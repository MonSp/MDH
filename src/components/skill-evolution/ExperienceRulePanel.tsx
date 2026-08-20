import React, { useState, useEffect } from 'react'
import { getAllRules, getPendingRules, approveRule, rejectRule } from '../../modules/experienceExtractor'
import type { ExperienceRule } from '../../modules/agentTypes'

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

export function ExperienceRulePanel({ mode = 'all' }: Props) {
  const [rules, setRules] = useState<ExperienceRule[]>([])
  const [filter, setFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>(mode === 'pending' ? 'pending_review' : 'all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const loadRules = async () => {
    setLoading(true); setError(null)
    try { setRules(mode === 'pending' ? await getPendingRules() : await getAllRules()) }
    catch (e: any) { setError(e.message || '加载失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadRules() }, [mode])

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
}
