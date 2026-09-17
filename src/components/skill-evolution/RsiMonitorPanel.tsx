import React, { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../../services/apiFetch'

interface TuningParam {
  name: string
  current: number
  min: number
  max: number
  description: string
  requires_approval: boolean
}

interface Deployment {
  deployment_id: string
  param_name: string
  old_value: number
  new_value: number
  status: string
  created_at: string
  shadow_tasks: number
  shadow_decisions_match: number
  shadow_decisions_differ: number
  baseline_success_rate: number
  post_deploy_success_rate: number
  post_deploy_tasks: number
}

interface AutoStatus {
  cycle_count: number
  last_run: string
  max_shadows_per_cycle: number
  max_promotions_per_cycle: number
  min_auto_shadow_confidence: number
}

const STATUS_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
  shadow: { bg: 'rgba(59,130,246,0.15)', color: '#93c5fd', icon: '🔍' },
  active: { bg: 'rgba(16,185,129,0.15)', color: '#6ee7b7', icon: '🟢' },
  promoted: { bg: 'rgba(16,185,129,0.15)', color: '#6ee7b7', icon: '✅' },
  rolled_back: { bg: 'rgba(239,68,68,0.15)', color: '#fca5a5', icon: '↩️' },
  expired: { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', icon: '⏰' },
}

export default function RsiMonitorPanel() {
  const [params, setParams] = useState<TuningParam[]>([])
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [lastCycle, setLastCycle] = useState<any>(null)

  const refresh = async () => {
    try {
      const [p, d, s] = await Promise.all([
        apiGet<{ params: TuningParam[] }>('/api/tuning/params'),
        apiGet<{ deployments: Deployment[] }>('/api/tuning/deployments'),
        apiGet<AutoStatus>('/api/tuning/auto-optimize/status'),
      ])
      setParams(p.params || [])
      setDeployments(d.deployments || [])
      setAutoStatus(s)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => clearInterval(timer)
  }, [])

  const runNow = async () => {
    setRunning(true)
    try {
      const result = await apiPost<any>('/api/tuning/auto-optimize/run', {})
      setLastCycle(result)
      await refresh()
    } catch { /* ignore */ }
    setRunning(false)
  }

  if (loading) return <div style={s.center}>加载中...</div>

  const activeDeployments = deployments.filter(d => d.status === 'active')
  const shadowDeployments = deployments.filter(d => d.status === 'shadow')
  const rolledBack = deployments.filter(d => d.status === 'rolled_back')

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>RSI 自调优引擎</span>
        <span style={s.subtitle}>实时状态</span>
        <button onClick={runNow} disabled={running} style={{ ...s.runBtn, opacity: running ? 0.5 : 1 }}>
          {running ? '运行中...' : '▶ 立即优化'}
        </button>
      </div>

      {/* 状态概览 */}
      <div style={s.overviewRow}>
        <div style={s.overviewCard}>
          <div style={s.overviewValue}>{params.length}</div>
          <div style={s.overviewLabel}>可调参数</div>
        </div>
        <div style={s.overviewCard}>
          <div style={{ ...s.overviewValue, color: '#93c5fd' }}>{shadowDeployments.length}</div>
          <div style={s.overviewLabel}>影子验证中</div>
        </div>
        <div style={s.overviewCard}>
          <div style={{ ...s.overviewValue, color: '#6ee7b7' }}>{activeDeployments.length}</div>
          <div style={s.overviewLabel}>活跃部署</div>
        </div>
        <div style={s.overviewCard}>
          <div style={{ ...s.overviewValue, color: '#fca5a5' }}>{rolledBack.length}</div>
          <div style={s.overviewLabel}>已回滚</div>
        </div>
      </div>

      {/* 自动优化器状态 */}
      {autoStatus && (
        <div style={s.section}>
          <div style={s.sectionTitle}>自动优化器</div>
          <div style={s.infoGrid}>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>运行轮次</span>
              <span style={s.infoValue}>{autoStatus.cycle_count}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>上次运行</span>
              <span style={s.infoValue}>{autoStatus.last_run ? autoStatus.last_run.slice(0, 19).replace('T', ' ') : '未运行'}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>每轮最大影子</span>
              <span style={s.infoValue}>{autoStatus.max_shadows_per_cycle}</span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>自动影子置信度</span>
              <span style={s.infoValue}>≥{autoStatus.min_auto_shadow_confidence}</span>
            </div>
          </div>
        </div>
      )}

      {/* 最近一轮结果 */}
      {lastCycle && (
        <div style={s.section}>
          <div style={s.sectionTitle}>最近一轮 (#{lastCycle.cycle})</div>
          <div style={s.cycleSummary}>
            提案 {lastCycle.proposals_generated} ·
            影子 {lastCycle.shadows_started?.length || 0} ·
            晋升 {lastCycle.promoted?.length || 0} ·
            回滚 {lastCycle.rolled_back?.length || 0}
          </div>
        </div>
      )}

      {/* 部署列表 */}
      {deployments.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>部署记录</div>
          {deployments.slice(0, 8).map(d => {
            const cfg = STATUS_COLORS[d.status] || STATUS_COLORS.expired
            const matchRate = d.shadow_tasks > 0
              ? (d.shadow_decisions_match / d.shadow_tasks * 100).toFixed(0)
              : '—'
            return (
              <div key={d.deployment_id} style={s.deployCard}>
                <div style={s.deployHeader}>
                  <span style={{ ...s.statusBadge, background: cfg.bg, color: cfg.color }}>
                    {cfg.icon} {d.status}
                  </span>
                  <span style={s.deployParam}>{d.param_name}</span>
                </div>
                <div style={s.deployDetail}>
                  <span>{d.old_value} → {d.new_value}</span>
                  {d.shadow_tasks > 0 && (
                    <span style={s.deployMeta}>影子: {d.shadow_tasks} 次, 一致率 {matchRate}%</span>
                  )}
                  {d.baseline_success_rate > 0 && (
                    <span style={s.deployMeta}>基线: {(d.baseline_success_rate * 100).toFixed(1)}%</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 参数列表 */}
      <div style={s.section}>
        <div style={s.sectionTitle}>参数总览 ({params.length})</div>
        <div style={s.paramGrid}>
          {params.map(p => (
            <div key={p.name} style={s.paramCard}>
              <div style={s.paramName}>{p.name.split('.').pop()}</div>
              <div style={s.paramValue}>{p.current}</div>
              <div style={s.paramRange}>[{p.min} – {p.max}]</div>
              {p.requires_approval && <span style={s.approvalBadge}>需审批</span>}
            </div>
          ))}
        </div>
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
  runBtn: { marginLeft: 'auto', background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  overviewRow: { display: 'flex', gap: 10, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  overviewCard: { background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' as const, flex: 1 },
  overviewValue: { fontSize: 22, fontWeight: 700, color: '#e2e8f0' },
  overviewLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  section: { padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#a78bfa', marginBottom: 10 },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  infoItem: { display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '6px 10px' },
  infoLabel: { fontSize: 11, color: '#9ca3af' },
  infoValue: { fontSize: 11, fontWeight: 600, color: '#e2e8f0' },
  cycleSummary: { fontSize: 12, color: '#9ca3af', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 12px' },
  deployCard: { background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, border: '1px solid rgba(255,255,255,0.06)' },
  deployHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  statusBadge: { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  deployParam: { fontSize: 12, fontWeight: 600, color: '#e2e8f0' },
  deployDetail: { display: 'flex', gap: 12, fontSize: 11, color: '#9ca3af' },
  deployMeta: { color: '#6b7280' },
  paramGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 },
  paramCard: { background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)', position: 'relative' as const },
  paramName: { fontSize: 11, color: '#9ca3af', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  paramValue: { fontSize: 18, fontWeight: 700, color: '#e2e8f0' },
  paramRange: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  approvalBadge: { position: 'absolute' as const, top: 6, right: 8, fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', padding: '1px 6px', borderRadius: 4 },
}
