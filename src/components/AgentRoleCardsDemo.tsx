import React, { useState, useMemo } from 'react'
import AgentRoleCard from './AgentRoleCard'
import './AgentRoleCard.css'
import type { AgentStatus } from '../modules/collaborationState'
import { AgentInstanceStatus } from '../modules/agentTypes'
import type { AgentRole, AgentCapability } from '../modules/agentTypes'
import { AgentRole as AgentRoleEnum } from '../modules/agentTypes'

const createDemoAgent = (
  id: string,
  name: string,
  role: AgentRole,
  capabilities: AgentCapability[],
  status: AgentInstanceStatus,
  currentTaskId: string | null = null,
  load: number = 0,
  completedTasks: number = 0,
  failedTasks: number = 0,
): AgentStatus => ({
  agentId: id,
  agentName: name,
  role,
  status,
  currentTaskId,
  capabilities,
  completedTasks,
  failedTasks,
  averageTaskDuration: Math.random() * 60000 + 10000,
  lastHeartbeat: Date.now() - Math.random() * 3600000,
  load,
  error: status === AgentInstanceStatus.Error ? '任务执行超时' : null,
})

const demoAgents: AgentStatus[] = [
  createDemoAgent(
    'agent-1',
    '规划者-Alpha',
    AgentRoleEnum.Planner,
    ['task_decomposition', 'data_analysis'],
    AgentInstanceStatus.Idle,
    null,
    0.2,
    15,
    1,
  ),
  createDemoAgent(
    'agent-2',
    '执行者-Beta',
    AgentRoleEnum.Executor,
    ['code_generation', 'browser_automation', 'file_operation'],
    AgentInstanceStatus.Busy,
    'task-abc12345',
    0.75,
    28,
    3,
  ),
  createDemoAgent(
    'agent-3',
    '监控者-Gamma',
    AgentRoleEnum.Monitor,
    ['monitoring', 'data_analysis'],
    AgentInstanceStatus.Idle,
    null,
    0.1,
    42,
    0,
  ),
  createDemoAgent(
    'agent-4',
    '审查者-Delta',
    AgentRoleEnum.Reviewer,
    ['code_review', 'testing'],
    AgentInstanceStatus.Waiting,
    'task-def67890',
    0.5,
    19,
    2,
  ),
  createDemoAgent(
    'agent-5',
    '协调者-Epsilon',
    AgentRoleEnum.Coordinator,
    ['task_decomposition', 'monitoring'],
    AgentInstanceStatus.Busy,
    'task-ghi11223',
    0.9,
    35,
    1,
  ),
  createDemoAgent(
    'agent-6',
    '执行者-Zeta',
    AgentRoleEnum.Executor,
    ['web_search', 'documentation'],
    AgentInstanceStatus.Error,
    null,
    0,
    8,
    5,
  ),
  createDemoAgent(
    'agent-7',
    '规划者-Eta',
    AgentRoleEnum.Planner,
    ['task_decomposition'],
    AgentInstanceStatus.Offline,
    null,
    0,
    12,
    0,
  ),
]

export default function AgentRoleCardsDemo() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<AgentInstanceStatus | 'all'>('all')

  const filteredAgents = useMemo(() => {
    if (filterStatus === 'all') return demoAgents
    return demoAgents.filter(agent => agent.status === filterStatus)
  }, [filterStatus])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: demoAgents.length,
      [AgentInstanceStatus.Idle]: 0,
      [AgentInstanceStatus.Busy]: 0,
      [AgentInstanceStatus.Waiting]: 0,
      [AgentInstanceStatus.Error]: 0,
      [AgentInstanceStatus.Offline]: 0,
    }
    demoAgents.forEach(agent => {
      counts[agent.status]++
    })
    return counts
  }, [])

  const handleAgentClick = (agent: AgentStatus) => {
    setSelectedAgentId(agent.agentId === selectedAgentId ? null : agent.agentId)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}>
          Agent 角色卡片演示
        </h1>
        <p style={{ fontSize: '16px', color: '#6b7280' }}>
          展示多Agent协作系统中各个Agent的角色形象、状态和当前工作
        </p>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterStatus('all')}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: filterStatus === 'all' ? '2px solid #8b5cf6' : '2px solid #e5e7eb',
            background: filterStatus === 'all' ? '#8b5cf6' : 'white',
            color: filterStatus === 'all' ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          全部 ({statusCounts.all})
        </button>
        <button
          onClick={() => setFilterStatus(AgentInstanceStatus.Idle)}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: filterStatus === AgentInstanceStatus.Idle ? '2px solid #10b981' : '2px solid #e5e7eb',
            background: filterStatus === AgentInstanceStatus.Idle ? '#10b981' : 'white',
            color: filterStatus === AgentInstanceStatus.Idle ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          空闲 ({statusCounts[AgentInstanceStatus.Idle]})
        </button>
        <button
          onClick={() => setFilterStatus(AgentInstanceStatus.Busy)}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: filterStatus === AgentInstanceStatus.Busy ? '2px solid #f59e0b' : '2px solid #e5e7eb',
            background: filterStatus === AgentInstanceStatus.Busy ? '#f59e0b' : 'white',
            color: filterStatus === AgentInstanceStatus.Busy ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          忙碌 ({statusCounts[AgentInstanceStatus.Busy]})
        </button>
        <button
          onClick={() => setFilterStatus(AgentInstanceStatus.Waiting)}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: filterStatus === AgentInstanceStatus.Waiting ? '2px solid #3b82f6' : '2px solid #e5e7eb',
            background: filterStatus === AgentInstanceStatus.Waiting ? '#3b82f6' : 'white',
            color: filterStatus === AgentInstanceStatus.Waiting ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          等待中 ({statusCounts[AgentInstanceStatus.Waiting]})
        </button>
        <button
          onClick={() => setFilterStatus(AgentInstanceStatus.Error)}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: filterStatus === AgentInstanceStatus.Error ? '2px solid #ef4444' : '2px solid #e5e7eb',
            background: filterStatus === AgentInstanceStatus.Error ? '#ef4444' : 'white',
            color: filterStatus === AgentInstanceStatus.Error ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          错误 ({statusCounts[AgentInstanceStatus.Error]})
        </button>
        <button
          onClick={() => setFilterStatus(AgentInstanceStatus.Offline)}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: filterStatus === AgentInstanceStatus.Offline ? '2px solid #6b7280' : '2px solid #e5e7eb',
            background: filterStatus === AgentInstanceStatus.Offline ? '#6b7280' : 'white',
            color: filterStatus === AgentInstanceStatus.Offline ? 'white' : '#374151',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          离线 ({statusCounts[AgentInstanceStatus.Offline]})
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
        {filteredAgents.map(agent => (
          <AgentRoleCard
            key={agent.agentId}
            agent={agent}
            isSelected={selectedAgentId === agent.agentId}
            onClick={handleAgentClick}
            showDetails={selectedAgentId === agent.agentId}
          />
        ))}
      </div>

      {filteredAgents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>没有找到匹配的Agent</p>
          <p style={{ fontSize: '14px' }}>请选择其他状态筛选条件</p>
        </div>
      )}

      <div style={{ marginTop: '48px', padding: '24px', background: '#f9fafb', borderRadius: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px' }}>
          使用说明
        </h2>
        <ul style={{ fontSize: '14px', color: '#4b5563', lineHeight: '2', paddingLeft: '20px' }}>
          <li>点击任意卡片可展开查看详细信息</li>
          <li>每个Agent都有独特的角色形象和主题色彩</li>
          <li>卡片显示Agent的当前状态、正在执行的任务和角色描述</li>
          <li>使用上方的筛选按钮可按状态过滤Agent</li>
          <li>忙碌状态的Agent会显示动态的进度指示器</li>
          <li>错误和离线状态的Agent会有特殊的视觉效果</li>
        </ul>
      </div>
    </div>
  )
}