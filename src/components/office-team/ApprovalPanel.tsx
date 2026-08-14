import React, { useState } from 'react'

interface PendingApproval {
  id: string
  requesterId: string
  operation: string
  description: string
  riskLevel: string
  confidence: number
  createdAt: number
  taskId?: string
  gateId?: string
  approver?: string
}

interface ApprovalPanelProps {
  pendingApprovals: Map<string, PendingApproval>
  onApprove: (requestId: string, reason?: string) => void
  onReject: (requestId: string, reason?: string) => void
}

export default function ApprovalPanel({
  pendingApprovals,
  onApprove,
  onReject,
}: ApprovalPanelProps) {
  const [reasons, setReasons] = useState<Map<string, string>>(new Map())

  const approvals = Array.from(pendingApprovals.entries())

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return '#ef4444'
      case 'high': return '#f97316'
      case 'medium': return '#eab308'
      case 'low': return '#22c55e'
      default: return '#94a3b8'
    }
  }

  const getRiskBg = (level: string) => {
    switch (level) {
      case 'critical': return 'rgba(239, 68, 68, 0.15)'
      case 'high': return 'rgba(249, 115, 22, 0.15)'
      case 'medium': return 'rgba(234, 179, 8, 0.15)'
      case 'low': return 'rgba(34, 197, 94, 0.15)'
      default: return 'rgba(148, 163, 184, 0.15)'
    }
  }

  if (approvals.length === 0) return null

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>待审批 ({approvals.length})</span>
      </div>

      {approvals.map(([id, approval]) => (
        <div key={id} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={{
              ...styles.riskBadge,
              color: getRiskColor(approval.riskLevel),
              background: getRiskBg(approval.riskLevel),
            }}>
              {approval.riskLevel.toUpperCase()}
            </span>
            <span style={styles.operation}>{approval.operation}</span>
            <span style={styles.requester}>{approval.requesterId}</span>
          </div>

          <div style={styles.gateContext}>
            <span style={styles.gateBadge}>
              {approval.approver ? `由 ${approval.approver} 把关` : '系统把关'}
            </span>
            {approval.taskId ? <span style={styles.gateTag}>任务: {approval.taskId}</span> : null}
            {approval.gateId ? <span style={styles.gateTag}>把关点: {approval.gateId}</span> : null}
          </div>

          <div style={styles.description}>{approval.description}</div>

          <div style={styles.meta}>
            <span style={styles.confidence}>
              置信度: {(approval.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <div style={styles.actions}>
            <input
              style={styles.reasonInput}
              placeholder="审批理由（可选）"
              value={reasons.get(id) || ''}
              onChange={e => setReasons(prev => new Map(prev).set(id, e.target.value))}
            />
            <div style={styles.buttons}>
              <button
                style={styles.approveBtn}
                onClick={() => onApprove(id, reasons.get(id) || undefined)}
              >
                批准
              </button>
              <button
                style={styles.rejectBtn}
                onClick={() => onReject(id, reasons.get(id) || undefined)}
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: 'rgba(239, 68, 68, 0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fca5a5',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  riskBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
  },
  operation: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
    flex: 1,
  },
  requester: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  gateContext: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '8px',
  },
  gateBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#fbbf24',
    background: 'rgba(251, 191, 36, 0.12)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  gateTag: {
    fontSize: '10px',
    color: '#94a3b8',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  description: {
    fontSize: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
    marginBottom: '8px',
  },
  meta: {
    display: 'flex',
    gap: '12px',
    marginBottom: '10px',
  },
  confidence: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  reasonInput: {
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '12px',
    outline: 'none',
  },
  buttons: {
    display: 'flex',
    gap: '8px',
  },
  approveBtn: {
    flex: 1,
    padding: '8px',
    background: 'rgba(34, 197, 94, 0.2)',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    borderRadius: '6px',
    color: '#22c55e',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  rejectBtn: {
    flex: 1,
    padding: '8px',
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '6px',
    color: '#ef4444',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
