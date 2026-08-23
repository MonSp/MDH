/**
 * 会议生命周期消息处理器
 */

import type { TeamAgent, Task, ChatMessage } from '../../components/office-team/types'

/** 会议生命周期 WebSocket 消息类型 */
export interface MeetingMessage {
  // 会议生命周期
  meetingId?: string
  meeting_id?: string
  agents?: RawAgent[]

  // 智能体消息
  delta?: string
  agentId?: string
  content?: string
  stance?: 'support' | 'oppose' | 'modify' | 'neutral'
  confidence?: number

  // 任务
  taskId?: string
  status?: string
  currentTask?: string | null

  // 议程
  phase?: string
  topic?: string
  current_speaker?: string | null
  proposal_id?: string | null
  token_queue?: Array<{ agent_id?: string; agentId?: string; relevance_score?: number; relevanceScore?: number }>
  event_history?: Array<{ type: string; timestamp: number; from?: string; to?: string; agent_id?: string; agentId?: string; reason?: string }>

  // 错误
  message?: string

  // 语义分析
  analysisResult?: string

  // 任务自动分配
  description?: string
  routing_decision?: { selected_dept: string; confidence: number }
  analysis?: unknown

  // 结构化反馈
  feedback?: {
    status?: string
    issues?: Array<{ id: number | string }>
    current_iteration?: number
    max_iterations?: number
    overall_comment?: string
  }

  // 迭代状态
  iteration_status?: {
    current_iteration: number
    max_iterations: number
    status: string
  }

  // 经验注入
  rules_count?: number
  keywords?: string[]

  // 技能挂载
  skill_id?: string
  skill_name?: string

  // 审查结果
  critic_result?: { severity?: string; findings?: Array<{ id: number | string }> }
  grounding_result?: { grounded?: boolean; sources?: string[] }

  // 工作流
  workflow_result?: {
    execution_id?: string
    workflow_id?: string
    status?: string
    started_at?: string
    completed_at?: string | null
    node_states?: Record<string, unknown>
    results?: Record<string, { result?: string }>
  }
  workflow_id?: string
  node_id?: string

  // 工作区
  workspace_id?: string
  workspace_type?: string
  workspace_path?: string
  branch_name?: string
  task_id?: string

  // 工具执行结果
  tool_name?: string
  arguments?: Record<string, unknown>
  success?: boolean
  output?: string
  error?: string

  // 阻塞器
  blockerType?: string
}

/** 原始智能体数据（来自 meeting_started 消息） */
export interface RawAgent {
  id: string
  name: string
  role: string
  status: string
  capabilities?: string[]
  currentTask?: string
  skill_id?: string
  skill_name?: string
}

export interface MeetingSetters {
  setMeetingId: (id: string) => void
  setAgents: (fn: (prev: TeamAgent[]) => TeamAgent[]) => void
  setTasks: (fn: (prev: Task[]) => Task[]) => void
  setChatMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void
  setIsMeetingActive: (v: boolean) => void
  setMeetingPhase: (phase: string) => void
  setMeetingStartTime: (v: number | null) => void
  setAgendaState: (state: { phase: string; topic: string; currentSpeaker: string | null; proposalId: string | null; tokenQueue: Array<{ agentId: string; relevanceScore: number }>; eventHistory: Array<{ type: string; timestamp: string; from?: string; to?: string; agentId?: string; reason?: string }> }) => void
  setWorkspace: (ws: { workspace_id: string; task_id: string; workspace_type: string; root_path: string; branch_name: string }) => void
  setToolCallLogs: (fn: (prev: Array<{ tool_name: string; arguments: Record<string, unknown>; success: boolean; output?: string; error?: string; timestamp: string }>) => Array<{ tool_name: string; arguments: Record<string, unknown>; success: boolean; output?: string; error?: string; timestamp: string }>) => void
  setLastWorkflow: (wf: { execution_id: string; workflow_id: string; status: string; started_at: string; completed_at: string | null; node_states: Record<string, unknown>; results: Record<string, unknown> }) => void
}

export interface MeetingRefs {
  pendingMessages: React.MutableRefObject<Map<string, string>>
}

export function handleMeetingStarted(msg: Partial<MeetingMessage>, setters: MeetingSetters, refs: MeetingRefs) {
  setters.setMeetingId(msg.meetingId || msg.meeting_id)
  setters.setAgents(() => msg.agents.map(mapAgentToTeamAgent))
  setters.setTasks(() => [])
  setters.setChatMessages(() => [])
  setters.setIsMeetingActive(true)
  setters.setMeetingStartTime(Date.now())
  setters.setMeetingPhase('analyzing')
  refs.pendingMessages.current.clear()
  setters.setChatMessages(() => [{
    role: 'boss' as const,
    content: '会议已开始',
    timestamp: Date.now(),
  }])
}

export function handleAgentMessage(msg: Partial<MeetingMessage>, setters: MeetingSetters, refs: MeetingRefs) {
  if (msg.delta) {
    const existing = refs.pendingMessages.current.get(msg.agentId) ?? ''
    const accumulated = existing + msg.delta
    refs.pendingMessages.current.set(msg.agentId, accumulated)
    setters.setChatMessages(prev => {
      const idx = [...prev].reverse().findIndex(
        m => m.role === 'agent' && m.agentId === msg.agentId && m._streaming
      )
      if (idx !== -1) {
        const actualIdx = prev.length - 1 - idx
        const updated = [...prev]
        updated[actualIdx] = { ...updated[actualIdx], content: accumulated }
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
    refs.pendingMessages.current.delete(msg.agentId)
    const content = msg.content || ''
    const phase = detectMeetingPhase(content)
    if (phase) setters.setMeetingPhase(phase)
    setters.setChatMessages(prev => {
      const filtered = prev.filter(
        m => !(m.role === 'agent' && m.agentId === msg.agentId && m._streaming)
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
}

// ── 思维链 handlers ──

export function handleThinkingStart(msg: MeetingMessage, setters: MeetingSetters, refs: MeetingRefs) {
  refs.pendingMessages.current.set(`thinking:${msg.agentId}`, '')
  setters.setChatMessages(prev => [...prev, {
    role: 'agent' as const,
    agentId: msg.agentId,
    content: '',
    timestamp: Date.now(),
    _thinking: true,
    _streaming: true,
  } as ChatMessage & { _thinking?: boolean; _streaming?: boolean }])
}

export function handleThinkingDelta(msg: MeetingMessage, setters: MeetingSetters, refs: MeetingRefs) {
  const key = `thinking:${msg.agentId}`
  const existing = refs.pendingMessages.current.get(key) ?? ''
  const accumulated = existing + msg.delta
  refs.pendingMessages.current.set(key, accumulated)

  setters.setChatMessages(prev => {
    const idx = [...prev].reverse().findIndex(
      m => m.role === 'agent' && m.agentId === msg.agentId && m._thinking && m._streaming
    )
    if (idx !== -1) {
      const actualIdx = prev.length - 1 - idx
      const updated = [...prev]
      updated[actualIdx] = { ...updated[actualIdx], content: accumulated }
      return updated
    }
    return prev
  })
}

export function handleThinkingEnd(msg: MeetingMessage, setters: MeetingSetters, refs: MeetingRefs) {
  const key = `thinking:${msg.agentId}`
  refs.pendingMessages.current.delete(key)

  setters.setChatMessages(prev => {
    const idx = [...prev].reverse().findIndex(
      m => m.role === 'agent' && m.agentId === msg.agentId && m._thinking && m._streaming
    )
    if (idx !== -1) {
      const actualIdx = prev.length - 1 - idx
      const updated = [...prev]
      updated[actualIdx] = { ...updated[actualIdx], _streaming: false }
      return updated
    }
    return prev
  })
}

export function handleTaskAssigned(msg: MeetingMessage, setters: MeetingSetters) {
  const newTask: Task = {
    id: msg.taskId,
    agentId: msg.agentId,
    description: '',
    status: msg.status,
    createdAt: Date.now(),
  }
  setters.setTasks(prev => [...prev, newTask])
  setters.setAgents(prev => prev.map(a =>
    a.id === msg.agentId ? { ...a, currentTask: msg.taskId } : a
  ))
}

export function handleTaskDeleted(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setTasks(prev => prev.filter(t => t.id !== msg.taskId))
}

export function handleAgentStatusUpdate(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setAgents(prev => prev.map(a =>
    a.id === msg.agentId
      ? { ...a, status: msg.status, currentTask: msg.currentTask ?? a.currentTask, currentTool: msg.currentTool ?? a.currentTool, artifactCount: msg.artifactCount ?? a.artifactCount }
      : a
  ))
}

export function handleArtifactCreated(msg: MeetingMessage, setters: MeetingSetters) {
  // 更新 agent 的 artifact 计数
  if (msg.agentId) {
    setters.setAgents(prev => prev.map(a =>
      a.id === msg.agentId
        ? { ...a, artifactCount: (a.artifactCount || 0) + (msg.filesCount || 0) }
        : a
    ))
  }
  // 添加系统消息到聊天
  const fileTypes = (msg.fileTypes as string[]) || []
  const typeStr = fileTypes.length > 0 ? ` (${fileTypes.join(', ')})` : ''
  setters.setChatMessages(prev => [...prev, {
    role: 'system' as const,
    content: `[Artifact] ${msg.agentId} 产出了 ${msg.filesCount || 0} 个文件${typeStr}`,
    timestamp: Date.now(),
  }])
}

export function handleMeetingEnded(_msg: MeetingMessage, setters: MeetingSetters) {
  setters.setIsMeetingActive(false)
  setters.setMeetingPhase('idle')
  setters.setMeetingStartTime(null)
  setters.setChatMessages(prev => [...prev, {
    role: 'boss' as const,
    content: '会议已结束',
    timestamp: Date.now(),
  }])
}

export function handleAgendaUpdate(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setAgendaState({
    phase: msg.phase || 'idle',
    topic: msg.topic || '',
    currentSpeaker: msg.current_speaker || null,
    proposalId: msg.proposal_id || null,
    tokenQueue: (msg.token_queue || []).map((t: Record<string, unknown>) => ({
      agentId: t.agent_id || t.agentId,
      relevanceScore: t.relevance_score ?? t.relevanceScore ?? 0,
    })),
    eventHistory: (msg.event_history || []).map((e: Record<string, unknown>) => ({
      type: e.type,
      timestamp: e.timestamp,
      from: e.from,
      to: e.to,
      agentId: e.agent_id || e.agentId,
      reason: e.reason,
    })),
  })
}

export function handleMeetingError(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setChatMessages(prev => [...prev, {
    role: 'boss' as const,
    content: `会议错误：${msg.message}`,
    timestamp: Date.now(),
  }])
}

export function handleSemanticAnalysisResult(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setChatMessages(prev => [...prev, {
    role: 'ceo' as const,
    agentId: 'agent-ceo',
    content: msg.analysisResult,
    timestamp: Date.now(),
  }])
}

export function handleTaskAutoAssigned(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setChatMessages(prev => [...prev, {
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
  setters.setTasks(prev => [...prev, autoTask])

  if (msg.routing_decision) {
    setters.setChatMessages(prev => [...prev, {
      role: 'ceo' as const,
      agentId: 'agent-ceo',
      content: `路由决策：推荐部门 ${msg.routing_decision.selected_dept}，置信度 ${(msg.routing_decision.confidence * 100).toFixed(1)}%`,
      timestamp: Date.now(),
      _routingDecision: msg.routing_decision,
      _msgSubtype: 'routing',
    }])
  }
}

export function handleStructuredFeedback(msg: MeetingMessage, setters: MeetingSetters) {
  const feedback = msg.feedback
  const feedbackStatus = feedback?.status === 'approved' ? '验收通过' : '需要修改'
  const issueCount = feedback?.issues?.length ?? 0
  const iterInfo = feedback ? ` (${feedback.current_iteration}/${feedback.max_iterations})` : ''

  setters.setChatMessages(prev => [...prev, {
    role: 'agent' as const,
    agentId: msg.agentId || 'agent-reviewer',
    content: `结构化验收${iterInfo}：${feedbackStatus}${issueCount > 0 ? `，${issueCount} 个问题待解决` : ''}${feedback?.overall_comment ? '\n' + feedback.overall_comment : ''}`,
    timestamp: Date.now(),
    _structuredFeedback: feedback,
    _msgSubtype: 'feedback',
  }])

  if (msg.taskId) {
    setters.setTasks(prev => prev.map(t =>
      t.id === msg.taskId
        ? { ...t, status: feedback?.status === 'revision_required' ? 'revision_required' : 'completed' }
        : t
    ))
  }
}

export function handleIterationUpdate(msg: MeetingMessage, setters: MeetingSetters) {
  const iterStatus = msg.iteration_status
  if (iterStatus) {
    setters.setChatMessages(prev => [...prev, {
      role: 'agent' as const,
      agentId: msg.agentId || 'agent-executor',
      content: `迭代修正 ${iterStatus.current_iteration}/${iterStatus.max_iterations}：${iterStatus.status === 'approved' ? '已通过' : iterStatus.status === 'max_iterations_reached' ? '已达最大迭代次数' : '修正中'}`,
      timestamp: Date.now(),
      _iterationStatus: iterStatus,
      _msgSubtype: 'iteration',
    }])

    if (msg.taskId) {
      setters.setTasks(prev => prev.map(t =>
        t.id === msg.taskId
          ? { ...t, iterationStatus: iterStatus, status: iterStatus.status === 'approved' ? 'completed' : 'revision_required' }
          : t
      ))
    }
  }
}

export function handleExperienceInjected(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setChatMessages(prev => [...prev, {
    role: 'agent' as const,
    agentId: msg.agentId || 'agent-executor',
    content: `已注入 ${msg.rules_count ?? 0} 条经验规则${msg.keywords?.length ? '，关键词: ' + msg.keywords.join(', ') : ''}`,
    timestamp: Date.now(),
    _msgSubtype: 'experience',
  }])
}

export function handleSkillMounted(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setAgents(prev => prev.map(a =>
    a.id === msg.agentId
      ? { ...a, skillId: msg.skill_id, skillName: msg.skill_name }
      : a
  ))
}

export function handleReviewCompleted(msg: MeetingMessage, setters: MeetingSetters) {
  const criticResult = msg.critic_result || {}
  const groundingResult = msg.grounding_result || {}
  const severity = criticResult.severity || 'unknown'
  const findingsCount = (criticResult.findings || []).length
  const grounded = groundingResult.grounded ?? false
  const sourcesCount = (groundingResult.sources || []).length
  setters.setChatMessages(prev => [...prev, {
    role: 'agent' as const,
    agentId: 'agent-reviewer',
    content: `审查完成 — 严重度: ${severity}，发现 ${findingsCount} 个问题；接地: ${grounded ? '是' : '否'}，${sourcesCount} 个来源`,
    timestamp: Date.now(),
    _msgSubtype: 'feedback' as const,
  }])
}

export function handleWorkflowExecuted(msg: MeetingMessage, setters: MeetingSetters) {
  const workflowResult = msg.workflow_result || {}
  const workflowStatus = workflowResult.status || 'unknown'
  const workflowId = workflowResult.execution_id || msg.workflow_id || ''

  setters.setLastWorkflow({
    execution_id: workflowId,
    workflow_id: workflowResult.workflow_id || '',
    status: workflowStatus,
    started_at: workflowResult.started_at || '',
    completed_at: workflowResult.completed_at || null,
    node_states: workflowResult.node_states || {},
    results: workflowResult.results || {},
  })

  setters.setChatMessages(prev => [...prev, {
    role: 'ceo' as const,
    agentId: 'agent-ceo',
    content: `工作流执行完成：${workflowStatus} (ID: ${workflowId})`,
    timestamp: Date.now(),
    _workflowResult: workflowResult,
    _msgSubtype: 'workflow',
  }])

  if (workflowResult.results && Object.keys(workflowResult.results).length > 0) {
    const resultSummary = Object.entries(workflowResult.results)
      .map(([nodeId, result]: [string, { result?: string }]) => `- ${nodeId}: ${result?.result?.substring(0, 100) || '无结果'}...`)
      .join('\n')
    setters.setChatMessages(prev => [...prev, {
      role: 'ceo' as const,
      agentId: 'agent-ceo',
      content: `工作流执行结果汇总:\n${resultSummary}`,
      timestamp: Date.now(),
      _msgSubtype: 'workflow_summary',
    }])
  }
}

export function handleWorkflowNodeStatusUpdate(msg: MeetingMessage, setters: MeetingSetters) {
  const nodeId = msg.node_id || ''
  const nodeStatus = msg.status || 'unknown'
  setters.setChatMessages(prev => [...prev, {
    role: 'ceo' as const,
    agentId: 'agent-ceo',
    content: `工作流节点 ${nodeId} 状态: ${nodeStatus}`,
    timestamp: Date.now(),
    _msgSubtype: 'workflow' as const,
  }])
  if (nodeId) {
    setters.setTasks(prev => prev.map(t =>
      t.id === nodeId ? { ...t, status: nodeStatus } : t
    ))
  }
}

export function handleWorkspaceCreated(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setWorkspace({
    workspace_id: msg.workspace_id,
    task_id: msg.task_id || '',
    workspace_type: msg.workspace_type || 'git_worktree',
    root_path: msg.workspace_path,
    branch_name: msg.branch_name,
  })
}

export function handleToolResult(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setToolCallLogs(prev => [...prev, {
    tool_name: msg.tool_name,
    arguments: msg.arguments || {},
    success: msg.success,
    output: msg.output,
    error: msg.error,
    timestamp: new Date().toISOString(),
  }])
}

export function handleCriticalBlocker(msg: MeetingMessage, setters: MeetingSetters) {
  setters.setChatMessages(prev => [...prev, {
    role: 'boss' as const,
    content: `[紧急阻塞] ${msg.agentId}: ${msg.content} (类型: ${msg.blockerType})`,
    timestamp: Date.now(),
    _msgSubtype: 'feedback',
  }])
}

// Helper functions

function mapAgentToTeamAgent(raw: Record<string, unknown>): TeamAgent {
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role,
    status: raw.status,
    capabilities: raw.capabilities || [],
    currentTask: raw.currentTask,
    skillId: raw.skill_id,
    skillName: raw.skill_name,
  }
}

function detectMeetingPhase(content: string): string | null {
  if (content.includes('确认细节') || content.includes('项目经理分析')) return 'analyzing'
  if (content.includes('制定项目计划') || content.includes('阶段1')) return 'planning'
  if (content.includes('组织团队讨论')) return 'discussing'
  if (content.includes('整合') && content.includes('讨论')) return 'discussing'
  if (content.includes('分派') && content.includes('任务')) return 'assigning'
  if (content.includes('正在执行任务') || content.includes('轮开发') || content.includes('写入文件')) return 'executing'
  if (content.includes('轮质量审查') || content.includes('轮审查') || content.includes('审查通过')) return 'reviewing'
  if (content.includes('项目总结') || content.includes('总结报告')) return 'summarizing'
  if (content.includes('汇报结果') || content.includes('任务已完成')) return 'done'
  return null
}
