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

export type MeetingAgentRole = 'planner' | 'executor' | 'monitor' | 'reviewer' | 'coordinator'

export type MeetingAgentStatus = 'idle' | 'meeting' | 'working' | 'speaking'

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
