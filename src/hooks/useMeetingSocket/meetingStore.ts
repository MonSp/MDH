/**
 * 会议状态管理 — Zustand store
 *
 * 替代 useMeetingSocket 中的 40+ useState 扁平 bag。
 * 按领域拆分为 5 个 slice：meeting、voting、approval、checkpoint、bridge。
 */

import { create } from 'zustand'
import type { TeamAgent, Task, ChatMessage, AgendaState } from '../../components/office-team/types'
import type { WorkflowExecution } from '../../modules/agentTypes'

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
  workspace: any
  toolCallLogs: any[]
  lastWorkflow: WorkflowExecution | null

  setMeetingId: (id: string | null) => void
  setAgents: (agents: TeamAgent[] | ((prev: TeamAgent[]) => TeamAgent[])) => void
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void
  setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  setIsMeetingActive: (active: boolean) => void
  setMeetingPhase: (phase: string) => void
  setMeetingStartTime: (time: number | null) => void
  setAgendaState: (state: AgendaState | null) => void
  setWorkspace: (workspace: any) => void
  setToolCallLogs: (logs: any[] | ((prev: any[]) => any[])) => void
  setLastWorkflow: (workflow: WorkflowExecution | null) => void
  clearMeeting: () => void
}

const createMeetingSlice = (set: any): MeetingSlice => ({
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

  setMeetingId: (id) => set({ meetingId: id }),
  setAgents: (agents) => set((state: any) => ({
    agents: typeof agents === 'function' ? agents(state.agents) : agents,
  })),
  setTasks: (tasks) => set((state: any) => ({
    tasks: typeof tasks === 'function' ? tasks(state.tasks) : tasks,
  })),
  setChatMessages: (messages) => set((state: any) => ({
    chatMessages: typeof messages === 'function' ? messages(state.chatMessages) : messages,
  })),
  setIsMeetingActive: (active) => set({ isMeetingActive: active }),
  setMeetingPhase: (phase) => set({ meetingPhase: phase }),
  setMeetingStartTime: (time) => set({ meetingStartTime: time }),
  setAgendaState: (state) => set({ agendaState: state }),
  setWorkspace: (workspace) => set({ workspace }),
  setToolCallLogs: (logs) => set((state: any) => ({
    toolCallLogs: typeof logs === 'function' ? logs(state.toolCallLogs) : logs,
  })),
  setLastWorkflow: (workflow) => set({ lastWorkflow: workflow }),
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
  }),
})

// ── Voting Slice ──

export interface VotingSlice {
  activeProposal: any | null
  votes: Map<string, any>
  voteResults: any | null

  setActiveProposal: (proposal: any | null) => void
  setVotes: (votes: Map<string, any> | ((prev: Map<string, any>) => Map<string, any>)) => void
  setVoteResults: (results: any | null) => void
}

const createVotingSlice = (set: any): VotingSlice => ({
  activeProposal: null,
  votes: new Map(),
  voteResults: null,

  setActiveProposal: (proposal) => set({ activeProposal: proposal }),
  setVotes: (votes) => set((state: any) => ({
    votes: typeof votes === 'function' ? votes(state.votes) : votes,
  })),
  setVoteResults: (results) => set({ voteResults: results }),
})

// ── Approval Slice ──

export interface ApprovalSlice {
  pendingApprovals: Map<string, any>

  setPendingApprovals: (approvals: Map<string, any> | ((prev: Map<string, any>) => Map<string, any>)) => void
}

const createApprovalSlice = (set: any): ApprovalSlice => ({
  pendingApprovals: new Map(),

  setPendingApprovals: (approvals) => set((state: any) => ({
    pendingApprovals: typeof approvals === 'function' ? approvals(state.pendingApprovals) : approvals,
  })),
})

// ── Checkpoint Slice ──

export interface CheckpointSlice {
  checkpoints: any[]
  restoredState: any | null
  auditLog: any[]

  setCheckpoints: (checkpoints: any[] | ((prev: any[]) => any[])) => void
  setRestoredState: (state: any | null) => void
  setAuditLog: (log: any[] | ((prev: any[]) => any[])) => void
}

const createCheckpointSlice = (set: any): CheckpointSlice => ({
  checkpoints: [],
  restoredState: null,
  auditLog: [],

  setCheckpoints: (checkpoints) => set((state: any) => ({
    checkpoints: typeof checkpoints === 'function' ? checkpoints(state.checkpoints) : checkpoints,
  })),
  setRestoredState: (restoredState) => set({ restoredState }),
  setAuditLog: (auditLog) => set((state: any) => ({
    auditLog: typeof auditLog === 'function' ? auditLog(state.auditLog) : auditLog,
  })),
})

// ── Bridge Slice ──

export interface BridgeSlice {
  bridgeMessages: any[]

  setBridgeMessages: (messages: any[] | ((prev: any[]) => any[])) => void
}

const createBridgeSlice = (set: any): BridgeSlice => ({
  bridgeMessages: [],

  setBridgeMessages: (messages) => set((state: any) => ({
    bridgeMessages: typeof messages === 'function' ? messages(state.bridgeMessages) : messages,
  })),
})

// ── Combined Store ──

export type MeetingStore = MeetingSlice & VotingSlice & ApprovalSlice & CheckpointSlice & BridgeSlice

export const useMeetingStore = create<MeetingStore>()((set: any) => ({
  ...createMeetingSlice(set),
  ...createVotingSlice(set),
  ...createApprovalSlice(set),
  ...createCheckpointSlice(set),
  ...createBridgeSlice(set),
}))
