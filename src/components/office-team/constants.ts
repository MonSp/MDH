import { AgentRole } from '../../modules/agentTypes'
import type { AgentConfig, WorkstationConfig } from './types'

export const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'agent-planner', name: '规划者-Alpha', role: AgentRole.Planner, workstationId: 'ws-1' },
  { id: 'agent-executor', name: '执行者-Beta', role: AgentRole.Executor, workstationId: 'ws-2' },
  { id: 'agent-monitor', name: '监控者-Gamma', role: AgentRole.Monitor, workstationId: 'ws-3' },
  { id: 'agent-reviewer', name: '审查者-Delta', role: AgentRole.Reviewer, workstationId: 'ws-4' },
  { id: 'agent-coordinator', name: '协调者-Epsilon', role: AgentRole.Coordinator, workstationId: 'ws-5' },
]

export const WORKSTATIONS: WorkstationConfig[] = [
  { id: 'ws-1', x: 15, y: 20 },
  { id: 'ws-2', x: 45, y: 15 },
  { id: 'ws-3', x: 75, y: 20 },
  { id: 'ws-4', x: 20, y: 70 },
  { id: 'ws-5', x: 50, y: 75 },
]

export const MEETING_TABLE = { x: 50, y: 45 }

export const ROLE_LABELS: Record<AgentRole, string> = {
  planner: '规划',
  executor: '执行',
  monitor: '监控',
  reviewer: '审查',
  coordinator: '协调',
}

export const ROLE_EMOJI: Record<AgentRole, string> = {
  planner: '🧠',
  executor: '⚡',
  monitor: '👁',
  reviewer: '🔍',
  coordinator: '🎯',
}
