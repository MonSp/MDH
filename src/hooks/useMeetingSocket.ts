import { useState, useCallback, useEffect, useRef } from 'react'
import type { MeetingAgentInfo, MeetingSummary, AgendaPhase } from '../modules/meetingProtocol'
import { isWsMessage, isKnownMessageType } from '../modules/meetingProtocol'
import type { TeamAgent, Task, ChatMessage, AgendaState } from '../components/office-team/types'
import { AgentRole } from '../modules/agentTypes'
import type { WorkflowExecution, WorkflowDefinition } from '../modules/agentTypes'
import { dispatchMessage } from './useMeetingSocket/handlers'
import { STORAGE_KEYS } from '../constants'
import { useMeetingStore } from './useMeetingSocket/meetingStore'
import type { BridgeMessage } from './useMeetingSocket/meetingStore'

export type MeetingPhase =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'discussing'
  | 'assigning'
  | 'executing'
  | 'reviewing'
  | 'summarizing'
  | 'done'

export const PHASE_LABELS: Record<MeetingPhase, string> = {
  idle: '等待中',
  analyzing: '需求分析',
  planning: '项目规划',
  discussing: '团队讨论',
  assigning: '任务分派',
  executing: '代码执行',
  reviewing: '质量审查',
  summarizing: '生成报告',
  done: '已完成',
}

interface Workspace {
  workspace_id: string
  task_id: string
  workspace_type: string
  root_path: string
  branch_name?: string
}

interface ToolCallLog {
  tool_name: string
  arguments: Record<string, unknown>
  success: boolean
  output?: string
  error?: string
  timestamp: string
}

const WORKSTATION_MAP: Record<string, string> = {
  'agent-ceo': 'ws-0',
  'agent-planner': 'ws-1',
  'agent-executor': 'ws-2',
  'agent-monitor': 'ws-3',
  'agent-reviewer': 'ws-4',
  'agent-coordinator': 'ws-5',
}

const MAX_RECONNECT_ATTEMPTS = 5

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

function mapAgentToTeamAgent(agent: MeetingAgentInfo): TeamAgent {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role as AgentRole,
    status: 'meeting',
    currentTask: null,
    workstationId: WORKSTATION_MAP[agent.id] ?? 'ws-1',
  }
}

export default function useMeetingSocket({
  wsRef,
  url,
}: {
  wsRef: React.MutableRefObject<WebSocket | null>
  url?: string
}) {
  // 使用 Zustand store 替代 40+ useState
  const store = useMeetingStore()
  const {
    meetingId, setMeetingId,
    agents, setAgents,
    tasks, setTasks,
    chatMessages, setChatMessages,
    isMeetingActive, setIsMeetingActive,
    lastWorkflow, setLastWorkflow,
    agendaState, setAgendaState,
    workspace, setWorkspace,
    toolCallLogs, setToolCallLogs,
    meetingPhase, setMeetingPhase,
    meetingStartTime, setMeetingStartTime,
    activeProposal, setActiveProposal,
    votes, setVotes,
    voteResults, setVoteResults,
    pendingApprovals, setPendingApprovals,
    checkpoints, setCheckpoints,
    restoredState, setRestoredState,
    auditLog, setAuditLog,
    bridgeMessages, setBridgeMessages,
  } = store

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

  const pendingMessages = useRef<Map<string, string>>(new Map())
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSequenceNo = useRef(-1)
  const bridgeCallbacks = useRef<Map<string, (msg: BridgeMessage) => void>>(new Map())

  // Bridge state
  // Bridge 消息（从 store 获取）

  // 投票决策状态（从 store 获取）

  // 人工审批状态（从 store 获取）

  // 检查点状态（从 store 获取）

  // 审计日志（从 store 获取）

  // 迭代配置
  const [maxIterations, setMaxIterationsState] = useState(3)

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[MeetingSocket] 发送消息:', data)
      wsRef.current.send(JSON.stringify(data))
    } else {
      console.warn('[MeetingSocket] WebSocket 未就绪，无法发送:', data)
    }
  }, [wsRef])

  const startMeeting = useCallback(() => {
    send({
      type: 'start_meeting',
      provider: localStorage.getItem(STORAGE_KEYS.PROVIDER) || undefined,
      model_name: localStorage.getItem(STORAGE_KEYS.MODEL_NAME) || undefined,
      api_key: localStorage.getItem(STORAGE_KEYS.API_KEY) || undefined,
      base_url: localStorage.getItem(STORAGE_KEYS.BASE_URL) || undefined,
      max_iterations: maxIterations,
    })
  }, [send, maxIterations])

  const sendMeetingMessage = useCallback((content: string) => {
    send({ type: 'meeting_message', content })
  }, [send])

  const assignTask = useCallback((agentId: string, description: string) => {
    send({ type: 'task_assign', agentId, description })
  }, [send])

  const endMeeting = useCallback(() => {
    send({ type: 'end_meeting' })
  }, [send])

  const sendAgendaAction = useCallback((action: string, payload?: Record<string, unknown>) => {
    send({ type: 'agenda_action', action, ...payload })
  }, [send])

  const createReconnectSocket = useCallback(() => {
    if (!url) return

    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {}
    }

    setConnectionState('connecting')
    const newWs = new WebSocket(url)
    wsRef.current = newWs

    const handleOpen = () => {
      setConnectionState('connected')
      reconnectAttempts.current = 0
      lastSequenceNo.current = -1
    }

    const handleClose = () => {
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        setConnectionState('reconnecting')
        reconnectTimer.current = setTimeout(() => {
          createReconnectSocket()
        }, delay)
      } else {
        setConnectionState('disconnected')
      }
    }

    const handleError = () => {
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        setConnectionState('reconnecting')
        reconnectTimer.current = setTimeout(() => {
          createReconnectSocket()
        }, delay)
      } else {
        setConnectionState('disconnected')
      }
    }

    newWs.addEventListener('open', handleOpen)
    newWs.addEventListener('close', handleClose)
    newWs.addEventListener('error', handleError)
  }, [url, wsRef])

  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return

    const handleMessage = (event: MessageEvent) => {
      let raw: unknown
      try {
        raw = JSON.parse(event.data)
      } catch {
        return
      }

      if (!isWsMessage(raw)) return
      const msg = raw
      const msgType = msg.type

      if (!isKnownMessageType(msgType)) {
        console.warn('[useMeetingSocket] 未知消息类型:', msgType)
      }

      const seqNo = msg.sequence_no ?? msg.sequenceNo
      if (seqNo !== undefined) {
        if (seqNo > lastSequenceNo.current + 1) {
          send({
            type: 'request_retransmit',
            from_sequence_no: lastSequenceNo.current + 1,
          })
        }
        lastSequenceNo.current = seqNo
      }

      const setters: HandlerSetters = {
        setMeetingId, setAgents, setTasks, setChatMessages,
        setIsMeetingActive, setMeetingPhase, setMeetingStartTime,
        setAgendaState, setWorkspace, setToolCallLogs, setLastWorkflow,
        setActiveProposal, setVotes, setVoteResults,
        setPendingApprovals, setCheckpoints, setRestoredState,
        setAuditLog, setBridgeMessages,
      }
      const refs: HandlerRefs = { pendingMessages, bridgeCallbacks }
      dispatchMessage(msg.type, msg, setters, refs)
    }

    ws.addEventListener('message', handleMessage)
    return () => {
      ws.removeEventListener('message', handleMessage)
    }
  }, [wsRef, send])

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
    }
  }, [])

  const clearWorkflow = useCallback(() => setLastWorkflow(null), [])

  const sendWorkspaceAction = useCallback((action: string, workspaceId?: string) => {
    send({
      type: 'workspace_action',
      action,
      workspace_id: workspaceId,
    })
  }, [send])

  const sendToolCall = useCallback((toolName: string, args: Record<string, unknown>) => {
    send({
      type: 'tool_call',
      tool_name: toolName,
      arguments: args,
    })
  }, [send])

  const deleteTask = useCallback((taskId: string) => {
    send({
      type: 'task_delete',
      taskId: taskId,
    })
  }, [send])

  // === Bridge functions ===

  const registerBridgeAgent = useCallback((agentId: string, name: string, role: string, capabilities: string[]): Promise<{ pyAgentId: string; success: boolean }> => {
    return new Promise((resolve) => {
      bridgeCallbacks.current.set(`reg:${agentId}`, (msg: BridgeMessage) => {
        resolve({ pyAgentId: (msg as Record<string, unknown>).pyAgentId as string, success: (msg as Record<string, unknown>).success as boolean })
      })
      send({
        type: 'bridge_register_agent',
        tsAgentId: agentId,
        name,
        role,
        capabilities,
      })
    })
  }, [send])

  const unregisterBridgeAgent = useCallback((agentId: string) => {
    send({
      type: 'bridge_unregister_agent',
      tsAgentId: agentId,
    })
    bridgeCallbacks.current.delete(`reg:${agentId}`)
    bridgeCallbacks.current.delete(`msg:${agentId}`)
  }, [send])

  const sendBridgeMessage = useCallback((fromId: string, toId: string, payload: unknown) => {
    send({
      type: 'bridge_message',
      fromAgentId: fromId,
      toAgentId: toId,
      payload,
    })
  }, [send])

  const onBridgeMessage = useCallback((agentId: string, callback: (msg: BridgeMessage) => void) => {
    bridgeCallbacks.current.set(`msg:${agentId}`, callback)
    return () => {
      bridgeCallbacks.current.delete(`msg:${agentId}`)
    }
  }, [])

  // === 投票决策函数 ===

  const createProposal = useCallback((content: string, proposerId: string = 'user') => {
    send({
      type: 'create_proposal',
      proposerId,
      content,
    })
  }, [send])

  const castVote = useCallback((proposalId: string, approve: boolean, reason: string = '', voterId: string = 'user') => {
    send({
      type: 'cast_vote',
      proposalId,
      voterId,
      approve,
      reason,
    })
  }, [send])

  const evaluateConsensus = useCallback((proposalId: string, strategy?: string) => {
    send({
      type: 'evaluate_consensus',
      proposalId,
      strategy,
    })
  }, [send])

  const clearVotes = useCallback(() => {
    setVotes(new Map())
    setVoteResults(null)
    setActiveProposal(null)
  }, [])

  // === 人工审批函数 ===

  const sendApprovalResponse = useCallback((requestId: string, approved: boolean, reason: string = '') => {
    send({
      type: 'human_approval_response',
      requestId,
      approved,
      reason,
    })
  }, [send])

  const getPendingApprovals = useCallback(() => {
    send({ type: 'get_pending_approvals' })
  }, [send])

  // === 检查点函数 ===

  const saveCheckpoint = useCallback((taskId: string, stepIndex: number, state: Record<string, unknown>) => {
    send({
      type: 'checkpoint_save',
      taskId,
      stepIndex,
      state,
    })
  }, [send])

  const restoreCheckpoint = useCallback((checkpointId: string) => {
    send({
      type: 'checkpoint_restore',
      checkpointId,
    })
  }, [send])

  const getCheckpoints = useCallback((taskId?: string) => {
    send({
      type: 'get_checkpoints',
      taskId: taskId || '',
    })
  }, [send])

  const deleteCheckpoint = useCallback((checkpointId: string) => {
    send({
      type: 'checkpoint_delete',
      checkpointId,
    })
  }, [send])

  const clearRestoredState = useCallback(() => {
    setRestoredState(null)
  }, [])

  // === 关键阻塞函数 ===

  const reportCriticalBlocker = useCallback((agentId: string, content: string, blockerType: string = 'unknown') => {
    send({
      type: 'critical_blocker',
      agentId,
      content,
      blockerType,
    })
  }, [send])

  // === 审计日志函数 ===

  const getAuditLog = useCallback((filters?: { agentId?: string; operation?: string; riskLevel?: string }) => {
    send({
      type: 'get_audit_log',
      agentId: filters?.agentId,
      operation: filters?.operation,
      riskLevel: filters?.riskLevel,
    })
  }, [send])

  const logAudit = useCallback((entry: { agentId: string; operation: string; target?: string; capability?: string; allowed?: boolean; reason?: string }) => {
    send({
      type: 'log_audit',
      ...entry,
    })
  }, [send])

  return {
    meetingId,
    agents,
    tasks,
    chatMessages,
    isMeetingActive,
    connectionState,
    lastWorkflow,
    agendaState,
    workspace,
    toolCallLogs,
    clearWorkflow,
    startMeeting,
    sendMeetingMessage,
    assignTask,
    endMeeting,
    sendAgendaAction,
    sendWorkspaceAction,
    sendToolCall,
    meetingPhase,
    meetingStartTime,
    deleteTask,
    // Bridge
    bridgeMessages,
    registerBridgeAgent,
    unregisterBridgeAgent,
    sendBridgeMessage,
    onBridgeMessage,
    // 投票决策
    activeProposal,
    votes,
    voteResults,
    createProposal,
    castVote,
    evaluateConsensus,
    clearVotes,
    // 人工审批
    pendingApprovals,
    sendApprovalResponse,
    getPendingApprovals,
    // 检查点
    checkpoints,
    restoredState,
    saveCheckpoint,
    restoreCheckpoint,
    getCheckpoints,
    deleteCheckpoint,
    clearRestoredState,
    // 关键阻塞
    reportCriticalBlocker,
    // 审计日志
    auditLog,
    getAuditLog,
    logAudit,
    // 迭代配置
    maxIterations,
    setMaxIterations: (n: number) => {
      setMaxIterationsState(n)
      send({ type: 'set_max_iterations', maxIterations: n })
    },
    // 权重调整
    adjustAgentWeight: (agentId: string, weight: number) => {
      send({ type: 'adjust_agent_weight', agentId, weight })
    },
    // 会议快照（断点续跑）
    saveMeetingSnapshot: () => send({ type: 'save_meeting_snapshot' }),
    restoreMeetingSnapshot: (checkpointId: string) => send({ type: 'restore_meeting_snapshot', checkpointId }),
  }
}
