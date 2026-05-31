import React, { useState, useMemo } from 'react'
import type { AgentStatus } from '../modules/collaborationState'
import { AgentInstanceStatus } from '../modules/agentTypes'
import type { AgentRole, AgentCapability, AgentRoleProfile } from '../modules/agentTypes'
import { DEFAULT_ROLE_PROFILES } from '../modules/agentTypes'
import RoleAvatar from './RoleAvatar'

interface AgentRoleCardProps {
  agent: AgentStatus
  roleProfile?: AgentRoleProfile
  isSelected?: boolean
  onClick?: (agent: AgentStatus) => void
  showDetails?: boolean
}

const statusColors: Record<AgentInstanceStatus, string> = {
  [AgentInstanceStatus.Idle]: '#10b981',
  [AgentInstanceStatus.Busy]: '#f59e0b',
  [AgentInstanceStatus.Waiting]: '#3b82f6',
  [AgentInstanceStatus.Error]: '#ef4444',
  [AgentInstanceStatus.Offline]: '#6b7280',
}

const statusLabels: Record<AgentInstanceStatus, string> = {
  [AgentInstanceStatus.Idle]: '空闲',
  [AgentInstanceStatus.Busy]: '忙碌',
  [AgentInstanceStatus.Waiting]: '等待中',
  [AgentInstanceStatus.Error]: '错误',
  [AgentInstanceStatus.Offline]: '离线',
}

const capabilityLabels: Record<AgentCapability, string> = {
  task_decomposition: '任务分解',
  code_generation: '代码生成',
  code_review: '代码审查',
  testing: '测试',
  browser_automation: '浏览器自动化',
  file_operation: '文件操作',
  web_search: '网络搜索',
  data_analysis: '数据分析',
  documentation: '文档编写',
  monitoring: '监控',
}

const CapabilityTags: React.FC<{
  capabilities: AgentCapability[]
  themeColor: string
  maxVisible?: number
}> = ({ capabilities, themeColor, maxVisible = 3 }) => {
  const visibleCaps = capabilities.slice(0, maxVisible)
  const remainingCount = capabilities.length - maxVisible

  return (
    <div className="capability-tags">
      {visibleCaps.map((cap) => (
        <span
          key={cap}
          className="capability-tag"
          style={{
            backgroundColor: `${themeColor}15`,
            color: themeColor,
            border: `1px solid ${themeColor}30`,
          }}
        >
          {capabilityLabels[cap] || cap}
        </span>
      ))}
      {remainingCount > 0 && (
        <span
          className="capability-more"
          style={{
            backgroundColor: `${themeColor}10`,
            color: `${themeColor}80`,
          }}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  )
}

const TaskProgressIndicator: React.FC<{
  taskId: string | null
  status: AgentInstanceStatus
  themeColor: string
}> = ({ taskId, status, themeColor }) => {
  if (!taskId) {
    return (
      <div className="task-progress-indicator idle">
        <div className="task-icon">💤</div>
        <span className="task-label">暂无任务</span>
      </div>
    )
  }

  const isActive = status === AgentInstanceStatus.Busy
  const isWaiting = status === AgentInstanceStatus.Waiting

  return (
    <div className={`task-progress-indicator ${isActive ? 'active' : ''} ${isWaiting ? 'waiting' : ''}`}>
      <div className="task-icon">
        {isActive ? '⚙️' : isWaiting ? '⏳' : '📋'}
      </div>
      <div className="task-info">
        <span className="task-label">正在执行</span>
        <span className="task-id">{taskId.slice(0, 8)}...</span>
      </div>
      {isActive && (
        <div className="task-progress-bar">
          <div
            className="progress-fill"
            style={{
              background: `linear-gradient(90deg, ${themeColor}, ${themeColor}80)`,
              animation: 'progress-animation 2s ease-in-out infinite',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default function AgentRoleCard({
  agent,
  roleProfile,
  isSelected = false,
  onClick,
  showDetails = false,
}: AgentRoleCardProps) {
  const [isExpanded, setIsExpanded] = useState(showDetails)

  const profile = useMemo(() => {
    return roleProfile || DEFAULT_ROLE_PROFILES[agent.role]
  }, [agent.role, roleProfile])

  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return `${Math.floor(diff / 86400000)} 天前`
  }

  const handleClick = () => {
    setIsExpanded(!isExpanded)
    onClick?.(agent)
  }

  const isOffline = agent.status === AgentInstanceStatus.Offline
  const isError = agent.status === AgentInstanceStatus.Error

  return (
    <div
      className={`agent-role-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''} ${isOffline ? 'offline' : ''} ${isError ? 'error' : ''}`}
      onClick={handleClick}
      style={{
        '--theme-color': profile.themeColor,
        '--gradient-start': profile.gradientColors[0],
        '--gradient-end': profile.gradientColors[1],
      } as React.CSSProperties}
    >
      <div className="card-header">
        <RoleAvatar role={agent.role} status={agent.status} size={72} />
        <div className="agent-identity">
          <h3 className="agent-name">{agent.agentName}</h3>
          <div className="agent-role-badge">
            <span className="role-label">{profile.personality}</span>
          </div>
        </div>
        <div className="status-indicator">
          <span
            className="status-dot"
            style={{ backgroundColor: statusColors[agent.status] }}
          />
          <span className="status-label">{statusLabels[agent.status]}</span>
        </div>
      </div>

      <div className="card-body">
        <div className="agent-motto">
          <span className="motto-icon">💬</span>
          <span className="motto-text">{profile.motto}</span>
        </div>

        <TaskProgressIndicator
          taskId={agent.currentTaskId}
          status={agent.status}
          themeColor={profile.themeColor}
        />

        {isExpanded && (
          <div className="expanded-content">
            <div className="agent-description">
              <h4>角色描述</h4>
              <p>{profile.description}</p>
            </div>

            <div className="agent-specializations">
              <h4>专业领域</h4>
              <div className="specialization-tags">
                {profile.specializations.map((spec) => (
                  <span key={spec} className="specialization-tag">
                    {spec}
                  </span>
                ))}
              </div>
            </div>

            <CapabilityTags
              capabilities={agent.capabilities}
              themeColor={profile.themeColor}
              maxVisible={5}
            />

            <div className="agent-metrics">
              <div className="metric">
                <span className="metric-label">负载</span>
                <div className="load-bar">
                  <div
                    className="load-fill"
                    style={{
                      width: `${Math.min(agent.load * 100, 100)}%`,
                      background: `linear-gradient(90deg, ${profile.gradientColors[0]}, ${profile.gradientColors[1]})`,
                    }}
                  />
                </div>
                <span className="metric-value">{Math.round(agent.load * 100)}%</span>
              </div>

              <div className="metric">
                <span className="metric-label">完成任务</span>
                <span className="metric-value success">{agent.completedTasks}</span>
              </div>

              <div className="metric">
                <span className="metric-label">失败任务</span>
                <span className="metric-value error">{agent.failedTasks}</span>
              </div>
            </div>

            {agent.error && (
              <div className="agent-error">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{agent.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card-footer">
        <span className="last-heartbeat">
          最后心跳: {formatTime(agent.lastHeartbeat)}
        </span>
        {agent.averageTaskDuration > 0 && (
          <span className="avg-duration">
            平均耗时: {Math.round(agent.averageTaskDuration / 1000)}s
          </span>
        )}
        <span className="expand-hint">
          {isExpanded ? '收起详情' : '展开详情'}
        </span>
      </div>
    </div>
  )
}