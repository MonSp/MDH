/**
 * 会议状态管理 — Zustand store
 *
 * 替代 useMeetingSocket 中的 40+ useState 扁平 bag。
 * 按领域拆分为 5 个 slice：meeting、voting、approval、checkpoint、bridge。
 */

import { create } from 'zustand'
import type { TeamAgent, Task, ChatMessage, AgendaState } from '../../components/office-team/types'
import type { WorkflowExecution } from '../../modules/agentTypes'

// ── 共享类型 ──

export interface WorkspaceInfo {
  workspace_id: string
  task_id: string
  workspace_type: string
  root_path: string
  branch_name: string
}

export interface ToolCallLog {
  tool_name: string
  arguments: Record<string, unknown>
  success: boolean
  output?: string
  error?: string
  timestamp: string
}

export interface Proposal {
  id: string
  proposerId: string
  content: string
  createdAt: string
}

export interface Vote {
  voterId: string
  approve: boolean
  reason?: string
}

export interface VoteResult {
  proposalId: string
  totalVotes: number
  approveCount: number
  opposeCount: number
  accepted: boolean
}

export interface PendingApproval {
  id: string
  requesterId: string
  operation: string
  description: string
  riskLevel: string
  confidence: number
  status: string
  createdAt: string
  taskId?: string
  gateId?: string
  approver?: string
  approverName?: string
}

export interface Checkpoint {
  id: string
  taskId?: string
  stepIndex?: number
  createdAt?: string
  agentId?: string
  operation?: string
  target?: string
  riskLevel?: string
  allowed?: boolean
  reason?: string
  timestamp?: string
}

export interface BridgeMessage {
  fromAgentId: string
  toAgentId: string
  payload: unknown
  timestamp: number
}

// ── Meeting Slice ──

export interface MeetingSlice {
  meetingId: string | null
  agents: TeamAgent[]
  tasks: Task[]
  chatMessages: ChatMessage[]
  isMeetingActive: boolean
  meetingPhase: string
  meetingStartTime: number | null
  agendaState: AgendaState | null
  workspace: WorkspaceInfo | null
  toolCallLogs: ToolCallLog[]
  lastWorkflow: WorkflowExecution | null

  setMeetingId: (id: string | null) => void
  setAgents: (agents: TeamAgent[] | ((prev: TeamAgent[]) => TeamAgent[])) => void
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void
  setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  setIsMeetingActive: (active: boolean) => void
  setMeetingPhase: (phase: string) => void
  setMeetingStartTime: (time: number | null) => void
  setAgendaState: (state: AgendaState | null) => void
  setWorkspace: (workspace: WorkspaceInfo | null) => void
  setToolCallLogs: (logs: ToolCallLog[] | ((prev: ToolCallLog[]) => ToolCallLog[])) => void
  setLastWorkflow: (workflow: WorkflowExecution | null) => void
  clearMeeting: () => void
}

type ZustandSet<T> = (partial: T | Partial<T> | ((state: T) => T | Partial<T>)) => void

const createMeetingSlice = (set: ZustandSet<MeetingSlice>): MeetingSlice => ({
  meetingId: null,
  agents: [],
  tasks: [],
  chatMessages: [],
  isMeetingActive: false,
  meetingPhase: 'idle',
  meetingStartTime: null,
  agendaState: null,
  workspace: null,
  toolCallLogs: [],
  lastWorkflow: null,

  setMeetingId: (id) => set({ meetingId: id } as Partial<MeetingSlice>),
  setAgents: (agents) => set((state: MeetingSlice) => ({
    agents: typeof agents === 'function' ? agents(state.agents) : agents,
  })),
  setTasks: (tasks) => set((state: MeetingSlice) => ({
    tasks: typeof tasks === 'function' ? tasks(state.tasks) : tasks,
  })),
  setChatMessages: (messages) => set((state: MeetingSlice) => ({
    chatMessages: typeof messages === 'function' ? messages(state.chatMessages) : messages,
  })),
  setIsMeetingActive: (active) => set({ isMeetingActive: active } as Partial<MeetingSlice>),
  setMeetingPhase: (phase) => set({ meetingPhase: phase } as Partial<MeetingSlice>),
  setMeetingStartTime: (time) => set({ meetingStartTime: time } as Partial<MeetingSlice>),
  setAgendaState: (state) => set({ agendaState: state } as Partial<MeetingSlice>),
  setWorkspace: (workspace) => set({ workspace } as Partial<MeetingSlice>),
  setToolCallLogs: (logs) => set((state: MeetingSlice) => ({
    toolCallLogs: typeof logs === 'function' ? logs(state.toolCallLogs) : logs,
  })),
  setLastWorkflow: (workflow) => set({ lastWorkflow: workflow } as Partial<MeetingSlice>),
  clearMeeting: () => set({
    meetingId: null,
    agents: [],
    tasks: [],
    chatMessages: [],
    isMeetingActive: false,
    meetingPhase: 'idle',
    meetingStartTime: null,
    agendaState: null,
    workspace: null,
    toolCallLogs: [],
  } as Partial<MeetingSlice>),
})

// ── Voting Slice ──

export interface VotingSlice {
  activeProposal: Proposal | null
  votes: Map<string, Vote>
  voteResults: VoteResult | null

  setActiveProposal: (proposal: Proposal | null) => void
  setVotes: (votes: Map<string, Vote> | ((prev: Map<string, Vote>) => Map<string, Vote>)) => void
  setVoteResults: (results: VoteResult | null) => void
}

const createVotingSlice = (set: ZustandSet<VotingSlice>): VotingSlice => ({
  activeProposal: null,
  votes: new Map(),
  voteResults: null,

  setActiveProposal: (proposal) => set({ activeProposal: proposal } as Partial<VotingSlice>),
  setVotes: (votes) => set((state: VotingSlice) => ({
    votes: typeof votes === 'function' ? votes(state.votes) : votes,
  })),
  setVoteResults: (results) => set({ voteResults: results } as Partial<VotingSlice>),
})

// ── Approval Slice ──

export interface ApprovalSlice {
  pendingApprovals: Map<string, PendingApproval>

  setPendingApprovals: (approvals: Map<string, PendingApproval> | ((prev: Map<string, PendingApproval>) => Map<string, PendingApproval>)) => void
}

const createApprovalSlice = (set: ZustandSet<ApprovalSlice>): ApprovalSlice => ({
  pendingApprovals: new Map(),

  setPendingApprovals: (approvals) => set((state: ApprovalSlice) => ({
    pendingApprovals: typeof approvals === 'function' ? approvals(state.pendingApprovals) : approvals,
  })),
})

// ── Checkpoint Slice ──

export interface CheckpointSlice {
  checkpoints: Checkpoint[]
  restoredState: unknown | null
  auditLog: Checkpoint[]

  setCheckpoints: (checkpoints: Checkpoint[] | ((prev: Checkpoint[]) => Checkpoint[])) => void
  setRestoredState: (state: unknown | null) => void
  setAuditLog: (log: Checkpoint[] | ((prev: Checkpoint[]) => Checkpoint[])) => void
}

const createCheckpointSlice = (set: ZustandSet<CheckpointSlice>): CheckpointSlice => ({
  checkpoints: [],
  restoredState: null,
  auditLog: [],

  setCheckpoints: (checkpoints) => set((state: CheckpointSlice) => ({
    checkpoints: typeof checkpoints === 'function' ? checkpoints(state.checkpoints) : checkpoints,
  })),
  setRestoredState: (restoredState) => set({ restoredState } as Partial<CheckpointSlice>),
  setAuditLog: (auditLog) => set((state: CheckpointSlice) => ({
    auditLog: typeof auditLog === 'function' ? auditLog(state.auditLog) : auditLog,
  })),
})

// ── Bridge Slice ──

export interface BridgeSlice {
  bridgeMessages: BridgeMessage[]

  setBridgeMessages: (messages: BridgeMessage[] | ((prev: BridgeMessage[]) => BridgeMessage[])) => void
}

const createBridgeSlice = (set: ZustandSet<BridgeSlice>): BridgeSlice => ({
  bridgeMessages: [],

  setBridgeMessages: (messages) => set((state: BridgeSlice) => ({
    bridgeMessages: typeof messages === 'function' ? messages(state.bridgeMessages) : messages,
  })),
})

// ── Combined Store ──

export type MeetingStore = MeetingSlice & VotingSlice & ApprovalSlice & CheckpointSlice & BridgeSlice

export const useMeetingStore = create<MeetingStore>()((set) => ({
  ...createMeetingSlice(set as ZustandSet<MeetingSlice>),
  ...createVotingSlice(set as ZustandSet<VotingSlice>),
  ...createApprovalSlice(set as ZustandSet<ApprovalSlice>),
  ...createCheckpointSlice(set as ZustandSet<CheckpointSlice>),
  ...createBridgeSlice(set as ZustandSet<BridgeSlice>),
}))
