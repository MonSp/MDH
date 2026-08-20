/**
 * 审批相关消息处理器
 */

import type { ChatMessage } from '../../components/office-team/types'

export interface ApprovalMessage {
  request?: { id: string; requesterId: string; operation: string; description: string; riskLevel: string; confidence: number; status: string; createdAt: string; taskId?: string; gateId?: string; approver?: string; approverName?: string }
  requestId?: string
  approved?: boolean
  reason?: string
  requests?: Array<{ id: string; requesterId: string; operation: string; description: string; riskLevel: string; confidence: number; status: string; createdAt: string; taskId?: string; gateId?: string; approver?: string; approverName?: string }>
}

export interface ApprovalSetters {
  setChatMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void
  setPendingApprovals: (fn: (prev: Map<string, ApprovalMessage['request']>) => Map<string, ApprovalMessage['request']>) => void
}

export function handleHumanApprovalRequest(msg: ApprovalMessage, setters: ApprovalSetters) {
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
    setters.setChatMessages(prev => [...prev, {
      role: 'boss' as const,
      content: `[审批请求] ${request.operation}: ${request.description} (风险: ${request.riskLevel})`,
      timestamp: Date.now(),
      _msgSubtype: 'feedback',
    }])
  }
}

export function handleHumanApprovalResponse(msg: ApprovalMessage, setters: ApprovalSetters) {
  const { requestId, approved, reason } = msg
  setters.setPendingApprovals(prev => {
    const next = new Map(prev)
    next.delete(requestId)
    return next
  })
  setters.setChatMessages(prev => [...prev, {
    role: 'boss' as const,
    content: `[审批结果] ${approved ? '已批准' : '已拒绝'}${reason ? ': ' + reason : ''}`,
    timestamp: Date.now(),
    _msgSubtype: 'feedback',
  }])
}

export function handlePendingApprovals(msg: ApprovalMessage, setters: ApprovalSetters) {
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
