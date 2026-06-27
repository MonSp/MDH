import { ToolCallRequest, ToolCallResponse } from './types.js';

export class ExecutorClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8767') {
    this.baseUrl = baseUrl;
  }

  async execute(request: ToolCallRequest): Promise<ToolCallResponse> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return {
        call_id: request.call_id,
        tool_name: request.tool_name,
        result: null,
        error: `Executor error: ${response.status}`,
        success: false,
      };
    }

    return response.json();
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
