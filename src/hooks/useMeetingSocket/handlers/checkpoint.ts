/**
 * 检查点相关消息处理器
 */

import type { ChatMessage } from '../../components/office-team/types'

export interface CheckpointMessage {
  checkpoint?: { id: string; taskId: string; stepIndex: number; createdAt: string }
  checkpointId?: string
  taskId?: string
  stepIndex?: number
  state?: unknown
  checkpoints?: Array<{ id: string; taskId: string; stepIndex: number; createdAt: string }>
  success?: boolean
  meetingId?: string
  tasksRestored?: number
  messagesRestored?: number
  entry?: { id: string; agentId: string; operation: string; target: string; riskLevel: string; allowed: boolean; reason: string; timestamp: string }
  entries?: Array<{ id: string; agentId: string; operation: string; target: string; riskLevel: string; allowed: boolean; reason: string; timestamp: string }>
}

export interface CheckpointSetters {
  setChatMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void
  setCheckpoints: (fn: (prev: unknown[]) => unknown[]) => void
  setRestoredState: (s: unknown) => void
}

export function handleCheckpointSaved(msg: CheckpointMessage, setters: CheckpointSetters) {
  const cp = msg.checkpoint
  if (cp) {
    setters.setCheckpoints(prev => [...prev, {
      id: cp.id,
      taskId: cp.taskId,
      stepIndex: cp.stepIndex,
      createdAt: cp.createdAt,
    }])
    setters.setChatMessages(prev => [...prev, {
      role: 'boss' as const,
      content: `[检查点] 已保存: 任务 ${cp.taskId} 步骤 ${cp.stepIndex}`,
      timestamp: Date.now(),
      _msgSubtype: 'feedback',
    }])
  }
}

export function handleCheckpointRestored(msg: CheckpointMessage, setters: CheckpointSetters) {
  setters.setRestoredState({
    checkpointId: msg.checkpointId,
    taskId: msg.taskId,
    stepIndex: msg.stepIndex,
    state: msg.state,
  })
  setters.setChatMessages(prev => [...prev, {
    role: 'boss' as const,
    content: `[检查点] 已恢复: 任务 ${msg.taskId} 步骤 ${msg.stepIndex}`,
    timestamp: Date.now(),
    _msgSubtype: 'feedback',
  }])
}

export function handleCheckpointsList(msg: CheckpointMessage, setters: CheckpointSetters) {
  const cps = msg.checkpoints || []
  setters.setCheckpoints(cps.map((cp: Record<string, unknown>) => ({
    id: cp.id,
    taskId: cp.taskId,
    stepIndex: cp.stepIndex,
    createdAt: cp.createdAt,
  })))
}

export function handleCheckpointDeleted(msg: CheckpointMessage, setters: CheckpointSetters) {
  if (msg.success) {
    setters.setCheckpoints(prev => prev.filter(cp => cp.id !== msg.checkpointId))
  }
}

export function handleMeetingSnapshotSaved(msg: CheckpointMessage, setters: CheckpointSetters) {
  setters.setChatMessages(prev => [...prev, {
    role: 'boss' as const,
    content: `[快照] 会议快照已保存 (${msg.meetingId})`,
    timestamp: Date.now(),
    _msgSubtype: 'feedback',
  }])
}

export function handleMeetingSnapshotRestored(msg: CheckpointMessage, setters: CheckpointSetters) {
  setters.setChatMessages(prev => [...prev, {
    role: 'boss' as const,
    content: `[快照] 已恢复 ${msg.tasksRestored} 个任务, ${msg.messagesRestored} 条消息`,
    timestamp: Date.now(),
    _msgSubtype: 'feedback',
  }])
}

export function handleAuditLog(msg: CheckpointMessage, setters: CheckpointSetters) {
  const entry = msg.entry
  if (entry) {
    setters.setCheckpoints(prev => [...prev, {
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

export function handleAuditLogList(msg: CheckpointMessage, setters: CheckpointSetters) {
  const entries = msg.entries || []
  setters.setCheckpoints(entries.map((e: Record<string, unknown>) => ({
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
