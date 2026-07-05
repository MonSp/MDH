import React, { useState } from 'react'

interface AuditLogEntry {
  id: string
  agentId: string
  operation: string
  target: string
  riskLevel: string
  allowed: boolean
  reason: string
  timestamp: number
}

interface AuditLogPanelProps {
  auditLog: AuditLogEntry[]
  onGetAuditLog: (filters?: { agentId?: string; operation?: string; riskLevel?: string }) => void
}

export default function AuditLogPanel({ auditLog, onGetAuditLog }: AuditLogPanelProps) {
  const [filterAgent, setFilterAgent] = useState('')
  const [filterRisk, setFilterRisk] = useState('')

  const riskColor = (level: string) => {
    switch (level) {
      case 'critical': return '#ef4444'
      case 'high': return '#f97316'
      case 'medium': return '#eab308'
      case 'low': return '#22c55e'
      default: return '#94a3b8'
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>审计日志 ({auditLog.length})</span>
        <div style={styles.filters}>
          <input
            style={styles.filterInput}
            placeholder="Agent ID"
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
          />
          <select
            style={styles.filterSelect}
            value={filterRisk}
            onChange={e => setFilterRisk(e.target.value)}
          >
            <option value="">全部风险</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            style={styles.refreshBtn}
            onClick={() => onGetAuditLog({
              agentId: filterAgent || undefined,
              riskLevel: filterRisk || undefined,
            })}
          >
            查询
          </button>
        </div>
      </div>

      {auditLog.length === 0 ? (
        <div style={styles.empty}>暂无审计记录</div>
      ) : (
        <div style={styles.list}>
          {auditLog.map(entry => (
            <div key={entry.id} style={styles.item}>
              <div style={styles.itemHeader}>
                <span style={{ ...styles.riskBadge, color: riskColor(entry.riskLevel) }}>
                  {entry.riskLevel.toUpperCase()}
                </span>
                <span style={styles.operation}>{entry.operation}</span>
                <span style={entry.allowed ? styles.allowedTag : styles.blockedTag}>
                  {entry.allowed ? '允许' : '拒绝'}
                </span>
              </div>
              <div style={styles.itemMeta}>
                <span style={styles.agentId}>{entry.agentId}</span>
                {entry.target && <span style={styles.target}>{entry.target}</span>}
                <span style={styles.time}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
              {entry.reason && <div style={styles.reason}>{entry.reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
    background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
  },
  header: {
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
  title: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
  filters: { display: 'flex', gap: '6px', flexWrap: 'wrap' as const },
  filterInput: {
    flex: 1, minWidth: '80px', padding: '4px 8px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px', color: '#e2e8f0', fontSize: '11px', outline: 'none',
  },
  filterSelect: {
    padding: '4px 8px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '11px', outline: 'none',
  },
  refreshBtn: {
    padding: '4px 12px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px',
    color: '#a78bfa', fontSize: '11px', cursor: 'pointer',
  },
  empty: { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, padding: '16px' },
  list: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflow: 'auto' },
  item: {
    padding: '8px 10px', background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)',
  },
  itemHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  riskBadge: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' },
  operation: { fontSize: '12px', fontWeight: 600, color: '#e2e8f0', flex: 1 },
  allowedTag: { fontSize: '10px', color: '#22c55e', fontWeight: 600 },
  blockedTag: { fontSize: '10px', color: '#ef4444', fontWeight: 600 },
  itemMeta: { display: 'flex', gap: '10px', fontSize: '11px', color: '#94a3b8' },
  agentId: { fontWeight: 500 },
  target: { color: '#6b7280' },
  time: { marginLeft: 'auto', fontSize: '10px', color: '#6b7280' },
  reason: { marginTop: '4px', fontSize: '11px', color: '#cbd5e1', lineHeight: 1.4 },
}
