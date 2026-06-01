import { generateTraceId, generateSpanId, TraceContextManager } from '../traceContext'

describe('generateTraceId', () => {
    it('should return a 32-character hex string', () => {
        const id = generateTraceId()
        expect(id).toMatch(/^[0-9a-f]{32}$/)
    })

    it('should return different values on successive calls', () => {
        const id1 = generateTraceId()
        const id2 = generateTraceId()
        expect(id1).not.toBe(id2)
    })
})

describe('generateSpanId', () => {
    it('should return a 16-character hex string', () => {
        const id = generateSpanId()
        expect(id).toMatch(/^[0-9a-f]{16}$/)
    })
})

describe('TraceContextManager', () => {
    let tm: TraceContextManager

    afterEach(() => {
        tm.destroy()
    })

    describe('getTraceparent format', () => {
        it('should return valid traceparent format with active span', () => {
            tm = new TraceContextManager()
            tm.startSpan()

            const tp = tm.getTraceparent()
            expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/)
        })

        it('should return valid traceparent format with no active span', () => {
            tm = new TraceContextManager()

            const tp = tm.getTraceparent()
            expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/)
        })
    })

    describe('getTracestate format', () => {
        it('should return multi-agent format with active span', () => {
            tm = new TraceContextManager()
            const span = tm.startSpan()

            const ts = tm.getTracestate()
            expect(ts).toBe(`multi-agent=${span.traceId}:${span.spanId}`)
        })
    })

    describe('inject/extract round-trip consistency', () => {
        it('should preserve traceId and spanId through inject/extract', () => {
            tm = new TraceContextManager()
            const original = tm.startSpan()

            const headers: Record<string, string> = {}
            tm.inject(headers)

            expect(headers['traceparent']).toBeDefined()
            expect(headers['tracestate']).toBeDefined()

            const tm2 = new TraceContextManager()
            const extracted = tm2.extract(headers)

            expect(extracted).not.toBeNull()
            expect(extracted!.traceId).toBe(original.traceId)
            expect(extracted!.spanId).toBe(original.spanId)

            tm2.destroy()
        })
    })

    describe('setSampled', () => {
        it('should make traceparent end with -00 when setSampled(false)', () => {
            tm = new TraceContextManager()
            tm.startSpan()
            tm.setSampled(false)

            const tp = tm.getTraceparent()
            expect(tp).toMatch(/-00$/)
        })

        it('should make traceparent end with -01 when setSampled(true)', () => {
            tm = new TraceContextManager()
            tm.startSpan()
            tm.setSampled(false)
            tm.setSampled(true)

            const tp = tm.getTraceparent()
            expect(tp).toMatch(/-01$/)
        })
    })

    describe('extract with invalid headers', () => {
        it('should return null when extracting from empty headers', () => {
            tm = new TraceContextManager()
            const result = tm.extract({})
            expect(result).toBeNull()
        })

        it('should return null when traceparent has wrong format', () => {
            tm = new TraceContextManager()
            const result = tm.extract({ traceparent: 'invalid-format' })
            expect(result).toBeNull()
        })

        it('should return null when traceparent has wrong version', () => {
            tm = new TraceContextManager()
            const traceId = generateTraceId()
            const spanId = generateSpanId()
            const result = tm.extract({ traceparent: `ff-${traceId}-${spanId}-01` })
            expect(result).toBeNull()
        })
    })

    describe('span lifecycle', () => {
        it('should create a span with traceId, spanId, and startTime on startSpan', () => {
            tm = new TraceContextManager()
            const span = tm.startSpan('test')

            expect(span.traceId).toMatch(/^[0-9a-f]{32}$/)
            expect(span.spanId).toMatch(/^[0-9a-f]{16}$/)
            expect(span.startTime).toBeTypeOf('number')
            expect(span.label).toBe('test')
        })

        it('should create a child span with same traceId, new spanId, and parentSpanId', () => {
            tm = new TraceContextManager()
            const parent = tm.startSpan('parent')
            const child = tm.startChildSpan('child')

            expect(child.traceId).toBe(parent.traceId)
            expect(child.spanId).not.toBe(parent.spanId)
            expect(child.parentSpanId).toBe(parent.spanId)
        })

        it('should set endTime on current span when endCurrentSpan is called', () => {
            tm = new TraceContextManager()
            tm.startSpan()
            tm.endCurrentSpan()

            const spans = tm.getSpans()
            expect(spans[0].endTime).toBeTypeOf('number')
            expect(tm.getCurrentSpan()).toBeNull()
        })

        it('should return all created spans from getSpans', () => {
            tm = new TraceContextManager()
            tm.startSpan('first')
            tm.startChildSpan('second')
            tm.startChildSpan('third')

            const spans = tm.getSpans()
            expect(spans).toHaveLength(3)
            expect(spans[0].label).toBe('first')
            expect(spans[1].label).toBe('second')
            expect(spans[2].label).toBe('third')
        })
    })
})
