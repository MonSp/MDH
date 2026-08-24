import React, { useState, useEffect } from 'react'
import { apiGet } from '../../services/apiFetch'

interface TimelineEvent {
  id: string
  event_type: string
  timestamp: string
  description: string
  agent_id?: string
  rule_id?: string
  details?: Record<string, unknown>
}

const EVENT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  xp_granted: { label: 'XP 授予', color: '#3b82f6', icon: '⭐' },
  skill_level_up: { label: '技能升级', color: '#10b981', icon: '📈' },
  career_promotion: { label: '角色晋升', color: '#f5b800', icon: '🏆' },
  rule_created: { label: '规则创建', color: '#a855f7', icon: '📋' },
  rule_evolved: { label: '规则进化', color: '#f97316', icon: '🔄' },
  rule_demoted: { label: '规则降级', color: '#ef4444', icon: '⬇️' },
  rule_approved: { label: '规则审批', color: '#14b8a6', icon: '✅' },
}

const EVENT_TYPES = Object.keys(EVENT_CONFIG)

export default function EvolutionTimelinePanel() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiGet<TimelineEvent[]>('/api/evolution/timeline?limit=50')
      .then(data => { if (Array.isArray(data)) setEvents(data); else setEvents([]) })
      .catch((e: Error) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? events : events.filter(e => e.event_type === filter)

  if (loading) return <div style={s.center}>加载中...</div>
  if (error) return <div style={{ ...s.center, color: '#ef4444' }}>{error}</div>

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>进化时间线</span>
        <span style={s.subtitle}>{events.length} 个事件</span>
      </div>

      <div style={s.filterRow}>
        <select
          style={s.select}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="all">全部类型</option>
          {EVENT_TYPES.map(t => (
            <option key={t} value={t}>{EVENT_CONFIG[t]?.label || t}</option>
          ))}
        </select>
        <span style={s.filterCount}>显示 {filtered.length} 条</span>
      </div>

      <div style={s.timeline}>
        {filtered.length === 0 ? (
          <div style={s.empty}>暂无事件</div>
        ) : (
          filtered.map((evt, idx) => {
            const cfg = EVENT_CONFIG[evt.event_type] || { label: evt.event_type, color: '#6b7280', icon: '•' }
            const isExpanded = expandedId === evt.id
            return (
              <div key={evt.id || idx} style={s.eventRow}>
                <div style={s.lineWrapper}>
                  <div style={{ ...s.node, background: cfg.color, boxShadow: `0 0 8px ${cfg.color}40` }} />
                  {idx < filtered.length - 1 && <div style={s.line} />}
                </div>
                <div
                  style={s.eventCard}
                  onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color + '60' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)' }}
                >
                  <div style={s.eventHeader}>
                    <span style={s.eventIcon}>{cfg.icon}</span>
                    <span style={{ ...s.eventType, color: cfg.color }}>{cfg.label}</span>
                    <span style={s.eventTime}>{evt.timestamp ? new Date(evt.timestamp).toLocaleString('zh-CN') : ''}</span>
                  </div>
                  <div style={s.eventDesc}>{evt.description}</div>
                  {isExpanded && (
                    <div style={s.eventDetails}>
                      {evt.agent_id && <div style={s.detailLine}><span style={s.detailKey}>Agent:</span> {evt.agent_id}</div>}
                      {evt.rule_id && <div style={s.detailLine}><span style={s.detailKey}>Rule:</span> {evt.rule_id}</div>}
                      {evt.details && Object.entries(evt.details).map(([k, v]) => (
                        <div key={k} style={s.detailLine}>
                          <span style={s.detailKey}>{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
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
  filterRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  select: { background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  filterCount: { fontSize: 11, color: '#6b7280' },
  timeline: { padding: '16px 20px', position: 'relative' },
  empty: { textAlign: 'center' as const, color: '#6b7280', padding: 40 },
  eventRow: { display: 'flex', gap: 12, marginBottom: 4 },
  lineWrapper: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', width: 20, flexShrink: 0 },
  node: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 6 },
  line: { width: 2, flex: 1, background: 'rgba(255,255,255,0.08)', minHeight: 20 },
  eventCard: { flex: 1, background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'border-color 0.15s' },
  eventHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  eventIcon: { fontSize: 14 },
  eventType: { fontSize: 12, fontWeight: 600 },
  eventTime: { fontSize: 10, color: '#6b7280', marginLeft: 'auto' },
  eventDesc: { fontSize: 12, color: '#d1d5db', marginTop: 4 },
  eventDetails: { marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, borderLeft: '3px solid rgba(139,92,246,0.4)' },
  detailLine: { fontSize: 11, color: '#9ca3af', marginBottom: 3 },
  detailKey: { color: '#8b5cf6', fontWeight: 600, marginRight: 4 },
}
