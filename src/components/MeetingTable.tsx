import React, { useState, useMemo } from 'react'
import type { AgentRole } from '../modules/agentTypes'
import RoleAvatar from './RoleAvatar'
import { styles } from './MeetingTable.styles'

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
