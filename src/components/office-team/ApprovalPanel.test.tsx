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

  it('shows resolved approver name with fallback chain', () => {
    // ① approverName 有值 → 显示名字
    const named = new Map([['req-name', {
      id: 'req-name', requesterId: 'a', operation: 'op', description: 'd',
      riskLevel: 'low', confidence: 0.5, createdAt: 1,
      approver: 'emp-001', approverName: '张伟',
    }]])
    const { container, unmount } = render(
      <ApprovalPanel pendingApprovals={named} onApprove={() => {}} onReject={() => {}} />
    )
    expect(container.textContent).toContain('由 张伟 把关')
    expect(container.textContent).not.toContain('emp-001')
    unmount()

    // ② approverName 空 + approver 有值 → 显示 approver
    const raw = new Map([['req-raw', {
      id: 'req-raw', requesterId: 'a', operation: 'op', description: 'd',
      riskLevel: 'low', confidence: 0.5, createdAt: 1,
      approver: 'emp-9', approverName: '',
    }]])
    const { container: c2, unmount: u2 } = render(
      <ApprovalPanel pendingApprovals={raw} onApprove={() => {}} onReject={() => {}} />
    )
    expect(c2.textContent).toContain('由 emp-9 把关')
    u2()

    // ③ 两者空 → 系统把关
    const sys = new Map([['req-sys', {
      id: 'req-sys', requesterId: 'a', operation: 'op', description: 'd',
      riskLevel: 'low', confidence: 0.5, createdAt: 1,
      approver: '', approverName: '',
    }]])
    const { container: c3, unmount: u3 } = render(
      <ApprovalPanel pendingApprovals={sys} onApprove={() => {}} onReject={() => {}} />
    )
    expect(c3.textContent).toContain('系统把关')
    u3()
  })
})
