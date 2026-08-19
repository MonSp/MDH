/**
 * LLM 调用守卫 — 统一的超时与重试保护。
 *
 * 对齐 Python 端 llm_guard.py 的 fail-closed 策略：
 * 所有 LLM 调用必须有超时保护，超时后抛异常而非静默降级。
 */

import type { LLMConfig, Message, ToolDefinition, LLMStreamChunk } from './types.js';
import { chatStream } from './openai.js';

// 默认超时（毫秒）
const DEFAULT_LLM_TIMEOUT_MS = 120_000;
// 最大重试次数
const DEFAULT_MAX_RETRIES = 2;
// 重试退避基数（毫秒）
const RETRY_BACKOFF_BASE_MS = 2_000;

export interface LLMGuardOptions {
  timeoutMs?: number;
  maxRetries?: number;
  onTimeout?: () => void;
}

/**
 * 带超时和重试的 LLM 流式调用守卫。
 *
 * 用法：
 *   for await (const chunk of safeChatStream(config, messages, tools)) {
 *     // 处理 chunk
 *   }
 */
export async function* safeChatStream(
  config: LLMConfig,
  messages: Message[],
  tools?: ToolDefinition[],
  options: LLMGuardOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 使用 AbortController 实现超时
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // chatStream 是 AsyncGenerator，需要逐 chunk 读取并检查 abort
        const gen = chatStream(config, messages, tools);
        for await (const chunk of gen) {
          if (controller.signal.aborted) {
            throw new Error(`LLM 调用超时 (${timeoutMs}ms, attempt ${attempt + 1}/${maxRetries + 1})`);
          }
          yield chunk;
        }
        // 正常完成
        clearTimeout(timer);
        return;
      } finally {
        clearTimeout(timer);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 超时
        lastError = new Error(`LLM 调用超时 (${timeoutMs}ms, attempt ${attempt + 1}/${maxRetries + 1})`);
        console.warn(`[llm_guard] ${lastError.message}`);
        if (options.onTimeout) {
          try { options.onTimeout(); } catch { /* ignore */ }
        }
        if (attempt < maxRetries) {
          const backoff = RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      } else {
        // 非超时异常，直接抛出
        throw e;
      }
    }
  }

  // 重试耗尽
  throw lastError;
}

/**
 * 带超时的通用异步调用守卫。
 */
export async function safeAsyncCall<T>(
  coro: Promise<T>,
  timeoutMs: number = DEFAULT_LLM_TIMEOUT_MS,
  description: string = 'async call',
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      coro,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`${description} 超时 (${timeoutMs}ms)`));
        });
      }),
    ]);
    return result;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.warn(`[llm_guard] ${description} 超时 (${timeoutMs}ms)`);
      throw new Error(`${description} 超时 (${timeoutMs}ms)`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
