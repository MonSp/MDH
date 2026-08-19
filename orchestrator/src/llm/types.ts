export interface LLMConfig {
  provider: 'deepseek' | 'openai' | 'anthropic' | 'dashscope' | 'gemini' | 'moonshot' | 'xai' | 'ollama' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMStreamChunk {
  delta: string;
  tool_calls: Partial<ToolCall>[];
  finish_reason: string | null;
}
