import { configManager } from './configSchema'
import type { CollaborationConfig } from './configSchema'

export interface TraceSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  causalMessageId?: string
  startTime: number
  endTime?: number
  label?: string
  sampled?: boolean
}

export function generateTraceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function generateSpanId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export class TraceContextManager {
  private currentSpan: TraceSpan | null = null
  private spans: TraceSpan[] = []
  private enabled: boolean
  private sampleRate: number
  private configListener: (config: CollaborationConfig) => void

  constructor() {
    const tracingConfig = configManager.getConfig().tracing
    this.enabled = tracingConfig.enabled
    this.sampleRate = tracingConfig.sampleRate

    this.configListener = (config: CollaborationConfig) => {
      this.enabled = config.tracing.enabled
      this.sampleRate = config.tracing.sampleRate
    }
    configManager.addListener(this.configListener)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  startSpan(label?: string): TraceSpan {
    const span: TraceSpan = {
      traceId: this.currentSpan?.traceId ?? generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId: this.currentSpan?.spanId,
      startTime: Date.now(),
      label,
      sampled: this.shouldSample(),
    }
    this.currentSpan = span
    this.spans.push(span)
    return span
  }

  startChildSpan(label?: string): TraceSpan {
    if (!this.currentSpan) {
      return this.startSpan(label)
    }
    const span: TraceSpan = {
      traceId: this.currentSpan.traceId,
      spanId: generateSpanId(),
      parentSpanId: this.currentSpan.spanId,
      startTime: Date.now(),
      label,
      sampled: this.currentSpan.sampled,
    }
    this.currentSpan = span
    this.spans.push(span)
    return span
  }

  injectFromMessage(messageId: string, label?: string): TraceSpan {
    const span: TraceSpan = {
      traceId: this.currentSpan?.traceId ?? generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId: this.currentSpan?.spanId,
      causalMessageId: messageId,
      startTime: Date.now(),
      label,
      sampled: this.currentSpan?.sampled ?? this.shouldSample(),
    }
    this.currentSpan = span
    this.spans.push(span)
    return span
  }

  getCurrentSpan(): TraceSpan | null {
    return this.currentSpan
  }

  endCurrentSpan(): void {
    if (this.currentSpan) {
      this.currentSpan.endTime = Date.now()
      this.currentSpan = null
    }
  }

  getSpans(): TraceSpan[] {
    return [...this.spans]
  }

  clear(): void {
    this.currentSpan = null
    this.spans = []
  }

  destroy(): void {
    this.clear()
    configManager.removeListener(this.configListener)
  }

  getTraceparent(): string {
    const span = this.currentSpan
    const traceId = span?.traceId ?? generateTraceId()
    const spanId = span?.spanId ?? generateSpanId()
    const flags = span?.sampled !== false ? '01' : '00'
    return `00-${traceId}-${spanId}-${flags}`
  }

  getTracestate(): string {
    const span = this.currentSpan
    const traceId = span?.traceId ?? generateTraceId()
    const spanId = span?.spanId ?? generateSpanId()
    return `multi-agent=${traceId}:${spanId}`
  }

  setSampled(sampled: boolean): void {
    if (this.currentSpan) {
      this.currentSpan.sampled = sampled
    }
  }

  inject(headers: Record<string, string>): void {
    if (!this.enabled) return
    headers['traceparent'] = this.getTraceparent()
    headers['tracestate'] = this.getTracestate()
  }

  extract(headers: Record<string, string>): TraceSpan | null {
    const traceparent = headers['traceparent']
    if (!traceparent) {
      return null
    }
    const parts = traceparent.split('-')
    if (parts.length !== 4) {
      return null
    }
    const [version, traceId, spanId, flags] = parts
    if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) {
      return null
    }
    const span: TraceSpan = {
      traceId,
      spanId,
      startTime: Date.now(),
      sampled: flags === '01',
    }
    this.currentSpan = span
    this.spans.push(span)
    return span
  }

  static injectHeaders(context: TraceContextManager, headers: Record<string, string>): void {
    context.inject(headers)
  }

  static extractFromHeaders(headers: Record<string, string>): TraceSpan | null {
    const traceparent = headers['traceparent']
    if (!traceparent) {
      return null
    }
    const parts = traceparent.split('-')
    if (parts.length !== 4) {
      return null
    }
    const [version, traceId, spanId, flags] = parts
    if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) {
      return null
    }
    return {
      traceId,
      spanId,
      startTime: Date.now(),
      sampled: flags === '01',
    }
  }

  private shouldSample(): boolean {
    return Math.random() < this.sampleRate
  }
}
