import React from 'react'
import type { TeamAgent, ChatMessage, Task } from './types'
import { ROLE_EMOJI } from './constants'

interface MeetingLogPanelProps {
  agents: TeamAgent[]
  messages: ChatMessage[]
  tasks: Task[]
  viewState: string
}

export default function MeetingLogPanel({ agents, messages, tasks, viewState }: MeetingLogPanelProps) {
  const getAgentById = (id?: string) => agents.find(a => a.id === id)

  return (
    <div style={{
      ...styles.logPanel,
      ...(viewState === 'transitioning-to-office' ? styles.logPanelEntering : {}),
      ...(viewState === 'office' ? styles.logPanelActive : {}),
    }}>
      <div style={styles.logHeader}>
        <h3 style={styles.logTitle}>📜 会议日志</h3>
        <span style={styles.logCount}>{messages.length} 条记录</span>
      </div>
      <div style={styles.logMessages}>
        {messages.slice(-10).map((msg, index) => {
          const agent = getAgentById(msg.agentId)
          return (
            <div key={index} style={styles.logItem}>
              <span style={styles.logSender}>
                {msg.role === 'boss' ? '👔' : ROLE_EMOJI[agent?.role || 'planner']}
              </span>
              <span style={styles.logText}>{msg.content}</span>
            </div>
          )
        })}
      </div>

      {tasks.length > 0 && (
        <div style={styles.taskSummary}>
          <h4 style={styles.taskSummaryTitle}>📋 任务状态</h4>
          {tasks.map(task => {
            const agent = getAgentById(task.agentId)
            return (
              <div key={task.id} style={styles.taskSummaryItem}>
                <span style={styles.taskSummaryAgent}>{agent?.name?.split('-')[0]}</span>
                <span style={styles.taskSummaryDesc}>{task.description}</span>
                <span style={{
                  ...styles.taskSummaryStatus,
                  color: task.status === 'completed' ? '#10b981' : task.status === 'executing' ? '#f59e0b' : '#6b7280',
                }}>
                  {task.status === 'completed' ? '✅' : task.status === 'executing' ? '⚡' : '⏳'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  logPanel: {
    width: '300px',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(0, 0, 0, 0.3)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: 0,
    transform: 'translateX(20px)',
  },
  logPanelEntering: {
    opacity: 0,
    transform: 'translateX(20px)',
  },
  logPanelActive: {
    opacity: 1,
    transform: 'translateX(0)',
  },
  logHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
  },
  logTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  logCount: {
    fontSize: '11px',
    color: '#6b7280',
  },
  logMessages: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  logItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '6px 8px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
  },
  logSender: {
    fontSize: '12px',
    flexShrink: 0,
  },
  logText: {
    fontSize: '11px',
    color: '#a0a0b0',
    lineHeight: 1.4,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  taskSummary: {
    padding: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  taskSummaryTitle: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: 600,
    color: '#8899b4',
  },
  taskSummaryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 0',
    fontSize: '11px',
  },
  taskSummaryAgent: {
    color: '#6b7280',
    flexShrink: 0,
  },
  taskSummaryDesc: {
    flex: 1,
    color: '#a0a0b0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  taskSummaryStatus: {
    flexShrink: 0,
  },
}
