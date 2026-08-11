import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { LLMCache, llmCache } from '../llmCache'

describe('LLMCache', () => {
  let cache: LLMCache

  beforeEach(() => {
    cache = new LLMCache(100, 300_000)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic get/put', () => {
    it('should store and retrieve a response', () => {
      cache.put('hello', 'world')
      expect(cache.get('hello')).toBe('world')
    })

    it('should return null for cache miss', () => {
      expect(cache.get('nonexistent')).toBeNull()
    })

    it('should handle role and model parameters', () => {
      cache.put('prompt', 'response1', 'ceo', 'deepseek')
      cache.put('prompt', 'response2', 'planner', 'deepseek')

      expect(cache.get('prompt', 'ceo', 'deepseek')).toBe('response1')
      expect(cache.get('prompt', 'planner', 'deepseek')).toBe('response2')
    })

    it('should use defaults for role and model', () => {
      cache.put('test', 'result')
      expect(cache.get('test')).toBe('result')
      expect(cache.get('test', 'default', 'default')).toBe('result')
    })

    it('should overwrite existing entry with same key', () => {
      cache.put('key', 'value1')
      cache.put('key', 'value2')
      expect(cache.get('key')).toBe('value2')
    })
  })

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      cache.put('key', 'value')

      // Before TTL
      expect(cache.get('key')).toBe('value')

      // After TTL (300_000ms = 5min)
      vi.advanceTimersByTime(300_001)
      expect(cache.get('key')).toBeNull()
    })

    it('should not expire entries before TTL', () => {
      cache.put('key', 'value')
      vi.advanceTimersByTime(299_999)
      expect(cache.get('key')).toBe('value')
    })

    it('should use custom TTL', () => {
      const customCache = new LLMCache(100, 10_000)
      customCache.put('key', 'value')
      vi.advanceTimersByTime(10_001)
      expect(customCache.get('key')).toBeNull()
    })
  })

  describe('LRU eviction', () => {
    it('should evict oldest entry when cache is full', () => {
      const smallCache = new LLMCache(3, 300_000)
      smallCache.put('a', '1')
      smallCache.put('b', '2')
      smallCache.put('c', '3')

      // Cache full, adding 'd' should evict 'a'
      smallCache.put('d', '4')
      expect(smallCache.get('a')).toBeNull()
      expect(smallCache.get('b')).toBe('2')
      expect(smallCache.get('c')).toBe('3')
      expect(smallCache.get('d')).toBe('4')
    })

    it('should update LRU order on access', () => {
      const smallCache = new LLMCache(3, 300_000)
      smallCache.put('a', '1')
      smallCache.put('b', '2')
      smallCache.put('c', '3')

      // Access 'a' to refresh its position
      smallCache.get('a')

      // Adding 'd' should evict 'b' (now the oldest)
      smallCache.put('d', '4')
      expect(smallCache.get('a')).toBe('1')
      expect(smallCache.get('b')).toBeNull()
      expect(smallCache.get('d')).toBe('4')
    })

    it('should overwrite without growing beyond maxSize', () => {
      const smallCache = new LLMCache(2, 300_000)
      smallCache.put('a', '1')
      smallCache.put('b', '2')
      smallCache.put('a', '1-updated')

      expect(smallCache.stats.size).toBe(2)
      expect(smallCache.get('a')).toBe('1-updated')
    })
  })

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.put('a', '1')
      cache.put('b', '2')
      cache.clear()

      expect(cache.get('a')).toBeNull()
      expect(cache.get('b')).toBeNull()
      expect(cache.stats.size).toBe(0)
    })

    it('should reset statistics on clear', () => {
      cache.put('a', '1')
      cache.get('a')  // hit
      cache.get('b')  // miss
      cache.clear()

      const stats = cache.stats
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
    })
  })

  describe('stats', () => {
    it('should track hit/miss statistics', () => {
      cache.put('a', '1')
      cache.get('a')    // hit
      cache.get('a')    // hit
      cache.get('b')    // miss

      const stats = cache.stats
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(2 / 3)
    })

    it('should return zero hitRate when no requests', () => {
      expect(cache.stats.hitRate).toBe(0)
    })

    it('should report correct size and maxSize', () => {
      cache.put('a', '1')
      cache.put('b', '2')

      const stats = cache.stats
      expect(stats.size).toBe(2)
      expect(stats.maxSize).toBe(100)
      expect(stats.ttlMs).toBe(300_000)
    })
  })

  describe('hash key determinism', () => {
    it('should produce the same hash for the same inputs', () => {
      cache.put('prompt', 'response', 'role', 'model')
      const first = cache.get('prompt', 'role', 'model')
      const second = cache.get('prompt', 'role', 'model')
      expect(first).toBe(second)
    })

    it('should produce different hashes for different inputs', () => {
      cache.put('prompt1', 'response')
      cache.put('prompt2', 'response')

      expect(cache.get('prompt1')).toBe('response')
      expect(cache.get('prompt2')).toBe('response')
      expect(cache.stats.size).toBe(2)
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton', () => {
      expect(llmCache).toBeInstanceOf(LLMCache)
    })
  })

  describe('edge cases', () => {
    it('should handle empty prompt', () => {
      cache.put('', 'empty-response')
      expect(cache.get('')).toBe('empty-response')
    })

    it('should handle very long prompts', () => {
      const longPrompt = 'x'.repeat(10_000)
      cache.put(longPrompt, 'long-response')
      expect(cache.get(longPrompt)).toBe('long-response')
    })

    it('should handle unicode prompts', () => {
      cache.put('你好世界', 'hello')
      expect(cache.get('你好世界')).toBe('hello')
    })

    it('should handle expired entries during LRU eviction', () => {
      const smallCache = new LLMCache(2, 300_000)
      smallCache.put('a', '1')
      vi.advanceTimersByTime(300_001) // expire 'a'
      smallCache.put('b', '2')
      smallCache.put('c', '3')

      // 'a' should be expired and evictable
      expect(smallCache.get('a')).toBeNull()
      expect(smallCache.get('b')).toBe('2')
    })
  })
})
