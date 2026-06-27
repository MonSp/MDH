export interface ToolCallRequest {
  tool_name: string;
  arguments: Record<string, unknown>;
  call_id: string;
  workspace?: string;
}

export interface ToolCallResponse {
  call_id: string;
  tool_name: string;
  result: unknown;
  error: string | null;
  success: boolean;
}
