import type { AgentRole } from '../../modules/agentTypes'

export interface TeamAgent {
  id: string
  name: string
  role: AgentRole
  status: 'idle' | 'working' | 'meeting' | 'wandering'
  currentTask: string | null
  workstationId: string
  wanderAngle?: number
}

export interface Task {
  id: string
  agentId: string
  description: string
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed'
  createdAt: number
}

export interface ChatMessage {
  role: 'boss' | 'agent' | 'ceo'
  agentId?: string
  content: string
  timestamp: number
}

export type ViewState = 'office' | 'transitioning-to-meeting' | 'meeting' | 'transitioning-to-office'

export interface WorkstationConfig {
  id: string
  x: number
  y: number
}

export interface AgentConfig {
  id: string
  name: string
  role: AgentRole
  workstationId: string
}
