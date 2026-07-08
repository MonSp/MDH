import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteToolkitRouter } from './remote.js';

const mockToolCall = {
  id: 'test-1',
  type: 'function' as const,
  function: { name: 'write_file', arguments: '{"path":"a.txt","content":"hi"}' },
};

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
