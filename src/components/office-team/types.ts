import type { AgentRole, StructuredFeedback, RoutingDecision, IterationStatus } from '../../modules/agentTypes'

export interface TeamAgent {
  id: string
  name: string
  role: AgentRole
  status: 'idle' | 'working' | 'meeting' | 'wandering'
  currentTask: string | null
  workstationId: string
  wanderAngle?: number
  skillId?: string | null
  skillName?: string | null
}

export interface Task {
  id: string
  agentId: string
  description: string
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed' | 'revision_required'
  createdAt: number
  acceptanceCriteria?: string[]
  requiredSkills?: string[]
  iterationStatus?: IterationStatus
}

export interface ChatMessage {
  role: 'boss' | 'agent' | 'ceo'
  agentId?: string
  content: string
  timestamp: number
  _stance?: 'support' | 'oppose' | 'modify' | 'neutral'
  _confidence?: number
  _streaming?: boolean
  /** 结构化反馈 */
  _structuredFeedback?: StructuredFeedback
  /** 路由决策信息 */
  _routingDecision?: RoutingDecision
  /** 迭代状态 */
  _iterationStatus?: IterationStatus
  /** 消息子类型：feedback / routing / experience / iteration */
  _msgSubtype?: 'feedback' | 'routing' | 'experience' | 'iteration'
}

export type ViewState = 'tower' | 'office' | 'meeting'

export type MeetingTab = 'chat' | 'skills' | 'projects' | 'rules' | 'routes' | 'workspace'

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

export interface AgendaEvent {
  type: string
  timestamp: number
  from?: string
  to?: string
  agentId?: string
  reason?: string
}

export interface AgendaState {
  phase: string
  topic: string
  currentSpeaker: string | null
  proposalId: string | null
  tokenQueue: { agentId: string; relevanceScore: number }[]
  eventHistory: AgendaEvent[]
}
