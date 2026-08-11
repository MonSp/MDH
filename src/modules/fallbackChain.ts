/**
 * Fallback Chain
 * Executes a primary action with ordered fallback strategies.
 * Supports compensation callbacks when all attempts are exhausted.
 */

export type FallbackStrategy = 'sequential' | 'parallel'

export interface FallbackChainConfig {
  primary: () => Promise<unknown>
  fallbacks: Array<() => Promise<unknown>>
  strategy: FallbackStrategy
  maxAttempts: number
}

export interface FallbackChainResult {
  success: boolean
  result?: unknown
  error?: Error
  attemptsMade: number
  failedStep: 'primary' | 'fallback' | 'none'
}

export class FallbackChainRunner {
  private compensationCallback: ((error: Error) => Promise<void>) | null = null

  /**
   * Set a compensation callback invoked when all attempts fail.
   */
  onAllFailed(callback: (error: Error) => Promise<void>): void {
    this.compensationCallback = callback
  }

  /**
   * Execute the fallback chain.
   */
  async execute(config: FallbackChainConfig): Promise<FallbackChainResult> {
    if (config.strategy === 'parallel') {
      return this.executeParallel(config)
    }
    return this.executeSequential(config)
  }

  private async executeSequential(config: FallbackChainConfig): Promise<FallbackChainResult> {
    let attemptsMade = 0
    const maxAttempts = Math.max(1, config.maxAttempts)
    const lastError: Error[] = []

    // Try primary
    for (let i = 0; i < maxAttempts; i++) {
      attemptsMade++
      try {
        const result = await config.primary()
        return { success: true, result, attemptsMade, failedStep: 'none' }
      } catch (err) {
        lastError[0] = err instanceof Error ? err : new Error(String(err))
      }
    }

    // Try fallbacks
    for (const fallback of config.fallbacks) {
      for (let i = 0; i < maxAttempts; i++) {
        attemptsMade++
        try {
          const result = await fallback()
          return { success: true, result, attemptsMade, failedStep: 'none' }
        } catch (err) {
          lastError[0] = err instanceof Error ? err : new Error(String(err))
        }
      }
    }

    // All failed
    const finalError = lastError[0] ?? new Error('All attempts failed')
    if (this.compensationCallback) {
      await this.compensationCallback(finalError)
    }

    return {
      success: false,
      error: finalError,
      attemptsMade,
      failedStep: 'fallback',
    }
  }

  private async executeParallel(config: FallbackChainConfig): Promise<FallbackChainResult> {
    let attemptsMade = 0
    const allFns = [config.primary, ...config.fallbacks]
    const maxAttempts = Math.max(1, config.maxAttempts)

    for (let round = 0; round < maxAttempts; round++) {
      const promises = allFns.map(fn => fn())
      attemptsMade += promises.length

      const results = await Promise.allSettled(promises)
      for (const r of results) {
        if (r.status === 'fulfilled') {
          return { success: true, result: r.value, attemptsMade, failedStep: 'none' }
        }
      }
    }

    // All failed
    const finalError = new Error('All parallel attempts failed')
    if (this.compensationCallback) {
      await this.compensationCallback(finalError)
    }

    return {
      success: false,
      error: finalError,
      attemptsMade,
      failedStep: 'fallback',
    }
  }
}

/**
 * Builder for constructing FallbackChainConfig fluently.
 */
export class RoutingFallbackBuilder {
  private _primary: (() => Promise<unknown>) | null = null
  private _fallbacks: Array<() => Promise<unknown>> = []
  private _strategy: FallbackStrategy = 'sequential'
  private _maxAttempts = 1

  primary(fn: () => Promise<unknown>): this {
    this._primary = fn
    return this
  }

  addFallback(fn: () => Promise<unknown>): this {
    this._fallbacks.push(fn)
    return this
  }

  strategy(s: FallbackStrategy): this {
    this._strategy = s
    return this
  }

  maxAttempts(n: number): this {
    this._maxAttempts = n
    return this
  }

  build(): FallbackChainConfig {
    if (!this._primary) {
      throw new Error('Primary function is required')
    }
    return {
      primary: this._primary,
      fallbacks: this._fallbacks,
      strategy: this._strategy,
      maxAttempts: this._maxAttempts,
    }
  }
}
