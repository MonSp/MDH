import React, { useState, useEffect } from 'react'
import { apiGet } from '../../services/apiFetch'

interface QualityBucket {
  total: number
  success_rate: number
}

interface QualityData {
  buckets: {
    low: QualityBucket
    medium: QualityBucket
    high: QualityBucket
  }
  baseline: { total: number; success_rate: number }
  insight: string
}

const BUCKET_CONFIG = [
  { key: 'high' as const, label: '高质量规则', threshold: '≥70%', color: '#10b981', icon: '🟢' },
  { key: 'medium' as const, label: '中质量规则', threshold: '40-70%', color: '#f59e0b', icon: '🟡' },
  { key: 'low' as const, label: '低质量规则', threshold: '<40%', color: '#ef4444', icon: '🔴' },
]

export default function QualityAnalysisPanel() {
  const [data, setData] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(30)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiGet<QualityData>(`/api/evolution/ab-quality?period=${period}`)
      .then(d => setData(d))
      .catch((e: Error) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [period])

  if (loading) return <div style={s.center}>加载中...</div>
  if (error) return <div style={{ ...s.center, color: '#ef4444' }}>{error}</div>
  if (!data) return <div style={s.center}>无数据</div>

  const maxRate = Math.max(
    data.baseline.success_rate,
    data.buckets.high.success_rate,
    data.buckets.medium.success_rate,
    data.buckets.low.success_rate,
    100,
  )

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>规则质量分析</span>
        <span style={s.subtitle}>按有效性评分分桶</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              style={{ ...s.periodBtn, ...(period === d ? s.periodBtnActive : {}) }}
            >
              {d}天
            </button>
          ))}
        </div>
      </div>

      {data.insight && (
        <div style={s.insightBar}>
          <span style={s.insightIcon}>💡</span>
          <span style={s.insightText}>{data.insight}</span>
        </div>
      )}

      <div style={s.body}>
        {/* 基线 */}
        <div style={s.baselineCard}>
          <div style={s.baselineHeader}>
            <span style={s.baselineLabel}>无规则基线</span>
            <span style={s.baselineCount}>{data.baseline.total} 次任务</span>
          </div>
          <div style={s.barRow}>
            <div style={s.barOuter}>
              <div style={{ ...s.barInner, width: `${(data.baseline.success_rate / maxRate) * 100}%`, background: '#6b7280' }} />
            </div>
            <span style={s.barValue}>{data.baseline.success_rate}%</span>
          </div>
        </div>

        {/* 质量分桶 */}
        {BUCKET_CONFIG.map(cfg => {
          const bucket = data.buckets[cfg.key]
          const diff = bucket.success_rate - data.baseline.success_rate
          const hasData = bucket.total > 0
          return (
            <div key={cfg.key} style={{ ...s.bucketCard, opacity: hasData ? 1 : 0.5 }}>
              <div style={s.bucketHeader}>
                <div style={s.bucketTitleRow}>
                  <span>{cfg.icon}</span>
                  <span style={s.bucketLabel}>{cfg.label}</span>
                  <span style={s.bucketThreshold}>{cfg.threshold}</span>
                </div>
                {hasData && (
                  <span style={{
                    ...s.diffBadge,
                    color: diff >= 0 ? '#10b981' : '#ef4444',
                    background: diff >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  }}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                  </span>
                )}
              </div>
              <div style={s.barRow}>
                <div style={s.barOuter}>
                  <div style={{ ...s.barInner, width: `${(bucket.success_rate / maxRate) * 100}%`, background: cfg.color }} />
                </div>
                <span style={s.barValue}>{hasData ? `${bucket.success_rate}%` : '—'}</span>
              </div>
              <div style={s.bucketFooter}>
                <span style={s.sampleText}>{bucket.total} 次任务</span>
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
  header: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: 700, color: '#a78bfa' },
  subtitle: { fontSize: 11, color: '#6b7280' },
  periodBtn: { background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' },
  periodBtnActive: { background: 'rgba(167,139,250,0.2)', color: '#a78bfa' },
  insightBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'rgba(167,139,250,0.08)', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  insightIcon: { fontSize: 14 },
  insightText: { fontSize: 12, color: '#c4b5fd' },
  body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  baselineCard: { background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)' },
  baselineHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  baselineLabel: { fontSize: 13, fontWeight: 600, color: '#9ca3af' },
  baselineCount: { fontSize: 11, color: '#6b7280' },
  bucketCard: { background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)', transition: 'opacity 0.2s' },
  bucketHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bucketTitleRow: { display: 'flex', alignItems: 'center', gap: 6 },
  bucketLabel: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  bucketThreshold: { fontSize: 10, color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4 },
  diffBadge: { padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700 },
  barRow: { display: 'flex', alignItems: 'center', gap: 10 },
  barOuter: { flex: 1, height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 6, transition: 'width 0.3s' },
  barValue: { fontSize: 13, fontWeight: 700, color: '#e2e8f0', minWidth: 48, textAlign: 'right' as const },
  bucketFooter: { marginTop: 6 },
  sampleText: { fontSize: 10, color: '#6b7280' },
}
