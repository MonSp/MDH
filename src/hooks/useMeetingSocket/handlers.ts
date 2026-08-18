/**
 * useMeetingSocket 消息处理器
 *
 * 将 618 行 switch 语句拆分为按领域分组的 handler 函数。
 * 每个 handler 接收 (msg, setters, refs) 参数，返回 void。
 */

import type { TeamAgent, Task, ChatMessage, AgendaState } from '../../components/office-team/types'
import type { WorkflowExecution } from '../../modules/agentTypes'

// ── 类型定义 ──

export interface HandlerSetters {
  setMeetingId: (id: string) => void
  setAgents: (fn: (prev: TeamAgent[]) => TeamAgent[]) => void
  setTasks: (fn: (prev: Task[]) => Task[]) => void
  setChatMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void
  setIsMeetingActive: (v: boolean) => void
  setMeetingPhase: (phase: string) => void
  setMeetingStartTime: (v: number | null) => void
  setAgendaState: (state: AgendaState) => void
  setWorkspace: (ws: any) => void
  setToolCallLogs: (fn: (prev: any[]) => any[]) => void
  setLastWorkflow: (wf: WorkflowExecution | null) => void
  setActiveProposal: (p: any) => void
  setVotes: (fn: (prev: Map<string, any>) => Map<string, any>) => void
  setVoteResults: (r: any) => void
  setPendingApprovals: (fn: (prev: Map<string, any>) => Map<string, any>) => void
  setCheckpoints: (fn: (prev: any[]) => any[]) => void
  setRestoredState: (s: any) => void
  setAuditLog: (fn: (prev: any[]) => any[]) => void
  setBridgeMessages: (fn: (prev: any[]) => any[]) => void
}

export interface HandlerRefs {
  pendingMessages: React.MutableRefObject<Map<string, string>>
  bridgeCallbacks: React.MutableRefObject<Map<string, (msg: any) => void>>
}

// ── 辅助函数 ──

function mapAgentToTeamAgent(raw: any): TeamAgent {
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

function addChatMsg(setters: HandlerSetters, role: string, content: string, extra?: Record<string, unknown>) {
  setters.setChatMessages(prev => [...prev, {
    role: role as any,
    content,
    timestamp: Date.now(),
    ...extra,
  }])
}

// ── 会议生命周期 handlers ──

export function handleMeetingStarted(msg: any, setters: HandlerSetters, refs: HandlerRefs) {
  setters.setMeetingId(msg.meetingId || msg.meeting_id)
  setters.setAgents(msg.agents.map(mapAgentToTeamAgent))
  setters.setTasks(() => [])
  setters.setChatMessages(() => [])
  setters.setIsMeetingActive(true)
  setters.setMeetingStartTime(Date.now())
  setters.setMeetingPhase('analyzing')
  refs.pendingMessages.current.clear()
  addChatMsg(setters, 'boss', '会议已开始')
}

export function handleAgentMessage(msg: any, setters: HandlerSetters, refs: HandlerRefs) {
  if (msg.delta) {
    const existing = refs.pendingMessages.current.get(msg.agentId) ?? ''
    const accumulated = existing + msg.delta
    refs.pendingMessages.current.set(msg.agentId, accumulated)
    setters.setChatMessages(prev => {
      const idx = [...prev].reverse().findIndex(
        m => m.role === 'agent' && m.agentId === msg.agentId && (m as any)._streaming
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
}

export function handleTaskAssigned(msg: any, setters: HandlerSetters) {
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

export function handleTaskDeleted(msg: any, setters: HandlerSetters) {
  setters.setTasks(prev => prev.filter(t => t.id !== msg.taskId))
}

export function handleAgentStatusUpdate(msg: any, setters: HandlerSetters) {
  setters.setAgents(prev => prev.map(a =>
    a.id === msg.agentId
      ? { ...a, status: msg.status, currentTask: msg.currentTask ?? a.currentTask }
      : a
  ))
}

export function handleMeetingEnded(msg: any, setters: HandlerSetters) {
  setters.setIsMeetingActive(false)
  setters.setMeetingPhase('idle')
  setters.setMeetingStartTime(null)
  addChatMsg(setters, 'boss', '会议已结束')
}

export function handleAgendaUpdate(msg: any, setters: HandlerSetters) {
  setters.setAgendaState({
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
}

export function handleMeetingError(msg: any, setters: HandlerSetters) {
  addChatMsg(setters, 'boss', `会议错误：${msg.message}`)
}

export function handleSemanticAnalysisResult(msg: any, setters: HandlerSetters) {
  addChatMsg(setters, 'ceo', msg.analysisResult, { agentId: 'agent-ceo' })
}

export function handleTaskAutoAssigned(msg: any, setters: HandlerSetters) {
  addChatMsg(setters, 'ceo', `任务已自动指派给 ${msg.agentId}：${msg.description}`, {
    agentId: 'agent-ceo',
    _msgSubtype: 'routing',
  })
  const autoTask: Task = {
    id: msg.taskId,
    agentId: msg.agentId,
    description: msg.description,
    status: msg.status,
    createdAt: Date.now(),
  }
  setters.setTasks(prev => [...prev, autoTask])
  if (msg.routing_decision) {
    addChatMsg(setters, 'ceo',
      `路由决策：推荐部门 ${msg.routing_decision.selected_dept}，置信度 ${(msg.routing_decision.confidence * 100).toFixed(1)}%`,
      { agentId: 'agent-ceo', _routingDecision: msg.routing_decision, _msgSubtype: 'routing' }
    )
  }
}

// ── 审查 handlers ──

export function handleStructuredFeedback(msg: any, setters: HandlerSetters) {
  const feedback = msg.feedback
  const feedbackStatus = feedback?.status === 'approved' ? '验收通过' : '需要修改'
  const issueCount = feedback?.issues?.length ?? 0
  const iterInfo = feedback ? ` (${feedback.current_iteration}/${feedback.max_iterations})` : ''
  addChatMsg(setters, 'agent',
    `结构化验收${iterInfo}：${feedbackStatus}${issueCount > 0 ? `，${issueCount} 个问题待解决` : ''}${feedback?.overall_comment ? '\n' + feedback.overall_comment : ''}`,
    { agentId: msg.agentId || 'agent-reviewer', _structuredFeedback: feedback, _msgSubtype: 'feedback' }
  )
  if (msg.taskId) {
    setters.setTasks(prev => prev.map(t =>
      t.id === msg.taskId
        ? { ...t, status: feedback?.status === 'revision_required' ? 'revision_required' : 'completed' }
        : t
    ))
  }
}

export function handleIterationUpdate(msg: any, setters: HandlerSetters) {
  const iterStatus = msg.iteration_status
  if (iterStatus) {
    addChatMsg(setters, 'agent',
      `迭代修正 ${iterStatus.current_iteration}/${iterStatus.max_iterations}：${iterStatus.status === 'approved' ? '已通过' : iterStatus.status === 'max_iterations_reached' ? '已达最大迭代次数' : '修正中'}`,
      { agentId: msg.agentId || 'agent-executor', _iterationStatus: iterStatus, _msgSubtype: 'iteration' }
    )
    if (msg.taskId) {
      setters.setTasks(prev => prev.map(t =>
        t.id === msg.taskId
          ? { ...t, iterationStatus: iterStatus, status: iterStatus.status === 'approved' ? 'completed' : 'revision_required' }
          : t
      ))
    }
  }
}

export function handleExperienceInjected(msg: any, setters: HandlerSetters) {
  addChatMsg(setters, 'agent',
    `已注入 ${msg.rules_count ?? 0} 条经验规则${msg.keywords?.length ? '，关键词: ' + msg.keywords.join(', ') : ''}`,
    { agentId: msg.agentId || 'agent-executor', _msgSubtype: 'experience' }
  )
}

export function handleSkillMounted(msg: any, setters: HandlerSetters) {
  setters.setAgents(prev => prev.map(a =>
    a.id === msg.agentId
      ? { ...a, skillId: msg.skill_id, skillName: msg.skill_name }
      : a
  ))
}

export function handleReviewCompleted(msg: any, setters: HandlerSetters) {
  const criticResult = msg.critic_result || {}
  const groundingResult = msg.grounding_result || {}
  const severity = criticResult.severity || 'unknown'
  const findingsCount = (criticResult.findings || []).length
  const grounded = groundingResult.grounded ?? false
  const sourcesCount = (groundingResult.sources || []).length
  addChatMsg(setters, 'agent',
    `审查完成 — 严重度: ${severity}，发现 ${findingsCount} 个问题；接地: ${grounded ? '是' : '否'}，${sourcesCount} 个来源`,
    { agentId: 'agent-reviewer', _msgSubtype: 'feedback' }
  )
}

// ── 工作流 handlers ──

export function handleWorkflowExecuted(msg: any, setters: HandlerSetters) {
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
  addChatMsg(setters, 'ceo', `工作流执行完成：${workflowStatus} (ID: ${workflowId})`, {
    agentId: 'agent-ceo', _workflowResult: workflowResult, _msgSubtype: 'workflow',
  })
  if (workflowResult.results && Object.keys(workflowResult.results).length > 0) {
    const resultSummary = Object.entries(workflowResult.results)
      .map(([nodeId, result]: [string, any]) => `- ${nodeId}: ${result?.result?.substring(0, 100) || '无结果'}...`)
      .join('\n')
    addChatMsg(setters, 'ceo', `工作流执行结果汇总:\n${resultSummary}`, {
      agentId: 'agent-ceo', _msgSubtype: 'workflow_summary',
    })
  }
}

export function handleWorkflowNodeStatusUpdate(msg: any, setters: HandlerSetters) {
  const nodeId = msg.node_id || ''
  const nodeStatus = msg.status || 'unknown'
  addChatMsg(setters, 'ceo', `工作流节点 ${nodeId} 状态: ${nodeStatus}`, {
    agentId: 'agent-ceo', _msgSubtype: 'workflow',
  })
  if (nodeId) {
    setters.setTasks(prev => prev.map(t =>
      t.id === nodeId ? { ...t, status: nodeStatus } : t
    ))
  }
}

export function handleWorkspaceCreated(msg: any, setters: HandlerSetters) {
  setters.setWorkspace({
    workspace_id: msg.workspace_id,
    task_id: msg.task_id || '',
    workspace_type: msg.workspace_type || 'git_worktree',
    root_path: msg.workspace_path,
    branch_name: msg.branch_name,
  })
}

export function handleToolResult(msg: any, setters: HandlerSetters) {
  setters.setToolCallLogs(prev => [...prev, {
    tool_name: msg.tool_name,
    arguments: msg.arguments || {},
    success: msg.success,
    output: msg.output,
    error: msg.error,
    timestamp: new Date().toISOString(),
  }])
}

// ── 投票 handlers ──

export function handleProposal(msg: any, setters: HandlerSetters) {
  const proposal = msg.proposal
  if (proposal) {
    setters.setActiveProposal({
      id: proposal.id,
      proposerId: proposal.proposerId,
      content: proposal.content,
      createdAt: proposal.createdAt,
    })
    setters.setVotes(() => new Map())
    setters.setVoteResults(null)
    addChatMsg(setters, 'agent', `[提案] ${proposal.content}`, {
      agentId: proposal.proposerId, _msgSubtype: 'proposal',
    })
  }
}

export function handleVote(msg: any, setters: HandlerSetters) {
  const vote = msg.vote
  if (vote) {
    setters.setVotes(prev => {
      const next = new Map(prev)
      next.set(vote.voterId, {
        voterId: vote.voterId,
        approve: vote.approve,
        reason: vote.reason,
      })
      return next
    })
    addChatMsg(setters, 'agent',
      `[投票] ${vote.approve ? '赞成' : '反对'}${vote.reason ? ': ' + vote.reason : ''}`,
      { agentId: vote.voterId, _msgSubtype: 'vote' }
    )
  }
}

export function handleVoteResult(msg: any, setters: HandlerSetters) {
  const result = msg.result
  if (result) {
    setters.setVoteResults({
      proposalId: result.proposalId,
      totalVotes: result.totalVotes,
      approveCount: result.approveCount,
      opposeCount: result.opposeCount,
      accepted: result.accepted,
    })
    setters.setActiveProposal(null)
    setters.setVotes(() => new Map())
    addChatMsg(setters, 'boss',
      `投票结果: ${result.accepted ? '通过' : '未通过'} (${result.approveCount}赞成 / ${result.opposeCount}反对，共${result.totalVotes}票)`,
      { _msgSubtype: 'vote_result' }
    )
  }
}

// ── 审批 handlers ──

export function handleHumanApprovalRequest(msg: any, setters: HandlerSetters) {
  const request = msg.request
  if (request) {
    setters.setPendingApprovals(prev => {
      const next = new Map(prev)
      next.set(request.id, {
        id: request.id,
        requesterId: request.requesterId,
        operation: request.operation,
        description: request.description,
        riskLevel: request.riskLevel,
        confidence: request.confidence,
        status: request.status,
        createdAt: request.createdAt,
        taskId: request.taskId,
        gateId: request.gateId,
        approver: request.approver,
        approverName: request.approverName,
      })
      return next
    })
    addChatMsg(setters, 'boss',
      `[审批请求] ${request.operation}: ${request.description} (风险: ${request.riskLevel})`,
      { _msgSubtype: 'feedback' }
    )
  }
}

export function handleHumanApprovalResponse(msg: any, setters: HandlerSetters) {
  const { requestId, approved, reason } = msg
  setters.setPendingApprovals(prev => {
    const next = new Map(prev)
    next.delete(requestId)
    return next
  })
  addChatMsg(setters, 'boss',
    `[审批结果] ${approved ? '已批准' : '已拒绝'}${reason ? ': ' + reason : ''}`,
    { _msgSubtype: 'feedback' }
  )
}

export function handlePendingApprovals(msg: any, setters: HandlerSetters) {
  const requests = msg.requests || []
  setters.setPendingApprovals(prev => {
    const next = new Map(prev)
    for (const req of requests) {
      next.set(req.id, {
        id: req.id,
        requesterId: req.requesterId,
        operation: req.operation,
        description: req.description,
        riskLevel: req.riskLevel,
        confidence: req.confidence,
        status: req.status,
        createdAt: req.createdAt,
        taskId: req.taskId,
        gateId: req.gateId,
        approver: req.approver,
        approverName: req.approverName,
      })
    }
    return next
  })
}

// ── 检查点 handlers ──

export function handleCheckpointSaved(msg: any, setters: HandlerSetters) {
  const cp = msg.checkpoint
  if (cp) {
    setters.setCheckpoints(prev => [...prev, {
      id: cp.id,
      taskId: cp.taskId,
      stepIndex: cp.stepIndex,
      createdAt: cp.createdAt,
    }])
    addChatMsg(setters, 'boss', `[检查点] 已保存: 任务 ${cp.taskId} 步骤 ${cp.stepIndex}`, {
      _msgSubtype: 'feedback',
    })
  }
}

export function handleCheckpointRestored(msg: any, setters: HandlerSetters) {
  setters.setRestoredState({
    checkpointId: msg.checkpointId,
    taskId: msg.taskId,
    stepIndex: msg.stepIndex,
    state: msg.state,
  })
  addChatMsg(setters, 'boss', `[检查点] 已恢复: 任务 ${msg.taskId} 步骤 ${msg.stepIndex}`, {
    _msgSubtype: 'feedback',
  })
}

export function handleCheckpointsList(msg: any, setters: HandlerSetters) {
  const cps = msg.checkpoints || []
  setters.setCheckpoints(cps.map((cp: any) => ({
    id: cp.id,
    taskId: cp.taskId,
    stepIndex: cp.stepIndex,
    createdAt: cp.createdAt,
  })))
}

export function handleCheckpointDeleted(msg: any, setters: HandlerSetters) {
  if (msg.success) {
    setters.setCheckpoints(prev => prev.filter(cp => cp.id !== msg.checkpointId))
  }
}

export function handleMeetingSnapshotSaved(msg: any, setters: HandlerSetters) {
  addChatMsg(setters, 'boss', `[快照] 会议快照已保存 (${msg.meetingId})`, { _msgSubtype: 'feedback' })
}

export function handleMeetingSnapshotRestored(msg: any, setters: HandlerSetters) {
  addChatMsg(setters, 'boss', `[快照] 已恢复 ${msg.tasksRestored} 个任务, ${msg.messagesRestored} 条消息`, {
    _msgSubtype: 'feedback',
  })
}

// ── 审计 handlers ──

export function handleAuditLog(msg: any, setters: HandlerSetters) {
  const entry = msg.entry
  if (entry) {
    setters.setAuditLog(prev => [...prev, {
      id: entry.id,
      agentId: entry.agentId,
      operation: entry.operation,
      target: entry.target,
      riskLevel: entry.riskLevel,
      allowed: entry.allowed,
      reason: entry.reason,
      timestamp: entry.timestamp,
    }])
  }
}

export function handleAuditLogList(msg: any, setters: HandlerSetters) {
  const entries = msg.entries || []
  setters.setAuditLog(entries.map((e: any) => ({
    id: e.id,
    agentId: e.agentId,
    operation: e.operation,
    target: e.target,
    riskLevel: e.riskLevel,
    allowed: e.allowed,
    reason: e.reason,
    timestamp: e.timestamp,
  })))
}

// ── Bridge handlers ──

export function handleBridgeAgentRegistered(msg: any, _setters: HandlerSetters, refs: HandlerRefs) {
  const regCallback = refs.bridgeCallbacks.current.get(`reg:${msg.tsAgentId}`)
  if (regCallback) {
    regCallback(msg)
    refs.bridgeCallbacks.current.delete(`reg:${msg.tsAgentId}`)
  }
}

export function handleBridgeMessage(msg: any, setters: HandlerSetters, refs: HandlerRefs) {
  const msgCallback = refs.bridgeCallbacks.current.get(`msg:${msg.toAgentId}`)
  if (msgCallback) {
    msgCallback(msg)
  }
  setters.setBridgeMessages(prev => [...prev, {
    fromAgentId: msg.fromAgentId,
    toAgentId: msg.toAgentId,
    payload: msg.payload,
    timestamp: Date.now(),
  }])
}

// ── 其他 handlers ──

export function handleCriticalBlocker(msg: any, setters: HandlerSetters) {
  addChatMsg(setters, 'boss',
    `[紧急阻塞] ${msg.agentId}: ${msg.content} (类型: ${msg.blockerType})`,
    { _msgSubtype: 'feedback' }
  )
}

// ── 消息分发器 ──

type Handler = (msg: any, setters: HandlerSetters, refs: HandlerRefs) => void

const HANDLER_REGISTRY: Record<string, Handler> = {
  meeting_started: handleMeetingStarted,
  agent_message: handleAgentMessage,
  task_assigned: handleTaskAssigned,
  task_deleted: handleTaskDeleted,
  agent_status_update: handleAgentStatusUpdate,
  meeting_ended: handleMeetingEnded,
  agenda_update: handleAgendaUpdate,
  meeting_error: handleMeetingError,
  semantic_analysis_result: handleSemanticAnalysisResult,
  task_auto_assigned: handleTaskAutoAssigned,
  structured_feedback: handleStructuredFeedback,
  iteration_update: handleIterationUpdate,
  experience_injected: handleExperienceInjected,
  skill_mounted: handleSkillMounted,
  review_completed: handleReviewCompleted,
  workflow_executed: handleWorkflowExecuted,
  workflow_node_status_update: handleWorkflowNodeStatusUpdate,
  workspace_created: handleWorkspaceCreated,
  tool_result: handleToolResult,
  proposal: handleProposal,
  vote: handleVote,
  vote_result: handleVoteResult,
  human_approval_request: handleHumanApprovalRequest,
  human_approval_response: handleHumanApprovalResponse,
  pending_approvals: handlePendingApprovals,
  checkpoint_saved: handleCheckpointSaved,
  checkpoint_restored: handleCheckpointRestored,
  checkpoints_list: handleCheckpointsList,
  checkpoint_deleted: handleCheckpointDeleted,
  meeting_snapshot_saved: handleMeetingSnapshotSaved,
  meeting_snapshot_restored: handleMeetingSnapshotRestored,
  critical_blocker: handleCriticalBlocker,
  audit_log: handleAuditLog,
  audit_log_list: handleAuditLogList,
  bridge_agent_registered: handleBridgeAgentRegistered,
  bridge_message: handleBridgeMessage,
}

export function dispatchMessage(
  msgType: string,
  msg: any,
  setters: HandlerSetters,
  refs: HandlerRefs,
): boolean {
  const handler = HANDLER_REGISTRY[msgType]
  if (handler) {
    handler(msg, setters, refs)
    return true
  }
  return false
}
