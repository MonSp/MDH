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

  startSpan(label?: string): TraceSpan {
    const span: TraceSpan = {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      startTime: Date.now(),
      label,
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

  getTraceparent(): string {
    const span = this.currentSpan
    const traceId = span?.traceId ?? generateTraceId()
    const spanId = span?.spanId ?? generateSpanId()
    const flags = span?.sampled ? '01' : '00'
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

  static inject(context: TraceContextManager, headers: Record<string, string>): void {
    headers['traceparent'] = context.getTraceparent()
    headers['tracestate'] = context.getTracestate()
  }

  static extract(headers: Record<string, string>): TraceSpan | null {
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
}
