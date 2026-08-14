import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ApprovalPanel from './ApprovalPanel'

describe('ApprovalPanel gate context', () => {
  it('展示 gate 把关人、任务与把关点', () => {
    const pending = new Map([['req-1', {
      id: 'req-1', requesterId: 'agent-minutes', operation: 'node_gate',
      description: '纪要待确认', riskLevel: 'medium', confidence: 0.8,
      createdAt: 123, status: 'pending',
      taskId: 'draft', gateId: 'draft:review', approver: 'emp-1',
    }]])
    const { container, unmount } = render(
      <ApprovalPanel pendingApprovals={pending} onApprove={() => {}} onReject={() => {}} />
    )
    expect(container.textContent).toContain('emp-1')
    expect(container.textContent).toContain('draft')
    expect(container.textContent).toContain('draft:review')
    unmount()
  })

  it('无 approver（undefined 或空串）时显示系统把关', () => {
    for (const approver of [undefined, '']) {
      const pending = new Map([['req-x', {
        id: 'req-x', requesterId: 'a', operation: 'op', description: 'd',
        riskLevel: 'low', confidence: 0.5, createdAt: 1,
        ...(approver !== undefined ? { approver } : {}),
      }]])
      const { container, unmount } = render(
        <ApprovalPanel pendingApprovals={pending} onApprove={() => {}} onReject={() => {}} />
      )
      expect(container.textContent).toContain('系统把关')
      unmount()
    }
  })
})
