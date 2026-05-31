import { configManager } from './configSchema'
import type { CollaborationConfig } from './configSchema'

export type MetricType = 'counter' | 'gauge' | 'histogram'

export interface MetricDefinition {
  name: string
  type: MetricType
  help: string
  labels?: string[]
}

export interface MetricValue {
  value: number
  labels?: Record<string, string>
  timestamp: number
}

export interface HistogramBucket {
  le: number
  count: number
}

export interface AlertRule {
  metricName: string
  threshold: number
  operator: 'gt' | 'lt' | 'gte' | 'lte'
  callback: (metricName: string, value: number, threshold: number) => void
}

const DEFAULT_HISTOGRAM_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

export class MetricsCollector {
  private definitions: Map<string, MetricDefinition>
  private counterValues: Map<string, number>
  private gaugeValues: Map<string, number>
  private histogramData: Map<string, { buckets: Map<number, number>; sum: number; count: number }>
  private alertRules: Map<string, AlertRule[]>
  private enabled: boolean
  private exportTimer: ReturnType<typeof setInterval> | null
  private exportCallback: ((data: string) => void) | null
  private configListener: (config: CollaborationConfig) => void

  constructor() {
    const metricsConfig = configManager.getConfig().metrics
    this.definitions = new Map()
    this.counterValues = new Map()
    this.gaugeValues = new Map()
    this.histogramData = new Map()
    this.alertRules = new Map()
    this.enabled = metricsConfig.enabled
    this.exportTimer = null
    this.exportCallback = null

    this.registerMetric({ name: 'conversation_rounds', type: 'counter', help: '对话轮次' })
    this.registerMetric({ name: 'task_duration_ms', type: 'histogram', help: '任务完成时长' })
    this.registerMetric({ name: 'message_processing_latency_ms', type: 'histogram', help: '消息处理延迟' })
    this.registerMetric({ name: 'consensus_time_ms', type: 'histogram', help: '共识达成时间' })
    this.registerMetric({ name: 'error_count', type: 'counter', help: '错误计数' })
    this.registerMetric({ name: 'approval_wait_time_ms', type: 'histogram', help: '审批等待时长' })
    this.registerMetric({ name: 'active_agents', type: 'gauge', help: '活跃 Agent 数量' })
    this.registerMetric({ name: 'pending_approvals', type: 'gauge', help: '待审批数量' })

    this.configListener = (config: CollaborationConfig) => {
      this.enabled = config.metrics.enabled
      if (this.exportTimer !== null) {
        this.stopAutoExport()
        if (this.enabled && this.exportCallback) {
          this.startAutoExport(this.exportCallback)
        }
      }
    }
    configManager.addListener(this.configListener)
  }

  private getLabelKey(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return ''
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
  }

  private parseLabelKey(labelKey: string): Record<string, string> | undefined {
    if (!labelKey) return undefined
    const labels: Record<string, string> = {}
    const pairs = labelKey.match(/(\w+)="([^"]*)"/g)
    if (!pairs) return undefined
    for (const pair of pairs) {
      const match = pair.match(/(\w+)="([^"]*)"/)
      if (match) {
        labels[match[1]] = match[2]
      }
    }
    return Object.keys(labels).length > 0 ? labels : undefined
  }

  private checkAlerts(name: string, value: number): void {
    const rules = this.alertRules.get(name)
    if (!rules) return
    for (const rule of rules) {
      let triggered = false
      switch (rule.operator) {
        case 'gt': triggered = value > rule.threshold; break
        case 'lt': triggered = value < rule.threshold; break
        case 'gte': triggered = value >= rule.threshold; break
        case 'lte': triggered = value <= rule.threshold; break
      }
      if (triggered) {
        rule.callback(rule.metricName, value, rule.threshold)
      }
    }
  }

  registerMetric(definition: MetricDefinition): void {
    this.definitions.set(definition.name, definition)
  }

  recordCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    if (!this.enabled) return
    const def = this.definitions.get(name)
    if (!def || def.type !== 'counter') return
    const key = `${name}|${this.getLabelKey(labels)}`
    const current = this.counterValues.get(key) ?? 0
    const newValue = current + value
    this.counterValues.set(key, newValue)
    this.checkAlerts(name, newValue)
  }

  recordGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return
    const def = this.definitions.get(name)
    if (!def || def.type !== 'gauge') return
    const key = `${name}|${this.getLabelKey(labels)}`
    this.gaugeValues.set(key, value)
    this.checkAlerts(name, value)
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return
    const def = this.definitions.get(name)
    if (!def || def.type !== 'histogram') return
    const key = `${name}|${this.getLabelKey(labels)}`
    let data = this.histogramData.get(key)
    if (!data) {
      const buckets = new Map<number, number>()
      for (const le of DEFAULT_HISTOGRAM_BUCKETS) {
        buckets.set(le, 0)
      }
      data = { buckets, sum: 0, count: 0 }
      this.histogramData.set(key, data)
    }
    data.sum += value
    data.count += 1
    for (const le of DEFAULT_HISTOGRAM_BUCKETS) {
      if (value <= le) {
        data.buckets.set(le, (data.buckets.get(le) ?? 0) + 1)
      }
    }
    this.checkAlerts(name, value)
  }

  addAlertRule(rule: AlertRule): void {
    const existing = this.alertRules.get(rule.metricName) ?? []
    existing.push(rule)
    this.alertRules.set(rule.metricName, existing)
  }

  removeAlertRule(metricName: string): void {
    this.alertRules.delete(metricName)
  }

  exportPrometheus(): string {
    const lines: string[] = []

    for (const [name, def] of this.definitions) {
      lines.push(`# TYPE ${name} ${def.type}`)

      if (def.type === 'counter') {
        for (const [key, value] of this.counterValues) {
          if (key.startsWith(`${name}|`)) {
            const labelPart = key.substring(name.length + 1)
            if (labelPart) {
              lines.push(`${name}{${labelPart}} ${value}`)
            } else {
              lines.push(`${name} ${value}`)
            }
          }
        }
      } else if (def.type === 'gauge') {
        for (const [key, value] of this.gaugeValues) {
          if (key.startsWith(`${name}|`)) {
            const labelPart = key.substring(name.length + 1)
            if (labelPart) {
              lines.push(`${name}{${labelPart}} ${value}`)
            } else {
              lines.push(`${name} ${value}`)
            }
          }
        }
      } else if (def.type === 'histogram') {
        for (const [key, data] of this.histogramData) {
          if (key.startsWith(`${name}|`)) {
            const labelPart = key.substring(name.length + 1)
            const buildLabels = (extra: string) => {
              if (labelPart) return `{${labelPart},${extra}}`
              return `{${extra}}`
            }
            for (const [le, count] of data.buckets) {
              lines.push(`${name}_bucket${buildLabels(`le="${le}"`)} ${count}`)
            }
            lines.push(`${name}_bucket${buildLabels('le="+Inf"')} ${data.count}`)
            lines.push(`${name}_sum${labelPart ? `{${labelPart}}` : ''} ${data.sum}`)
            lines.push(`${name}_count${labelPart ? `{${labelPart}}` : ''} ${data.count}`)
          }
        }
      }
    }

    return lines.join('\n')
  }

  exportJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [name, def] of this.definitions) {
      if (def.type === 'counter') {
        const values: Array<{ labels?: Record<string, string>; value: number }> = []
        for (const [key, value] of this.counterValues) {
          if (key.startsWith(`${name}|`)) {
            const labelPart = key.substring(name.length + 1)
            const labels = this.parseLabelKey(labelPart)
            values.push(labels ? { labels, value } : { value })
          }
        }
        result[name] = { type: def.type, help: def.help, values }
      } else if (def.type === 'gauge') {
        const values: Array<{ labels?: Record<string, string>; value: number }> = []
        for (const [key, value] of this.gaugeValues) {
          if (key.startsWith(`${name}|`)) {
            const labelPart = key.substring(name.length + 1)
            const labels = this.parseLabelKey(labelPart)
            values.push(labels ? { labels, value } : { value })
          }
        }
        result[name] = { type: def.type, help: def.help, values }
      } else if (def.type === 'histogram') {
        const values: Array<{ labels?: Record<string, string>; buckets: HistogramBucket[]; sum: number; count: number }> = []
        for (const [key, data] of this.histogramData) {
          if (key.startsWith(`${name}|`)) {
            const labelPart = key.substring(name.length + 1)
            const labels = this.parseLabelKey(labelPart)
            const buckets: HistogramBucket[] = []
            for (const [le, count] of data.buckets) {
              buckets.push({ le, count })
            }
            buckets.push({ le: Infinity, count: data.count })
            const entry: { labels?: Record<string, string>; buckets: HistogramBucket[]; sum: number; count: number } = { buckets, sum: data.sum, count: data.count }
            if (labels) entry.labels = labels
            values.push(entry)
          }
        }
        result[name] = { type: def.type, help: def.help, values }
      }
    }

    return result
  }

  getMetric(name: string): MetricValue[] {
    const def = this.definitions.get(name)
    if (!def) return []

    const values: MetricValue[] = []
    const timestamp = Date.now()

    if (def.type === 'counter') {
      for (const [key, value] of this.counterValues) {
        if (key.startsWith(`${name}|`)) {
          const labelPart = key.substring(name.length + 1)
          const labels = this.parseLabelKey(labelPart)
          values.push({ value, labels, timestamp })
        }
      }
    } else if (def.type === 'gauge') {
      for (const [key, value] of this.gaugeValues) {
        if (key.startsWith(`${name}|`)) {
          const labelPart = key.substring(name.length + 1)
          const labels = this.parseLabelKey(labelPart)
          values.push({ value, labels, timestamp })
        }
      }
    } else if (def.type === 'histogram') {
      for (const [key, data] of this.histogramData) {
        if (key.startsWith(`${name}|`)) {
          const labelPart = key.substring(name.length + 1)
          const labels = this.parseLabelKey(labelPart)
          values.push({ value: data.count, labels, timestamp })
        }
      }
    }

    return values
  }

  clear(): void {
    this.counterValues.clear()
    this.gaugeValues.clear()
    this.histogramData.clear()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  startAutoExport(callback: (data: string) => void): void {
    this.stopAutoExport()
    this.exportCallback = callback
    if (!this.enabled) return
    const config = configManager.getConfig().metrics
    const format = config.exportFormat
    this.exportTimer = setInterval(() => {
      if (!this.enabled) return
      const data = format === 'prometheus' ? this.exportPrometheus() : JSON.stringify(this.exportJSON())
      callback(data)
    }, config.exportInterval)
  }

  stopAutoExport(): void {
    if (this.exportTimer !== null) {
      clearInterval(this.exportTimer)
      this.exportTimer = null
    }
  }

  destroy(): void {
    this.stopAutoExport()
    configManager.removeListener(this.configListener)
  }
}

export const metricsCollector = new MetricsCollector()
