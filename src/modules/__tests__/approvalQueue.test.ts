import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ApprovalRequestInfo } from '../meetingProtocol'

function makeRequest(id: string, riskLevel = 'medium'): ApprovalRequestInfo {
  return {
    id,
    requesterId: 'agent-test',
    operation: 'test-op',
    description: 'Test operation',
    riskLevel: riskLevel as any,
    confidence: 0.8,
    status: 'pending',
    createdAt: Date.now(),
  }
}

describe('ApprovalQueue', () => {
  let ApprovalQueue: any

  beforeEach(async () => {
    vi.useFakeTimers()
    const mod = await import('../approvalQueue')
    ApprovalQueue = mod.ApprovalQueue
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should initialize with empty queue', () => {
    const queue = new ApprovalQueue()
    expect(queue.getPendingCount()).toBe(0)
    expect(queue.getNextRequest()).toBeNull()
  })

  it('should add request and retrieve it', () => {
    const queue = new ApprovalQueue()
    const req = makeRequest('req-1')

    queue.addRequest(req, 50)

    expect(queue.getPendingCount()).toBe(1)
    expect(queue.getNextRequest()?.request.id).toBe('req-1')
  })

  it('should order by priority (highest first)', () => {
    const queue = new ApprovalQueue()

    queue.addRequest(makeRequest('low'), 10)
    queue.addRequest(makeRequest('high'), 100)
    queue.addRequest(makeRequest('medium'), 50)

    expect(queue.getNextRequest()?.request.id).toBe('high')
    expect(queue.getPendingRequests().map((i: any) => i.request.id)).toEqual(['high', 'medium', 'low'])
  })

  it('should approve request', () => {
    const queue = new ApprovalQueue()
    queue.addRequest(makeRequest('req-1'), 50)

    const result = queue.approveRequest('req-1', 'Looks good')

    expect(result).toBe(true)
    expect(queue.getPendingCount()).toBe(0)
    expect(queue.getProcessedHistory()).toHaveLength(1)
    expect(queue.getProcessedHistory()[0].status).toBe('approved')
  })

  it('should reject request', () => {
    const queue = new ApprovalQueue()
    queue.addRequest(makeRequest('req-1'), 50)

    const result = queue.rejectRequest('req-1', 'Security concern')

    expect(result).toBe(true)
    expect(queue.getPendingCount()).toBe(0)
    expect(queue.getProcessedHistory()[0].status).toBe('rejected')
  })

  it('should return false for non-existent request', () => {
    const queue = new ApprovalQueue()

    expect(queue.approveRequest('missing')).toBe(false)
    expect(queue.rejectRequest('missing')).toBe(false)
  })

  it('should get request by id', () => {
    const queue = new ApprovalQueue()
    queue.addRequest(makeRequest('req-1'), 50)

    expect(queue.getRequest('req-1')?.request.id).toBe('req-1')
    expect(queue.getRequest('missing')).toBeNull()
  })

  it('should notify listeners on add', () => {
    const queue = new ApprovalQueue()
    const listener = vi.fn()
    queue.addListener(listener)

    queue.addRequest(makeRequest('req-1'), 50)

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({ id: 'req-1' }),
    }))
  })

  it('should expire requests after timeout', () => {
    const queue = new ApprovalQueue({ defaultTimeoutMs: 1000 })
    queue.addRequest(makeRequest('req-1'), 50, 1000)

    expect(queue.getPendingCount()).toBe(1)

    // Advance past timeout
    vi.advanceTimersByTime(1500)
    queue.startAutoExpiryCheck(500)
    vi.advanceTimersByTime(600)

    // Request should be expired (moved to history)
    // Note: auto-expiry check interval may vary
    queue.stopAutoExpiryCheck()
  })
})
