import React from 'react'
import type { Task } from './types'

interface OfficeHeaderProps {
  viewState: string
  tasks: Task[]
  hasMessages: boolean
  onBackToSingle: () => void
  onStartMeeting: () => void
}

export default function OfficeHeader({
  viewState,
  tasks,
  hasMessages,
  onBackToSingle,
  onStartMeeting,
}: OfficeHeaderProps) {
  const completedTasks = tasks.filter(t => t.status === 'completed').length
  const executingTasks = tasks.filter(t => t.status === 'executing').length

  return (
    <div style={styles.header}>
      <button style={styles.backButton} onClick={onBackToSingle}>
        ← 返回单智能体
      </button>
      <div style={styles.headerCenter}>
        <h2 style={styles.title}>🏢 多智能体团队协作</h2>
        {tasks.length > 0 && (
          <div style={styles.stats}>
            <span style={styles.stat}>
              <span style={styles.statLabel}>任务</span>
              <span style={styles.statValue}>{tasks.length}</span>
            </span>
            <span style={styles.statDivider}>|</span>
            <span style={styles.stat}>
              <span style={styles.statLabel}>完成</span>
              <span style={{ ...styles.statValue, color: '#10b981' }}>{completedTasks}</span>
            </span>
            <span style={styles.statDivider}>|</span>
            <span style={styles.stat}>
              <span style={styles.statLabel}>执行中</span>
              <span style={{ ...styles.statValue, color: '#f59e0b' }}>{executingTasks}</span>
            </span>
          </div>
        )}
      </div>
      <div style={styles.headerRight}>
        {viewState === 'office' && hasMessages && (
          <button style={styles.meetingButton} onClick={onStartMeeting}>
            🤝 再次召集会议
          </button>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    background: 'rgba(0, 0, 0, 0.4)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(10px)',
    zIndex: 10,
  },
  backButton: {
    padding: '6px 14px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    color: '#a0a0b0',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  headerCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  statLabel: {
    color: '#6b7280',
  },
  statValue: {
    fontWeight: 600,
    color: '#e2e8f0',
  },
  statDivider: {
    color: '#374151',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  meetingButton: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
