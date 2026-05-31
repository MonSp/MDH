export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  agentId?: string
  sessionId?: string
  messageType?: string
  causalMessageId?: string
  message: string
  data?: Record<string, unknown>
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export class StructuredLogger {
  private buffer: LogEntry[]
  private maxSize: number
  private minLevel: LogLevel

  constructor(maxSize: number = 1000, minLevel: LogLevel = 'debug') {
    this.buffer = []
    this.maxSize = maxSize
    this.minLevel = minLevel
  }

  log(
    level: LogLevel,
    message: string,
    context?: {
      agentId?: string
      sessionId?: string
      messageType?: string
      causalMessageId?: string
      data?: Record<string, unknown>
    },
  ): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.minLevel]) return

    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level,
      message,
      ...context,
    }

    this.buffer.push(entry)

    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(this.buffer.length - this.maxSize)
    }
  }

  debug(message: string, context?: { agentId?: string; sessionId?: string; messageType?: string; causalMessageId?: string; data?: Record<string, unknown> }): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: { agentId?: string; sessionId?: string; messageType?: string; causalMessageId?: string; data?: Record<string, unknown> }): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: { agentId?: string; sessionId?: string; messageType?: string; causalMessageId?: string; data?: Record<string, unknown> }): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: { agentId?: string; sessionId?: string; messageType?: string; causalMessageId?: string; data?: Record<string, unknown> }): void {
    this.log('error', message, context)
  }

  getEntries(filter?: {
    level?: LogLevel
    agentId?: string
    sessionId?: string
    messageType?: string
  }): LogEntry[] {
    let entries = [...this.buffer]

    if (filter?.level) {
      const minOrder = LOG_LEVEL_ORDER[filter.level]
      entries = entries.filter(e => LOG_LEVEL_ORDER[e.level] >= minOrder)
    }
    if (filter?.agentId) {
      entries = entries.filter(e => e.agentId === filter.agentId)
    }
    if (filter?.sessionId) {
      entries = entries.filter(e => e.sessionId === filter.sessionId)
    }
    if (filter?.messageType) {
      entries = entries.filter(e => e.messageType === filter.messageType)
    }

    return entries
  }

  getLatest(count: number): LogEntry[] {
    return this.buffer.slice(-count)
  }

  clear(): void {
    this.buffer = []
  }

  size(): number {
    return this.buffer.length
  }
}

export const logger = new StructuredLogger()
