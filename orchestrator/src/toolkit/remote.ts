import { ToolCall, ToolResult } from '../team/types.js';
import { IToolkitRouter } from './router.js';

export interface RemoteToolkitRouterConfig {
  executorUrl: string;
  token?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  circuitBreaker?: CircuitBreakerConfig;
  /** 熔断时的 fallback：返回 null 则走默认错误，返回 ToolResult 则用 fallback 结果 */
  onCircuitOpen?: (toolCall: ToolCall, workspace: string) => Promise<ToolResult | null>;
}

export interface CircuitBreakerConfig {
  /** 触发熔断的连续失败次数 */
  failureThreshold?: number;
  /** 熔断恢复时间 (ms) */
  recoveryMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RECOVERY_MS = 30_000;

// ─── Circuit Breaker ─────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly recoveryMs: number;

  constructor(config?: CircuitBreakerConfig) {
    this.threshold = config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.recoveryMs = config?.recoveryMs ?? DEFAULT_RECOVERY_MS;
  }

  canExecute(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      // 冷却期已过 → 半开，放一个请求试探
      if (Date.now() - this.lastFailureTime >= this.recoveryMs) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    // half-open → 放行试探请求
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    // 自动从 open 转 half-open
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.recoveryMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

// ─── RemoteToolkitRouter ─────────────────────────────────────

export class RemoteToolkitRouter implements IToolkitRouter {
  private executorUrl: string;
  private token: string;
  private maxRetries: number;
  private baseDelayMs: number;
  private circuit: CircuitBreaker;
  private onCircuitOpen?: (toolCall: ToolCall, workspace: string) => Promise<ToolResult | null>;

  constructor(config: RemoteToolkitRouterConfig) {
    this.executorUrl = config.executorUrl;
    this.token = config.token ?? '';
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.circuit = new CircuitBreaker(config.circuitBreaker);
    this.onCircuitOpen = config.onCircuitOpen;
  }

  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    // 熔断检查
    if (!this.circuit.canExecute()) {
      // 尝试 fallback
      if (this.onCircuitOpen) {
        const fallback = await this.onCircuitOpen(toolCall, workspace);
        if (fallback) return fallback;
      }
      return {
        call_id: toolCall.id,
        tool_name: toolCall.function.name,
        result: null,
        error: `Circuit breaker OPEN — executor ${this.executorUrl} is unavailable (state: ${this.circuit.getState()})`,
      };
    }

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
          // 4xx 客户端错误不重试，不计入熔断
          if (response.status >= 400 && response.status < 500) {
            return {
              call_id: toolCall.id,
              tool_name: toolCall.function.name,
              result: null,
              error: `Executor error (${response.status}): ${detail}`,
            };
          }
          // 5xx 服务端错误可重试，计入熔断
          lastError = `Executor error (${response.status}): ${detail}`;
          this.circuit.recordFailure();
          if (attempt < this.maxRetries) {
            await this.delay(attempt);
            continue;
          }
          break;
        }

        // 成功 → 重置熔断计数
        this.circuit.recordSuccess();
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
        // 网络错误/超时 → 计入熔断
        this.circuit.recordFailure();
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

  getCircuitBreaker(): CircuitBreaker {
    return this.circuit;
  }

  private delay(attempt: number): Promise<void> {
    const ms = this.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
