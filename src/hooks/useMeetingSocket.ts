import { useState, useCallback, useEffect, useRef } from 'react'
import type { MeetingAgentInfo, MeetingSummary, AgendaPhase } from '../modules/meetingProtocol'
import type { TeamAgent, Task, ChatMessage, AgendaState } from '../components/office-team/types'
import { AgentRole } from '../modules/agentTypes'
import type { WorkflowExecution, WorkflowDefinition } from '../modules/agentTypes'

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
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [agents, setAgents] = useState<TeamAgent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isMeetingActive, setIsMeetingActive] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [lastWorkflow, setLastWorkflow] = useState<WorkflowExecution | null>(null)
  const [agendaState, setAgendaState] = useState<AgendaState | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [toolCallLogs, setToolCallLogs] = useState<ToolCallLog[]>([])
  const [meetingPhase, setMeetingPhase] = useState<MeetingPhase>('idle')
  const [meetingStartTime, setMeetingStartTime] = useState<number | null>(null)

  const pendingMessages = useRef<Map<string, string>>(new Map())
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSequenceNo = useRef(-1)
  const bridgeCallbacks = useRef<Map<string, (msg: any) => void>>(new Map())

  // Bridge state
  interface BridgeMessage {
    fromAgentId: string
    toAgentId: string
    payload: any
    timestamp: number
  }
  const [bridgeMessages, setBridgeMessages] = useState<BridgeMessage[]>([])

  // 投票决策状态
  interface ActiveProposal {
    id: string
    proposerId: string
    content: string
    createdAt: number
  }
  interface VoteEntry {
    voterId: string
    approve: boolean
    reason: string
  }
  interface VoteResults {
    proposalId: string
    totalVotes: number
    approveCount: number
    opposeCount: number
    accepted: boolean
  }
  const [activeProposal, setActiveProposal] = useState<ActiveProposal | null>(null)
  const [votes, setVotes] = useState<Map<string, VoteEntry>>(new Map())
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null)

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
      provider: localStorage.getItem('llm_provider') || undefined,
      model_name: localStorage.getItem('llm_model_name') || undefined,
      api_key: localStorage.getItem('deepseek_api_key') || undefined,
      base_url: localStorage.getItem('deepseek_base_url') || undefined,
    })
  }, [send])

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
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
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

      switch (msg.type) {
        case 'meeting_started': {
          setMeetingId(msg.meetingId || msg.meeting_id)
          setAgents(msg.agents.map(mapAgentToTeamAgent))
          setTasks([])
          setChatMessages([])
          setIsMeetingActive(true)
          setMeetingStartTime(Date.now())
          setMeetingPhase('analyzing')
          pendingMessages.current.clear()
          setChatMessages([{
            role: 'boss',
            content: '会议已开始',
            timestamp: Date.now(),
          }])
          break
        }
        case 'agent_message': {
          if (msg.delta) {
            const existing = pendingMessages.current.get(msg.agentId) ?? ''
            const accumulated = existing + msg.delta
            pendingMessages.current.set(msg.agentId, accumulated)
            setChatMessages(prev => {
              const idx = [...prev].reverse().findIndex(
                m => m.role === 'agent' && m.agentId === msg.agentId && (m as any)._streaming
              )
              if (idx !== -1) {
                const actualIdx = prev.length - 1 - idx
                const updated = [...prev]
                updated[actualIdx] = {
                  ...updated[actualIdx],
                  content: accumulated,
                }
                return updated
              }
              return [...prev, {
                role: 'agent' as const,
                agentId: msg.agentId,
                content: accumulated,
                timestamp: Date.now(),
                _streaming: true,
              } as ChatMessage & { _streaming?: boolean }]
            })
          } else {
            pendingMessages.current.delete(msg.agentId)
            // 检测会议阶段
            const content = msg.content || ''
            if (content.includes('确认细节') || content.includes('项目经理分析')) setMeetingPhase('analyzing')
            else if (content.includes('制定项目计划') || content.includes('阶段1')) setMeetingPhase('planning')
            else if (content.includes('组织团队讨论')) setMeetingPhase('discussing')
            else if (content.includes('整合') && content.includes('讨论')) setMeetingPhase('discussing')
            else if (content.includes('分派') && content.includes('任务')) setMeetingPhase('assigning')
            else if (content.includes('正在执行任务') || content.includes('轮开发') || content.includes('写入文件')) setMeetingPhase('executing')
            else if (content.includes('轮质量审查') || content.includes('轮审查') || content.includes('审查通过')) setMeetingPhase('reviewing')
            else if (content.includes('项目总结') || content.includes('总结报告')) setMeetingPhase('summarizing')
            else if (content.includes('汇报结果') || content.includes('任务已完成')) setMeetingPhase('done')
            setChatMessages(prev => {
              const filtered = prev.filter(
                m => !(m.role === 'agent' && m.agentId === msg.agentId && (m as any)._streaming)
              )
              return [...filtered, {
                role: 'agent' as const,
                agentId: msg.agentId,
                content: msg.content,
                timestamp: Date.now(),
                _stance: msg.stance ?? undefined,
                _confidence: msg.confidence ?? undefined,
              }]
            })
          }
          break
        }
        case 'task_assigned': {
          const newTask: Task = {
            id: msg.taskId,
            agentId: msg.agentId,
            description: '',
            status: msg.status,
            createdAt: Date.now(),
          }
          setTasks(prev => [...prev, newTask])
          setAgents(prev => prev.map(a =>
            a.id === msg.agentId ? { ...a, currentTask: msg.taskId } : a
          ))
          break
        }
        case 'task_deleted': {
          setTasks(prev => prev.filter(t => t.id !== msg.taskId))
          break
        }
        case 'agent_status_update': {
          setAgents(prev => prev.map(a =>
            a.id === msg.agentId
              ? { ...a, status: msg.status, currentTask: msg.currentTask ?? a.currentTask }
              : a
          ))
          break
        }
        case 'meeting_ended': {
          setIsMeetingActive(false)
          setMeetingPhase('idle')
          setMeetingStartTime(null)
          setChatMessages(prev => [...prev, {
            role: 'boss' as const,
            content: '会议已结束',
            timestamp: Date.now(),
          }])
          break
        }
        case 'agenda_update': {
          setAgendaState({
            phase: msg.phase || 'idle',
            topic: msg.topic || '',
            currentSpeaker: msg.current_speaker || null,
            proposalId: msg.proposal_id || null,
            tokenQueue: (msg.token_queue || []).map((t: any) => ({
              agentId: t.agent_id || t.agentId,
              relevanceScore: t.relevance_score ?? t.relevanceScore ?? 0,
            })),
            eventHistory: (msg.event_history || []).map((e: any) => ({
              type: e.type,
              timestamp: e.timestamp,
              from: e.from,
              to: e.to,
              agentId: e.agent_id || e.agentId,
              reason: e.reason,
            })),
          })
          break
        }
        case 'meeting_error': {
          setChatMessages(prev => [...prev, {
            role: 'boss' as const,
            content: `会议错误：${msg.message}`,
            timestamp: Date.now(),
          }])
          break
        }
        case 'semantic_analysis_result': {
          setChatMessages(prev => [...prev, {
            role: 'ceo' as const,
            agentId: 'agent-ceo',
            content: msg.analysisResult,
            timestamp: Date.now(),
          }])
          break
        }
        case 'task_auto_assigned': {
          setChatMessages(prev => [...prev, {
            role: 'ceo' as const,
            agentId: 'agent-ceo',
            content: `任务已自动指派给 ${msg.agentId}：${msg.description}`,
            timestamp: Date.now(),
            _routingDecision: msg.analysis ? undefined : undefined,
            _msgSubtype: 'routing',
          }])
          const autoTask: Task = {
            id: msg.taskId,
            agentId: msg.agentId,
            description: msg.description,
            status: msg.status,
            createdAt: Date.now(),
          }
          setTasks(prev => [...prev, autoTask])

          // 如果有路由决策信息，添加路由决策消息
          if (msg.routing_decision) {
            setChatMessages(prev => [...prev, {
              role: 'ceo' as const,
              agentId: 'agent-ceo',
              content: `路由决策：推荐部门 ${msg.routing_decision.selected_dept}，置信度 ${(msg.routing_decision.confidence * 100).toFixed(1)}%`,
              timestamp: Date.now(),
              _routingDecision: msg.routing_decision,
              _msgSubtype: 'routing',
            }])
          }
          break
        }
        case 'structured_feedback': {
          const feedback = msg.feedback
          const feedbackStatus = feedback?.status === 'approved' ? '验收通过' : '需要修改'
          const issueCount = feedback?.issues?.length ?? 0
          const iterInfo = feedback ? ` (${feedback.current_iteration}/${feedback.max_iterations})` : ''

          setChatMessages(prev => [...prev, {
            role: 'agent' as const,
            agentId: msg.agentId || 'agent-reviewer',
            content: `结构化验收${iterInfo}：${feedbackStatus}${issueCount > 0 ? `，${issueCount} 个问题待解决` : ''}${feedback?.overall_comment ? '\n' + feedback.overall_comment : ''}`,
            timestamp: Date.now(),
            _structuredFeedback: feedback,
            _msgSubtype: 'feedback',
          }])

          // 更新对应任务状态
          if (msg.taskId) {
            setTasks(prev => prev.map(t =>
              t.id === msg.taskId
                ? { ...t, status: feedback?.status === 'revision_required' ? 'revision_required' : 'completed' }
                : t
            ))
          }
          break
        }
        case 'iteration_update': {
          const iterStatus = msg.iteration_status
          if (iterStatus) {
            setChatMessages(prev => [...prev, {
              role: 'agent' as const,
              agentId: msg.agentId || 'agent-executor',
              content: `迭代修正 ${iterStatus.current_iteration}/${iterStatus.max_iterations}：${iterStatus.status === 'approved' ? '已通过' : iterStatus.status === 'max_iterations_reached' ? '已达最大迭代次数' : '修正中'}`,
              timestamp: Date.now(),
              _iterationStatus: iterStatus,
              _msgSubtype: 'iteration',
            }])

            // 更新任务的迭代状态
            if (msg.taskId) {
              setTasks(prev => prev.map(t =>
                t.id === msg.taskId
                  ? { ...t, iterationStatus: iterStatus, status: iterStatus.status === 'approved' ? 'completed' : 'revision_required' }
                  : t
              ))
            }
          }
          break
        }
        case 'experience_injected': {
          setChatMessages(prev => [...prev, {
            role: 'agent' as const,
            agentId: msg.agentId || 'agent-executor',
            content: `已注入 ${msg.rules_count ?? 0} 条经验规则${msg.keywords?.length ? '，关键词: ' + msg.keywords.join(', ') : ''}`,
            timestamp: Date.now(),
            _msgSubtype: 'experience',
          }])
          break
        }
        case 'skill_mounted': {
          setAgents(prev => prev.map(a =>
            a.id === msg.agentId
              ? { ...a, skillId: msg.skill_id, skillName: msg.skill_name }
              : a
          ))
          break
        }
        case 'workflow_executed': {
          const workflowResult = msg.workflow_result || {}
          const workflowStatus = workflowResult.status || 'unknown'
          const workflowId = workflowResult.execution_id || msg.workflow_id || ''

          // 更新lastWorkflow状态，触发WorkflowPanel弹出
          setLastWorkflow({
            execution_id: workflowId,
            workflow_id: workflowResult.workflow_id || '',
            status: workflowStatus,
            started_at: workflowResult.started_at || '',
            completed_at: workflowResult.completed_at || null,
            node_states: workflowResult.node_states || {},
            results: workflowResult.results || {},
          })

          setChatMessages(prev => [...prev, {
            role: 'ceo' as const,
            agentId: 'agent-ceo',
            content: `工作流执行完成：${workflowStatus} (ID: ${workflowId})`,
            timestamp: Date.now(),
            _workflowResult: workflowResult,
            _msgSubtype: 'workflow',
          }])

          // 如果有结果汇总，添加详细信息
          if (workflowResult.results && Object.keys(workflowResult.results).length > 0) {
            const resultSummary = Object.entries(workflowResult.results)
              .map(([nodeId, result]: [string, any]) => `- ${nodeId}: ${result?.result?.substring(0, 100) || '无结果'}...`)
              .join('\n')

            setChatMessages(prev => [...prev, {
              role: 'ceo' as const,
              agentId: 'agent-ceo',
              content: `工作流执行结果汇总:\n${resultSummary}`,
              timestamp: Date.now(),
              _msgSubtype: 'workflow_summary',
            }])
          }
          break
        }
        case 'review_completed': {
          const criticResult = msg.critic_result || {}
          const groundingResult = msg.grounding_result || {}
          const severity = criticResult.severity || 'unknown'
          const findingsCount = (criticResult.findings || []).length
          const grounded = groundingResult.grounded ?? false
          const sourcesCount = (groundingResult.sources || []).length

          setChatMessages(prev => [...prev, {
            role: 'agent' as const,
            agentId: 'agent-reviewer',
            content: `审查完成 — 严重度: ${severity}，发现 ${findingsCount} 个问题；接地: ${grounded ? '是' : '否'}，${sourcesCount} 个来源`,
            timestamp: Date.now(),
            _msgSubtype: 'feedback' as const,
          }])
          break
        }
        case 'workflow_node_status_update': {
          const nodeId = msg.node_id || ''
          const nodeStatus = msg.status || 'unknown'
          setChatMessages(prev => [...prev, {
            role: 'ceo' as const,
            agentId: 'agent-ceo',
            content: `工作流节点 ${nodeId} 状态: ${nodeStatus}`,
            timestamp: Date.now(),
            _msgSubtype: 'workflow' as const,
          }])
          // 更新 tasks 中匹配节点的状态
          if (nodeId) {
            setTasks(prev => prev.map(t =>
              t.id === nodeId ? { ...t, status: nodeStatus } : t
            ))
          }
          break
        }
        case 'workspace_created': {
          setWorkspace({
            workspace_id: msg.workspace_id,
            task_id: msg.task_id || '',
            workspace_type: msg.workspace_type || 'git_worktree',
            root_path: msg.workspace_path,
            branch_name: msg.branch_name,
          })
          break
        }
        case 'tool_result': {
          setToolCallLogs(prev => [...prev, {
            tool_name: msg.tool_name,
            arguments: msg.arguments || {},
            success: msg.success,
            output: msg.output,
            error: msg.error,
            timestamp: new Date().toISOString(),
          }])
          break
        }
        case 'proposal': {
          // 收到提案
          const proposal = msg.proposal
          if (proposal) {
            setActiveProposal({
              id: proposal.id,
              proposerId: proposal.proposerId,
              content: proposal.content,
              createdAt: proposal.createdAt,
            })
            setVoteResults(null) // 清除旧投票结果
            setChatMessages(prev => [...prev, {
              role: 'agent' as const,
              agentId: proposal.proposerId,
              content: `[提案] ${proposal.content}`,
              timestamp: Date.now(),
              _msgSubtype: 'proposal',
            }])
          }
          break
        }
        case 'vote': {
          // 收到投票
          const vote = msg.vote
          if (vote) {
            setVotes(prev => {
              const next = new Map(prev)
              next.set(vote.voterId, {
                voterId: vote.voterId,
                approve: vote.approve,
                reason: vote.reason,
              })
              return next
            })
            setChatMessages(prev => [...prev, {
              role: 'agent' as const,
              agentId: vote.voterId,
              content: `[投票] ${vote.approve ? '赞成' : '反对'}${vote.reason ? ': ' + vote.reason : ''}`,
              timestamp: Date.now(),
              _msgSubtype: 'vote',
            }])
          }
          break
        }
        case 'vote_result': {
          // 收到投票结果
          const result = msg.result
          if (result) {
            setVoteResults({
              proposalId: result.proposalId,
              totalVotes: result.totalVotes,
              approveCount: result.approveCount,
              opposeCount: result.opposeCount,
              accepted: result.accepted,
            })
            // 清除活跃提案
            setActiveProposal(null)
            setVotes(new Map())
            setChatMessages(prev => [...prev, {
              role: 'boss' as const,
              content: `投票结果: ${result.accepted ? '通过' : '未通过'} (${result.approveCount}赞成 / ${result.opposeCount}反对，共${result.totalVotes}票)`,
              timestamp: Date.now(),
              _msgSubtype: 'vote_result',
            }])
          }
          break
        }
        case 'bridge_agent_registered': {
          // Bridge registration confirmation from Python
          console.log('[Bridge] Agent registered:', msg.tsAgentId, '->', msg.pyAgentId, 'success:', msg.success)
          // Notify any pending bridge registration callbacks
          const regCallback = bridgeCallbacks.current.get(`reg:${msg.tsAgentId}`)
          if (regCallback) {
            regCallback(msg)
            bridgeCallbacks.current.delete(`reg:${msg.tsAgentId}`)
          }
          break
        }
        case 'bridge_message': {
          // Incoming message from Python agent to TS agent
          console.log('[Bridge] Message received:', msg.fromAgentId, '->', msg.toAgentId)
          const msgCallback = bridgeCallbacks.current.get(`msg:${msg.toAgentId}`)
          if (msgCallback) {
            msgCallback(msg)
          }
          // Also store in bridge messages state
          setBridgeMessages(prev => [...prev, {
            fromAgentId: msg.fromAgentId,
            toAgentId: msg.toAgentId,
            payload: msg.payload,
            timestamp: Date.now(),
          }])
          break
        }
      }
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
      bridgeCallbacks.current.set(`reg:${agentId}`, (msg: any) => {
        resolve({ pyAgentId: msg.pyAgentId, success: msg.success })
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

  const sendBridgeMessage = useCallback((fromId: string, toId: string, payload: any) => {
    send({
      type: 'bridge_message',
      fromAgentId: fromId,
      toAgentId: toId,
      payload,
    })
  }, [send])

  const onBridgeMessage = useCallback((agentId: string, callback: (msg: any) => void) => {
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
  }
}
