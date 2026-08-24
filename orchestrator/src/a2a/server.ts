/**
 * A2A (Agent-to-Agent) Server for the TS Orchestrator.
 *
 * Implements the A2A protocol:
 *   GET  /.well-known/agent.json   — Agent Card (capabilities & skills)
 *   POST /a2a/tasks/send           — Accept a task, stream SSE results
 *
 * Uses a single RoleAgent to process the incoming task: the agent calls the
 * LLM, executes any tool calls via the LocalToolkitRouter, and streams every
 * event back as SSE.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { LLMConfig } from '../llm/types.js';
import { resolveConfig } from '../llm/openai.js';
import { RoleAgent, type AgentConfig, type EventHandler } from '../agent/role-agent.js';
import { ALL_TOOL_DEFINITIONS } from '../agent/tools.js';
import { buildSystemPrompt } from '../agent/system-prompt.js';
import { LocalToolkitRouter } from '../toolkit/local.js';
import type { IToolkitRouter } from '../toolkit/router.js';

// ─── Agent Card ──────────────────────────────────────────────────────────────

const AGENT_CARD = {
  name: 'ts-orchestrator',
  description: '本地 Node.js 工具执行 + 多提供商 LLM 路由',
  url: 'http://localhost:9090',
  version: '1.0.0',
  capabilities: { streaming: true },
  skills: [
    {
      id: 'local_tool_execution',
      name: '本地工具执行',
      tags: ['file', 'git', 'shell', 'search', 'browser'],
      description: '在用户本地环境执行文件操作、Git、命令等',
    },
    {
      id: 'llm_routing',
      name: 'LLM 多提供商路由',
      tags: ['llm', 'deepseek', 'openai', 'anthropic', 'gemini', 'ollama'],
      description: '支持 9 个 LLM 提供商的智能路由',
    },
  ],
};

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function writeSSE(res: ServerResponse, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSSEError(res: ServerResponse, message: string): void {
  writeSSE(res, { status: { state: 'failed', message } });
}

// ─── A2A Request / Response types ────────────────────────────────────────────

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

// ─── Core task handler ───────────────────────────────────────────────────────

/**
 * Process a single A2A task and stream results back via SSE.
 *
 * Flow:
 * 1. Build a RoleAgent (executor role) with the default LLM config
 * 2. Forward the user message (with any injected metadata) to the agent
 * 3. Let the agent loop: LLM → tool call → tool result → LLM …
 * 4. Stream every intermediate event as an SSE `data:` line
 * 5. Emit a terminal `completed` or `failed` event
 */
async function handleTask(
  req: IncomingMessage,
  res: ServerResponse,
  llmConfig: LLMConfig,
  workspace: string,
  router: IToolkitRouter,
): Promise<void> {
  // Parse body
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

  // Extract the text content from the message parts
  const textParts = taskReq.message.parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!);
  const userText = textParts.join('\n');

  if (!userText) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'At least one text part is required' }));
    return;
  }

  // Inject metadata into the user text when present
  const metadata = taskReq.message.metadata;
  let enrichedText = userText;
  if (metadata?.experience_rules?.length || metadata?.skill_context) {
    const metaLines: string[] = [];
    if (metadata.experience_rules?.length) {
      metaLines.push(`[经验规则]\n${JSON.stringify(metadata.experience_rules, null, 2)}`);
    }
    if (metadata.skill_context) {
      metaLines.push(`[技能上下文]\n${metadata.skill_context}`);
    }
    enrichedText = `${metaLines.join('\n\n')}\n\n${userText}`;
  }

  // Build the agent
  const systemPrompt = await buildSystemPrompt('executor');
  const agentConfig: AgentConfig = {
    id: `a2a-${taskReq.task_id}`,
    roleId: 'executor',
    roleName: 'Executor',
    systemPrompt,
    tools: ALL_TOOL_DEFINITIONS,
    router,
    workspace,
    llm: llmConfig,
  };
  const agent = new RoleAgent(agentConfig);

  // Set up SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx proxy passthrough
  });

  // Notify: task started
  writeSSE(res, { status: { state: 'working' } });

  // Abort tracking: if the client disconnects, stop processing
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  try {
    // Event handler — forward every agent event as an SSE artifact/status update
    const onEvent: EventHandler = (event) => {
      if (aborted) return;

      switch (event.type) {
        case 'tool_result':
          writeSSE(res, {
            artifact: {
              name: 'tool_result',
              parts: [{ type: 'text', text: String(event.output ?? event.result ?? '') }],
            },
          });
          break;

        case 'agent_message':
          // Intermediate text from the agent (not the final result)
          writeSSE(res, {
            artifact: {
              name: 'agent_message',
              parts: [{ type: 'text', text: String(event.content ?? '') }],
            },
          });
          break;

        case 'tool_call':
          // Acknowledge the tool call (informational)
          writeSSE(res, {
            artifact: {
              name: 'tool_call',
              parts: [{ type: 'text', text: JSON.stringify({ tool: event.tool, args: event.args }) }],
            },
          });
          break;

        default:
          // Other events (thinking_*, subagent_*, etc.) — forward as-is
          writeSSE(res, { event });
          break;
      }
    };

    const { result } = await agent.chatWithTools(enrichedText, onEvent);

    if (aborted) return;

    // Final result artifact
    if (result) {
      writeSSE(res, {
        artifact: {
          name: 'final_result',
          parts: [{ type: 'text', text: result }],
        },
      });
    }

    // Terminal event
    writeSSE(res, { status: { state: 'completed' } });
  } catch (err: unknown) {
    if (aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[A2A] Task ${taskReq.task_id} failed:`, message);
    writeSSEError(res, message);
  }

  res.end();
}

// ─── Route dispatcher ────────────────────────────────────────────────────────

export interface A2AOptions {
  llmConfig: LLMConfig;
  workspace: string;
  router?: IToolkitRouter;
}

/**
 * Create an HTTP request handler for A2A routes.
 *
 * Returns `true` if the request was handled (matched an A2A route),
 * `false` otherwise — so the caller can fall through to other handlers.
 */
export function createA2AHandler(options: A2AOptions) {
  const router = options.router ?? new LocalToolkitRouter();

  return async function handleA2ARequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const url = req.url || '/';

    // --- GET /.well-known/agent.json ---
    if (req.method === 'GET' && url === '/.well-known/agent.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(AGENT_CARD, null, 2));
      return true;
    }

    // --- POST /a2a/tasks/send ---
    if (req.method === 'POST' && url === '/a2a/tasks/send') {
      await handleTask(req, res, options.llmConfig, options.workspace, router);
      return true;
    }

    return false; // Not an A2A route
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
