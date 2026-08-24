/**
 * FeedbackPanel — 反馈统计面板
 *
 * 在 SkillEvolutionDashboard 中展示人类反馈的汇总统计。
 */

import React, { useState, useEffect } from 'react'
import { apiGet, apiPost, apiDelete } from '../../services/apiFetch'

interface FeedbackSummary {
  total: number
  by_rating: Record<string, number>
  top_improvements: { item: string; count: number }[]
  top_strengths: { item: string; count: number }[]
}

const RATING_COLORS: Record<string, string> = {
  excellent: '#10b981',
  good: '#3b82f6',
  needs_improvement: '#f59e0b',
  poor: '#ef4444',
}

const RATING_LABELS: Record<string, string> = {
  excellent: '优秀',
  good: '良好',
  needs_improvement: '需改进',
  poor: '差',
}

export default function FeedbackPanel() {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/feedback/summary')
      .then(r => r.json())
      .then(data => { if (data.success) setSummary(data.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={s.center}>加载中...</div>
  if (!summary || summary.total === 0) return <div style={s.center}>暂无反馈数据</div>

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>💬 人类反馈统计</span>
        <span style={s.total}>{summary.total} 条反馈</span>
      </div>

      <div style={s.cardRow}>
        {Object.entries(summary.by_rating).map(([rating, count]) => (
          <div key={rating} style={s.card}>
            <div style={{ ...s.cardValue, color: RATING_COLORS[rating] || '#6b7280' }}>{count}</div>
            <div style={s.cardLabel}>{RATING_LABELS[rating] || rating}</div>
          </div>
        ))}
      </div>

      {summary.top_strengths.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>高频优势</div>
          {summary.top_strengths.map((s_item, i) => (
            <div key={i} style={s.listItem}>
              <span style={{ ...s.dot, background: '#10b981' }} />
              <span style={s.itemText}>{s_item.item}</span>
              <span style={s.itemCount}>{s_item.count}次</span>
            </div>
          ))}
        </div>
      )}

      {summary.top_improvements.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>高频改进点</div>
          {summary.top_improvements.map((item, i) => (
            <div key={i} style={s.listItem}>
              <span style={{ ...s.dot, background: '#f59e0b' }} />
              <span style={s.itemText}>{item.item}</span>
              <span style={s.itemCount}>{item.count}次</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 12, fontFamily: "'Noto Sans SC', sans-serif" },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#a78bfa' },
  total: { fontSize: 12, color: '#6b7280' },
  cardRow: { display: 'flex', gap: 10, marginBottom: 16 },
  card: { flex: 1, background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' as const },
  cardValue: { fontSize: 22, fontWeight: 700 },
  cardLabel: { fontSize: 10, color: '#6b7280', marginTop: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 },
  listItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: '#d1d5db' },
  dot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  itemText: { flex: 1 },
  itemCount: { fontSize: 10, color: '#6b7280' },
}
