import { LLMConfig, Message, ToolDefinition, LLMStreamChunk } from './types';

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  dashscope: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-3' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3:14b' },
  custom: { baseUrl: '', model: '' },
};

export function resolveConfig(config: Partial<LLMConfig>): LLMConfig {
  const defaults = PROVIDER_DEFAULTS[config.provider || 'deepseek'];
  return {
    provider: config.provider || 'deepseek',
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl || defaults?.baseUrl || '',
    model: config.model || defaults?.model || '',
  };
}

export async function* chatStream(
  config: LLMConfig,
  messages: Message[],
  tools?: ToolDefinition[],
): AsyncGenerator<LLMStreamChunk> {
  const url = `${config.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error ${response.status}: ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        yield {
          delta: choice.delta?.content || '',
          reasoning: choice.delta?.reasoning_content || '',
          tool_calls: choice.delta?.tool_calls || [],
          finish_reason: choice.finish_reason || null,
        };
      } catch {
        // Skip malformed chunks
      }
    }
  }
}
