export interface RetryState {
  attempt: number
  maxRetries: number
  nextDelayMs: number
}

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  onRetry?: (state: RetryState) => void
  onTARGET_STALE?: () => Promise<any>
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    onRetry,
    onTARGET_STALE,
  } = options

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      if (attempt >= maxRetries) throw err

      const state: RetryState = {
        attempt: attempt + 1,
        maxRetries,
        nextDelayMs: baseDelayMs * (2 ** attempt),
      }

      onRetry?.(state)

      if (err.code === 'TARGET_STALE' && onTARGET_STALE) {
        try {
          await onTARGET_STALE()
        } catch {
        }
      }

      await new Promise(r => setTimeout(r, state.nextDelayMs))
    }
  }

  throw new Error('retryWithBackoff: unexpected exit')
}
