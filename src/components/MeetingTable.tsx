import React, { useState, useMemo } from 'react'
import type { AgentRole } from '../modules/agentTypes'
import RoleAvatar from './RoleAvatar'

interface MeetingTableProps {
  agents: Array<{
    id: string
    name: string
    role: AgentRole
    status: 'idle' | 'discussing' | 'waiting'
  }>
  meetingStatus: 'idle' | 'discussing' | 'assigning' | 'done'
  onAssignTask?: (agentId: string, task: string) => void
  onStartMeeting?: () => void
  onEndMeeting?: () => void
}

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  idle: { label: '等待开始', color: '#6b7280', icon: '⏸' },
  discussing: { label: '讨论中', color: '#f59e0b', icon: '💬' },
  assigning: { label: '任务派发', color: '#8b5cf6', icon: '📋' },
  done: { label: '已完成', color: '#10b981', icon: '✅' },
}

const agentStatusColors: Record<string, string> = {
  idle: '#6b7280',
  discussing: '#f59e0b',
  waiting: '#3b82f6',
}

const roleLabels: Record<AgentRole, string> = {
  planner: '规划者',
  executor: '执行者',
  monitor: '监控者',
  reviewer: '审查者',
  coordinator: '协调者',
}

export default function MeetingTable({
  agents,
  meetingStatus,
  onAssignTask,
  onStartMeeting,
  onEndMeeting,
}: MeetingTableProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [taskInput, setTaskInput] = useState('')

  const statusInfo = statusConfig[meetingStatus]

  const agentPositions = useMemo(() => {
    const count = agents.length
    if (count === 0) return []

    const centerX = 200
    const centerY = 160
    const radiusX = 150
    const radiusY = 120

    return agents.map((agent, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2
      const x = centerX + radiusX * Math.cos(angle)
      const y = centerY + radiusY * Math.sin(angle)
      return { ...agent, x, y }
    })
  }, [agents])

  const handleAssignTask = () => {
    if (selectedAgentId && taskInput.trim() && onAssignTask) {
      onAssignTask(selectedAgentId, taskInput.trim())
      setTaskInput('')
      setSelectedAgentId(null)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAssignTask()
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>会议桌</h3>
        <div style={styles.statusBadge}>
          <span style={styles.statusIcon}>{statusInfo.icon}</span>
          <span style={{ ...styles.statusText, color: statusInfo.color }}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      <div style={styles.tableArea}>
        <svg width="100%" height="100%" viewBox="0 0 400 320" style={styles.svg}>
          <defs>
            <radialGradient id="tableGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#1e40af" stopOpacity="0.05" />
            </radialGradient>
            <filter id="shadow">
              <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#1e3a5f" floodOpacity="0.2" />
            </filter>
          </defs>

          <ellipse
            cx="200"
            cy="160"
            rx="150"
            ry="120"
            fill="url(#tableGradient)"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="8 4"
            filter="url(#shadow)"
          />

          <ellipse
            cx="200"
            cy="160"
            rx="120"
            ry="96"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1"
            opacity="0.3"
          />
        </svg>

        <div style={styles.centerStatus}>
          <div style={styles.statusEmoji}>{statusInfo.icon}</div>
          <div style={styles.statusLabel}>{statusInfo.label}</div>
          {meetingStatus === 'discussing' && (
            <div style={styles.pulseRing} />
          )}
        </div>

        {agentPositions.map((agent) => (
          <div
            key={agent.id}
            style={{
              ...styles.agentPosition,
              left: agent.x - 30,
              top: agent.y - 30,
            }}
            onClick={() => setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)}
          >
            <div
              style={{
                ...styles.agentAvatarWrapper,
                borderColor: agentStatusColors[agent.status],
                transform: selectedAgentId === agent.id ? 'scale(1.15)' : 'scale(1)',
                boxShadow: selectedAgentId === agent.id
                  ? `0 0 20px ${agentStatusColors[agent.status]}40`
                  : 'none',
              }}
            >
              <RoleAvatar
                role={agent.role}
                size={52}
                status={agent.status === 'discussing' ? 'busy' : agent.status === 'waiting' ? 'waiting' : 'idle'}
              />
            </div>
            <div style={styles.agentName}>{agent.name}</div>
            <div style={styles.agentRole}>{roleLabels[agent.role]}</div>
            {agent.status === 'discussing' && (
              <div style={styles.speakingIndicator}>
                <div style={styles.speakingDot} />
                <div style={styles.speakingDot} />
                <div style={styles.speakingDot} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.controlSection}>
        {meetingStatus === 'idle' && (
          <button style={styles.startButton} onClick={onStartMeeting}>
            开始会议
          </button>
        )}
        {(meetingStatus === 'discussing' || meetingStatus === 'assigning') && (
          <button style={styles.endButton} onClick={onEndMeeting}>
            结束会议
          </button>
        )}
        {meetingStatus === 'done' && (
          <div style={styles.doneMessage}>会议已结束</div>
        )}
      </div>

      {meetingStatus !== 'idle' && (
        <div style={styles.taskAssignSection}>
          <div style={styles.taskAssignHeader}>
            <span style={styles.taskAssignTitle}>任务派发</span>
            {selectedAgentId && (
              <span style={styles.selectedAgentLabel}>
                已选择: {agents.find(a => a.id === selectedAgentId)?.name}
              </span>
            )}
          </div>
          <div style={styles.taskInputRow}>
            <input
              type="text"
              style={styles.taskInput}
              placeholder={selectedAgentId ? '输入任务描述...' : '请先选择一个Agent'}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!selectedAgentId}
            />
            <button
              style={{
                ...styles.assignButton,
                opacity: selectedAgentId && taskInput.trim() ? 1 : 0.5,
              }}
              onClick={handleAssignTask}
              disabled={!selectedAgentId || !taskInput.trim()}
            >
              派发
            </button>
          </div>
        </div>
      )}

      <div style={styles.agentList}>
        <div style={styles.agentListTitle}>参会 Agent</div>
        <div style={styles.agentListItems}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                ...styles.agentListItem,
                borderColor: selectedAgentId === agent.id ? agentStatusColors[agent.status] : 'transparent',
                background: selectedAgentId === agent.id ? `${agentStatusColors[agent.status]}10` : 'transparent',
              }}
              onClick={() => setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)}
            >
              <div
                style={{
                  ...styles.agentListDot,
                  background: agentStatusColors[agent.status],
                }}
              />
              <span style={styles.agentListName}>{agent.name}</span>
              <span style={styles.agentListRole}>{roleLabels[agent.role]}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    borderRadius: '16px',
    border: '1px solid #334155',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#f1f5f9',
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: '#1e293b',
    borderRadius: '20px',
    border: '1px solid #334155',
  },
  statusIcon: {
    fontSize: '14px',
  },
  statusText: {
    fontSize: '13px',
    fontWeight: 500,
  },
  tableArea: {
    position: 'relative',
    width: '100%',
    height: '320px',
    minHeight: '320px',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  centerStatus: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    zIndex: 10,
  },
  statusEmoji: {
    fontSize: '32px',
    lineHeight: 1,
  },
  statusLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#94a3b8',
  },
  pulseRing: {
    position: 'absolute',
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: '2px solid #f59e0b',
    animation: 'pulse 2s ease-in-out infinite',
    pointerEvents: 'none',
  },
  agentPosition: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
    zIndex: 20,
  },
  agentAvatarWrapper: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e293b',
    transition: 'all 0.2s ease',
  },
  agentName: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#e2e8f0',
    textAlign: 'center',
    maxWidth: '70px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  agentRole: {
    fontSize: '10px',
    color: '#64748b',
  },
  speakingIndicator: {
    display: 'flex',
    gap: '3px',
    marginTop: '2px',
  },
  speakingDot: {
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    background: '#f59e0b',
    animation: 'bounce 1s ease-in-out infinite',
  },
  controlSection: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
  },
  startButton: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
  },
  endButton: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
  },
  doneMessage: {
    fontSize: '14px',
    color: '#10b981',
    fontWeight: 500,
  },
  taskAssignSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px',
    background: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
  },
  taskAssignHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskAssignTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  selectedAgentLabel: {
    fontSize: '12px',
    color: '#3b82f6',
    fontWeight: 500,
  },
  taskInputRow: {
    display: 'flex',
    gap: '10px',
  },
  taskInput: {
    flex: 1,
    padding: '10px 14px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  assignButton: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
  },
  agentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  agentListTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  agentListItems: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  agentListItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: '#1e293b',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  agentListDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  agentListName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e8f0',
  },
  agentListRole: {
    fontSize: '11px',
    color: '#64748b',
  },
}