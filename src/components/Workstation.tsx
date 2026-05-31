import React from 'react'
import RoleAvatar from './RoleAvatar'
import type { AgentRole } from '../modules/agentTypes'

interface WorkstationProps {
  id: string
  position: { x: number; y: number }
  agentId?: string
  agentName?: string
  agentRole?: AgentRole
  status: 'idle' | 'busy' | 'meeting'
  currentTask?: string
  progress?: number
  onClick?: (id: string) => void
}

const statusColors: Record<WorkstationProps['status'], string> = {
  idle: '#10b981',
  busy: '#f59e0b',
  meeting: '#3b82f6',
}

const statusLabels: Record<WorkstationProps['status'], string> = {
  idle: '空闲',
  busy: '工作中',
  meeting: '会议中',
}

const roleLabels: Record<AgentRole, string> = {
  planner: '规划师',
  executor: '执行者',
  monitor: '监控者',
  reviewer: '审查员',
  coordinator: '协调员',
}

export default function Workstation({
  id,
  position,
  agentId,
  agentName,
  agentRole,
  status,
  currentTask,
  progress = 0,
  onClick,
}: WorkstationProps) {
  const isOccupied = !!agentId
  const isActive = status === 'busy' || status === 'meeting'

  const handleClick = () => {
    onClick?.(id)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: 240,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        border: `2px solid ${isOccupied ? statusColors[status] : '#e5e7eb'}`,
        padding: 16,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: isActive ? 'scale(1.02)' : 'scale(1)',
      }}
      onClick={handleClick}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          {isOccupied && agentRole ? (
            <RoleAvatar
              role={agentRole}
              status={status === 'idle' ? 'idle' : 'busy'}
              size={56}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                color: '#9ca3af',
              }}
            >
              💻
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: statusColors[status],
              border: '3px solid #ffffff',
              boxShadow: `0 0 8px ${statusColors[status]}`,
              animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#1f2937',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {isOccupied ? agentName : '空闲工位'}
            </span>
            {isOccupied && agentRole && (
              <span
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 12,
                  backgroundColor: `${statusColors[status]}15`,
                  color: statusColors[status],
                  border: `1px solid ${statusColors[status]}30`,
                }}
              >
                {roleLabels[agentRole]}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: statusColors[status],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {statusLabels[status]}
            </span>
          </div>

          {isOccupied && currentTask && (
            <div
              style={{
                fontSize: 12,
                color: '#6b7280',
                backgroundColor: '#f9fafb',
                padding: '8px 10px',
                borderRadius: 8,
                marginBottom: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              📋 {currentTask}
            </div>
          )}

          {isActive && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 11, color: '#9ca3af' }}>进度</span>
                <span style={{ fontSize: 11, color: statusColors[status], fontWeight: 600 }}>
                  {progress}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  backgroundColor: '#f3f4f6',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${statusColors[status]}, ${statusColors[status]}80)`,
                    borderRadius: 3,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}