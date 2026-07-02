import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetricsCollector } from '../metricsCollector'

describe('MetricsCollector', () => {
  let collector: InstanceType<typeof MetricsCollector>

  beforeEach(() => {
    vi.useFakeTimers()
    collector = new MetricsCollector()
    // Enable metrics
    ;(collector as any).enabled = true
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should register default metrics', () => {
    // Default metrics should be registered in constructor
    const defs = (collector as any).definitions as Map<string, any>
    expect(defs.has('conversation_rounds')).toBe(true)
    expect(defs.has('task_duration_ms')).toBe(true)
    expect(defs.has('error_count')).toBe(true)
    expect(defs.has('active_agents')).toBe(true)
  })

  it('should record counter', () => {
    collector.recordCounter('conversation_rounds')
    collector.recordCounter('conversation_rounds')
    collector.recordCounter('conversation_rounds', 3)

    const counters = (collector as any).counterValues as Map<string, number>
    expect(counters.get('conversation_rounds|')).toBe(5) // 1 + 1 + 3
  })

  it('should record gauge', () => {
    collector.recordGauge('active_agents', 5)
    collector.recordGauge('active_agents', 3)

    const gauges = (collector as any).gaugeValues as Map<string, number>
    expect(gauges.get('active_agents|')).toBe(3) // gauge overwrites
  })

  it('should record histogram', () => {
    collector.recordHistogram('task_duration_ms', 100)
    collector.recordHistogram('task_duration_ms', 200)
    collector.recordHistogram('task_duration_ms', 500)

    const hist = (collector as any).histogramData as Map<string, any>
    const data = hist.get('task_duration_ms|')
    expect(data.count).toBe(3)
    expect(data.sum).toBe(800)
  })

  it('should not record when disabled', () => {
    ;(collector as any).enabled = false

    collector.recordCounter('conversation_rounds')
    collector.recordGauge('active_agents', 5)

    const counters = (collector as any).counterValues as Map<string, number>
    const gauges = (collector as any).gaugeValues as Map<string, number>
    expect(counters.size).toBe(0)
    expect(gauges.size).toBe(0)
  })

  it('should handle labels', () => {
    collector.recordCounter('conversation_rounds', 1, { agent: 'ceo' })
    collector.recordCounter('conversation_rounds', 1, { agent: 'executor' })
    collector.recordCounter('conversation_rounds', 1, { agent: 'ceo' })

    const counters = (collector as any).counterValues as Map<string, number>
    expect(counters.get('conversation_rounds|agent=\"ceo\"')).toBe(2)
    expect(counters.get('conversation_rounds|agent=\"executor\"')).toBe(1)
  })

  it('should trigger alert on threshold', () => {
    const callback = vi.fn()
    collector.addAlertRule({
      metricName: 'error_count',
      threshold: 5,
      operator: 'gt',
      callback,
    })

    collector.recordCounter('error_count', 3)
    expect(callback).not.toHaveBeenCalled()

    collector.recordCounter('error_count', 4) // total = 7 > 5
    expect(callback).toHaveBeenCalledWith('error_count', 7, 5)
  })

  it('should export metrics as text', () => {
    collector.recordCounter('error_count', 3)
    collector.recordGauge('active_agents', 5)

    const text = collector.exportPrometheus()
    expect(text).toContain('error_count')
    expect(text).toContain('active_agents')
  })
})
