export function formatStepResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'number' || typeof result === 'boolean') return String(result);
  try {
    const str = JSON.stringify(result, null, 2);
    if (str === undefined) return '[undefined]';
    const lines = str.split('\n');
    return lines.length > 10
      ? lines.slice(0, 10).join('\n') + '\n... 还有 ' + (lines.length - 10) + ' 行'
      : str;
  } catch {
    try {
      if (typeof result === 'object' && result !== null) {
        return Object.entries(result as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join('\n');
      }
      return String(result);
    } catch {
      return '[无法序列化的对象]';
    }
  }
}

export interface CommandResponse {
  success: boolean;
  error?: { message: string; code?: string };
  payload?: unknown;
}

export function executeCommand(
  command: string,
  payload: Record<string, unknown>,
  parentOrigin: string,
  timeout = 15000
): Promise<Record<string, unknown>> {
  const id = 'req_' + Date.now();
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== parentOrigin) return;
      const msg = event.data as CommandResponse;
      if (!msg || !('type' in msg) || msg.type !== 'response' || !('id' in msg) || msg.id !== id) return;
      window.removeEventListener('message', handler);
      if (msg.error) {
        reject(Object.assign(new Error(msg.error.message || '失败'), { code: msg.error.code }));
      } else {
        resolve((msg.payload as Record<string, unknown>) || { success: true });
      }
    };
    window.addEventListener('message', handler);
    parent.postMessage(
      { type: 'request', id, command, payload, timestamp: Date.now() },
      parentOrigin
    );
    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('超时'));
    }, timeout);
  });
}
