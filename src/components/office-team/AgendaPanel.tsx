import React, { useState } from 'react'
import type { AgendaState } from './types'

interface AgendaPanelProps {
  agendaState: AgendaState | null
  onAction: (action: string, payload?: Record<string, unknown>) => void
}

const PHASE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  idle:          { label: '待议',   icon: '⏸️', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)' },
  open_topic:    { label: '开题',   icon: '📝', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
  discussion:    { label: '讨论中', icon: '💬', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
  proposal:      { label: '提案',   icon: '📋', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
  voting:        { label: '投票中', icon: '🗳️', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  accepted:      { label: '已通过', icon: '✅', color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
  rejected:      { label: '已否决', icon: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
  emergency:     { label: '紧急',   icon: '🚨', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.5)' },
  closed:        { label: '已关闭', icon: '🔒', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.3)' },
}

const PHASE_ORDER = ['idle', 'open_topic', 'discussion', 'proposal', 'voting', 'accepted']

export default function AgendaPanel({ agendaState, onAction }: AgendaPanelProps) {
  const [topicInput, setTopicInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const phase = agendaState?.phase || 'idle'
  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.idle
  const currentIdx = PHASE_ORDER.indexOf(phase)

  const handleSetTopic = () => {
    if (!topicInput.trim()) return
    onAction('open_topic', { topic: topicInput.trim() })
    setTopicInput('')
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>📑 议程管理</h3>
        <button
          style={styles.historyToggle}
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? '收起' : '历史'}
        </button>
      </div>

      <div style={{ ...styles.phaseBadge, background: config.bg, borderColor: config.border }}>
        <span style={styles.phaseIcon}>{config.icon}</span>
        <span style={{ ...styles.phaseLabel, color: config.color }}>{config.label}</span>
      </div>

      <div style={styles.phaseTrack}>
        {PHASE_ORDER.map((p, i) => {
          const c = PHASE_CONFIG[p]
          const isActive = i === currentIdx
          const isPast = i < currentIdx
          return (
            <React.Fragment key={p}>
              <div
                style={{
                  ...styles.phaseDot,
                  background: isActive ? c.color : isPast ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.1)',
                  boxShadow: isActive ? `0 0 8px ${c.color}` : 'none',
                }}
                title={c.label}
              >
                <span style={{ fontSize: '10px' }}>{c.icon}</span>
              </div>
              {i < PHASE_ORDER.length - 1 && (
                <div style={{
                  ...styles.phaseLine,
                  background: isPast ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)',
                }} />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {agendaState?.topic && (
        <div style={styles.topicDisplay}>
          <span style={styles.topicLabel}>议题</span>
          <span style={styles.topicText}>{agendaState.topic}</span>
        </div>
      )}

      {phase === 'idle' && (
        <div style={styles.topicInputRow}>
          <input
            style={styles.input}
            placeholder="输入议题..."
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSetTopic()}
          />
          <button style={styles.setTopicBtn} onClick={handleSetTopic}>
            开题
          </button>
        </div>
      )}

      {agendaState?.currentSpeaker && (
        <div style={styles.speakerRow}>
          <span style={styles.speakerIcon}>🎤</span>
          <span style={styles.speakerName}>{agendaState.currentSpeaker}</span>
        </div>
      )}

      {agendaState?.tokenQueue && agendaState.tokenQueue.length > 0 && (
        <div style={styles.queueSection}>
          <span style={styles.queueLabel}>发言队列</span>
          <div style={styles.queueList}>
            {agendaState.tokenQueue.map((t, i) => (
              <span key={i} style={styles.queueItem}>
                {t.agentId}
                <span style={styles.queueScore}>{Math.round(t.relevanceScore * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={styles.actionBar}>
        {phase === 'discussion' && (
          <button style={styles.actionBtn} onClick={() => onAction('propose')}>
            📋 提案
          </button>
        )}
        {phase === 'proposal' && (
          <button style={styles.actionBtn} onClick={() => onAction('start_voting')}>
            🗳️ 投票
          </button>
        )}
        {(phase === 'accepted' || phase === 'rejected') && (
          <button style={styles.actionBtn} onClick={() => onAction('close')}>
            🔒 关闭
          </button>
        )}
        {phase !== 'emergency' && phase !== 'closed' && phase !== 'idle' && (
          <button
            style={{ ...styles.actionBtn, ...styles.emergencyBtn }}
            onClick={() => onAction('declare_emergency', { reason: '手动触发紧急中断' })}
          >
            🚨 紧急
          </button>
        )}
        {phase === 'emergency' && (
          <button style={styles.actionBtn} onClick={() => onAction('resolve_emergency')}>
            ✅ 恢复
          </button>
        )}
      </div>

      {showHistory && agendaState?.eventHistory && agendaState.eventHistory.length > 0 && (
        <div style={styles.historySection}>
          <div style={styles.historyList}>
            {agendaState.eventHistory.slice(-8).map((evt, i) => (
              <div key={i} style={styles.historyItem}>
                <span style={styles.historyTime}>{formatTime(evt.timestamp)}</span>
                <span style={styles.historyText}>
                  {evt.type === 'phase_change' && `${PHASE_CONFIG[evt.from || '']?.label || evt.from} → ${PHASE_CONFIG[evt.to || '']?.label || evt.to}`}
                  {evt.type === 'token_granted' && `🎤 ${evt.agentId} 获得发言权`}
                  {evt.type === 'token_revoked' && `🔇 ${evt.agentId} 发言权被收回`}
                  {evt.type === 'emergency_declared' && `🚨 紧急中断: ${evt.reason}`}
                  {evt.type === 'emergency_resolved' && `✅ 紧急状态解除`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 12px',
    background: 'rgba(0,0,0,0.15)',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  historyToggle: {
    padding: '2px 8px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px',
    color: '#9ca3af',
    fontSize: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  phaseBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid',
  },
  phaseIcon: { fontSize: '14px' },
  phaseLabel: { fontSize: '13px', fontWeight: 600 },
  phaseTrack: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0',
    padding: '4px 0',
  },
  phaseDot: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.3s ease',
  },
  phaseLine: {
    width: '16px',
    height: '2px',
    flexShrink: 0,
  },
  topicDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    background: 'rgba(139,92,246,0.08)',
    borderRadius: '6px',
  },
  topicLabel: {
    fontSize: '10px',
    color: '#a78bfa',
    fontWeight: 600,
    flexShrink: 0,
  },
  topicText: {
    fontSize: '11px',
    color: '#d1d5db',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  topicInputRow: {
    display: 'flex',
    gap: '4px',
  },
  input: {
    flex: 1,
    padding: '4px 8px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '11px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  setTopicBtn: {
    padding: '4px 10px',
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  speakerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    background: 'rgba(16,185,129,0.08)',
    borderRadius: '6px',
  },
  speakerIcon: { fontSize: '12px' },
  speakerName: { fontSize: '11px', color: '#10b981', fontWeight: 500 },
  queueSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  queueLabel: {
    fontSize: '10px',
    color: '#6b7280',
    fontWeight: 600,
  },
  queueList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  queueItem: {
    padding: '2px 6px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '4px',
    fontSize: '10px',
    color: '#9ca3af',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  queueScore: {
    fontSize: '9px',
    color: '#6b7280',
  },
  actionBar: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  actionBtn: {
    padding: '4px 10px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  emergencyBtn: {
    background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.2))',
    borderColor: 'rgba(239,68,68,0.4)',
    color: '#fca5a5',
  },
  historySection: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: '6px',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    maxHeight: '120px',
    overflowY: 'auto',
  },
  historyItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    fontSize: '10px',
  },
  historyTime: {
    color: '#6b7280',
    flexShrink: 0,
    fontFamily: 'monospace',
  },
  historyText: {
    color: '#9ca3af',
    lineHeight: 1.3,
  },
}
