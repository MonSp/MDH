import { ToolCall, ToolResult } from '../team/types.js';
import { IToolkitRouter } from './router.js';

export interface RemoteToolkitRouterConfig {
  executorUrl: string;
  token?: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

export class RemoteToolkitRouter implements IToolkitRouter {
  private executorUrl: string;
  private token: string;
  private maxRetries: number;
  private baseDelayMs: number;

  constructor(config: RemoteToolkitRouterConfig) {
    this.executorUrl = config.executorUrl;
    this.token = config.token ?? '';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  }

  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const args = JSON.parse(toolCall.function.arguments);
    const body = JSON.stringify({
      tool_name: toolCall.function.name,
      arguments: args,
      call_id: toolCall.id,
      workspace,
    });

    let lastError = '';

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.executorUrl}/execute`, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          const detail = await response.text();
          // 4xx 客户端错误不重试
          if (response.status >= 400 && response.status < 500) {
            return {
              call_id: toolCall.id,
              tool_name: toolCall.function.name,
              result: null,
              error: `Executor error (${response.status}): ${detail}`,
            };
          }
          // 5xx 服务端错误可重试
          lastError = `Executor error (${response.status}): ${detail}`;
          if (attempt < this.maxRetries) {
            await this.delay(attempt);
            continue;
          }
          break;
        }

        const data = await response.json();
        return {
          call_id: toolCall.id,
          tool_name: toolCall.function.name,
          result: data.result ?? null,
          error: data.error ?? undefined,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = msg;
        // 网络错误/超时可重试
        if (attempt < this.maxRetries) {
          await this.delay(attempt);
          continue;
        }
      }
    }

    return {
      call_id: toolCall.id,
      tool_name: toolCall.function.name,
      result: null,
      error: `Failed after ${this.maxRetries + 1} attempts: ${lastError}`,
    };
  }

  private delay(attempt: number): Promise<void> {
    const ms = this.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
