import { describe, it, expect, vi } from 'vitest'
import { FallbackChainRunner, RoutingFallbackBuilder } from '../fallbackChain'

describe('FallbackChainRunner', () => {
  describe('execute - sequential', () => {
    it('should succeed on primary', async () => {
      const runner = new FallbackChainRunner()
      const result = await runner.execute({
        primary: async () => 'primary-result',
        fallbacks: [async () => 'fb1'],
        strategy: 'sequential',
        maxAttempts: 1,
      })
      expect(result.success).toBe(true)
      expect(result.result).toBe('primary-result')
      expect(result.attemptsMade).toBe(1)
      expect(result.failedStep).toBe('none')
    })

    it('should fall back when primary fails', async () => {
      const runner = new FallbackChainRunner()
      const result = await runner.execute({
        primary: async () => { throw new Error('primary failed') },
        fallbacks: [
          async () => { throw new Error('fb1 failed') },
          async () => 'fb2-result',
        ],
        strategy: 'sequential',
        maxAttempts: 1,
      })
      expect(result.success).toBe(true)
      expect(result.result).toBe('fb2-result')
      expect(result.attemptsMade).toBe(3) // 1 primary + 2 fallbacks
    })

    it('should retry primary up to maxAttempts', async () => {
      const runner = new FallbackChainRunner()
      let callCount = 0
      const result = await runner.execute({
        primary: async () => {
          callCount++
          if (callCount < 3) throw new Error('not yet')
          return 'success-on-third'
        },
        fallbacks: [],
        strategy: 'sequential',
        maxAttempts: 3,
      })
      expect(result.success).toBe(true)
      expect(result.result).toBe('success-on-third')
      expect(result.attemptsMade).toBe(3)
    })

    it('should fail when all attempts exhausted', async () => {
      const runner = new FallbackChainRunner()
      const result = await runner.execute({
        primary: async () => { throw new Error('p') },
        fallbacks: [async () => { throw new Error('fb') }],
        strategy: 'sequential',
        maxAttempts: 1,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error!.message).toBe('fb')
      expect(result.failedStep).toBe('fallback')
    })

    it('should invoke compensation callback on all-fail', async () => {
      const runner = new FallbackChainRunner()
      const compensation = vi.fn(async () => {})
      runner.onAllFailed(compensation)

      await runner.execute({
        primary: async () => { throw new Error('p') },
        fallbacks: [async () => { throw new Error('fb') }],
        strategy: 'sequential',
        maxAttempts: 1,
      })

      expect(compensation).toHaveBeenCalledTimes(1)
      expect(compensation).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should not invoke compensation on success', async () => {
      const runner = new FallbackChainRunner()
      const compensation = vi.fn(async () => {})
      runner.onAllFailed(compensation)

      await runner.execute({
        primary: async () => 'ok',
        fallbacks: [],
        strategy: 'sequential',
        maxAttempts: 1,
      })

      expect(compensation).not.toHaveBeenCalled()
    })

    it('should handle non-Error throws', async () => {
      const runner = new FallbackChainRunner()
      const result = await runner.execute({
        primary: async () => { throw 'string error' },
        fallbacks: [],
        strategy: 'sequential',
        maxAttempts: 1,
      })
      expect(result.success).toBe(false)
      expect(result.error!.message).toBe('string error')
    })
  })

  describe('execute - parallel', () => {
    it('should succeed if any parallel attempt succeeds', async () => {
      const runner = new FallbackChainRunner()
      const result = await runner.execute({
        primary: async () => { throw new Error('p') },
        fallbacks: [async () => 'fb-ok'],
        strategy: 'parallel',
        maxAttempts: 1,
      })
      expect(result.success).toBe(true)
      expect(result.result).toBe('fb-ok')
    })

    it('should fail when all parallel attempts fail', async () => {
      const runner = new FallbackChainRunner()
      const result = await runner.execute({
        primary: async () => { throw new Error('p') },
        fallbacks: [async () => { throw new Error('fb') }],
        strategy: 'parallel',
        maxAttempts: 1,
      })
      expect(result.success).toBe(false)
      expect(result.attemptsMade).toBe(2)
    })

    it('should retry parallel rounds', async () => {
      const runner = new FallbackChainRunner()
      let callCount = 0
      const result = await runner.execute({
        primary: async () => {
          callCount++
          if (callCount <= 1) throw new Error('not yet')
          return 'ok'
        },
        fallbacks: [],
        strategy: 'parallel',
        maxAttempts: 2,
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('RoutingFallbackBuilder', () => {
  it('should build a valid config', () => {
    const config = new RoutingFallbackBuilder()
      .primary(async () => 'p')
      .addFallback(async () => 'fb1')
      .strategy('sequential')
      .maxAttempts(2)
      .build()

    expect(config.primary).toBeDefined()
    expect(config.fallbacks).toHaveLength(1)
    expect(config.strategy).toBe('sequential')
    expect(config.maxAttempts).toBe(2)
  })

  it('should use defaults', () => {
    const config = new RoutingFallbackBuilder()
      .primary(async () => 'p')
      .build()

    expect(config.strategy).toBe('sequential')
    expect(config.maxAttempts).toBe(1)
    expect(config.fallbacks).toHaveLength(0)
  })

  it('should throw if primary is not set', () => {
    expect(() => new RoutingFallbackBuilder().build()).toThrow('Primary function is required')
  })

  it('should chain multiple fallbacks', () => {
    const config = new RoutingFallbackBuilder()
      .primary(async () => 'p')
      .addFallback(async () => 'fb1')
      .addFallback(async () => 'fb2')
      .addFallback(async () => 'fb3')
      .build()

    expect(config.fallbacks).toHaveLength(3)
  })

  it('should produce a runnable config', async () => {
    const runner = new FallbackChainRunner()
    const config = new RoutingFallbackBuilder()
      .primary(async () => 'built-result')
      .strategy('sequential')
      .maxAttempts(1)
      .build()

    const result = await runner.execute(config)
    expect(result.success).toBe(true)
    expect(result.result).toBe('built-result')
  })
})
