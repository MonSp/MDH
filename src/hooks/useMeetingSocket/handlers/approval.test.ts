import { describe, it, expect, vi } from 'vitest'
import { handleHumanApprovalRequest, handleHumanApprovalResponse, handlePendingApprovals } from './approval'
import type { ApprovalSetters } from './approval'

function makeSetters(): ApprovalSetters {
  return {
    setChatMessages: vi.fn(fn => fn([])),
    setPendingApprovals: vi.fn(fn => fn(new Map())),
  }
}

describe('approval handlers', () => {
  describe('handleHumanApprovalRequest', () => {
    it('adds approval request and chat message', () => {
      const setters = makeSetters()
      handleHumanApprovalRequest({
        request: {
          id: 'req-1', requesterId: 'agent-1', operation: 'bash',
          description: 'rm -rf /tmp', riskLevel: 'high', confidence: 0.9,
          status: 'pending', createdAt: '2026-01-01',
        },
      }, setters)

      expect(setters.setPendingApprovals).toHaveBeenCalled()
      const fn = (setters.setPendingApprovals as any).mock.calls[0][0]
      const map = fn(new Map())
      expect(map.get('req-1')).toBeDefined()
      expect(map.get('req-1').operation).toBe('bash')
    })

    it('ignores msg without request', () => {
      const setters = makeSetters()
      handleHumanApprovalRequest({}, setters)
      expect(setters.setPendingApprovals).not.toHaveBeenCalled()
    })
  })

  describe('handleHumanApprovalResponse', () => {
    it('removes approval and adds chat message', () => {
      const setters = makeSetters()
      const existingMap = new Map([['req-1', { id: 'req-1' }]])
      ;(setters.setPendingApprovals as any).mockImplementation((fn: any) => fn(existingMap))

      handleHumanApprovalResponse({ requestId: 'req-1', approved: true, reason: '安全' }, setters)

      expect(setters.setPendingApprovals).toHaveBeenCalled()
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handlePendingApprovals', () => {
    it('replaces all pending approvals', () => {
      const setters = makeSetters()
      handlePendingApprovals({
        requests: [
          { id: 'req-1', requesterId: 'a1', operation: 'bash', description: 'test' },
          { id: 'req-2', requesterId: 'a2', operation: 'git_push', description: 'push' },
        ],
      }, setters)

      const fn = (setters.setPendingApprovals as any).mock.calls[0][0]
      const map = fn(new Map())
      expect(map.size).toBe(2)
      expect(map.has('req-1')).toBe(true)
      expect(map.has('req-2')).toBe(true)
    })

    it('handles empty requests', () => {
      const setters = makeSetters()
      handlePendingApprovals({}, setters)
      const fn = (setters.setPendingApprovals as any).mock.calls[0][0]
      const map = fn(new Map())
      expect(map.size).toBe(0)
    })
  })
})
