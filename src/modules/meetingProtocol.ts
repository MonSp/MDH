// 后端 server.py 实际发送的消息类型
export type MeetingMessageType =
  | 'start_meeting'
  | 'end_meeting'
  | 'meeting_message'
  | 'task_assign'
  | 'get_meeting_status'
  | 'meeting_started'
  | 'meeting_ended'
  | 'meeting_message_ack'
  | 'agent_message'
  | 'task_assigned'
  | 'agent_status_update'
  | 'meeting_error'
  | 'request_retransmit'
  | 'task_auto_assigned'
  | 'structured_feedback'
  | 'iteration_update'
  | 'review_completed'
  | 'workflow_executed'
  | 'workflow_node_status_update'
  | 'experience_injected'
  | 'skill_mounted'
  // --- 以下为预留类型，后端当前不发送 ---
  | 'agenda_update'           // reserved: 议程状态推送
  | 'proposal'                // reserved: 提案推送
  | 'vote'                    // reserved: 投票推送
  | 'vote_result'             // reserved: 投票结果推送
  | 'critical_blocker'        // reserved: 关键阻塞推送
  | 'human_approval_request'  // reserved: 人工审批请求
  | 'human_approval_response' // reserved: 人工审批响应
  | 'checkpoint_save'         // reserved: 检查点保存
  | 'checkpoint_restore'      // reserved: 检查点恢复
  | 'audit_log'               // reserved: 审计日志

export type MeetingAgentRole = 'planner' | 'executor' | 'monitor' | 'reviewer' | 'coordinator'

export type MeetingAgentStatus = 'idle' | 'meeting' | 'working' | 'speaking'

export type AgendaPhase = 'idle' | 'open_topic' | 'discussion' | 'proposal' | 'voting' | 'accepted' | 'rejected' | 'closed' | 'emergency'

export type Stance = 'support' | 'oppose' | 'modify' | 'neutral'

export type ConsensusStrategy = 'simple_majority' | 'weighted_vote' | 'argument_based'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface MeetingAgentInfo {
  id: string
  name: string
  role: MeetingAgentRole
  status: MeetingAgentStatus
  capabilities: string[]
}

export interface MeetingTaskInfo {
  id: string
  agentId: string
  description: string
  status: string
  createdAt: number
}

export interface MeetingSummary {
  totalAgents: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  pendingTasks: number
  messagesCount: number
}

export interface TraceContext {
  traceId: string
  spanId: string
  parentSpanId?: string
}

export interface AgendaStateInfo {
  phase: AgendaPhase
  topic: string
  currentSpeaker?: string
  proposalId?: string
}

export interface ArgumentRef {
  messageId: string
  summary: string
}

export interface ProposalInfo {
  id: string
  proposerId: string
  content: string
  stance: Stance
  confidence: number
  argumentRefs: ArgumentRef[]
  createdAt: number
}

export interface VoteInfo {
  proposalId: string
  voterId: string
  approve: boolean
  weight: number
  reason: string
}

export interface VoteResultInfo {
  proposalId: string
  strategy: ConsensusStrategy
  totalVotes: number
  approveCount: number
  opposeCount: number
  weightedApprove: number
  weightedOppose: number
  accepted: boolean
}

export interface ApprovalRequestInfo {
  id: string
  requesterId: string
  operation: string
  description: string
  riskLevel: RiskLevel
  confidence: number
  status: ApprovalStatus
  createdAt: number
  /** 门禁把关上下文（可选，向后兼容）：所属任务 / 门禁节点 / 指定审批人 */
  taskId?: string
  gateId?: string
  approver?: string
  /** 审批人显示名（员工目录解析；空串 = 未命中/系统） */
  approverName?: string
}

export interface CheckpointInfo {
  id: string
  taskId: string
  stepIndex: number
  stateSnapshot: Record<string, unknown>
  createdAt: number
}

export interface AuditEntryInfo {
  id: string
  agentId: string
  operation: string
  target: string
  riskLevel: RiskLevel
  result: string
  details: Record<string, unknown>
  timestamp: number
}

export interface StartMeetingMsg {
  type: 'start_meeting'
}

export interface EndMeetingMsg {
  type: 'end_meeting'
}

export interface MeetingMessageMsg {
  type: 'meeting_message'
  content: string
}

export interface TaskAssignMsg {
  type: 'task_assign'
  agentId: string
  description: string
}

export interface GetMeetingStatusMsg {
  type: 'get_meeting_status'
}

export interface MeetingStartedMsg {
  type: 'meeting_started'
  meetingId: string
  agents: MeetingAgentInfo[]
}

export interface MeetingEndedMsg {
  type: 'meeting_ended'
  summary: MeetingSummary
}

export interface AgentMessageMsg {
  type: 'agent_message'
  agentId: string
  content: string
  delta?: string
}

export interface TaskAssignedMsg {
  type: 'task_assigned'
  taskId: string
  agentId: string
  status: string
}

export interface AgentStatusUpdateMsg {
  type: 'agent_status_update'
  agentId: string
  status: MeetingAgentStatus
  currentTask?: string
}

export interface MeetingErrorMsg {
  type: 'meeting_error'
  message: string
}

export interface AgendaUpdateMsg {
  type: 'agenda_update'
  agenda: AgendaStateInfo
}

export interface ProposalMsg {
  type: 'proposal'
  proposal: ProposalInfo
}

export interface VoteMsg {
  type: 'vote'
  vote: VoteInfo
}

export interface VoteResultMsg {
  type: 'vote_result'
  result: VoteResultInfo
}

export interface CriticalBlockerMsg {
  type: 'critical_blocker'
  agentId: string
  content: string
  blockerType: string
}

export interface HumanApprovalRequestMsg {
  type: 'human_approval_request'
  request: ApprovalRequestInfo
}

export interface HumanApprovalResponseMsg {
  type: 'human_approval_response'
  requestId: string
  approved: boolean
  reason?: string
}

export interface CheckpointSaveMsg {
  type: 'checkpoint_save'
  checkpoint: CheckpointInfo
}

export interface CheckpointRestoreMsg {
  type: 'checkpoint_restore'
  checkpointId: string
}

export interface AuditLogMsg {
  type: 'audit_log'
  entry: AuditEntryInfo
}

export interface RequestRetransmitMsg {
  type: 'request_retransmit'
  fromSequenceNo: number
}

export interface AgendaActionMsg {
  type: 'agenda_action'
  action: string
  topic?: string
  reason?: string
}

export type MeetingWSMessage =
  | StartMeetingMsg
  | EndMeetingMsg
  | MeetingMessageMsg
  | TaskAssignMsg
  | GetMeetingStatusMsg
  | MeetingStartedMsg
  | MeetingEndedMsg
  | AgentMessageMsg
  | TaskAssignedMsg
  | AgentStatusUpdateMsg
  | MeetingErrorMsg
  | AgendaUpdateMsg
  | ProposalMsg
  | VoteMsg
  | VoteResultMsg
  | CriticalBlockerMsg
  | HumanApprovalRequestMsg
  | HumanApprovalResponseMsg
  | CheckpointSaveMsg
  | CheckpointRestoreMsg
  | AuditLogMsg
  | RequestRetransmitMsg

// 已知消息类型集合（用于运行时校验）
const KNOWN_MESSAGE_TYPES = new Set<string>([
  'start_meeting', 'end_meeting', 'meeting_message', 'task_assign', 'get_meeting_status',
  'meeting_started', 'meeting_ended', 'meeting_message_ack', 'agent_message', 'task_assigned',
  'agent_status_update', 'meeting_error', 'agenda_update', 'proposal', 'vote', 'vote_result',
  'critical_blocker', 'human_approval_request', 'human_approval_response',
  'checkpoint_save', 'checkpoint_restore', 'audit_log', 'request_retransmit',
  'task_auto_assigned', 'structured_feedback', 'iteration_update', 'review_completed',
  'workflow_executed', 'workflow_node_status_update', 'experience_injected', 'skill_mounted',
  'task_result', 'task_deleted', 'workspace_confirm_request', 'complexity_result',
  'path_selected', 'path_upgrade', 'workspace_created', 'tool_result',
  'semantic_analysis_result', 'pending_approvals', 'checkpoint_deleted',
  'meeting_snapshot_saved', 'meeting_snapshot_restored',
  'bridge_agent_registered', 'bridge_message', 'config_updated',
  'audit_log_list', 'checkpoints_list', 'workspace_list', 'workspace_destroyed',
  'decision_overridden', 'agent_weight_adjusted', 'task_paused', 'task_resumed',
  'skill_saved', 'skill_list', 'skill_deleted', 'skill_summary',
])

/** 运行时消息类型守卫 */
export function isWsMessage(data: unknown): data is { type: string } & Record<string, unknown> {
  return typeof data === 'object' && data !== null && 'type' in data && typeof (data as any).type === 'string'
}

/** 检查是否为已知消息类型 */
export function isKnownMessageType(type: string): boolean {
  return KNOWN_MESSAGE_TYPES.has(type)
}
