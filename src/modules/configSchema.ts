export interface RateLimitConfig {
  action: string
  maxPerWindow: number
  windowMs: number
}

export interface CollaborationConfig {
  agenda: {
    stateTimeouts: {
      idle: number
      open_topic: number
      discussion: number
      proposal: number
      voting: number
      emergency: number
    }
    tokenDuration: number
    snapshotInterval: number
  }
  approval: {
    defaultTimeoutMs: number
    escalationStrategy: 'reject' | 'escalate' | 'auto_approve'
    priorityEscalationThreshold: number
    maxBatchSize: number
  }
  compensation: {
    maxDepth: number
    timeoutMs: number
    onFailure: 'abort' | 'skip' | 'manual'
  }
  communication: {
    dlqThreshold: number
    dedupTtlMs: number
    maxRetries: number
    retryDelayMs: number
  }
  security: {
    rateLimits: RateLimitConfig[]
  }
  tracing: {
    enabled: boolean
    propagationFormat: 'w3c' | 'custom'
    sampleRate: number
  }
  metrics: {
    enabled: boolean
    exportFormat: 'prometheus' | 'json'
    exportInterval: number
  }
}

export const DEFAULT_CONFIG: CollaborationConfig = {
  agenda: {
    stateTimeouts: {
      idle: 0,
      open_topic: 300_000,
      discussion: 600_000,
      proposal: 120_000,
      voting: 180_000,
      emergency: 300_000,
    },
    tokenDuration: 60_000,
    snapshotInterval: 300_000,
  },
  approval: {
    defaultTimeoutMs: 300_000,
    escalationStrategy: 'reject',
    priorityEscalationThreshold: 120_000,
    maxBatchSize: 10,
  },
  compensation: {
    maxDepth: 10,
    timeoutMs: 30_000,
    onFailure: 'abort',
  },
  communication: {
    dlqThreshold: 10,
    dedupTtlMs: 300_000,
    maxRetries: 3,
    retryDelayMs: 1_000,
  },
  security: {
    rateLimits: [
      { action: 'message_send', maxPerWindow: 100, windowMs: 60_000 },
      { action: 'task_create', maxPerWindow: 30, windowMs: 60_000 },
    ],
  },
  tracing: {
    enabled: true,
    propagationFormat: 'w3c',
    sampleRate: 1.0,
  },
  metrics: {
    enabled: true,
    exportFormat: 'prometheus',
    exportInterval: 15_000,
  },
}

type ConfigListener = (config: CollaborationConfig) => void

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    const baseVal = (base as Record<string, unknown>)[key]
    const overVal = (override as Record<string, unknown>)[key]
    if (isRecord(baseVal) && isRecord(overVal)) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overVal as Record<string, unknown>)
    } else if (overVal !== undefined) {
      result[key] = overVal
    }
  }
  return result as T
}

function validateConfig(config: CollaborationConfig): boolean {
  const warnings: string[] = []

  const t = config.agenda.stateTimeouts
  for (const [key, val] of Object.entries(t)) {
    if (typeof val !== 'number' || val < 0) {
      warnings.push(`agenda.stateTimeouts.${key} must be >= 0`)
    }
  }
  if (typeof config.agenda.tokenDuration !== 'number' || config.agenda.tokenDuration <= 0) {
    warnings.push('agenda.tokenDuration must be > 0')
  }
  if (typeof config.agenda.snapshotInterval !== 'number' || config.agenda.snapshotInterval <= 0) {
    warnings.push('agenda.snapshotInterval must be > 0')
  }

  if (typeof config.approval.defaultTimeoutMs !== 'number' || config.approval.defaultTimeoutMs <= 0) {
    warnings.push('approval.defaultTimeoutMs must be > 0')
  }
  if (!['reject', 'escalate', 'auto_approve'].includes(config.approval.escalationStrategy)) {
    warnings.push('approval.escalationStrategy must be "reject", "escalate", or "auto_approve"')
  }
  if (typeof config.approval.priorityEscalationThreshold !== 'number' || config.approval.priorityEscalationThreshold < 0) {
    warnings.push('approval.priorityEscalationThreshold must be >= 0')
  }
  if (typeof config.approval.maxBatchSize !== 'number' || config.approval.maxBatchSize <= 0) {
    warnings.push('approval.maxBatchSize must be > 0')
  }

  if (typeof config.compensation.maxDepth !== 'number' || config.compensation.maxDepth <= 0) {
    warnings.push('compensation.maxDepth must be > 0')
  }
  if (typeof config.compensation.timeoutMs !== 'number' || config.compensation.timeoutMs <= 0) {
    warnings.push('compensation.timeoutMs must be > 0')
  }
  if (!['abort', 'skip', 'manual'].includes(config.compensation.onFailure)) {
    warnings.push('compensation.onFailure must be "abort", "skip", or "manual"')
  }

  if (typeof config.communication.dlqThreshold !== 'number' || config.communication.dlqThreshold < 0) {
    warnings.push('communication.dlqThreshold must be >= 0')
  }
  if (typeof config.communication.dedupTtlMs !== 'number' || config.communication.dedupTtlMs <= 0) {
    warnings.push('communication.dedupTtlMs must be > 0')
  }
  if (typeof config.communication.maxRetries !== 'number' || config.communication.maxRetries < 0) {
    warnings.push('communication.maxRetries must be >= 0')
  }
  if (typeof config.communication.retryDelayMs !== 'number' || config.communication.retryDelayMs < 0) {
    warnings.push('communication.retryDelayMs must be >= 0')
  }

  if (!Array.isArray(config.security.rateLimits)) {
    warnings.push('security.rateLimits must be an array')
  } else {
    for (let i = 0; i < config.security.rateLimits.length; i++) {
      const rl = config.security.rateLimits[i]
      if (typeof rl.maxPerWindow !== 'number' || rl.maxPerWindow <= 0) {
        warnings.push(`security.rateLimits[${i}].maxPerWindow must be > 0`)
      }
      if (typeof rl.windowMs !== 'number' || rl.windowMs <= 0) {
        warnings.push(`security.rateLimits[${i}].windowMs must be > 0`)
      }
    }
  }

  if (typeof config.tracing.sampleRate !== 'number' || config.tracing.sampleRate < 0 || config.tracing.sampleRate > 1) {
    warnings.push('tracing.sampleRate must be between 0 and 1')
  }
  if (!['w3c', 'custom'].includes(config.tracing.propagationFormat)) {
    warnings.push('tracing.propagationFormat must be "w3c" or "custom"')
  }

  if (!['prometheus', 'json'].includes(config.metrics.exportFormat)) {
    warnings.push('metrics.exportFormat must be "prometheus" or "json"')
  }
  if (typeof config.metrics.exportInterval !== 'number' || config.metrics.exportInterval <= 0) {
    warnings.push('metrics.exportInterval must be > 0')
  }

  for (const w of warnings) {
    console.warn(`[ConfigManager] Validation: ${w}`)
  }

  return warnings.length === 0
}

export class ConfigManager {
  private config: CollaborationConfig
  private listeners: ConfigListener[]
  private persistKey?: string

  constructor(initial?: Partial<CollaborationConfig>, options?: { persistKey?: string }) {
    this.listeners = []
    this.persistKey = options?.persistKey ?? undefined
    if (initial) {
      this.config = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, initial as unknown as Record<string, unknown>) as unknown as CollaborationConfig
    } else {
      this.config = structuredClone(DEFAULT_CONFIG)
    }
    if (this.persistKey) {
      this.loadFromStorage()
    }
    validateConfig(this.config)
  }

  getConfig(): CollaborationConfig {
    return structuredClone(this.config)
  }

  updateConfig(partial: Partial<CollaborationConfig>): void {
    const merged = deepMerge(this.config as unknown as Record<string, unknown>, partial as unknown as Record<string, unknown>) as unknown as CollaborationConfig
    if (!validateConfig(merged)) {
      console.warn('[ConfigManager] Config update rejected due to validation failures')
      return
    }
    this.config = merged
    this.saveToStorage()
    for (const listener of this.listeners) {
      listener(structuredClone(this.config))
    }
  }

  addListener(listener: ConfigListener): void {
    this.listeners.push(listener)
  }

  removeListener(listener: ConfigListener): void {
    const idx = this.listeners.indexOf(listener)
    if (idx !== -1) {
      this.listeners.splice(idx, 1)
    }
  }

  clearStorage(): void {
    if (!this.persistKey) return
    try {
      localStorage.removeItem(this.persistKey)
    } catch {}
  }

  private saveToStorage(): void {
    if (!this.persistKey) return
    try {
      localStorage.setItem(this.persistKey, JSON.stringify(this.config))
    } catch {}
  }

  private loadFromStorage(): void {
    if (!this.persistKey) return
    try {
      const json = localStorage.getItem(this.persistKey)
      if (json) {
        const parsed = JSON.parse(json) as Partial<CollaborationConfig>
        const merged = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, parsed as unknown as Record<string, unknown>) as unknown as CollaborationConfig
        if (validateConfig(merged)) {
          this.config = merged
        } else {
          console.warn('[ConfigManager] Persisted config is invalid, using default')
        }
      }
    } catch {}
  }
}

export const configManager = new ConfigManager()
