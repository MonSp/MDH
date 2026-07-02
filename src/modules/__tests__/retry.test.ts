import { describe, it, expect, vi } from 'vitest'
import { retryWithBackoff } from '../retry'

describe('retryWithBackoff', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retryWithBackoff(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should throw after max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    await expect(retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 1 }))
      .rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('should call onRetry callback', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')
    const onRetry = vi.fn()

    const result = await retryWithBackoff(fn, { maxRetries: 1, baseDelayMs: 1, onRetry })

    expect(result).toBe('ok')
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      maxRetries: 1,
    }))
  })

  it('should use default options', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retryWithBackoff(fn, {})
    expect(result).toBe('ok')
  })
})
