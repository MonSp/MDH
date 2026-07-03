import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetricsCollector } from '../metricsCollector'

describe('MetricsCollector', () => {
  let mc: InstanceType<typeof MetricsCollector>

  beforeEach(() => {
    vi.useFakeTimers()
    mc = new MetricsCollector()
    ;(mc as any).enabled = true
  })

  afterEach(() => {
    mc.destroy()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should register 8 default metrics', () => {
      const defs = (mc as any).definitions as Map<string, any>
      expect(defs.size).toBe(8)
      expect(defs.has('conversation_rounds')).toBe(true)
      expect(defs.has('task_duration_ms')).toBe(true)
      expect(defs.has('message_processing_latency_ms')).toBe(true)
      expect(defs.has('consensus_time_ms')).toBe(true)
      expect(defs.has('error_count')).toBe(true)
      expect(defs.has('approval_wait_time_ms')).toBe(true)
      expect(defs.has('active_agents')).toBe(true)
      expect(defs.has('pending_approvals')).toBe(true)
    })
  })

  describe('recordCounter', () => {
    it('should accumulate values', () => {
      mc.recordCounter('conversation_rounds')
      mc.recordCounter('conversation_rounds')
      mc.recordCounter('conversation_rounds', 3)
      expect((mc as any).counterValues.get('conversation_rounds|')).toBe(5)
    })

    it('should skip unknown metric', () => {
      mc.recordCounter('nonexistent')
      expect((mc as any).counterValues.size).toBe(0)
    })

    it('should skip non-counter metric', () => {
      mc.recordCounter('active_agents') // gauge
      expect((mc as any).counterValues.size).toBe(0)
    })

    it('should handle labels with sorted keys', () => {
      mc.recordCounter('error_count', 1, { b: '2', a: '1' })
      expect((mc as any).counterValues.has('error_count|a="1",b="2"')).toBe(true)
    })

    it('should not record when disabled', () => {
      ;(mc as any).enabled = false
      mc.recordCounter('conversation_rounds')
      expect((mc as any).counterValues.size).toBe(0)
    })
  })

  describe('recordGauge', () => {
    it('should overwrite values', () => {
      mc.recordGauge('active_agents', 5)
      mc.recordGauge('active_agents', 3)
      expect((mc as any).gaugeValues.get('active_agents|')).toBe(3)
    })

    it('should skip non-gauge metric', () => {
      mc.recordGauge('conversation_rounds') // counter
      expect((mc as any).gaugeValues.size).toBe(0)
    })

    it('should not record when disabled', () => {
      ;(mc as any).enabled = false
      mc.recordGauge('active_agents', 5)
      expect((mc as any).gaugeValues.size).toBe(0)
    })
  })

  describe('recordHistogram', () => {
    it('should create buckets and accumulate', () => {
      mc.recordHistogram('task_duration_ms', 50)
      mc.recordHistogram('task_duration_ms', 150)
      mc.recordHistogram('task_duration_ms', 3000)

      const data = (mc as any).histogramData.get('task_duration_ms|')
      expect(data.count).toBe(3)
      expect(data.sum).toBe(3200)
      expect(data.buckets.get(100)).toBe(1) // 50 <= 100
      expect(data.buckets.get(250)).toBe(2) // 50,150 <= 250
      expect(data.buckets.get(5000)).toBe(3) // all <= 5000
    })

    it('should skip non-histogram metric', () => {
      mc.recordHistogram('conversation_rounds')
      expect((mc as any).histogramData.size).toBe(0)
    })

    it('should not record when disabled', () => {
      ;(mc as any).enabled = false
      mc.recordHistogram('task_duration_ms', 100)
      expect((mc as any).histogramData.size).toBe(0)
    })
  })

  describe('alerts', () => {
    it('should trigger gt alert', () => {
      const cb = vi.fn()
      mc.addAlertRule({ metricName: 'error_count', threshold: 5, operator: 'gt', callback: cb })
      mc.recordCounter('error_count', 6)
      expect(cb).toHaveBeenCalledWith('error_count', 6, 5)
    })

    it('should trigger lt alert', () => {
      const cb = vi.fn()
      mc.addAlertRule({ metricName: 'active_agents', threshold: 2, operator: 'lt', callback: cb })
      mc.recordGauge('active_agents', 1)
      expect(cb).toHaveBeenCalledWith('active_agents', 1, 2)
    })

    it('should trigger gte alert', () => {
      const cb = vi.fn()
      mc.addAlertRule({ metricName: 'error_count', threshold: 5, operator: 'gte', callback: cb })
      mc.recordCounter('error_count', 5)
      expect(cb).toHaveBeenCalledWith('error_count', 5, 5)
    })

    it('should trigger lte alert', () => {
      const cb = vi.fn()
      mc.addAlertRule({ metricName: 'active_agents', threshold: 0, operator: 'lte', callback: cb })
      mc.recordGauge('active_agents', 0)
      expect(cb).toHaveBeenCalledWith('active_agents', 0, 0)
    })

    it('should not trigger when threshold not met', () => {
      const cb = vi.fn()
      mc.addAlertRule({ metricName: 'error_count', threshold: 10, operator: 'gt', callback: cb })
      mc.recordCounter('error_count', 5)
      expect(cb).not.toHaveBeenCalled()
    })

    it('should remove alert rules', () => {
      const cb = vi.fn()
      mc.addAlertRule({ metricName: 'error_count', threshold: 5, operator: 'gt', callback: cb })
      mc.removeAlertRule('error_count')
      mc.recordCounter('error_count', 10)
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('registerMetric', () => {
    it('should register custom metric', () => {
      mc.registerMetric({ name: 'custom', type: 'counter', help: 'test' })
      const defs = (mc as any).definitions as Map<string, any>
      expect(defs.has('custom')).toBe(true)
    })
  })

  describe('exportPrometheus', () => {
    it('should export counter without labels', () => {
      mc.recordCounter('error_count', 3)
      const text = mc.exportPrometheus()
      expect(text).toContain('# TYPE error_count counter')
      expect(text).toContain('error_count 3')
    })

    it('should export counter with labels', () => {
      mc.recordCounter('error_count', 2, { agent: 'ceo' })
      const text = mc.exportPrometheus()
      expect(text).toContain('error_count{agent="ceo"} 2')
    })

    it('should export gauge without labels', () => {
      mc.recordGauge('active_agents', 5)
      const text = mc.exportPrometheus()
      expect(text).toContain('# TYPE active_agents gauge')
      expect(text).toContain('active_agents 5')
    })

    it('should export gauge with labels', () => {
      mc.recordGauge('active_agents', 3, { role: 'executor' })
      const text = mc.exportPrometheus()
      expect(text).toContain('active_agents{role="executor"} 3')
    })

    it('should export histogram with buckets', () => {
      mc.recordHistogram('task_duration_ms', 50)
      mc.recordHistogram('task_duration_ms', 200)
      const text = mc.exportPrometheus()
      expect(text).toContain('# TYPE task_duration_ms histogram')
      expect(text).toContain('task_duration_ms_bucket{le="100"} 1')
      expect(text).toContain('task_duration_ms_bucket{le="250"} 2')
      expect(text).toContain('task_duration_ms_bucket{le="+Inf"} 2')
      expect(text).toContain('task_duration_ms_sum 250')
      expect(text).toContain('task_duration_ms_count 2')
    })

    it('should export histogram with labels', () => {
      mc.recordHistogram('task_duration_ms', 100, { agent: 'a1' })
      const text = mc.exportPrometheus()
      expect(text).toContain('task_duration_ms_bucket{agent="a1",le="250"} 1')
      expect(text).toContain('task_duration_ms_sum{agent="a1"} 100')
    })
  })

  describe('exportJSON', () => {
    it('should export counter', () => {
      mc.recordCounter('error_count', 3)
      const json = mc.exportJSON() as any
      expect(json.error_count.type).toBe('counter')
      expect(json.error_count.values).toHaveLength(1)
      expect(json.error_count.values[0].value).toBe(3)
    })

    it('should export counter with labels', () => {
      mc.recordCounter('error_count', 1, { agent: 'ceo' })
      const json = mc.exportJSON() as any
      expect(json.error_count.values[0].labels).toEqual({ agent: 'ceo' })
    })

    it('should export gauge', () => {
      mc.recordGauge('active_agents', 5)
      const json = mc.exportJSON() as any
      expect(json.active_agents.type).toBe('gauge')
      expect(json.active_agents.values[0].value).toBe(5)
    })

    it('should export gauge with labels', () => {
      mc.recordGauge('active_agents', 3, { role: 'executor' })
      const json = mc.exportJSON() as any
      expect(json.active_agents.values[0].labels).toEqual({ role: 'executor' })
    })

    it('should export histogram with buckets', () => {
      mc.recordHistogram('task_duration_ms', 100)
      const json = mc.exportJSON() as any
      expect(json.task_duration_ms.type).toBe('histogram')
      expect(json.task_duration_ms.values[0].count).toBe(1)
      expect(json.task_duration_ms.values[0].sum).toBe(100)
      expect(json.task_duration_ms.values[0].buckets.length).toBeGreaterThan(0)
      expect(json.task_duration_ms.values[0].buckets.some((b: any) => b.le === Infinity)).toBe(true)
    })

    it('should export histogram with labels', () => {
      mc.recordHistogram('task_duration_ms', 100, { agent: 'a1' })
      const json = mc.exportJSON() as any
      expect(json.task_duration_ms.values[0].labels).toEqual({ agent: 'a1' })
    })
  })

  describe('getMetric', () => {
    it('should return counter values', () => {
      mc.recordCounter('error_count', 5)
      const vals = mc.getMetric('error_count')
      expect(vals).toHaveLength(1)
      expect(vals[0].value).toBe(5)
    })

    it('should return gauge values', () => {
      mc.recordGauge('active_agents', 3)
      const vals = mc.getMetric('active_agents')
      expect(vals).toHaveLength(1)
      expect(vals[0].value).toBe(3)
    })

    it('should return histogram count', () => {
      mc.recordHistogram('task_duration_ms', 100)
      mc.recordHistogram('task_duration_ms', 200)
      const vals = mc.getMetric('task_duration_ms')
      expect(vals).toHaveLength(1)
      expect(vals[0].value).toBe(2) // count
    })

    it('should return empty for unknown metric', () => {
      expect(mc.getMetric('nonexistent')).toEqual([])
    })

    it('should return labeled values', () => {
      mc.recordCounter('error_count', 1, { agent: 'ceo' })
      mc.recordCounter('error_count', 2, { agent: 'executor' })
      const vals = mc.getMetric('error_count')
      expect(vals).toHaveLength(2)
    })
  })

  describe('clear', () => {
    it('should clear all data', () => {
      mc.recordCounter('error_count', 5)
      mc.recordGauge('active_agents', 3)
      mc.recordHistogram('task_duration_ms', 100)

      mc.clear()

      expect((mc as any).counterValues.size).toBe(0)
      expect((mc as any).gaugeValues.size).toBe(0)
      expect((mc as any).histogramData.size).toBe(0)
    })
  })

  describe('isEnabled', () => {
    it('should return enabled state', () => {
      expect(mc.isEnabled()).toBe(true)
      ;(mc as any).enabled = false
      expect(mc.isEnabled()).toBe(false)
    })
  })

  describe('auto export', () => {
    it('should start and stop auto export', () => {
      const cb = vi.fn()
      mc.startAutoExport(cb)
      expect((mc as any).exportTimer).not.toBeNull()

      mc.stopAutoExport()
      expect((mc as any).exportTimer).toBeNull()
    })

    it('should call callback on interval', () => {
      mc.recordCounter('error_count', 1)
      const cb = vi.fn()
      mc.startAutoExport(cb)

      vi.advanceTimersByTime(30000) // default interval
      expect(cb).toHaveBeenCalled()
      expect(cb.mock.calls[0][0]).toContain('error_count')
    })

    it('should not start when disabled', () => {
      ;(mc as any).enabled = false
      const cb = vi.fn()
      mc.startAutoExport(cb)
      expect((mc as any).exportTimer).toBeNull()
    })

    it('should restart on config change', () => {
      const cb = vi.fn()
      mc.startAutoExport(cb)
      const timer1 = (mc as any).exportTimer

      // Trigger config listener
      const listener = (mc as any).configListener
      listener({ metrics: { enabled: true, exportInterval: 5000, exportFormat: 'json' } })

      expect((mc as any).exportTimer).not.toBe(timer1)
    })

    it('should stop on config change to disabled', () => {
      const cb = vi.fn()
      mc.startAutoExport(cb)

      const listener = (mc as any).configListener
      listener({ metrics: { enabled: false, exportInterval: 5000, exportFormat: 'json' } })

      expect((mc as any).exportTimer).toBeNull()
    })

    it('should export JSON via exportJSON directly', () => {
      mc.recordCounter('error_count', 1)
      const json = mc.exportJSON()
      expect(JSON.stringify(json)).toContain('error_count')
    })
  })

  describe('destroy', () => {
    it('should clean up resources', () => {
      const cb = vi.fn()
      mc.startAutoExport(cb)
      mc.destroy()
      expect((mc as any).exportTimer).toBeNull()
    })
  })
})
