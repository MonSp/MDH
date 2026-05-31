import type { ApprovalRequestInfo, ApprovalStatus } from './meetingProtocol'

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

  constructor(defaultTimeoutMs = 5 * 60 * 1000) {
    this.queue = []
    this.processedHistory = []
    this.defaultTimeoutMs = defaultTimeoutMs
    this.listeners = []
    this.checkTimer = null
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

    const insertIndex = this.queue.findIndex(q => q.priority < priority)
    if (insertIndex === -1) {
      this.queue.push(item)
    } else {
      this.queue.splice(insertIndex, 0, item)
    }

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
        this.processedHistory.push({
          request: { ...item.request, status: 'expired' },
          status: 'expired',
          resolvedAt: now,
        })
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
    this.stopAutoExpiryCheck()
  }
}
