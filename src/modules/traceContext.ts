export interface TraceSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  causalMessageId?: string
  startTime: number
  endTime?: number
  label?: string
}

export class TraceContextManager {
  private currentSpan: TraceSpan | null = null
  private spans: TraceSpan[] = []

  startSpan(label?: string): TraceSpan {
    const span: TraceSpan = {
      traceId: crypto.randomUUID(),
      spanId: crypto.randomUUID(),
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
      spanId: crypto.randomUUID(),
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
      traceId: this.currentSpan?.traceId ?? crypto.randomUUID(),
      spanId: crypto.randomUUID(),
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
}
