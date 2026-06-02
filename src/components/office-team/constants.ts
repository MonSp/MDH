import { AgentRole } from '../../modules/agentTypes'
import type { AgentConfig, WorkstationConfig } from './types'

export const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'agent-ceo', name: 'CTO-技术总监', role: AgentRole.CEO, workstationId: 'ws-0' },
  { id: 'agent-planner', name: '架构师-Alpha', role: AgentRole.Planner, workstationId: 'ws-1' },
  { id: 'agent-executor', name: '全栈开发-Beta', role: AgentRole.Executor, workstationId: 'ws-2' },
  { id: 'agent-monitor', name: 'DevOps-Gamma', role: AgentRole.Monitor, workstationId: 'ws-3' },
  { id: 'agent-reviewer', name: 'QA工程师-Delta', role: AgentRole.Reviewer, workstationId: 'ws-4' },
  { id: 'agent-coordinator', name: '项目经理-Epsilon', role: AgentRole.Coordinator, workstationId: 'ws-5' },
]

export const WORKSTATIONS: WorkstationConfig[] = [
  { id: 'ws-0', x: 50, y: 5 },
  { id: 'ws-1', x: 15, y: 20 },
  { id: 'ws-2', x: 45, y: 15 },
  { id: 'ws-3', x: 75, y: 20 },
  { id: 'ws-4', x: 20, y: 70 },
  { id: 'ws-5', x: 50, y: 75 },
]

export const MEETING_TABLE = { x: 50, y: 45 }

export const ROLE_LABELS: Record<AgentRole, string> = {
  ceo: 'CEO',
  planner: '规划',
  executor: '执行',
  monitor: '监控',
  reviewer: '审查',
  coordinator: '协调',
}

export const ROLE_EMOJI: Record<AgentRole, string> = {
  ceo: '👔',
  planner: '🧠',
  executor: '⚡',
  monitor: '👁',
  reviewer: '🔍',
  coordinator: '🎯',
}
