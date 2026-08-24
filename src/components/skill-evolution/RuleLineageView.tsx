import React, { useState, useEffect } from 'react'
import { apiGet } from '../../services/apiFetch'

interface RuleNode {
  rule_id: string
  effectiveness_score: number
  usage_count: number
  status: string
  trigger_condition?: string
  action?: string
  created_at?: string
  version?: number
}

interface Props {
  rule_id: string
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  approved: { label: '已批准', bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  evolved: { label: '已进化', bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  demoted: { label: '已降级', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  pending_review: { label: '待审核', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  rejected: { label: '已拒绝', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
}

export function RuleLineageView({ rule_id }: Props) {
  const [chain, setChain] = useState<RuleNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<RuleNode | null>(null)

  useEffect(() => {
    if (!rule_id) return
    setLoading(true)
    setError(null)
    apiGet<RuleNode[] | { chain: RuleNode[] }>(`/api/experience/rules/${rule_id}/chain`)
      .then(data => {
        const list = Array.isArray(data) ? data : (data && 'chain' in data ? (data as { chain: RuleNode[] }).chain : [])
        setChain(list)
      })
      .catch((e: Error) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [rule_id])

  if (!rule_id) return <div style={s.center}>请提供 rule_id</div>
  if (loading) return <div style={s.center}>加载中...</div>
  if (error) return <div style={{ ...s.center, color: '#ef4444' }}>{error}</div>

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>规则进化链</span>
        <span style={s.subtitle}>Rule: {rule_id}</span>
      </div>

      {chain.length === 0 ? (
        <div style={s.empty}>无进化链数据</div>
      ) : (
        <div style={s.chainContainer}>
          {chain.map((node, idx) => {
            const stCfg = STATUS_CONFIG[node.status] || { label: node.status, bg: 'rgba(107,114,128,0.15)', color: '#6b7280' }
            const isSelected = selectedNode?.rule_id === node.rule_id
            return (
              <React.Fragment key={node.rule_id || idx}>
                <div
                  style={{ ...s.nodeCard, borderColor: isSelected ? stCfg.color : 'rgba(255,255,255,0.06)' }}
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                >
                  <div style={s.nodeHeader}>
                    <span style={s.nodeId}>{node.rule_id.slice(0, 8)}...</span>
                    <span style={{ ...s.statusBadge, background: stCfg.bg, color: stCfg.color }}>{stCfg.label}</span>
                  </div>
                  <div style={s.nodeMetrics}>
                    <div style={s.metric}>
                      <span style={s.metricLabel}>有效性</span>
                      <span style={{ ...s.metricValue, color: (node.effectiveness_score ?? 0) >= 0.6 ? '#10b981' : (node.effectiveness_score ?? 0) >= 0.3 ? '#f59e0b' : '#ef4444' }}>
                        {((node.effectiveness_score ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={s.metric}>
                      <span style={s.metricLabel}>使用次数</span>
                      <span style={s.metricValue}>{node.usage_count ?? 0}</span>
                    </div>
                  </div>
                  {node.version !== undefined && (
                    <div style={s.versionTag}>v{node.version}</div>
                  )}
                </div>
                {idx < chain.length - 1 && (
                  <div style={s.connector}>
                    <div style={s.arrow}>↓</div>
                    <div style={s.arrowLine} />
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {selectedNode && (
        <div style={s.detailPanel}>
          <div style={s.detailHeader}>
            <span style={s.detailTitle}>规则详情</span>
            <button style={s.closeBtn} onClick={() => setSelectedNode(null)}>✕</button>
          </div>
          <div style={s.detailBody}>
            <div style={s.detailRow}><span style={s.detailKey}>ID:</span> {selectedNode.rule_id}</div>
            <div style={s.detailRow}><span style={s.detailKey}>状态:</span> {STATUS_CONFIG[selectedNode.status]?.label || selectedNode.status}</div>
            <div style={s.detailRow}><span style={s.detailKey}>有效性:</span> {((selectedNode.effectiveness_score ?? 0) * 100).toFixed(1)}%</div>
            <div style={s.detailRow}><span style={s.detailKey}>使用次数:</span> {selectedNode.usage_count ?? 0}</div>
            {selectedNode.version !== undefined && <div style={s.detailRow}><span style={s.detailKey}>版本:</span> {selectedNode.version}</div>}
            {selectedNode.trigger_condition && <div style={s.detailRow}><span style={s.detailKey}>触发条件:</span> {selectedNode.trigger_condition}</div>}
            {selectedNode.action && <div style={s.detailRow}><span style={s.detailKey}>动作:</span> {selectedNode.action}</div>}
            {selectedNode.created_at && <div style={s.detailRow}><span style={s.detailKey}>创建时间:</span> {selectedNode.created_at}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default RuleLineageView

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif", color: '#e2e8f0', overflow: 'auto' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' },
  header: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' },
  title: { fontSize: 16, fontWeight: 700, color: '#a78bfa' },
  subtitle: { fontSize: 11, color: '#6b7280', marginLeft: 10, fontFamily: 'monospace' },
  empty: { textAlign: 'center' as const, color: '#6b7280', padding: 40 },
  chainContainer: { padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  nodeCard: { width: '100%', maxWidth: 400, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' },
  nodeHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nodeId: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' },
  statusBadge: { padding: '2px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600 },
  nodeMetrics: { display: 'flex', gap: 20 },
  metric: { display: 'flex', flexDirection: 'column' as const },
  metricLabel: { fontSize: 10, color: '#6b7280' },
  metricValue: { fontSize: 16, fontWeight: 700, color: '#e2e8f0' },
  versionTag: { fontSize: 10, color: '#8b5cf6', marginTop: 4 },
  connector: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '4px 0' },
  arrow: { fontSize: 16, color: '#8b5cf6', lineHeight: 1 },
  arrowLine: { width: 2, height: 16, background: 'rgba(139,92,246,0.3)' },
  detailPanel: { margin: '16px 20px', background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.3)' },
  detailHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  detailTitle: { fontSize: 13, fontWeight: 600, color: '#a78bfa' },
  closeBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  detailBody: { padding: '12px 16px' },
  detailRow: { fontSize: 12, color: '#d1d5db', marginBottom: 6 },
  detailKey: { color: '#8b5cf6', fontWeight: 600, marginRight: 4 },
}
