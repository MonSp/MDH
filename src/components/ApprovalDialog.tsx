import React from 'react'
import type { ApprovalRequestInfo } from '../modules/meetingProtocol'

interface ApprovalDialogProps {
  request: ApprovalRequestInfo
  onApprove: (requestId: string, reason?: string) => void
  onReject: (requestId: string, reason?: string) => void
  onClose: () => void
}

const riskLevelColors: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
}

const riskLevelLabels: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重风险',
}

export default function ApprovalDialog({ request, onApprove, onReject, onClose }: ApprovalDialogProps) {
  const [reason, setReason] = React.useState('')

  const riskColor = riskLevelColors[request.riskLevel] || riskLevelColors.medium
  const riskLabel = riskLevelLabels[request.riskLevel] || '未知风险'
  const confidencePercent = Math.round(request.confidence * 100)

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>审批请求</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.riskBadge}>
          <span style={{
            ...styles.riskDot,
            background: riskColor,
            boxShadow: `0 0 8px ${riskColor}80`,
          }} />
          <span style={{ ...styles.riskLabel, color: riskColor }}>{riskLabel}</span>
        </div>

        <div style={styles.section}>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>操作名称</span>
            <span style={styles.fieldValue}>{request.operation}</span>
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>描述</span>
            <span style={styles.fieldValue}>{request.description}</span>
          </div>
          <div style={styles.field}>
            <span style={styles.fieldLabel}>请求者</span>
            <span style={styles.fieldValue}>{request.requesterId}</span>
          </div>
        </div>

        <div style={styles.section}>
          <span style={styles.fieldLabel}>置信度</span>
          <div style={styles.confidenceBar}>
            <div style={{
              ...styles.confidenceFill,
              width: `${confidencePercent}%`,
              background: confidencePercent >= 70
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : confidencePercent >= 40
                ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                : 'linear-gradient(90deg, #ef4444, #f87171)',
            }} />
          </div>
          <span style={styles.confidenceText}>{confidencePercent}%</span>
        </div>

        <div style={styles.section}>
          <textarea
            style={styles.textarea}
            placeholder="输入审批理由（可选）..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <div style={styles.actions}>
          <button
            style={styles.rejectBtn}
            onClick={() => onReject(request.id, reason || undefined)}
          >
            拒绝
          </button>
          <button
            style={styles.approveBtn}
            onClick={() => onApprove(request.id, reason || undefined)}
          >
            批准
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  dialog: {
    width: '420px',
    maxWidth: '90vw',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  closeBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#6b7280',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  riskBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
  },
  riskDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  riskLabel: {
    fontSize: '13px',
    fontWeight: 600,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  fieldValue: {
    fontSize: '14px',
    color: '#e2e8f0',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  confidenceBar: {
    height: '6px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  confidenceText: {
    fontSize: '12px',
    color: '#a0a0b0',
    textAlign: 'right',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#e2e8f0',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  approveBtn: {
    padding: '8px 24px',
    background: 'linear-gradient(135deg, #10b981, #34d399)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  rejectBtn: {
    padding: '8px 24px',
    background: 'linear-gradient(135deg, #ef4444, #f87171)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
}
