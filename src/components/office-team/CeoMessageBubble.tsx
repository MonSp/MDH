import React from 'react'

interface CeoMessage {
  role: 'user' | 'ceo' | 'agent' | 'system'
  content: string
  agentId?: string
  agentName?: string
  timestamp?: number
}

interface CeoMessageBubbleProps {
  msg: CeoMessage
  index: number
  agentColors: Record<string, string>
  onEnter?: () => void
  onWorkspaceConfirm?: () => void
  workspaceConfirm?: any
}

const AGENT_COLORS: Record<string, string> = {
  'agent-coordinator': '#8b5cf6',
  'agent-planner': '#3b82f6',
  'agent-executor': '#10b981',
  'agent-reviewer': '#f59e0b',
  'agent-monitor': '#ef4444',
  'agent-ceo': '#8b5cf6',
}

export default function CeoMessageBubble({ msg, index, onEnter, onWorkspaceConfirm, workspaceConfirm }: CeoMessageBubbleProps) {
  const isMeetingReady = msg.content.startsWith('meeting_ready:')
  const isTaskDone = msg.content === 'task_done:enter_project'
  const isWsConfirm = msg.content === 'workspace_confirm:pending'
  const agentCount = isMeetingReady ? msg.content.split(':')[1] : ''

  return (
    <div style={{
      ...styles.msgRow,
      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
    }}>
      {msg.role !== 'user' && (
        <span style={{
          ...styles.msgAvatar,
          ...(msg.role === 'agent' && msg.agentId ? {
            background: `${AGENT_COLORS[msg.agentId] || '#6b7280'}30`,
            border: `1px solid ${AGENT_COLORS[msg.agentId] || '#6b7280'}50`,
          } : {}),
        }}>
          {msg.role === 'ceo' ? '🧠' : msg.role === 'agent' ? '👤' : '📋'}
        </span>
      )}
      <div style={{
        ...styles.msgBubble,
        ...(msg.role === 'user' ? styles.userBubble : {}),
        ...(msg.role === 'system' ? styles.systemBubble : {}),
        ...(msg.role === 'agent' && msg.agentId ? {
          borderLeft: `3px solid ${AGENT_COLORS[msg.agentId] || '#6b7280'}`,
        } : {}),
      }}>
        {isMeetingReady ? (
          <div>
            <div style={{ marginBottom: 8 }}>项目已创建，{agentCount} 人团队已就绪，会议正在处理中。</div>
            <button style={styles.inlineEnterBtn} onClick={onEnter}>
              🚀 进入项目工作间查看会议 →
            </button>
          </div>
        ) : isTaskDone ? (
          <div>
            <div style={{ marginBottom: 8 }}>任务处理完成。</div>
            <button style={styles.inlineEnterBtn} onClick={onEnter}>
              🚀 进入项目工作间查看详情 →
            </button>
          </div>
        ) : isWsConfirm && workspaceConfirm ? (
          <div>
            <div style={{ marginBottom: 10, fontWeight: 600 }}>
              {workspaceConfirm.existing_project ? '⚠️ 目录已有内容' : '📁 工作区配置'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
              项目: {workspaceConfirm.task_description}
            </div>
            <button style={styles.inlineEnterBtn} onClick={onWorkspaceConfirm}>
              确认工作区配置
            </button>
          </div>
        ) : (
          <div style={styles.msgContent}>{msg.content}</div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  msgRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    background: 'rgba(139,92,246,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    flexShrink: 0,
  },
  msgBubble: {
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.05)',
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: 'break-word' as const,
  },
  userBubble: {
    background: 'rgba(139,92,246,0.3)',
    borderBottomRightRadius: 4,
  },
  systemBubble: {
    background: 'rgba(255,255,255,0.03)',
    fontStyle: 'italic',
    color: '#94a3b8',
  },
  msgContent: {
    whiteSpace: 'pre-wrap' as const,
  },
  inlineEnterBtn: {
    padding: '6px 14px',
    background: 'rgba(139,92,246,0.3)',
    border: '1px solid rgba(139,92,246,0.5)',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 12,
    cursor: 'pointer',
    marginTop: 8,
  },
}
