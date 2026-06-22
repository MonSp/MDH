import React, { useState, useEffect } from 'react'
import type { Task } from './types'
import type { MeetingPhase } from '../../hooks/useMeetingSocket'
import { PHASE_LABELS } from '../../hooks/useMeetingSocket'

const PHASE_ORDER: MeetingPhase[] = [
  'analyzing', 'planning', 'discussing', 'assigning', 'executing', 'reviewing', 'summarizing',
]

interface OfficeHeaderProps {
  viewState: string
  tasks: Task[]
  hasMessages: boolean
  onBackToSingle: () => void
  onStartMeeting: () => void
  meetingPhase?: MeetingPhase
  meetingStartTime?: number | null
}

export default function OfficeHeader({
  viewState,
  tasks,
  hasMessages,
  onBackToSingle,
  onStartMeeting,
  meetingPhase = 'idle',
  meetingStartTime,
}: OfficeHeaderProps) {
  const completedTasks = tasks.filter(t => t.status === 'completed').length
  const executingTasks = tasks.filter(t => t.status === 'executing').length
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!meetingStartTime || meetingPhase === 'idle' || meetingPhase === 'done') return
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - meetingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [meetingStartTime, meetingPhase])

  const formatElapsed = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}分${s.toString().padStart(2, '0')}秒` : `${s}秒`
  }

  const isActive = meetingPhase !== 'idle' && meetingPhase !== 'done'

  return (
    <div style={styles.header}>
      <button style={styles.backButton} onClick={onBackToSingle}>
        ← 返回单智能体
      </button>
      <div style={styles.headerCenter}>
        <h2 style={styles.title}>🏢 多智能体团队协作</h2>
        {isActive && (
          <div style={styles.phaseInfo}>
            <span style={styles.phaseLabel}>{PHASE_LABELS[meetingPhase]}</span>
            <span style={styles.phaseTime}>{formatElapsed(elapsed)}</span>
          </div>
        )}
        {isActive && (
          <div style={styles.progressBar}>
            {PHASE_ORDER.map((phase, i) => {
              const phaseIdx = PHASE_ORDER.indexOf(meetingPhase)
              const isDone = i < phaseIdx
              const isCurrent = i === phaseIdx
              return (
                <div key={phase} style={{
                  ...styles.progressStep,
                  background: isDone ? '#10b981' : isCurrent ? '#8b5cf6' : 'rgba(255,255,255,0.08)',
                  color: isDone || isCurrent ? '#fff' : '#6b7280',
                }}>
                  {isDone ? '✓' : i + 1}
                </div>
              )
            })}
          </div>
        )}
        {!isActive && tasks.length > 0 && (
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
  phaseInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  phaseLabel: {
    color: '#a78bfa',
    fontWeight: 600,
  },
  phaseTime: {
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  progressBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  progressStep: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 700,
    transition: 'all 0.3s ease',
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
