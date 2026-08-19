import { describe, it, expect, vi } from 'vitest'
import {
  handleMeetingStarted, handleAgentMessage, handleThinkingStart,
  handleThinkingDelta, handleThinkingEnd, handleTaskAssigned,
  handleTaskDeleted, handleAgentStatusUpdate, handleMeetingEnded,
  handleAgendaUpdate, handleMeetingError, handleSemanticAnalysisResult,
  handleTaskAutoAssigned, handleStructuredFeedback, handleIterationUpdate,
  handleExperienceInjected, handleSkillMounted, handleReviewCompleted,
  handleWorkflowExecuted, handleWorkflowNodeStatusUpdate,
  handleWorkspaceCreated, handleToolResult, handleCriticalBlocker,
} from './meeting'
import type { MeetingSetters, MeetingRefs } from './meeting'

function makeSetters(): MeetingSetters {
  return {
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
  }
}

function makeRefs(): MeetingRefs {
  return {
    pendingMessages: { current: new Map() },
  }
}

describe('meeting handlers', () => {
  describe('handleMeetingStarted', () => {
    it('initializes meeting state', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      handleMeetingStarted({
        meetingId: 'm1',
        agents: [{ id: 'a1', name: 'Agent 1', role: 'executor', status: 'idle' }],
      }, setters, refs)

      expect(setters.setMeetingId).toHaveBeenCalledWith('m1')
      expect(setters.setAgents).toHaveBeenCalled()
      expect(setters.setIsMeetingActive).toHaveBeenCalledWith(true)
      expect(setters.setMeetingPhase).toHaveBeenCalledWith('analyzing')
      expect(setters.setMeetingStartTime).toHaveBeenCalled()
    })

    it('clears pending messages', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      refs.pendingMessages.current.set('old', 'data')
      handleMeetingStarted({ meetingId: 'm1', agents: [] }, setters, refs)
      expect(refs.pendingMessages.current.size).toBe(0)
    })
  })

  describe('handleAgentMessage', () => {
    it('accumulates delta messages', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      ;(setters.setChatMessages as any).mockImplementation((fn: any) => fn([]))

      handleAgentMessage({ agentId: 'a1', delta: 'Hello ' }, setters, refs)
      expect(refs.pendingMessages.current.get('a1')).toBe('Hello ')

      handleAgentMessage({ agentId: 'a1', delta: 'World' }, setters, refs)
      expect(refs.pendingMessages.current.get('a1')).toBe('Hello World')
    })

    it('handles complete messages (no delta)', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      handleAgentMessage({ agentId: 'a1', content: 'Complete message' }, setters, refs)
      expect(refs.pendingMessages.current.has('a1')).toBe(false)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handleThinkingStart/Delta/End', () => {
    it('manages thinking stream lifecycle', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      ;(setters.setChatMessages as any).mockImplementation((fn: any) => fn([]))

      handleThinkingStart({ agentId: 'a1' }, setters, refs)
      expect(refs.pendingMessages.current.has('thinking:a1')).toBe(true)

      handleThinkingDelta({ agentId: 'a1', delta: 'thinking...' }, setters, refs)
      expect(refs.pendingMessages.current.get('thinking:a1')).toBe('thinking...')

      handleThinkingEnd({ agentId: 'a1' }, setters, refs)
      expect(refs.pendingMessages.current.has('thinking:a1')).toBe(false)
    })
  })

  describe('handleTaskAssigned', () => {
    it('adds task and updates agent', () => {
      const setters = makeSetters()
      handleTaskAssigned({ taskId: 't1', agentId: 'a1', status: 'running' }, setters)
      expect(setters.setTasks).toHaveBeenCalled()
      expect(setters.setAgents).toHaveBeenCalled()
    })
  })

  describe('handleTaskDeleted', () => {
    it('removes task by id', () => {
      const setters = makeSetters()
      const existing = [{ id: 't1' }, { id: 't2' }]
      ;(setters.setTasks as any).mockImplementation((fn: any) => fn(existing))
      handleTaskDeleted({ taskId: 't1' }, setters)
      const fn = (setters.setTasks as any).mock.calls[0][0]
      expect(fn(existing)).toEqual([{ id: 't2' }])
    })
  })

  describe('handleAgentStatusUpdate', () => {
    it('updates agent status', () => {
      const setters = makeSetters()
      const existing = [{ id: 'a1', status: 'idle', currentTask: undefined }]
      ;(setters.setAgents as any).mockImplementation((fn: any) => fn(existing))
      handleAgentStatusUpdate({ agentId: 'a1', status: 'busy', currentTask: 't1' }, setters)
      const fn = (setters.setAgents as any).mock.calls[0][0]
      expect(fn(existing)[0].status).toBe('busy')
      expect(fn(existing)[0].currentTask).toBe('t1')
    })
  })

  describe('handleMeetingEnded', () => {
    it('resets meeting state', () => {
      const setters = makeSetters()
      handleMeetingEnded({}, setters)
      expect(setters.setIsMeetingActive).toHaveBeenCalledWith(false)
      expect(setters.setMeetingPhase).toHaveBeenCalledWith('idle')
      expect(setters.setMeetingStartTime).toHaveBeenCalledWith(null)
    })
  })

  describe('handleAgendaUpdate', () => {
    it('parses agenda state with snake_case fields', () => {
      const setters = makeSetters()
      handleAgendaUpdate({
        phase: 'speaking',
        topic: '讨论方案',
        current_speaker: 'a1',
        proposal_id: 'p1',
        token_queue: [{ agent_id: 'a2', relevance_score: 0.8 }],
        event_history: [{ type: 'speak', timestamp: '2026-01-01', from: 'a1' }],
      }, setters)

      const state = (setters.setAgendaState as any).mock.calls[0][0]
      expect(state.phase).toBe('speaking')
      expect(state.currentSpeaker).toBe('a1')
      expect(state.tokenQueue[0].agentId).toBe('a2')
      expect(state.eventHistory[0].type).toBe('speak')
    })
  })

  describe('handleMeetingError', () => {
    it('adds error message', () => {
      const setters = makeSetters()
      handleMeetingError({ message: 'Something went wrong' }, setters)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handleSemanticAnalysisResult', () => {
    it('adds CEO message with analysis', () => {
      const setters = makeSetters()
      handleSemanticAnalysisResult({ analysisResult: '分析结果...' }, setters)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handleTaskAutoAssigned', () => {
    it('adds task and chat messages', () => {
      const setters = makeSetters()
      handleTaskAutoAssigned({
        taskId: 't1', agentId: 'a1', description: '实现功能', status: 'assigned',
      }, setters)
      expect(setters.setTasks).toHaveBeenCalled()
      expect(setters.setChatMessages).toHaveBeenCalled()
    })

    it('adds routing decision message when present', () => {
      const setters = makeSetters()
      handleTaskAutoAssigned({
        taskId: 't1', agentId: 'a1', description: '实现功能', status: 'assigned',
        routing_decision: { selected_dept: 'dept-software', confidence: 0.85 },
      }, setters)
      expect((setters.setChatMessages as any).mock.calls.length).toBe(2)
    })
  })

  describe('handleStructuredFeedback', () => {
    it('adds feedback message and updates task status', () => {
      const setters = makeSetters()
      const existing = [{ id: 't1', status: 'running' }]
      ;(setters.setTasks as any).mockImplementation((fn: any) => fn(existing))

      handleStructuredFeedback({
        agentId: 'agent-reviewer',
        taskId: 't1',
        feedback: { status: 'revision_required', issues: [{ id: 1 }], current_iteration: 1, max_iterations: 3 },
      }, setters)

      expect(setters.setChatMessages).toHaveBeenCalled()
      const fn = (setters.setTasks as any).mock.calls[0][0]
      expect(fn(existing)[0].status).toBe('revision_required')
    })
  })

  describe('handleIterationUpdate', () => {
    it('updates task with iteration status', () => {
      const setters = makeSetters()
      const existing = [{ id: 't1', status: 'running' }]
      ;(setters.setTasks as any).mockImplementation((fn: any) => fn(existing))

      handleIterationUpdate({
        agentId: 'agent-executor',
        taskId: 't1',
        iteration_status: { current_iteration: 2, max_iterations: 3, status: 'iterating' },
      }, setters)

      expect(setters.setChatMessages).toHaveBeenCalled()
      const fn = (setters.setTasks as any).mock.calls[0][0]
      expect(fn(existing)[0].status).toBe('revision_required')
    })
  })

  describe('handleExperienceInjected', () => {
    it('adds experience message', () => {
      const setters = makeSetters()
      handleExperienceInjected({ agentId: 'a1', rules_count: 3, keywords: ['react', 'hooks'] }, setters)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handleSkillMounted', () => {
    it('updates agent skill info', () => {
      const setters = makeSetters()
      const existing = [{ id: 'a1', skillId: undefined }]
      ;(setters.setAgents as any).mockImplementation((fn: any) => fn(existing))
      handleSkillMounted({ agentId: 'a1', skill_id: 'frontend_dev', skill_name: '前端开发' }, setters)
      const fn = (setters.setAgents as any).mock.calls[0][0]
      expect(fn(existing)[0].skillId).toBe('frontend_dev')
    })
  })

  describe('handleReviewCompleted', () => {
    it('adds review summary message', () => {
      const setters = makeSetters()
      handleReviewCompleted({
        critic_result: { severity: 'medium', findings: [{ id: 1 }] },
        grounding_result: { grounded: true, sources: ['file.ts'] },
      }, setters)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handleWorkflowExecuted', () => {
    it('sets workflow result and chat messages', () => {
      const setters = makeSetters()
      handleWorkflowExecuted({
        workflow_result: {
          execution_id: 'ex-1', workflow_id: 'wf-1', status: 'completed',
          started_at: '2026-01-01', node_states: {}, results: { n1: { result: 'ok' } },
        },
      }, setters)

      expect(setters.setLastWorkflow).toHaveBeenCalled()
      expect((setters.setChatMessages as any).mock.calls.length).toBe(2) // result + summary
    })
  })

  describe('handleWorkflowNodeStatusUpdate', () => {
    it('updates task status for matching node', () => {
      const setters = makeSetters()
      const existing = [{ id: 'n1', status: 'pending' }]
      ;(setters.setTasks as any).mockImplementation((fn: any) => fn(existing))
      handleWorkflowNodeStatusUpdate({ node_id: 'n1', status: 'completed' }, setters)
      const fn = (setters.setTasks as any).mock.calls[0][0]
      expect(fn(existing)[0].status).toBe('completed')
    })
  })

  describe('handleWorkspaceCreated', () => {
    it('sets workspace info', () => {
      const setters = makeSetters()
      handleWorkspaceCreated({
        workspace_id: 'ws-1', workspace_type: 'git_worktree',
        workspace_path: '/tmp/ws', branch_name: 'agent/task-1',
      }, setters)
      expect(setters.setWorkspace).toHaveBeenCalledWith({
        workspace_id: 'ws-1', task_id: '', workspace_type: 'git_worktree',
        root_path: '/tmp/ws', branch_name: 'agent/task-1',
      })
    })
  })

  describe('handleToolResult', () => {
    it('adds tool call log', () => {
      const setters = makeSetters()
      handleToolResult({
        tool_name: 'bash', arguments: { command: 'ls' }, success: true, output: 'file.ts',
      }, setters)
      const fn = (setters.setToolCallLogs as any).mock.calls[0][0]
      const result = fn([])
      expect(result[0].tool_name).toBe('bash')
      expect(result[0].success).toBe(true)
    })
  })

  describe('handleCriticalBlocker', () => {
    it('adds blocker message', () => {
      const setters = makeSetters()
      handleCriticalBlocker({ agentId: 'a1', content: '死锁检测', blockerType: 'deadlock' }, setters)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })
})
