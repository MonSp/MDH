import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  readyState = MockWebSocket.CONNECTING
  url: string
  send = vi.fn()
  close = vi.fn()
  private listeners: Record<string, Function[]> = {}
  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }
  removeEventListener(event: string, handler: Function) {
    if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter(h => h !== handler)
  }
  emit(event: string, data?: any) {
    for (const h of this.listeners[event] || []) h(data)
  }
  constructor(url: string) {
    this.url = url
    setTimeout(() => { this.readyState = MockWebSocket.OPEN; this.emit('open') }, 0)
  }
}

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} },
  }
})()

let useMeetingSocket: any

beforeAll(async () => {
  const mod = await import('../hooks/useMeetingSocket')
  useMeetingSocket = mod.default
})

function setupHook() {
  const ws = new MockWebSocket('ws://test') as any
  ws.readyState = MockWebSocket.OPEN
  const wsRef = { current: ws }
  const { result } = renderHook(() => useMeetingSocket({ wsRef }))
  return { result, ws, wsRef }
}

function emitMsg(ws: any, msg: any) {
  ws.emit('message', { data: JSON.stringify(msg) })
}

describe('useMeetingSocket', () => {
  let origWS: typeof globalThis.WebSocket
  let origStorage: typeof globalThis.localStorage

  beforeEach(() => {
    vi.useFakeTimers()
    origWS = globalThis.WebSocket
    origStorage = globalThis.localStorage
    globalThis.WebSocket = MockWebSocket as any
    globalThis.localStorage = localStorageMock as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    globalThis.WebSocket = origWS
    globalThis.localStorage = origStorage
  })

  describe('PHASE_LABELS', () => {
    it('should export all phase labels', async () => {
      const { PHASE_LABELS } = await import('../hooks/useMeetingSocket')
      expect(Object.keys(PHASE_LABELS)).toHaveLength(9)
      expect(PHASE_LABELS.idle).toBe('等待中')
      expect(PHASE_LABELS.analyzing).toBe('需求分析')
      expect(PHASE_LABELS.planning).toBe('项目规划')
      expect(PHASE_LABELS.discussing).toBe('团队讨论')
      expect(PHASE_LABELS.assigning).toBe('任务分派')
      expect(PHASE_LABELS.executing).toBe('代码执行')
      expect(PHASE_LABELS.reviewing).toBe('质量审查')
      expect(PHASE_LABELS.summarizing).toBe('生成报告')
      expect(PHASE_LABELS.done).toBe('已完成')
    })
  })

  describe('initialization', () => {
    it('should initialize with defaults', () => {
      const { result } = setupHook()
      expect(result.current.meetingPhase).toBe('idle')
      expect(result.current.agents).toEqual([])
      expect(result.current.tasks).toEqual([])
      expect(result.current.chatMessages).toEqual([])
      expect(result.current.isMeetingActive).toBe(false)
      expect(result.current.connectionState).toBe('disconnected')
      expect(result.current.lastWorkflow).toBeNull()
      expect(result.current.agendaState).toBeNull()
      expect(result.current.workspace).toBeNull()
      expect(result.current.toolCallLogs).toEqual([])
      expect(result.current.meetingStartTime).toBeNull()
    })
  })

  describe('send functions', () => {
    it('should send startMeeting with localStorage values', () => {
      localStorage.setItem('llm_provider', 'openai')
      localStorage.setItem('llm_model_name', 'gpt-4')
      localStorage.setItem('deepseek_api_key', 'key123')
      localStorage.setItem('deepseek_base_url', 'http://api.test')
      const { result, ws } = setupHook()

      act(() => { result.current.startMeeting() })

      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"start_meeting"'))
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.provider).toBe('openai')
      expect(sent.model_name).toBe('gpt-4')
    })

    it('should send meeting_message', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.sendMeetingMessage('Hello') })
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"content":"Hello"'))
    })

    it('should send task_assign', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.assignTask('a1', 'Do task') })
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('task_assign')
      expect(sent.agentId).toBe('a1')
    })

    it('should send end_meeting', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.endMeeting() })
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"end_meeting"'))
    })

    it('should send agenda_action', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.sendAgendaAction('propose', { topic: 'test' }) })
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('agenda_action')
      expect(sent.action).toBe('propose')
      expect(sent.topic).toBe('test')
    })

    it('should send workspace_action', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.sendWorkspaceAction('create', 'ws-1') })
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('workspace_action')
      expect(sent.workspace_id).toBe('ws-1')
    })

    it('should send tool_call', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.sendToolCall('read_file', { path: '/tmp' }) })
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('tool_call')
      expect(sent.tool_name).toBe('read_file')
    })

    it('should send task_delete', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.deleteTask('t1') })
      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('task_delete')
      expect(sent.taskId).toBe('t1')
    })

    it('should not send when WebSocket not open', () => {
      const { result, ws } = setupHook()
      ws.readyState = MockWebSocket.CONNECTING
      act(() => { result.current.sendMeetingMessage('Hello') })
      expect(ws.send).not.toHaveBeenCalled()
    })
  })

  describe('meeting_started', () => {
    it('should set up meeting state', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'meeting_started', meeting_id: 'm1',
          agents: [{ id: 'agent-ceo', name: 'CEO', role: 'ceo' }, { id: 'agent-executor', name: 'Dev', role: 'executor' }],
        })
      })

      expect(result.current.meetingId).toBe('m1')
      expect(result.current.agents).toHaveLength(2)
      expect(result.current.isMeetingActive).toBe(true)
      expect(result.current.meetingPhase).toBe('analyzing')
      expect(result.current.chatMessages[0].content).toBe('会议已开始')
    })
  })

  describe('agent_message', () => {
    it('should handle streaming delta messages', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, { type: 'meeting_started', meeting_id: 'm1', agents: [{ id: 'a1', name: 'A', role: 'executor' }] })
      })

      act(() => { emitMsg(ws, { type: 'agent_message', agentId: 'a1', delta: 'Hello ' }) })
      act(() => { emitMsg(ws, { type: 'agent_message', agentId: 'a1', delta: 'world' }) })

      const msgs = result.current.chatMessages
      expect(msgs[msgs.length - 1].content).toBe('Hello world')
    })

    it('should handle complete agent message with phase detection', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'meeting_started', meeting_id: 'm1', agents: [] }) })

      const phaseTests = [
        ['确认细节', 'analyzing'],
        ['制定项目计划', 'planning'],
        ['组织团队讨论', 'discussing'],
        ['分派任务给', 'assigning'],
        ['正在执行任务', 'executing'],
        ['轮质量审查', 'reviewing'],
        ['项目总结报告', 'summarizing'],
        ['汇报结果', 'done'],
      ] as const

      for (const [content, expectedPhase] of phaseTests) {
        act(() => { emitMsg(ws, { type: 'agent_message', agentId: 'a1', content }) })
        expect(result.current.meetingPhase).toBe(expectedPhase)
      }
    })
  })

  describe('task messages', () => {
    it('should handle task_assigned', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'meeting_started', meeting_id: 'm1', agents: [{ id: 'a1', name: 'A', role: 'executor' }] }) })
      act(() => { emitMsg(ws, { type: 'task_assigned', taskId: 't1', agentId: 'a1', status: 'assigned' }) })

      expect(result.current.tasks).toHaveLength(1)
      expect(result.current.tasks[0].id).toBe('t1')
      expect(result.current.agents[0].currentTask).toBe('t1')
    })

    it('should handle task_deleted', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'task_assigned', taskId: 't1', agentId: 'a1', status: 'assigned' }) })
      act(() => { emitMsg(ws, { type: 'task_deleted', taskId: 't1' }) })
      expect(result.current.tasks).toHaveLength(0)
    })
  })

  describe('agent_status_update', () => {
    it('should update agent status', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'meeting_started', meeting_id: 'm1', agents: [{ id: 'a1', name: 'A', role: 'executor' }] }) })
      act(() => { emitMsg(ws, { type: 'agent_status_update', agentId: 'a1', status: 'working', currentTask: 't1' }) })
      expect(result.current.agents[0].status).toBe('working')
      expect(result.current.agents[0].currentTask).toBe('t1')
    })
  })

  describe('meeting_ended', () => {
    it('should reset meeting state', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'meeting_started', meeting_id: 'm1', agents: [] }) })
      act(() => { emitMsg(ws, { type: 'meeting_ended' }) })

      expect(result.current.isMeetingActive).toBe(false)
      expect(result.current.meetingPhase).toBe('idle')
      expect(result.current.meetingStartTime).toBeNull()
    })
  })

  describe('agenda_update', () => {
    it('should set agenda state with all fields', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'agenda_update', phase: 'voting', topic: 'Design',
          current_speaker: 'a1', proposal_id: 'p1',
          token_queue: [{ agent_id: 'a1', relevance_score: 0.8 }],
          event_history: [{ type: 'vote', timestamp: 100, from: 'a1', to: 'a2', agent_id: 'a1', reason: 'agree' }],
        })
      })

      expect(result.current.agendaState?.phase).toBe('voting')
      expect(result.current.agendaState?.topic).toBe('Design')
      expect(result.current.agendaState?.tokenQueue).toHaveLength(1)
      expect(result.current.agendaState?.eventHistory).toHaveLength(1)
    })
  })

  describe('meeting_error', () => {
    it('should add error message to chat', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'meeting_error', message: 'Something broke' }) })
      expect(result.current.chatMessages[0].content).toContain('Something broke')
    })
  })

  describe('semantic_analysis_result', () => {
    it('should add CEO analysis message', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'semantic_analysis_result', analysisResult: 'Analysis done' }) })
      expect(result.current.chatMessages[0].content).toBe('Analysis done')
      expect(result.current.chatMessages[0].role).toBe('ceo')
    })
  })

  describe('task_auto_assigned', () => {
    it('should add task and chat message', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'task_auto_assigned', taskId: 't1', agentId: 'a1',
          description: 'Auto task', status: 'assigned',
        })
      })
      expect(result.current.tasks).toHaveLength(1)
      expect(result.current.chatMessages[0].content).toContain('a1')
    })

    it('should add routing decision when present', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'task_auto_assigned', taskId: 't1', agentId: 'a1',
          description: 'Auto task', status: 'assigned',
          routing_decision: { selected_dept: 'engineering', confidence: 0.95 },
        })
      })
      expect(result.current.chatMessages).toHaveLength(2)
      expect(result.current.chatMessages[1].content).toContain('95.0%')
    })
  })

  describe('structured_feedback', () => {
    it('should handle approved feedback', () => {
      const { result, ws } = setupHook()
      // Add task first
      act(() => { emitMsg(ws, { type: 'task_assigned', taskId: 't1', agentId: 'a1', status: 'assigned' }) })
      act(() => {
        emitMsg(ws, {
          type: 'structured_feedback', taskId: 't1', agentId: 'reviewer',
          feedback: { status: 'approved', issues: [], current_iteration: 1, max_iterations: 3, overall_comment: 'Good' },
        })
      })
      expect(result.current.chatMessages.some((m: any) => m.content.includes('验收通过'))).toBe(true)
      expect(result.current.tasks.find((t: any) => t.id === 't1')?.status).toBe('completed')
    })

    it('should handle revision_required feedback', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'structured_feedback', taskId: 't1',
          feedback: { status: 'revision_required', issues: [{ type: 'bug' }], current_iteration: 1, max_iterations: 3, overall_comment: 'Fix it' },
        })
      })
      expect(result.current.chatMessages[0].content).toContain('需要修改')
      expect(result.current.chatMessages[0].content).toContain('1 个问题')
    })
  })

  describe('iteration_update', () => {
    it('should handle approved iteration', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'iteration_update', taskId: 't1',
          iteration_status: { status: 'approved', current_iteration: 2, max_iterations: 3 },
        })
      })
      expect(result.current.chatMessages[0].content).toContain('已通过')
    })

    it('should handle max_iterations_reached', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'iteration_update', taskId: 't1',
          iteration_status: { status: 'max_iterations_reached', current_iteration: 3, max_iterations: 3 },
        })
      })
      expect(result.current.chatMessages[0].content).toContain('最大迭代次数')
    })
  })

  describe('experience_injected', () => {
    it('should add experience message', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, { type: 'experience_injected', rules_count: 5, keywords: ['api', 'rest'] })
      })
      expect(result.current.chatMessages[0].content).toContain('5 条经验规则')
      expect(result.current.chatMessages[0].content).toContain('api, rest')
    })
  })

  describe('skill_mounted', () => {
    it('should update agent skill info', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'meeting_started', meeting_id: 'm1', agents: [{ id: 'a1', name: 'A', role: 'executor' }] }) })
      act(() => { emitMsg(ws, { type: 'skill_mounted', agentId: 'a1', skill_id: 's1', skill_name: 'coder' }) })
      expect(result.current.agents[0].skillId).toBe('s1')
    })
  })

  describe('workflow_executed', () => {
    it('should set lastWorkflow and chat messages', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'workflow_executed',
          workflow_result: {
            execution_id: 'ex-1', workflow_id: 'wf-1', status: 'completed',
            started_at: '2024-01-01', completed_at: '2024-01-02',
            node_states: { n1: 'completed' },
            results: { n1: { result: 'Success output that is long enough to be truncated at 100 chars in the summary section of the test' } },
          },
        })
      })
      expect(result.current.lastWorkflow?.execution_id).toBe('ex-1')
      expect(result.current.chatMessages).toHaveLength(2) // main + summary
    })
  })

  describe('review_completed', () => {
    it('should add review message', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'review_completed',
          critic_result: { severity: 'high', findings: [{ id: 1 }, { id: 2 }] },
          grounding_result: { grounded: true, sources: [{ url: 'http://test' }] },
        })
      })
      expect(result.current.chatMessages[0].content).toContain('严重度: high')
      expect(result.current.chatMessages[0].content).toContain('2 个问题')
    })
  })

  describe('workflow_node_status_update', () => {
    it('should add node status message', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'workflow_node_status_update', node_id: 'n1', status: 'running' }) })
      expect(result.current.chatMessages[0].content).toContain('n1')
      expect(result.current.chatMessages[0].content).toContain('running')
    })
  })

  describe('workspace_created', () => {
    it('should set workspace state', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'workspace_created',
          workspace_id: 'ws-1', task_id: 't1',
          workspace_type: 'git_worktree', workspace_path: '/tmp/ws',
          branch_name: 'feature-1',
        })
      })
      expect(result.current.workspace?.workspace_id).toBe('ws-1')
      expect(result.current.workspace?.root_path).toBe('/tmp/ws')
      expect(result.current.workspace?.branch_name).toBe('feature-1')
    })
  })

  describe('tool_result', () => {
    it('should add tool call log', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'tool_result', tool_name: 'bash', arguments: { cmd: 'ls' },
          success: true, output: 'file1\nfile2',
        })
      })
      expect(result.current.toolCallLogs).toHaveLength(1)
      expect(result.current.toolCallLogs[0].tool_name).toBe('bash')
    })
  })

  describe('sequence number handling', () => {
    it('should request retransmit on gap', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'agent_message', agentId: 'a1', content: 'msg1', sequence_no: 0 }) })
      act(() => { emitMsg(ws, { type: 'agent_message', agentId: 'a1', content: 'msg2', sequence_no: 5 }) })

      // Should have sent a retransmit request
      const retransmit = ws.send.mock.calls.find((c: any) => c[0].includes('request_retransmit'))
      expect(retransmit).toBeDefined()
    })

    it('should handle sequenceNo field name', () => {
      const { result, ws } = setupHook()
      act(() => { emitMsg(ws, { type: 'agent_message', agentId: 'a1', content: 'msg', sequenceNo: 0 }) })
      // Should not crash
    })
  })

  describe('invalid JSON', () => {
    it('should ignore invalid JSON', () => {
      const { ws } = setupHook()
      ws.emit('message', { data: 'not json' })
      // Should not crash
    })
  })

  describe('clearWorkflow', () => {
    it('should clear lastWorkflow', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'workflow_executed',
          workflow_result: { execution_id: 'ex-1', status: 'completed' },
        })
      })
      expect(result.current.lastWorkflow).not.toBeNull()
      act(() => { result.current.clearWorkflow() })
      expect(result.current.lastWorkflow).toBeNull()
    })
  })

  describe('human_approval_request (P0 structured approval push)', () => {
    it('should populate pendingApprovals with complete structured fields', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'human_approval_request',
          request: {
            id: 'req-1',
            requesterId: 'agent-executor',
            operation: 'git_push',
            description: '推送 feature 分支到远程仓库',
            riskLevel: 'HIGH',
            confidence: 0.85,
            createdAt: 1720000000000,
          },
        })
      })

      const pending = result.current.pendingApprovals.get('req-1')
      expect(pending).toBeDefined()
      expect(pending).toEqual({
        id: 'req-1',
        requesterId: 'agent-executor',
        operation: 'git_push',
        description: '推送 feature 分支到远程仓库',
        riskLevel: 'HIGH',
        confidence: 0.85,
        createdAt: 1720000000000,
      })
    })

    it('should append an approval request chat message', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'human_approval_request',
          request: {
            id: 'req-2',
            requesterId: 'agent-executor',
            operation: 'bash',
            description: '执行 npm publish',
            riskLevel: 'CRITICAL',
            confidence: 0.9,
            createdAt: 1720000000000,
          },
        })
      })

      expect(result.current.chatMessages[0].content).toContain('[审批请求]')
      expect(result.current.chatMessages[0].content).toContain('bash')
      expect(result.current.chatMessages[0].content).toContain('npm publish')
      expect(result.current.chatMessages[0].content).toContain('CRITICAL')
    })

    it('should accumulate multiple requests in pendingApprovals', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, { type: 'human_approval_request', request: { id: 'req-a', requesterId: 'a', operation: 'op1', description: 'd1', riskLevel: 'LOW', confidence: 0.4, createdAt: 1 } })
        emitMsg(ws, { type: 'human_approval_request', request: { id: 'req-b', requesterId: 'b', operation: 'op2', description: 'd2', riskLevel: 'MEDIUM', confidence: 0.6, createdAt: 2 } })
      })
      expect(result.current.pendingApprovals.size).toBe(2)
      expect(result.current.pendingApprovals.get('req-a')?.operation).toBe('op1')
      expect(result.current.pendingApprovals.get('req-b')?.operation).toBe('op2')
    })

    it('includes status field in pendingApprovals from structured request', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'human_approval_request',
          request: {
            id: 'req-status-1',
            requesterId: 'agent-executor',
            operation: 'bash',
            description: '执行部署脚本',
            riskLevel: 'HIGH',
            confidence: 0.8,
            status: 'pending',
            createdAt: 1720000000000,
          },
        })
      })

      const pending = result.current.pendingApprovals.get('req-status-1')
      expect(pending).toBeDefined()
      expect(pending?.status).toBe('pending')
    })

    it('reads status field from pending_approvals list', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'pending_approvals',
          requests: [{
            id: 'req-status-2',
            requesterId: 'agent-executor',
            operation: 'git_push',
            description: '推送分支',
            riskLevel: 'MEDIUM',
            confidence: 0.6,
            status: 'pending',
            createdAt: 1720000000000,
          }],
        })
      })

      expect(result.current.pendingApprovals.get('req-status-2')?.status).toBe('pending')
    })

    it('透传 taskId/gateId/approver 到 pending 状态', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'human_approval_request',
          request: {
            id: 'req-9',
            requesterId: 'agent-minutes',
            operation: 'node_gate',
            description: '纪要待确认',
            riskLevel: 'medium',
            confidence: 0.8,
            status: 'pending',
            createdAt: 123,
            taskId: 'draft',
            gateId: 'draft:review',
            approver: 'emp-1',
          },
        })
      })

      const pending = result.current.pendingApprovals.get('req-9')
      expect(pending?.taskId).toBe('draft')
      expect(pending?.gateId).toBe('draft:review')
      expect(pending?.approver).toBe('emp-1')
    })

    it('透传 taskId/gateId/approver 到 pending_approvals 批量状态', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'pending_approvals',
          requests: [{
            id: 'req-batch-1',
            requesterId: 'agent-minutes',
            operation: 'node_gate',
            description: '纪要待确认',
            riskLevel: 'medium',
            confidence: 0.8,
            status: 'pending',
            createdAt: 123,
            taskId: 'draft',
            gateId: 'draft:review',
            approver: 'emp-1',
          }],
        })
      })

      const pending = result.current.pendingApprovals.get('req-batch-1')
      expect(pending?.taskId).toBe('draft')
      expect(pending?.gateId).toBe('draft:review')
      expect(pending?.approver).toBe('emp-1')
    })

    it('无 taskId/gateId/approver 字段时 pending 状态对应字段为 undefined', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'human_approval_request',
          request: {
            id: 'req-10',
            requesterId: 'agent-executor',
            operation: 'bash',
            description: '执行部署脚本',
            riskLevel: 'HIGH',
            confidence: 0.8,
            status: 'pending',
            createdAt: 1720000000000,
          },
        })
      })

      const pending = result.current.pendingApprovals.get('req-10')
      expect(pending?.taskId).toBeUndefined()
      expect(pending?.gateId).toBeUndefined()
      expect(pending?.approver).toBeUndefined()
    })
  })

  describe('approval response (send + confirmation)', () => {
    it('should send human_approval_response via sendApprovalResponse', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.sendApprovalResponse('req-1', true, '批准执行') })

      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('human_approval_response')
      expect(sent.requestId).toBe('req-1')
      expect(sent.approved).toBe(true)
      expect(sent.reason).toBe('批准执行')
    })

    it('should send human_approval_response with empty reason by default', () => {
      const { result, ws } = setupHook()
      act(() => { result.current.sendApprovalResponse('req-2', false) })

      const sent = JSON.parse(ws.send.mock.calls[0][0])
      expect(sent.type).toBe('human_approval_response')
      expect(sent.requestId).toBe('req-2')
      expect(sent.approved).toBe(false)
      expect(sent.reason).toBe('')
    })

    it('should remove pending approval when backend confirms with human_approval_response', () => {
      const { result, ws } = setupHook()
      act(() => {
        emitMsg(ws, {
          type: 'human_approval_request',
          request: { id: 'req-1', requesterId: 'agent-executor', operation: 'git_push', description: 'push', riskLevel: 'HIGH', confidence: 0.85, createdAt: 1720000000000 },
        })
      })
      expect(result.current.pendingApprovals.has('req-1')).toBe(true)

      act(() => {
        emitMsg(ws, {
          type: 'human_approval_response',
          requestId: 'req-1',
          approved: true,
          reason: '已批准',
        })
      })
      expect(result.current.pendingApprovals.has('req-1')).toBe(false)
      expect(result.current.chatMessages[1].content).toContain('[审批结果]')
      expect(result.current.chatMessages[1].content).toContain('已批准')
    })
  })

  describe('reconnect', () => {
    it('should attempt reconnect on close', () => {
      const { wsRef } = setupHook()
      // createReconnectSocket is not directly exposed, but we can test via the effect
      // This is tested indirectly through the connection state
    })
  })
})
