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
  | 'agenda_update'
  | 'proposal'
  | 'vote'
  | 'vote_result'
  | 'critical_blocker'
  | 'human_approval_request'
  | 'human_approval_response'
  | 'checkpoint_save'
  | 'checkpoint_restore'
  | 'audit_log'
  | 'request_retransmit'

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
