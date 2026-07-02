import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retryWithBackoff } from '../retry'

describe('retryWithBackoff', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retryWithBackoff(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')

    const promise = retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 100 })
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should throw after max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'))

    const promise = retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10 })
    await vi.advanceTimersByTimeAsync(100)

    await expect(promise).rejects.toThrow('always fail')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('should call onRetry callback', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')
    const onRetry = vi.fn()

    const promise = retryWithBackoff(fn, { maxRetries: 1, baseDelayMs: 50, onRetry })
    await vi.advanceTimersByTimeAsync(100)
    await promise

    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      maxRetries: 1,
    }))
  })

  it('should use exponential backoff delay', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('f1'))
      .mockRejectedValueOnce(new Error('f2'))
      .mockResolvedValue('ok')

    const promise = retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 100 })
    // delay1 = 100, delay2 = 200
    await vi.advanceTimersByTimeAsync(400)
    const result = await promise

    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
