/**
 * Claude Wrapper — spawns `claude -p` with stream-json output and maps
 * Claude Code CLI events to A2A artifact events.
 *
 * Claude CLI stream-json format (one JSON object per line):
 *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
 *   {"type":"tool_use","tool":{"name":"..."},"input":{...}}
 *   {"type":"tool_result","tool":{"name":"..."},"output":"..."}
 *   {"type":"result","result":"...","is_error":false}
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface ClaudeEvent {
  type: 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error' | 'unknown';
  data: Record<string, unknown>;
}

export type EventHandler = (event: ClaudeEvent) => void;

const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Spawn Claude Code CLI for a single task and stream parsed events.
 *
 * Returns a Promise that resolves with the final result string (or empty),
 * and rejects on timeout / crash.
 */
export function runClaudeTask(
  task: string,
  onEvent: EventHandler,
  options?: {
    cwd?: string;
    maxTurns?: number;
    abortSignal?: AbortSignal;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const maxTurns = options?.maxTurns ?? 20;
    const cwd = options?.cwd ?? process.cwd();

    const args = [
      '-p', task,
      '--output-format', 'stream-json',
      '--max-turns', String(maxTurns),
    ];

    let child: ChildProcess;
    try {
      child = spawn('claude', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: options?.abortSignal,
      });
    } catch (err) {
      reject(err);
      return;
    }

    let finalResult = '';
    let settled = false;
    let lineBuffer = '';

    // Timeout guard
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGTERM');
        reject(new Error('Claude task timed out after 5 minutes'));
      }
    }, TASK_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
    };

    // Abort signal handling
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        if (!settled) {
          settled = true;
          cleanup();
          child.kill('SIGTERM');
          reject(new Error('Task cancelled'));
        }
      });
    }

    child.stdout!.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString('utf-8');
      const lines = lineBuffer.split('\n');
      // Keep the last incomplete line in the buffer
      lineBuffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue; // Skip non-JSON lines (e.g. progress bars)
        }

        const eventType = parsed.type as string;
        const claudeEvent = mapClaudeEvent(eventType, parsed);
        onEvent(claudeEvent);

        if (claudeEvent.type === 'result') {
          finalResult = String(parsed.result ?? '');
        }
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      // Log stderr but don't treat as fatal
      const msg = chunk.toString('utf-8').trim();
      if (msg) console.error(`[claude-wrapper] stderr: ${msg}`);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();

      // Process any remaining buffer
      const trimmed = lineBuffer.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          const eventType = parsed.type as string;
          const claudeEvent = mapClaudeEvent(eventType, parsed);
          onEvent(claudeEvent);
          if (claudeEvent.type === 'result') {
            finalResult = String(parsed.result ?? '');
          }
        } catch {
          // ignore
        }
      }

      if (code === 0 || finalResult) {
        resolve(finalResult);
      } else {
        reject(new Error(`Claude CLI exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
  });
}

/** Map a raw Claude stream-json event to our ClaudeEvent type. */
function mapClaudeEvent(
  type: string,
  data: Record<string, unknown>,
): ClaudeEvent {
  switch (type) {
    case 'assistant':
      return { type: 'assistant', data };
    case 'tool_use':
      return { type: 'tool_use', data };
    case 'tool_result':
      return { type: 'tool_result', data };
    case 'result':
      return { type: 'result', data };
    case 'error':
      return { type: 'error', data };
    default:
      return { type: 'unknown', data };
  }
}
