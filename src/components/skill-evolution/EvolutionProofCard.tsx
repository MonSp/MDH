import React, { useState, useEffect } from 'react'
import { apiGet } from '../../services/apiFetch'

interface TaskTypeStats {
  task_type: string
  total: number
  with_rules_total: number
  with_rules_success_rate: number
  without_rules_total: number
  without_rules_success_rate: number
  improvement_pct: number
  avg_rule_count?: number
  avg_rule_score?: number
}

interface AbStatsResponse {
  stats: TaskTypeStats[]
  total: number
}

export default function EvolutionProofCard() {
  const [data, setData] = useState<AbStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiGet<AbStatsResponse>('/api/evolution/ab-stats')
      .then(d => setData(d))
      .catch((e: Error) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={s.center}>加载中...</div>
  if (error) return <div style={{ ...s.center, color: '#ef4444' }}>{error}</div>
  if (!data || !data.stats || data.stats.length === 0) return <div style={s.center}>无数据</div>

  const sorted = [...data.stats].sort((a, b) => b.improvement_pct - a.improvement_pct)
  const avgImprovement = sorted.reduce((sum, r) => sum + r.improvement_pct, 0) / sorted.length

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>进化效果验证</span>
        <span style={s.subtitle}>A/B 对比</span>
      </div>

      <div style={s.summaryRow}>
        <div style={s.summaryCard}>
          <div style={{ ...s.summaryValue, color: avgImprovement >= 0 ? '#10b981' : '#ef4444' }}>
            {avgImprovement >= 0 ? '+' : ''}{avgImprovement.toFixed(1)}%
          </div>
          <div style={s.summaryLabel}>平均提升</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryValue}>{data.total}</div>
          <div style={s.summaryLabel}>任务类型</div>
        </div>
      </div>

      <div style={s.body}>
        {sorted.map((item, idx) => {
          const improvement = item.improvement_pct / 100
          const isPositive = improvement >= 0
          const withPct = Math.min(item.with_rules_success_rate, 100)
          const withoutPct = Math.min(item.without_rules_success_rate, 100)
          return (
            <div key={item.task_type || idx} style={s.card}>
              <div style={s.cardHeader}>
                <span style={s.taskType}>{item.task_type}</span>
                <span style={{ ...s.improvementBadge, color: isPositive ? '#10b981' : '#ef4444', background: isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }}>
                  {isPositive ? '↑' : '↓'} {isPositive ? '+' : ''}{item.improvement_pct.toFixed(1)}%
                </span>
              </div>

              <div style={s.barSection}>
                <div style={s.barLabelRow}>
                  <span style={s.barLabel}>有规则</span>
                  <span style={s.barPct}>{item.with_rules_success_rate.toFixed(1)}%</span>
                </div>
                <div style={s.barOuter}>
                  <div style={{ ...s.barInner, width: `${withPct}%`, background: '#10b981' }} />
                </div>
              </div>

              <div style={s.barSection}>
                <div style={s.barLabelRow}>
                  <span style={s.barLabel}>无规则</span>
                  <span style={s.barPct}>{item.without_rules_success_rate.toFixed(1)}%</span>
                </div>
                <div style={s.barOuter}>
                  <div style={{ ...s.barInner, width: `${withoutPct}%`, background: '#6b7280' }} />
                </div>
              </div>

              <div style={s.countRow}>
                <span style={s.countText}>样本: {item.with_rules_total}</span>
                <span style={s.countText}>对照: {item.without_rules_total}</span>
                {item.avg_rule_count !== undefined && item.avg_rule_count > 0 && (
                  <span style={s.countText}>平均规则数: {item.avg_rule_count}</span>
                )}
                {item.avg_rule_score !== undefined && item.avg_rule_score > 0 && (
                  <span style={s.countText}>平均评分: {(item.avg_rule_score * 100).toFixed(0)}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif", color: '#e2e8f0', overflow: 'auto' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' },
  header: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' },
  title: { fontSize: 16, fontWeight: 700, color: '#a78bfa' },
  subtitle: { fontSize: 11, color: '#6b7280', marginLeft: 10 },
  summaryRow: { display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  summaryCard: { background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' as const, flex: 1 },
  summaryValue: { fontSize: 22, fontWeight: 700, color: '#e2e8f0' },
  summaryLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  body: { padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 10 },
  card: { background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  taskType: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  improvementBadge: { padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700 },
  barSection: { marginBottom: 8 },
  barLabelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 },
  barLabel: { fontSize: 11, color: '#9ca3af' },
  barPct: { fontSize: 11, fontWeight: 600, color: '#e2e8f0' },
  barOuter: { height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 5, transition: 'width 0.3s' },
  countRow: { display: 'flex', gap: 16, marginTop: 4 },
  countText: { fontSize: 10, color: '#6b7280' },
}
