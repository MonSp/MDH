import React, { useState, useEffect } from 'react'
import { getAllRules, getPendingRules, approveRule, rejectRule } from '../../modules/experienceExtractor'
import type { ExperienceRule } from '../../modules/agentTypes'
import { apiGet, apiPost, apiDelete } from '../../services/apiFetch'

interface Props {
  mode?: 'all' | 'pending'
}

const typeCfg: Record<string, { label: string; color: string }> = {
  success_pattern: { label: '成功模式', color: '#10b981' },
  failure_avoidance: { label: '避坑指南', color: '#f59e0b' },
  correction_tip: { label: '纠正提示', color: '#8b5cf6' },
}
const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  pending_review: { label: '待审核', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  approved: { label: '已批准', bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  rejected: { label: '已拒绝', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
}

interface DemotionEntry {
  rule_id: string; trigger_condition: string; action: string
  effectiveness_score: number; usage_count: number; success_count: number
  reason: string; demoted_at: string
}

interface DemotionStats {
  total: number; avg_score: number; re_approval_rate: number
  by_rule_type: Record<string, number>; by_team: Record<string, number>
  timeline: { date: string; count: number }[]
  top_rules: { rule_id: string; trigger_condition: string; action: string; demotion_count: number; current_status: string; last_score: number }[]
}

export function ExperienceRulePanel({ mode = 'all' }: Props) {
  const [rules, setRules] = useState<ExperienceRule[]>([])
  const [filter, setFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>(mode === 'pending' ? 'pending_review' : 'all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [demotionAlerts, setDemotionAlerts] = useState<DemotionEntry[]>([])
  const [alertsDismissed, setAlertsDismissed] = useState(false)
  const [stats, setStats] = useState<DemotionStats | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)

  const loadRules = async () => {
    setLoading(true); setError(null)
    try { setRules(mode === 'pending' ? await getPendingRules() : await getAllRules()) }
    catch (e: any) { setError(e.message || '加载失败') }
    finally { setLoading(false) }
  }

  const loadDemotionAlerts = async () => {
    try {
      const resp = await apiGet("/api/experience/rules/demotion-log")
      const data = await resp.json()
      if (data.success && data.data?.summary?.recent_24h > 0) {
        setDemotionAlerts(data.data.entries.slice(0, 5))
        setAlertsDismissed(false)
      }
    } catch { /* silent */ }
  }

  const loadStats = async () => {
    try {
      const resp = await apiGet("/api/experience/rules/demotion-stats")
      const data = await resp.json()
      if (data.success) setStats(data.data)
    } catch { /* silent */ }
  }

  useEffect(() => { loadRules(); loadDemotionAlerts(); loadStats() }, [mode])

  const handleApprove = async (id: string) => {
    setActingId(id)
    try { await approveRule(id); setRules(prev => prev.map(r => r.rule_id === id ? { ...r, status: 'approved' } : r)) }
    catch (e: any) { setError(e.message || '批准失败') }
    finally { setActingId(null) }
  }

  const handleReject = async (id: string) => {
    setActingId(id)
    try { await rejectRule(id, '不符合标准'); setRules(prev => prev.map(r => r.rule_id === id ? { ...r, status: 'rejected' } : r)) }
    catch (e: any) { setError(e.message || '拒绝失败') }
    finally { setActingId(null) }
  }

  const filtered = filter === 'all' ? rules : rules.filter(r => r.status === filter)
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>📋</span>
          <div>
            <div style={s.title}>经验规则管理</div>
            <div style={s.subtitle}>查看和管理从项目中提取的经验规则</div>
          </div>
        </div>
        <button style={s.refreshBtn} onClick={loadRules} disabled={loading}>{loading ? '加载中...' : '刷新'}</button>
      </div>

      <div style={s.filterRow}>
        {([['all', '全部'], ['pending_review', '待审核'], ['approved', '已批准'], ['rejected', '已拒绝']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k as any)} style={{ ...s.filterBtn, ...(filter === k ? s.filterActive : {}) }}>{l}</button>
        ))}
      </div>

      {demotionAlerts.length > 0 && !alertsDismissed && (
        <div style={s.alertBanner}>
          <div style={s.alertHeader}>
            <span style={s.alertIcon}>⚠️</span>
            <span style={s.alertTitle}>近 24 小时有 {demotionAlerts.length} 条规则因有效性不足被自动降级</span>
            <button style={s.alertDismiss} onClick={() => setAlertsDismissed(true)}>✕</button>
          </div>
          {demotionAlerts.map((e, i) => (
            <div key={i} style={s.alertEntry}>
              <span style={s.alertRuleId}>{e.rule_id.slice(0, 8)}</span>
              <span style={s.alertCondition}>{e.trigger_condition}</span>
              <span style={s.alertScore}>{(e.effectiveness_score * 100).toFixed(0)}%</span>
              <span style={s.alertUsage}>({e.success_count}/{e.usage_count})</span>
            </div>
          ))}
        </div>
      )}

      {stats && stats.total > 0 && (
        <div style={s.statsSection}>
          <div style={s.statsHeaderRow}>
            <button style={s.statsToggle} onClick={() => setStatsOpen(!statsOpen)}>
              <span>📊 降级统计报表</span>
              <span style={{ ...s.statsArrow, transform: statsOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
            </button>
            <div style={s.exportBtns}>
              <a href="/api/experience/rules/demotion-export?format=json" download="demotion_report.json" style={s.exportLink}>JSON</a>
              <a href="/api/experience/rules/demotion-export?format=csv" download="demotion_report.csv" style={s.exportLink}>CSV</a>
            </div>
          </div>
          {statsOpen && (
            <div style={s.statsBody}>
              <div style={s.statsRow}>
                <div style={s.statCard}>
                  <div style={s.statValue}>{stats.total}</div>
                  <div style={s.statLabel}>总降级</div>
                </div>
                <div style={s.statCard}>
                  <div style={s.statValue}>{(stats.avg_score * 100).toFixed(0)}%</div>
                  <div style={s.statLabel}>平均评分</div>
                </div>
                <div style={s.statCard}>
                  <div style={{ ...s.statValue, color: stats.re_approval_rate >= 0.5 ? '#10b981' : '#f59e0b' }}>
                    {(stats.re_approval_rate * 100).toFixed(0)}%
                  </div>
                  <div style={s.statLabel}>复审通过率</div>
                </div>
              </div>

              {stats.timeline.length > 0 && (
                <div style={s.statsBlock}>
                  <div style={s.statsBlockTitle}>时间线（最近 14 天）</div>
                  <div style={s.timelineRow}>
                    {stats.timeline.map((t, i) => (
                      <div key={i} style={s.timelineDay}>
                        <div style={{ ...s.timelineBar, height: Math.min(t.count * 12, 60) }} />
                        <div style={s.timelineLabel}>{t.date.slice(5)}</div>
                        <div style={s.timelineCount}>{t.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(stats.by_rule_type).length > 0 && (
                <div style={s.statsBlock}>
                  <div style={s.statsBlockTitle}>按类型</div>
                  <div style={s.tagRow2}>
                    {Object.entries(stats.by_rule_type).map(([k, v]) => (
                      <span key={k} style={s.statsTag}>{k}: {v}</span>
                    ))}
                  </div>
                </div>
              )}

              {stats.top_rules.length > 0 && (
                <div style={s.statsBlock}>
                  <div style={s.statsBlockTitle}>高频降级规则</div>
                  {stats.top_rules.map((r, i) => (
                    <div key={i} style={s.topRuleRow}>
                      <span style={s.topRuleId}>{r.rule_id.slice(0, 8)}</span>
                      <span style={s.topRuleCond}>{r.trigger_condition}</span>
                      <span style={s.topRuleCount}>{r.demotion_count}次</span>
                      <span style={{
                        ...s.topRuleStatus,
                        color: r.current_status === 'approved' ? '#10b981' : r.current_status === 'pending_review' ? '#f59e0b' : '#6b7280',
                      }}>{r.current_status === 'approved' ? '已恢复' : r.current_status === 'pending_review' ? '待审核' : r.current_status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      <div style={s.list}>
        {loading ? <div style={s.empty}>加载中...</div> :
         filtered.length === 0 ? <div style={s.empty}>暂无规则</div> :
         filtered.map(rule => {
           const tc = typeCfg[rule.rule_type] || { label: rule.rule_type, color: '#6b7280' }
           const sc = statusCfg[rule.status] || { label: rule.status, bg: 'rgba(255,255,255,0.06)', color: '#9ca3af' }
           const isExp = expandedId === rule.rule_id
           const isAct = actingId === rule.rule_id
           return (
             <div key={rule.rule_id} style={{ ...s.card, borderLeftColor: tc.color }}>
               <div style={s.cardClickable} onClick={() => setExpandedId(isExp ? null : rule.rule_id)}>
                 <div style={s.cardTop}>
                   <div style={s.tagRow}>
                     <span style={{ ...s.typeTag, color: tc.color, borderColor: tc.color + '40', background: tc.color + '15' }}>{tc.label}</span>
                     <span style={{ ...s.statusTag, background: sc.bg, color: sc.color }}>{sc.label}</span>
                   </div>
                   <span style={s.date}>{fmt(rule.created_at)}</span>
                 </div>
                 <div style={s.action}>{rule.action}</div>
                 <div style={s.sourceRow}>
                   <span style={s.source}>{rule.source_task_type} · {rule.source_task_id.slice(0, 8)}...</span>
                   {(rule.usage_count ?? 0) > 0 && (
                     <span style={{ ...s.effBadge, color: (rule.effectiveness_score ?? 0) >= 0.7 ? '#10b981' : (rule.effectiveness_score ?? 0) >= 0.4 ? '#f59e0b' : '#ef4444' }}>
                       ★ {((rule.effectiveness_score ?? 0) * 100).toFixed(0)}% ({rule.usage_count}次)
                     </span>
                   )}
                 </div>
               </div>

               {isExp && (
                 <div style={s.expanded}>
                   <div style={s.detailSection}>
                     <div style={s.detailLabel}>触发条件</div>
                     <div style={s.detailValue}>{rule.trigger_condition}</div>
                   </div>
                   {rule.note && <div style={s.detailSection}><div style={s.detailLabel}>备注</div><div style={s.detailValue}>{rule.note}</div></div>}
                   {rule.keywords.length > 0 && (
                     <div style={s.detailSection}>
                       <div style={s.detailLabel}>关键词</div>
                       <div style={s.kwList}>{rule.keywords.map(k => <span key={k} style={s.kwTag}>{k}</span>)}</div>
                     </div>
                   )}
                   {rule.status === 'pending_review' && (
                     <div style={s.actionRow}>
                       <button style={{ ...s.actionBtn, ...s.approveBtn }} onClick={e => { e.stopPropagation(); handleApprove(rule.rule_id) }} disabled={isAct}>✓ 批准</button>
                       <button style={{ ...s.actionBtn, ...s.rejectBtn }} onClick={e => { e.stopPropagation(); handleReject(rule.rule_id) }} disabled={isAct}>✕ 拒绝</button>
                     </div>
                   )}
                 </div>
               )}
             </div>
           )
         })}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif" },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerIcon: { fontSize: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.2)', borderRadius: 8 },
  title: { fontSize: 14, fontWeight: 700, color: '#e2e8f0' },
  subtitle: { fontSize: 11, color: '#6b7280' },
  refreshBtn: { padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  filterRow: { display: 'flex', gap: 4, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' as const, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  filterBtn: { padding: '5px 14px', borderRadius: 14, borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  filterActive: { background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.5)', color: '#c4b5fd' },
  alertBanner: { margin: '8px 12px 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' },
  alertHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  alertIcon: { fontSize: 16, flexShrink: 0 },
  alertTitle: { fontSize: 12, fontWeight: 600, color: '#fca5a5', flex: 1 },
  alertDismiss: { background: 'none', border: 'none', color: '#6b7280', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  alertEntry: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11, color: '#d1d5db' },
  alertRuleId: { fontFamily: 'monospace', color: '#9ca3af', fontSize: 10 },
  alertCondition: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  alertScore: { fontWeight: 700, color: '#ef4444' },
  alertUsage: { color: '#6b7280', fontSize: 10 },
  error: { padding: '8px 16px', color: '#ef4444', fontSize: 12, background: 'rgba(239,68,68,0.1)' },
  list: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 },
  card: { borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '4px solid', overflow: 'hidden' },
  cardClickable: { padding: '12px 14px', cursor: 'pointer' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  tagRow: { display: 'flex', gap: 6 },
  typeTag: { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, border: '1px solid' },
  statusTag: { padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500 },
  date: { fontSize: 10, color: '#4b5563' },
  action: { fontSize: 12, color: '#d1d5db', lineHeight: 1.5, marginBottom: 4 },
  sourceRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  source: { fontSize: 11, color: '#4b5563' },
  effBadge: { fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' as const },
  expanded: { padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)' },
  detailSection: { marginBottom: 8 },
  detailLabel: { fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 3 },
  detailValue: { fontSize: 12, color: '#d1d5db', lineHeight: 1.5 },
  kwList: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  kwTag: { padding: '2px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' },
  actionRow: { display: 'flex', gap: 8, marginTop: 8 },
  actionBtn: { padding: '4px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  approveBtn: { background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' },
  rejectBtn: { background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' },
  statsSection: { margin: '0 12px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.04)', overflow: 'hidden' },
  statsHeaderRow: { display: 'flex', alignItems: 'center' },
  statsToggle: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'none', border: 'none', color: '#c4b5fd', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  exportBtns: { display: 'flex', gap: 4, paddingRight: 10 },
  exportLink: { padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: '#8b5cf6', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', textDecoration: 'none', cursor: 'pointer' },
  statsArrow: { fontSize: 10, transition: 'transform 0.15s' },
  statsBody: { padding: '0 14px 12px' },
  statsRow: { display: 'flex', gap: 8, marginBottom: 10 },
  statCard: { flex: 1, padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', textAlign: 'center' as const },
  statValue: { fontSize: 18, fontWeight: 700, color: '#e2e8f0' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  statsBlock: { marginBottom: 10 },
  statsBlockTitle: { fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  tagRow2: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  statsTag: { padding: '2px 10px', borderRadius: 10, fontSize: 11, background: 'rgba(139,92,246,0.1)', color: '#a78bfa' },
  timelineRow: { display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 },
  timelineDay: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, minWidth: 28 },
  timelineBar: { width: 18, background: 'rgba(239,68,68,0.4)', borderRadius: 3, minHeight: 2, transition: 'height 0.2s' },
  timelineLabel: { fontSize: 9, color: '#6b7280' },
  timelineCount: { fontSize: 10, fontWeight: 600, color: '#ef4444' },
  topRuleRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11, color: '#d1d5db', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  topRuleId: { fontFamily: 'monospace', color: '#6b7280', fontSize: 10, flexShrink: 0 },
  topRuleCond: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  topRuleCount: { fontWeight: 700, color: '#ef4444', fontSize: 11, flexShrink: 0 },
  topRuleStatus: { fontSize: 10, flexShrink: 0 },
}
