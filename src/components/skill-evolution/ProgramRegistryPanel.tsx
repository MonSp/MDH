import React, { useState, useEffect, useRef } from 'react'
import { apiGet } from '../../services/apiFetch'

/** ProgramRegistry 面板（program-pivot T9, M3）：只读展示程序包列表与 lineage。 */

interface ProgramManifestLite {
  program_id: string
  version: string
  description: string
  kind: string
  status: 'candidate' | 'promoted' | 'deprecated'
  trigger: { keywords: string[] }
  last_validated_model: string | null
  last_validated_at: string | null
  consecutive_gate_failures: number
}

interface LineageEvent {
  event: string
  version?: string
  from?: string | null
  to?: string | null
  at?: string
  model?: string | null
  count?: number
  tests_modified?: boolean
  issues?: string[]
  snapshot?: string
  previous_version?: string
  new_version?: string
}

interface ProgramDetail extends ProgramManifestLite {
  lineage: LineageEvent[]
}

const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
  candidate: { label: '候选', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  promoted: { label: '已晋升', bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  deprecated: { label: '已降级', bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
}

const eventLabel: Record<string, string> = {
  create: '创建',
  promote: '晋升',
  rollback: '回滚',
  deprecate: '降级',
  revised: '修订',
  validated: '评测刷新',
  gate_passed: '门禁通过',
  gate_failed: '门禁失败',
  gate_timeout: '门禁超时',
  gate_aborted: '门禁中止',
  gate_failure_counted: '失败计数',
  gate_failure_count_reset: '失败计数清零',
  upgrade_requested: '升级请求',
  version_restored: '版本还原',
  tests_restored: '测试基线还原',
  legacy_import: '旧资产登记',
}

export function ProgramRegistryPanel() {
  const [programs, setPrograms] = useState<ProgramManifestLite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'candidate' | 'promoted' | 'deprecated'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProgramDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const detailReqRef = useRef(0)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      setPrograms((await apiGet<ProgramManifestLite[]>('/api/programs')) || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleDetail = async (id: string) => {
    if (expandedId === id) {
      detailReqRef.current += 1
      setExpandedId(null); setDetail(null); return
    }
    const reqId = ++detailReqRef.current
    setExpandedId(id); setDetailLoading(true); setDetail(null); setError(null)
    try {
      const d = await apiGet<ProgramDetail>(`/api/programs/${id}`)
      if (reqId !== detailReqRef.current) return // 竞态：忽略过期响应
      setDetail(d)
    } catch (e: unknown) {
      if (reqId !== detailReqRef.current) return
      setError(e instanceof Error ? e.message : '详情加载失败')
    } finally {
      if (reqId === detailReqRef.current) setDetailLoading(false)
    }
  }

  const filtered = filter === 'all' ? programs : programs.filter(p => p.status === filter)
  const fmt = (iso?: string | null) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  return (
    <div style={s.container} data-testid="program-registry-panel">
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>🧩</span>
          <div>
            <div style={s.title}>程序库（ProgramRegistry）</div>
            <div style={s.subtitle}>沉淀程序包列表 · 状态机 · 血缘（只读）</div>
          </div>
        </div>
        <button style={s.refreshBtn} onClick={load} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.filters}>
        {([['all', '全部'], ['promoted', '已晋升'], ['candidate', '候选'], ['deprecated', '已降级']] as const).map(([k, l]) => (
          <button
            key={k}
            style={{ ...s.filterBtn, ...(filter === k ? s.filterActive : {}) }}
            onClick={() => setFilter(k)}
          >{l}</button>
        ))}
      </div>

      <div style={s.list}>
        {loading ? <div style={s.empty}>加载中...</div> :
         filtered.length === 0 ? <div style={s.empty}>暂无程序包（沉淀经 ProgramCompiler 产生 candidate，门禁晋升后可路由）</div> :
         filtered.map(p => {
           const cfg = statusCfg[p.status] || statusCfg.deprecated
           const open = expandedId === p.program_id
           return (
             <div key={p.program_id} style={s.card}>
               <div
                 style={s.cardHeader}
                 onClick={() => toggleDetail(p.program_id)}
                 data-testid={`program-row-${p.program_id}`}
               >
                 <div style={s.cardLeft}>
                   <span style={{ ...s.badge, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                   <span style={s.programId}>{p.program_id}</span>
                   <span style={s.version}>v{p.version}</span>
                 </div>
                 <div style={s.cardRight}>
                   {p.consecutive_gate_failures > 0 && (
                     <span style={s.failChip}>连续失败 {p.consecutive_gate_failures}</span>
                   )}
                   <span style={s.meta}>验证 {fmt(p.last_validated_at)}</span>
                   <span style={s.chevron}>{open ? '▾' : '▸'}</span>
                 </div>
               </div>
               <div style={s.desc}>{p.description || '（无描述）'}</div>
               {p.trigger?.keywords?.length ? (
                 <div style={s.keywords}>
                   {p.trigger.keywords.map(k => <span key={k} style={s.kw}>{k}</span>)}
                 </div>
               ) : null}

               {open && (
                 <div style={s.detail} data-testid={`program-detail-${p.program_id}`}>
                   {detailLoading ? <div style={s.empty}>加载血缘...</div> :
                    !detail ? <div style={s.empty}>无详情</div> : (
                     <>
                       <div style={s.detailTitle}>血缘（lineage）· 共 {detail.lineage?.length ?? 0} 条</div>
                       {(Array.isArray(detail.lineage) ? detail.lineage : [])
                         .slice().reverse().map((ev, i) => (
                         <div key={i} style={s.evRow}>
                           <span style={s.evName}>{eventLabel[ev.event] || ev.event}</span>
                           <span style={s.evMeta}>
                             {ev.from && ev.to ? `${ev.from} → ${ev.to}` : ev.to || ''}
                             {ev.version ? ` · v${ev.version}` : ''}
                             {ev.model ? ` · model=${ev.model}` : ''}
                             {typeof ev.count === 'number' ? ` · count=${ev.count}` : ''}
                             {ev.tests_modified ? ' · 测试已变更' : ''}
                             {ev.snapshot ? ` · 快照 ${ev.snapshot}` : ''}
                             {ev.previous_version ? ` · ${ev.previous_version}→${ev.new_version}` : ''}
                           </span>
                           <span style={s.evTime}>{fmt(ev.at)}</span>
                           {ev.issues?.length ? (
                             <div style={s.issues}>意见：{ev.issues.join('；')}</div>
                           ) : null}
                         </div>
                       ))}
                     </>
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

export default ProgramRegistryPanel

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 12, padding: 4 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerIcon: { fontSize: 22 },
  title: { fontSize: 16, fontWeight: 700, color: '#e5e7eb' },
  subtitle: { fontSize: 12, color: '#9ca3af' },
  refreshBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid #374151',
    background: '#111827', color: '#d1d5db', cursor: 'pointer', fontSize: 12,
  },
  error: {
    padding: '8px 12px', borderRadius: 8, fontSize: 12,
    background: 'rgba(239,68,68,0.12)', color: '#f87171',
  },
  filters: { display: 'flex', gap: 6 },
  filterBtn: {
    padding: '4px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
    border: '1px solid #374151', background: 'transparent', color: '#9ca3af',
  },
  filterActive: { background: '#1f2937', color: '#e5e7eb', borderColor: '#6b7280' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 13 },
  card: {
    border: '1px solid #1f2937', borderRadius: 10, padding: '10px 12px',
    background: '#0b0f14',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', cursor: 'pointer' },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 8 },
  badge: { padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 },
  programId: { color: '#e5e7eb', fontWeight: 600, fontSize: 13 },
  version: { color: '#6b7280', fontSize: 12 },
  failChip: {
    fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.1)',
    padding: '2px 6px', borderRadius: 6,
  },
  meta: { color: '#6b7280', fontSize: 11 },
  chevron: { color: '#6b7280' },
  desc: { marginTop: 6, color: '#9ca3af', fontSize: 12 },
  keywords: { marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' },
  kw: {
    fontSize: 11, color: '#93c5fd', background: 'rgba(59,130,246,0.1)',
    padding: '1px 6px', borderRadius: 4,
  },
  detail: {
    marginTop: 10, borderTop: '1px solid #1f2937', paddingTop: 8,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  detailTitle: { color: '#d1d5db', fontSize: 12, fontWeight: 600 },
  evRow: {
    display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline',
    fontSize: 12, padding: '4px 0', borderBottom: '1px dashed #111827',
  },
  evName: { color: '#34d399', fontWeight: 600, minWidth: 64 },
  evMeta: { color: '#9ca3af', flex: 1 },
  evTime: { color: '#6b7280', fontSize: 11 },
  issues: { width: '100%', color: '#fbbf24', fontSize: 11, paddingLeft: 64 },
}
