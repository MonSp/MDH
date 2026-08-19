/**
 * HITL (Human-in-the-Loop) 确认管理器
 *
 * 当检测到危险操作时，发送确认请求给用户，等待响应后决定是否执行。
 */

import { SHELL_BLACKLIST_PATTERNS } from '../toolkit/shellSafety.js';

export interface ConfirmRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  timestamp: number;
}

export interface ConfirmResult {
  requestId: string;
  confirmed: boolean;
  reason?: string;
}

type ResolveFn = (result: ConfirmResult) => void;

/**
 * HITL 确认管理器
 *
 * 用法:
 *   const hitl = new HITLManager(sendEvent);
 *   const result = await hitl.requestConfirmation(toolName, args);
 *   if (!result.confirmed) { throw new Error('User denied'); }
 */
export class HITLManager {
  private pending = new Map<string, ResolveFn>();
  private sendEvent: (event: Record<string, unknown>) => void;

  constructor(sendEvent: (event: Record<string, unknown>) => void) {
    this.sendEvent = sendEvent;
  }

  /**
   * 检查工具调用是否需要用户确认。
   * 返回 true 表示需要确认，false 表示可以安全执行。
   */
  needsConfirmation(toolName: string, args: Record<string, unknown>): boolean {
    // 只有 bash 工具需要检查
    if (toolName !== 'bash') return false;

    const command = String(args.command || '');
    for (const pattern of SHELL_BLACKLIST_PATTERNS) {
      if (pattern.test(command)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 请求用户确认。
   * 发送 confirm_request 事件，然后等待 confirm_result。
   */
  async requestConfirmation(
    toolName: string,
    args: Record<string, unknown>,
    reason: string,
    timeoutMs: number = 30_000,
  ): Promise<ConfirmResult> {
    const requestId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const request: ConfirmRequest = {
      id: requestId,
      toolName,
      args,
      reason,
      timestamp: Date.now(),
    };

    // 发送确认请求
    this.sendEvent({
      type: 'confirm_request',
      ...request,
    });

    // 等待响应
    return new Promise<ConfirmResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ requestId, confirmed: false, reason: 'Timeout' });
      }, timeoutMs);

      this.pending.set(requestId, (result) => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve(result);
      });
    });
  }

  /**
   * 处理用户的确认响应。
   * 由 WebSocket 消息处理器调用。
   */
  handleConfirmResult(result: ConfirmResult): void {
    const resolve = this.pending.get(result.requestId);
    if (resolve) {
      resolve(result);
    }
  }

  /** 获取待确认请求数量 */
  get pendingCount(): number {
    return this.pending.size;
  }
}
