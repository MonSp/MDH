import { ToolCall, ToolResult } from '../team/types.js';
import { IToolkitRouter } from './router.js';

export interface RemoteToolkitRouterConfig {
  executorUrl: string;
  token?: string;
}

export class RemoteToolkitRouter implements IToolkitRouter {
  private executorUrl: string;
  private token: string;

  constructor(config: RemoteToolkitRouterConfig) {
    this.executorUrl = config.executorUrl;
    this.token = config.token ?? '';
  }

  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const args = JSON.parse(toolCall.function.arguments);

    const response = await fetch(`${this.executorUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tool_name: toolCall.function.name,
        arguments: args,
        call_id: toolCall.id,
        workspace,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        call_id: toolCall.id,
        tool_name: toolCall.function.name,
        result: null,
        error: `Executor error (${response.status}): ${detail}`,
      };
    }

    const data = await response.json();
    return {
      call_id: toolCall.id,
      tool_name: toolCall.function.name,
      result: data.result ?? null,
      error: data.error ?? undefined,
    };
  }
}
