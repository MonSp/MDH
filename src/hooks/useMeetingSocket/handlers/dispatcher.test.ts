import { describe, it, expect, vi } from 'vitest'
import { dispatchMessage } from '../handlers'

describe('dispatchMessage', () => {
  it('dispatches known message types to correct handler', () => {
    const setters = {
      setMeetingId: vi.fn(),
      setAgents: vi.fn(fn => fn([])),
      setTasks: vi.fn(fn => fn([])),
      setChatMessages: vi.fn(fn => fn([])),
      setIsMeetingActive: vi.fn(),
      setMeetingPhase: vi.fn(),
      setMeetingStartTime: vi.fn(),
      setAgendaState: vi.fn(),
      setWorkspace: vi.fn(),
      setToolCallLogs: vi.fn(fn => fn([])),
      setLastWorkflow: vi.fn(),
      setActiveProposal: vi.fn(),
      setVotes: vi.fn(fn => fn(new Map())),
      setVoteResults: vi.fn(),
      setPendingApprovals: vi.fn(fn => fn(new Map())),
      setCheckpoints: vi.fn(arg => typeof arg === 'function' ? arg([]) : arg),
      setRestoredState: vi.fn(),
      setBridgeMessages: vi.fn(fn => fn([])),
    }
    const refs = {
      pendingMessages: { current: new Map() },
      bridgeCallbacks: { current: new Map() },
    }

    // meeting_started
    expect(dispatchMessage('meeting_started', { meetingId: 'm1', agents: [] }, setters, refs)).toBe(true)
    expect(setters.setMeetingId).toHaveBeenCalledWith('m1')

    // proposal
    expect(dispatchMessage('proposal', { proposal: { id: 'p1', proposerId: 'a1', content: 'test' } }, setters, refs)).toBe(true)
    expect(setters.setActiveProposal).toHaveBeenCalled()

    // vote_result
    expect(dispatchMessage('vote_result', { result: { proposalId: 'p1', totalVotes: 3, approveCount: 2, opposeCount: 1, accepted: true } }, setters, refs)).toBe(true)
    expect(setters.setVoteResults).toHaveBeenCalled()

    // checkpoint_saved
    expect(dispatchMessage('checkpoint_saved', { checkpoint: { id: 'cp-1', taskId: 't1', stepIndex: 1 } }, setters, refs)).toBe(true)
    expect(setters.setCheckpoints).toHaveBeenCalled()

    // bridge_message
    expect(dispatchMessage('bridge_message', { fromAgentId: 'py-1', toAgentId: 'ts-1', payload: {} }, setters, refs)).toBe(true)
    expect(setters.setBridgeMessages).toHaveBeenCalled()
  })

  it('returns false for unknown message types', () => {
    const setters = {}
    expect(dispatchMessage('unknown_type', {}, setters)).toBe(false)
  })

  it('handles all registered message types without throwing', () => {
    const setters = {
      setMeetingId: vi.fn(),
      setAgents: vi.fn(fn => fn([])),
      setTasks: vi.fn(fn => fn([])),
      setChatMessages: vi.fn(fn => fn([])),
      setIsMeetingActive: vi.fn(),
      setMeetingPhase: vi.fn(),
      setMeetingStartTime: vi.fn(),
      setAgendaState: vi.fn(),
      setWorkspace: vi.fn(),
      setToolCallLogs: vi.fn(fn => fn([])),
      setLastWorkflow: vi.fn(),
      setActiveProposal: vi.fn(),
      setVotes: vi.fn(fn => fn(new Map())),
      setVoteResults: vi.fn(),
      setPendingApprovals: vi.fn(fn => fn(new Map())),
      setCheckpoints: vi.fn(arg => typeof arg === 'function' ? arg([]) : arg),
      setRestoredState: vi.fn(),
      setBridgeMessages: vi.fn(fn => fn([])),
    }
    const refs = {
      pendingMessages: { current: new Map() },
      bridgeCallbacks: { current: new Map() },
    }

    const types = [
      'meeting_started', 'agent_message', 'thinking_start', 'thinking_delta', 'thinking_end',
      'task_assigned', 'task_deleted', 'agent_status_update', 'meeting_ended', 'agenda_update',
      'meeting_error', 'semantic_analysis_result', 'task_auto_assigned', 'structured_feedback',
      'iteration_update', 'experience_injected', 'skill_mounted', 'review_completed',
      'workflow_executed', 'workflow_node_status_update', 'workspace_created', 'tool_result',
      'critical_blocker', 'proposal', 'vote', 'vote_result',
      'human_approval_request', 'human_approval_response', 'pending_approvals',
      'checkpoint_saved', 'checkpoint_restored', 'checkpoints_list', 'checkpoint_deleted',
      'meeting_snapshot_saved', 'meeting_snapshot_restored', 'audit_log', 'audit_log_list',
      'bridge_agent_registered', 'bridge_message',
    ]

    for (const type of types) {
      expect(dispatchMessage(type, { agents: [], proposal: { id: 'p1' }, vote: { voterId: 'a1', approve: true }, result: { proposalId: 'p1', totalVotes: 1, approveCount: 1, opposeCount: 0, accepted: true }, request: { id: 'r1' }, requestId: 'r1', approved: true, requests: [], checkpoint: { id: 'cp1', taskId: 't1', stepIndex: 0 }, success: true, checkpointId: 'cp1', checkpoints: [], meetingId: 'm1', tasksRestored: 0, messagesRestored: 0, entry: { id: 'a1' }, entries: [], tsAgentId: 'ts1', fromAgentId: 'py1', toAgentId: 'ts1', payload: {} }, setters, refs)).toBe(true)
    }
  })
})
