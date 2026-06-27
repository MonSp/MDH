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

/* ───────── 项目/任务共享类型 ───────── */

export interface SubTask {
  subtask_id: string
  description: string
  status: string
  agent_id: string
  created_at: number
  completed_at: number
}

export interface ProjectTask {
  task_id: string
  project_id: string
  description: string
  status: string
  created_at: number
  completed_at: number
  meeting_id: string
  subtasks: SubTask[]
}

export interface ProjectDetail {
  project_id: string
  name: string
  status: string
  brief: Record<string, unknown>
  created_at: string
  category: string
  tasks: ProjectTask[]
  employees: Array<{ employee_id: string; agent_id: string; skill_id: string; status: string }>
  skill_packages: Array<{ skill_id: string; name: string }>
  execution_logs: Array<Record<string, unknown>>
}

/* ───────── 状态映射常量 ───────── */

export const TASK_STATUS_MAP: Record<string, { icon: string; color: string; label: string }> = {
  completed: { icon: '✅', color: '#10b981', label: '已完成' },
  executing: { icon: '⚡', color: '#f59e0b', label: '执行中' },
  assigned: { icon: '📌', color: '#3b82f6', label: '已分配' },
  pending: { icon: '⏳', color: '#6b7280', label: '待处理' },
  failed: { icon: '❌', color: '#ef4444', label: '失败' },
  revision_required: { icon: '⚠️', color: '#f59e0b', label: '需修改' },
}

export const PROJECT_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: '进行中', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  running: { label: '运行中', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  completed: { label: '已完成', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  archived: { label: '已归档', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  planning: { label: '规划中', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  created: { label: '已创建', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  failed: { label: '失败', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
}
