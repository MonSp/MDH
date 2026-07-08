import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteToolkitRouter, CircuitBreaker } from './remote.js';

const mockToolCall = {
  id: 'test-1',
  type: 'function' as const,
  function: { name: 'write_file', arguments: '{"path":"a.txt","content":"hi"}' },
};

describe('CircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('opens after threshold failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('closed');
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.canExecute()).toBe(false);
  });

  it('transitions to half-open after recovery', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, recoveryMs: 50 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    // 等待恢复期
    return new Promise(resolve => setTimeout(() => {
      expect(cb.getState()).toBe('half-open');
      expect(cb.canExecute()).toBe(true);
      resolve(undefined);
    }, 60));
  });

  it('closes on success after half-open', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, recoveryMs: 1 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    // 模拟恢复
    cb.recordSuccess();
    expect(cb.getState()).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('resets failure count on success', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('closed'); // 只有2次，未达阈值
  });
});

describe('RemoteToolkitRouter retry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('succeeds on first try', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'ok', call_id: 'test-1' }), { status: 200 })
    );
    const router = new RemoteToolkitRouter({ executorUrl: 'http://localhost:9999' });
    const result = await router.execute(mockToolCall, '/ws');
    expect(result.result).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 and succeeds', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('server error', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
      );
    const router = new RemoteToolkitRouter({ executorUrl: 'http://localhost:9999', maxRetries: 2, baseDelayMs: 10 });
    const result = await router.execute(mockToolCall, '/ws');
    expect(result.result).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('bad request', { status: 400 })
    );
    const router = new RemoteToolkitRouter({ executorUrl: 'http://localhost:9999', maxRetries: 3, baseDelayMs: 10 });
    const result = await router.execute(mockToolCall, '/ws');
    expect(result.error).toContain('400');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network error and fails after maxRetries', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const router = new RemoteToolkitRouter({ executorUrl: 'http://localhost:9999', maxRetries: 2, baseDelayMs: 10 });
    const result = await router.execute(mockToolCall, '/ws');
    expect(result.error).toContain('3 attempts');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('retries on timeout', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
      );
    const router = new RemoteToolkitRouter({ executorUrl: 'http://localhost:9999', maxRetries: 1, baseDelayMs: 10 });
    const result = await router.execute(mockToolCall, '/ws');
    expect(result.result).toBe('ok');
  });
});

describe('RemoteToolkitRouter circuit breaker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens circuit after repeated failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const router = new RemoteToolkitRouter({
      executorUrl: 'http://localhost:9999',
      maxRetries: 0,
      baseDelayMs: 10,
      circuitBreaker: { failureThreshold: 3, recoveryMs: 60_000 },
    });

    // 3次失败触发熔断
    await router.execute(mockToolCall, '/ws');
    await router.execute(mockToolCall, '/ws');
    await router.execute(mockToolCall, '/ws');
    expect(router.getCircuitBreaker().getState()).toBe('open');

    // 第4次直接被熔断，不调用 fetch
    const fetchCalls = (globalThis.fetch as any).mock.calls.length;
    const result = await router.execute(mockToolCall, '/ws');
    expect(result.error).toContain('Circuit breaker OPEN');
    expect((globalThis.fetch as any).mock.calls.length).toBe(fetchCalls); // 没有新调用
  });

  it('half-open allows probe request after recovery', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount <= 3) throw new Error('ECONNREFUSED');
      return new Response(JSON.stringify({ result: 'recovered' }), { status: 200 });
    });

    const router = new RemoteToolkitRouter({
      executorUrl: 'http://localhost:9999',
      maxRetries: 0,
      baseDelayMs: 10,
      circuitBreaker: { failureThreshold: 3, recoveryMs: 50 },
    });

    // 触发熔断
    await router.execute(mockToolCall, '/ws');
    await router.execute(mockToolCall, '/ws');
    await router.execute(mockToolCall, '/ws');
    expect(router.getCircuitBreaker().getState()).toBe('open');

    // 等待恢复期
    await new Promise(r => setTimeout(r, 60));

    // 半开状态，放行试探请求
    const result = await router.execute(mockToolCall, '/ws');
    expect(result.result).toBe('recovered');
    expect(router.getCircuitBreaker().getState()).toBe('closed');
  });

  it('calls onCircuitOpen fallback when circuit is open', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const fallback = vi.fn().mockResolvedValue({
      call_id: 'test-1', tool_name: 'write_file', result: 'fallback-ok',
    });
    const router = new RemoteToolkitRouter({
      executorUrl: 'http://localhost:9999',
      maxRetries: 0,
      baseDelayMs: 10,
      circuitBreaker: { failureThreshold: 2, recoveryMs: 60_000 },
      onCircuitOpen: fallback,
    });

    // 触发熔断
    await router.execute(mockToolCall, '/ws');
    await router.execute(mockToolCall, '/ws');
    expect(router.getCircuitBreaker().getState()).toBe('open');

    // 熔断后调用 fallback
    const result = await router.execute(mockToolCall, '/ws');
    expect(fallback).toHaveBeenCalledWith(mockToolCall, '/ws');
    expect(result.result).toBe('fallback-ok');
  });

  it('falls back to error when onCircuitOpen returns null', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const fallback = vi.fn().mockResolvedValue(null);
    const router = new RemoteToolkitRouter({
      executorUrl: 'http://localhost:9999',
      maxRetries: 0,
      baseDelayMs: 10,
      circuitBreaker: { failureThreshold: 2, recoveryMs: 60_000 },
      onCircuitOpen: fallback,
    });

    await router.execute(mockToolCall, '/ws');
    await router.execute(mockToolCall, '/ws');
    const result = await router.execute(mockToolCall, '/ws');
    expect(fallback).toHaveBeenCalled();
    expect(result.error).toContain('Circuit breaker OPEN');
  });

  it('calls onHalfOpen when transitioning from open to half-open', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const onHalfOpen = vi.fn();
    const router = new RemoteToolkitRouter({
      executorUrl: 'http://localhost:9999',
      maxRetries: 0,
      baseDelayMs: 10,
      circuitBreaker: { failureThreshold: 2, recoveryMs: 50 },
      onHalfOpen,
    });

    // 触发熔断
    await router.execute(mockToolCall, '/ws');
    await router.execute(mockToolCall, '/ws');
    expect(router.getCircuitBreaker().getState()).toBe('open');
    expect(onHalfOpen).not.toHaveBeenCalled();

    // 等待恢复期 → half-open
    await new Promise(r => setTimeout(r, 60));
    router.getCircuitBreaker().getState(); // 触发转换
    expect(onHalfOpen).toHaveBeenCalledTimes(1);
  });
});
