import { ToolCallRequest, ToolCallResponse } from './types.js';

export interface ExecutorClientConfig {
  baseUrl: string;
  token?: string;
}

export class ExecutorClient {
  private baseUrl: string;
  private token: string;

  constructor(config: ExecutorClientConfig | string) {
    if (typeof config === 'string') {
      this.baseUrl = config;
      this.token = '';
    } else {
      this.baseUrl = config.baseUrl;
      this.token = config.token || '';
    }
  }

  async execute(request: ToolCallRequest, permissionToken?: string): Promise<ToolCallResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const body = { ...request };
    if (permissionToken) {
      body.permission_token = permissionToken;
    }

    const response = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 401 || response.status === 403) {
      const detail = await response.text();
      return {
        call_id: request.call_id,
        tool_name: request.tool_name,
        result: null,
        error: `Auth error (${response.status}): ${detail}`,
        success: false,
      };
    }

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

  async health(): Promise<{ status: string; storage_backend: string; workspace: string; auth_enabled: boolean } | null> {
    try {
      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      const response = await fetch(`${this.baseUrl}/health`, { headers });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async getToken(): Promise<string | null> {
    try {
      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      const response = await fetch(`${this.baseUrl}/token`, { headers });
      if (!response.ok) return null;
      const data = await response.json();
      return data.token || null;
    } catch {
      return null;
    }
  }
}
