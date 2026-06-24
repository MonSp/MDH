import React, { useState, useEffect } from 'react'
import { getRouteTable } from '../../modules/dynamicRouter'
import type { RouteEntry } from '../../modules/agentTypes'

export function RouteTablePanel() {
  const [routes, setRoutes] = useState<RouteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadRoutes = async () => {
    setLoading(true); setError(null)
    try { setRoutes(await getRouteTable()) }
    catch (e: any) { setError(e.message || '加载失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadRoutes() }, [])

  const rateColor = (r: number) => r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444'

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>🧭</span>
          <div>
            <div style={s.title}>动态路由表</div>
            <div style={s.subtitle}>部门能力与任务路由配置</div>
          </div>
        </div>
        <button style={s.refreshBtn} onClick={loadRoutes} disabled={loading}>{loading ? '加载中...' : '刷新'}</button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.list}>
        {loading ? <div style={s.empty}>加载中...</div> :
         routes.length === 0 ? <div style={s.empty}>路由表为空</div> :
         routes.map(r => {
           const isExp = expandedId === r.dept_id
           return (
             <div key={r.dept_id} style={s.card} onClick={() => setExpandedId(isExp ? null : r.dept_id)}>
               <div style={s.cardTop}>
                 <div style={s.cardLeft}>
                   <span style={s.deptName}>{r.dept_name}</span>
                   <span style={s.deptId}>{r.dept_id}</span>
                 </div>
                 <div style={s.cardRight}>
                   <span style={{ ...s.rate, color: rateColor(r.success_rate) }}>{(r.success_rate * 100).toFixed(1)}%</span>
                   <span style={s.rateDetail}>({r.successful_tasks}/{r.total_tasks})</span>
                 </div>
               </div>
               <div style={s.capDesc}>{r.capability_desc || '-'}</div>
               <div style={s.kwList}>
                 {r.capability_keywords.slice(0, 6).map(kw => <span key={kw} style={s.kwTag}>{kw}</span>)}
                 {r.capability_keywords.length > 6 && <span style={s.moreTag}>+{r.capability_keywords.length - 6}</span>}
               </div>
               {isExp && (
                 <div style={s.expanded}>
                   {r.tools.length > 0 && (
                     <div style={s.detailSection}>
                       <div style={s.detailLabel}>工具列表</div>
                       <div style={s.toolList}>{r.tools.map(t => <span key={t} style={s.toolTag}>{t}</span>)}</div>
                     </div>
                   )}
                   <div style={s.metaInfo}>优先级: {r.priority} · 最近活跃: {r.last_active || '无'}</div>
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
  headerIcon: { fontSize: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59,130,246,0.2)', borderRadius: 8 },
  title: { fontSize: 14, fontWeight: 700, color: '#e2e8f0' },
  subtitle: { fontSize: 11, color: '#6b7280' },
  refreshBtn: { padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  error: { padding: '8px 16px', color: '#ef4444', fontSize: 12, background: 'rgba(239,68,68,0.1)' },
  list: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 },
  card: { padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  deptName: { fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
  deptId: { padding: '2px 6px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.06)', color: '#6b7280' },
  cardRight: { display: 'flex', alignItems: 'center', gap: 6 },
  rate: { fontSize: 14, fontWeight: 700 },
  rateDetail: { fontSize: 11, color: '#4b5563' },
  capDesc: { fontSize: 12, color: '#9ca3af', marginBottom: 6 },
  kwList: { display: 'flex', gap: 4, flexWrap: 'wrap' as const },
  kwTag: { padding: '2px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' },
  moreTag: { fontSize: 10, color: '#4b5563', padding: '2px 4px' },
  expanded: { marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' },
  detailSection: { marginBottom: 8 },
  detailLabel: { fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  toolList: { display: 'flex', gap: 4, flexWrap: 'wrap' as const },
  toolTag: { padding: '2px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' },
  metaInfo: { fontSize: 11, color: '#4b5563' },
}
