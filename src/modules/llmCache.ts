/**
 * LLM 响应缓存模块
 *
 * 基于 MD5-like 哈希键、TTL 300s、LRU 淘汰策略的 LLM 缓存。
 * 最大 100 条目，仅缓存 semantic_analyze 结果。
 */

interface CacheEntry {
  response: string
  role: string
  model: string
  createdAt: number
  lastAccessedAt: number
}

export interface LLMCacheStats {
  size: number
  maxSize: number
  hits: number
  misses: number
  hitRate: number
  ttlMs: number
}

export class LLMCache {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly maxSize: number
  private readonly ttlMs: number
  private hits = 0
  private misses = 0

  constructor(maxSize = 100, ttlMs = 300_000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  /**
   * MD5-like 哈希：将 prompt + role + model 混合为 32 位 hex 字符串。
   * 浏览器/Node 环境兼容的确定性哈希。
   */
  private hashKey(prompt: string, role: string, model: string): string {
    const raw = `${role}:${model}:${prompt}`
    let h1 = 0x811c9dc5
    let h2 = 0x01000193
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i)
      h1 ^= ch
      h1 = Math.imul(h1, 0x01000193) >>> 0
      h2 ^= ch
      h2 = Math.imul(h2, 0x811c9dc5) >>> 0
    }
    const hash = (h1.toString(16).padStart(8, '0') +
      h2.toString(16).padStart(8, '0') +
      ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0') +
      ((h1 + h2) >>> 0).toString(16).padStart(8, '0'))
    return hash
  }

  /**
   * 从缓存获取响应。
   * 返回 null 表示缓存未命中或已过期。
   */
  get(prompt: string, role = 'default', model = 'default'): string | null {
    const key = this.hashKey(prompt, role, model)
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    // TTL 检查
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // LRU：更新访问时间并移到末尾
    entry.lastAccessedAt = Date.now()
    this.cache.delete(key)
    this.cache.set(key, entry)
    this.hits++
    return entry.response
  }

  /**
   * 将 LLM 响应写入缓存。
   */
  put(prompt: string, response: string, role = 'default', model = 'default'): void {
    const key = this.hashKey(prompt, role, model)

    // 已存在则先删除再重新插入（保持 LRU 顺序）
    this.cache.delete(key)

    // LRU 淘汰：缓存满时删除最久未访问的（Map 迭代顺序即插入顺序）
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      } else {
        break
      }
    }

    const now = Date.now()
    this.cache.set(key, {
      response,
      role,
      model,
      createdAt: now,
      lastAccessedAt: now,
    })
  }

  /**
   * 清空缓存并重置统计。
   */
  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  /**
   * 返回缓存统计信息。
   */
  get stats(): LLMCacheStats {
    const totalRequests = this.hits + this.misses
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      ttlMs: this.ttlMs,
    }
  }
}

/** 全局单例 */
export const llmCache = new LLMCache()
