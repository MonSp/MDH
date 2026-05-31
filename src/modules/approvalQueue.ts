import type { ApprovalRequestInfo, ApprovalStatus } from './meetingProtocol'
import { configManager } from './configSchema'
import type { CollaborationConfig } from './configSchema'

export type EscalationStrategy = 'reject' | 'escalate' | 'auto_approve'

export interface ApprovalQueueConfig {
  defaultTimeoutMs?: number
  escalationStrategy?: EscalationStrategy
  priorityEscalationThreshold?: number
  maxBatchSize?: number
}

export interface ApprovalQueueItem {
  request: ApprovalRequestInfo
  addedAt: number
  expiresAt: number | null
  priority: number
}

export class ApprovalQueue {
  private queue: ApprovalQueueItem[]
  private processedHistory: Array<{ request: ApprovalRequestInfo; status: ApprovalStatus; resolvedAt: number }>
  private defaultTimeoutMs: number
  private listeners: ((item: ApprovalQueueItem) => void)[]
  private checkTimer: ReturnType<typeof setInterval> | null
  private escalationStrategy: EscalationStrategy
  private priorityEscalationThreshold: number
  private maxBatchSize: number
  private escalatedIds: Set<string>
  private configListener: (config: CollaborationConfig) => void

  constructor(config: ApprovalQueueConfig = {}) {
    const approvalConfig = configManager.getConfig().approval
    this.queue = []
    this.processedHistory = []
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? approvalConfig.defaultTimeoutMs
    this.listeners = []
    this.checkTimer = null
    this.escalationStrategy = config.escalationStrategy ?? approvalConfig.escalationStrategy
    this.priorityEscalationThreshold = config.priorityEscalationThreshold ?? approvalConfig.priorityEscalationThreshold
    this.maxBatchSize = config.maxBatchSize ?? approvalConfig.maxBatchSize
    this.escalatedIds = new Set()

    this.configListener = (cfg: CollaborationConfig) => {
      this.defaultTimeoutMs = cfg.approval.defaultTimeoutMs
      this.escalationStrategy = cfg.approval.escalationStrategy
      this.priorityEscalationThreshold = cfg.approval.priorityEscalationThreshold
      this.maxBatchSize = cfg.approval.maxBatchSize
    }
    configManager.addListener(this.configListener)
  }

  addRequest(request: ApprovalRequestInfo, priority = 0, timeoutMs?: number): void {
    const now = Date.now()
    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs
    const item: ApprovalQueueItem = {
      request,
      addedAt: now,
      expiresAt: effectiveTimeout > 0 ? now + effectiveTimeout : null,
      priority,
    }

    this.queue.push(item)
    this.sortQueue()

    for (const listener of this.listeners) {
      listener(item)
    }
  }

  getNextRequest(): ApprovalQueueItem | null {
    return this.queue.length > 0 ? this.queue[0] : null
  }

  getRequest(requestId: string): ApprovalQueueItem | null {
    return this.queue.find(item => item.request.id === requestId) || null
  }

  approveRequest(requestId: string, reason?: string): boolean {
    const index = this.queue.findIndex(item => item.request.id === requestId)
    if (index === -1) return false

    const item = this.queue.splice(index, 1)[0]
    this.processedHistory.push({
      request: { ...item.request, status: 'approved' },
      status: 'approved',
      resolvedAt: Date.now(),
    })
    return true
  }

  rejectRequest(requestId: string, reason?: string): boolean {
    const index = this.queue.findIndex(item => item.request.id === requestId)
    if (index === -1) return false

    const item = this.queue.splice(index, 1)[0]
    this.processedHistory.push({
      request: { ...item.request, status: 'rejected' },
      status: 'rejected',
      resolvedAt: Date.now(),
    })
    return true
  }

  getPendingCount(): number {
    return this.queue.length
  }

  getPendingRequests(): ApprovalQueueItem[] {
    return [...this.queue]
  }

  getProcessedHistory(): typeof this.processedHistory {
    return [...this.processedHistory]
  }

  addListener(listener: (item: ApprovalQueueItem) => void): void {
    this.listeners.push(listener)
  }

  removeListener(listener: (item: ApprovalQueueItem) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index !== -1) {
      this.listeners.splice(index, 1)
    }
  }

  escalateRequest(requestId: string): boolean {
    const index = this.queue.findIndex(item => item.request.id === requestId)
    if (index === -1) return false

    const item = this.queue[index]
    this.escalatedIds.add(requestId)
    item.priority += 1
    item.expiresAt = null

    this.sortQueue()
    return true
  }

  batchApprove(requestIds: string[], reason?: string): { succeeded: string[]; failed: string[] } {
    const succeeded: string[] = []
    const failed: string[] = []
    const ids = requestIds.slice(0, this.maxBatchSize)

    for (const requestId of ids) {
      if (this.approveRequest(requestId, reason)) {
        succeeded.push(requestId)
      } else {
        failed.push(requestId)
      }
    }

    return { succeeded, failed }
  }

  batchReject(requestIds: string[], reason?: string): { succeeded: string[]; failed: string[] } {
    const succeeded: string[] = []
    const failed: string[] = []
    const ids = requestIds.slice(0, this.maxBatchSize)

    for (const requestId of ids) {
      if (this.rejectRequest(requestId, reason)) {
        succeeded.push(requestId)
      } else {
        failed.push(requestId)
      }
    }

    return { succeeded, failed }
  }

  getAverageWaitTime(): number {
    if (this.processedHistory.length === 0) return 0

    let totalWaitTime = 0
    let count = 0

    for (const entry of this.processedHistory) {
      totalWaitTime += entry.resolvedAt - entry.request.createdAt
      count++
    }

    return totalWaitTime / count
  }

  startAutoExpiryCheck(intervalMs = 30000): void {
    this.stopAutoExpiryCheck()
    this.checkTimer = setInterval(() => {
      const now = Date.now()
      const expired: ApprovalQueueItem[] = []
      this.queue = this.queue.filter(item => {
        if (item.expiresAt !== null && item.expiresAt <= now) {
          expired.push(item)
          return false
        }
        return true
      })
      for (const item of expired) {
        if (this.escalationStrategy === 'reject') {
          this.processedHistory.push({
            request: { ...item.request, status: 'rejected' },
            status: 'rejected',
            resolvedAt: now,
          })
        } else if (this.escalationStrategy === 'escalate') {
          this.escalatedIds.add(item.request.id)
          item.priority += 1
          item.expiresAt = null
          this.queue.push(item)
        } else if (this.escalationStrategy === 'auto_approve') {
          this.processedHistory.push({
            request: { ...item.request, status: 'approved' },
            status: 'approved',
            resolvedAt: now,
          })
        }
      }
      let needsSort = false
      for (const item of this.queue) {
        const waitTime = now - item.addedAt
        if (waitTime > this.priorityEscalationThreshold && !this.escalatedIds.has(item.request.id)) {
          item.priority += 1
          this.escalatedIds.add(item.request.id)
          needsSort = true
        }
      }
      if (needsSort) {
        this.sortQueue()
      }
    }, intervalMs)
  }

  stopAutoExpiryCheck(): void {
    if (this.checkTimer !== null) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
  }

  clear(): void {
    this.queue = []
    this.processedHistory = []
    this.escalatedIds.clear()
    this.stopAutoExpiryCheck()
  }

  destroy(): void {
    this.clear()
    configManager.removeListener(this.configListener)
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority)
  }
}
