/**
 * A2A Handler — HTTP request handler for A2A protocol routes.
 *
 * Routes:
 *   GET  /.well-known/agent.json   → Agent Card (capabilities & skills)
 *   POST /a2a/tasks/send           → Accept task, spawn Claude CLI, stream SSE
 *   POST /a2a/tasks/:id/cancel     → Kill running Claude CLI process
 *
 * SSE format (matching orchestrator/src/a2a/server.ts):
 *   data: {"status": {"state": "working"}}
 *   data: {"artifact": {"name": "agent_message", "parts": [{"type":"text","text":"..."}]}}
 *   data: {"artifact": {"name": "tool_call", "parts": [{"type":"text","text":"..."}]}}
 *   data: {"artifact": {"name": "tool_result", "parts": [{"type":"text","text":"..."}]}}
 *   data: {"artifact": {"name": "final_result", "parts": [{"type":"text","text":"..."}]}}
 *   data: {"status": {"state": "completed"}}
 *   data: {"status": {"state": "failed", "message": "..."}}
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { runClaudeTask, type ClaudeEvent } from './claude-wrapper.js';
import type { StateCache } from './state-cache.js';
import { pullExperience, flushPendingMemories } from './sync.js';

// ─── Agent Card ──────────────────────────────────────────────────────────────

export function buildAgentCard(url: string) {
  return {
    name: 'claude-code',
    description: 'Anthropic Claude Code — local AI coding assistant',
    url,
    version: '1.0.0',
    capabilities: { streaming: true },
    skills: [
      {
        id: 'code_implementation',
        name: 'Code Implementation',
        tags: ['file', 'git', 'shell', 'search', 'code', 'test'],
        description: 'Implement code changes: write files, run commands, create tests, manage git',
      },
      {
        id: 'code_review',
        name: 'Code Review',
        tags: ['review', 'code', 'security'],
        description: 'Review code for correctness, security, style, and best practices',
      },
    ],
  };
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function writeSSE(res: ServerResponse, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSSEError(res: ServerResponse, message: string): void {
  writeSSE(res, { status: { state: 'failed', message } });
}

// ─── A2A Request types ───────────────────────────────────────────────────────

interface A2AMessagePart {
  type: string;
  text?: string;
}

interface A2AMessage {
  role: string;
  parts: A2AMessagePart[];
  metadata?: {
    experience_rules?: unknown[];
    skill_context?: string;
    [key: string]: unknown;
  };
}

interface A2ATaskRequest {
  task_id: string;
  message: A2AMessage;
}

// ─── Active tasks ────────────────────────────────────────────────────────────

const activeTasks = new Map<string, AbortController>();

// ─── Task handler ────────────────────────────────────────────────────────────

async function handleTask(
  req: IncomingMessage,
  res: ServerResponse,
  stateCache: StateCache,
  backendUrl: string,
): Promise<void> {
  const body = await readBody(req);
  let taskReq: A2ATaskRequest;
  try {
    taskReq = JSON.parse(body) as A2ATaskRequest;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  if (!taskReq.task_id || !taskReq.message?.parts?.length) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'task_id and message.parts are required' }));
    return;
  }

  const textParts = taskReq.message.parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!);
  const userText = textParts.join('\n');

  if (!userText) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'At least one text part is required' }));
    return;
  }

  // Inject metadata (experience rules, skill context) into the prompt
  const metadata = taskReq.message.metadata;
  let enrichedText = userText;
  if (metadata?.experience_rules?.length || metadata?.skill_context) {
    const metaLines: string[] = [];
    if (metadata.experience_rules?.length) {
      metaLines.push(`[Experience Rules]\n${JSON.stringify(metadata.experience_rules, null, 2)}`);
    }
    if (metadata.skill_context) {
      metaLines.push(`[Skill Context]\n${metadata.skill_context}`);
    }
    enrichedText = `${metaLines.join('\n\n')}\n\n${userText}`;
  }

  // Pull relevant experience before execution
  const keywords = extractKeywords(userText);
  await pullExperience(backendUrl, stateCache, keywords).catch(() => {});

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  writeSSE(res, { status: { state: 'working' } });

  // Track cancellation
  const abortController = new AbortController();
  activeTasks.set(taskReq.task_id, abortController);

  // If client disconnects, abort
  req.on('close', () => {
    abortController.abort();
    activeTasks.delete(taskReq.task_id);
  });

  let finalResult = '';

  try {
    const result = await runClaudeTask(
      enrichedText,
      (event: ClaudeEvent) => {
        if (abortController.signal.aborted) return;
        mapAndSendSSE(res, event);
      },
      {
        maxTurns: 20,
        abortSignal: abortController.signal,
      },
    );

    finalResult = result;

    if (!abortController.signal.aborted) {
      if (finalResult) {
        writeSSE(res, {
          artifact: {
            name: 'final_result',
            parts: [{ type: 'text', text: finalResult }],
          },
        });
      }
      writeSSE(res, { status: { state: 'completed' } });
    }
  } catch (err: unknown) {
    if (!abortController.signal.aborted) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[A2A] Task ${taskReq.task_id} failed:`, message);
      writeSSEError(res, message);
    }
  } finally {
    activeTasks.delete(taskReq.task_id);
    res.end();

    // Store memory entry for completed task
    if (finalResult) {
      stateCache.addToMemoryInbox({
        agent_id: 'claude-code',
        type: 'task_result',
        content: finalResult.slice(0, 2000), // Truncate for storage
        task_id: taskReq.task_id,
        timestamp: new Date().toISOString(),
      });
    }

    // Flush pending memories to backend (fire-and-forget)
    flushPendingMemories(backendUrl, 'claude-code', stateCache).catch(() => {});
  }
}

/** Map a Claude CLI event to an A2A SSE artifact and write it. */
function mapAndSendSSE(res: ServerResponse, event: ClaudeEvent): void {
  switch (event.type) {
    case 'assistant': {
      // Extract text from Claude's assistant message format
      const message = event.data.message as { content?: Array<{ type: string; text?: string }> } | undefined;
      const textContent = message?.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');
      if (textContent) {
        writeSSE(res, {
          artifact: {
            name: 'agent_message',
            parts: [{ type: 'text', text: textContent }],
          },
        });
      }
      break;
    }

    case 'tool_use': {
      const tool = event.data.tool as { name?: string } | undefined;
      const input = event.data.input;
      writeSSE(res, {
        artifact: {
          name: 'tool_call',
          parts: [{ type: 'text', text: JSON.stringify({ tool: tool?.name ?? 'unknown', args: input }) }],
        },
      });
      break;
    }

    case 'tool_result': {
      const tool = event.data.tool as { name?: string } | undefined;
      const output = event.data.output ?? event.data.result ?? '';
      writeSSE(res, {
        artifact: {
          name: 'tool_result',
          parts: [{ type: 'text', text: `[${tool?.name ?? 'tool'}] ${String(output).slice(0, 4000)}` }],
        },
      });
      break;
    }

    case 'result': {
      // Final result is handled separately in handleTask
      break;
    }

    case 'error': {
      writeSSE(res, {
        status: { state: 'failed', message: String(event.data.error ?? event.data.message ?? 'Unknown error') },
      });
      break;
    }

    default: {
      // Forward unknown events as-is
      writeSSE(res, { event: event.data });
      break;
    }
  }
}

// ─── Route dispatcher ────────────────────────────────────────────────────────

export interface A2AHandlerOptions {
  stateCache: StateCache;
  backendUrl: string;
  url?: string;
}

/**
 * Create an HTTP request handler for A2A routes.
 *
 * Returns `true` if the request was handled, `false` otherwise.
 */
export function createA2AHandler(options: A2AHandlerOptions) {
  const { stateCache, backendUrl, url: baseUrl } = options;
  const agentCard = buildAgentCard(baseUrl ?? 'http://localhost:9091');

  return async function handleA2ARequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // --- GET /.well-known/agent.json ---
    if (method === 'GET' && url === '/.well-known/agent.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agentCard, null, 2));
      return true;
    }

    // --- POST /a2a/tasks/send ---
    if (method === 'POST' && url === '/a2a/tasks/send') {
      await handleTask(req, res, stateCache, backendUrl);
      return true;
    }

    // --- POST /a2a/tasks/:id/cancel ---
    const cancelMatch = url.match(/^\/a2a\/tasks\/([^/]+)\/cancel$/);
    if (method === 'POST' && cancelMatch) {
      const taskId = cancelMatch[1];
      const controller = activeTasks.get(taskId);
      if (controller) {
        controller.abort();
        activeTasks.delete(taskId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Task ${taskId} cancelled` }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Task ${taskId} not found` }));
      }
      return true;
    }

    return false; // Not an A2A route
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/** Extract simple keywords from text for experience search. */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
    'not', 'so', 'if', 'this', 'that', 'these', 'those', 'it', 'its',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
    'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who', 'whom',
    'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'than',
    'too', 'very', 'just', 'because', 'about',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);
}
