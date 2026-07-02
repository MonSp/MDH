import { describe, it, expect } from 'vitest'
import { ReferenceType, ReferenceStatus } from '../agentReferenceSystem'

describe('agentReferenceSystem', () => {
  it('should have reference types', () => {
    expect(ReferenceType.DirectMention).toBe('direct_mention')
    expect(ReferenceType.Quote).toBe('quote')
    expect(ReferenceType.Response).toBe('response')
    expect(ReferenceType.Collaboration).toBe('collaboration')
    expect(ReferenceType.Delegation).toBe('delegation')
    expect(ReferenceType.Feedback).toBe('feedback')
  })

  it('should have reference statuses', () => {
    expect(ReferenceStatus.Pending).toBe('pending')
    expect(ReferenceStatus.Acknowledged).toBe('acknowledged')
    expect(ReferenceStatus.Accepted).toBe('accepted')
    expect(ReferenceStatus.Rejected).toBe('rejected')
    expect(ReferenceStatus.Completed).toBe('completed')
  })
})
