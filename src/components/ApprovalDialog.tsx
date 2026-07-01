import React from 'react'
import type { ApprovalRequestInfo } from '../modules/meetingProtocol'
import '../styles/ApprovalDialog.css'

interface ApprovalDialogProps {
  request: ApprovalRequestInfo
  onApprove: (requestId: string, reason?: string) => void
  onReject: (requestId: string, reason?: string) => void
  onClose: () => void
}

const riskLevelColors: Record<string, string> = {
  low: 'var(--success-color)',
  medium: 'var(--warning-color)',
  high: 'var(--error-color)',
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

  const confidenceLevel = confidencePercent >= 70 ? 'high' : confidencePercent >= 40 ? 'medium' : 'low'

  return (
    <div className="approval-overlay" onClick={onClose}>
      <div className="approval-dialog" onClick={e => e.stopPropagation()}>
        <div className="approval-header">
          <h3 className="approval-title">审批请求</h3>
          <button className="approval-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="approval-risk-badge">
          <span
            className="approval-risk-dot"
            style={{
              background: riskColor,
              boxShadow: `0 0 8px ${riskColor}80`,
            }}
          />
          <span className="approval-risk-label" style={{ color: riskColor }}>{riskLabel}</span>
        </div>

        <div className="approval-section">
          <div className="approval-field">
            <span className="approval-field-label">操作名称</span>
            <span className="approval-field-value">{request.operation}</span>
          </div>
          <div className="approval-field">
            <span className="approval-field-label">描述</span>
            <span className="approval-field-value">{request.description}</span>
          </div>
          <div className="approval-field">
            <span className="approval-field-label">请求者</span>
            <span className="approval-field-value">{request.requesterId}</span>
          </div>
        </div>

        <div className="approval-section">
          <span className="approval-field-label">置信度</span>
          <div className="approval-confidence-bar">
            <div
              className={`approval-confidence-fill ${confidenceLevel}`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="approval-confidence-text">{confidencePercent}%</span>
        </div>

        <div className="approval-section">
          <textarea
            className="approval-textarea"
            placeholder="输入审批理由（可选）..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <div className="approval-actions">
          <button
            className="approval-btn reject"
            onClick={() => onReject(request.id, reason || undefined)}
          >
            拒绝
          </button>
          <button
            className="approval-btn approve"
            onClick={() => onApprove(request.id, reason || undefined)}
          >
            批准
          </button>
        </div>
      </div>
    </div>
  )
}
