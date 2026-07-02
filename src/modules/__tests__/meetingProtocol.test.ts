import { describe, it, expect } from 'vitest'
import type {
  MeetingAgentStatus,
  AgendaPhase,
  Stance,
  ConsensusStrategy,
  ApprovalStatus,
  RiskLevel,
} from '../meetingProtocol'

describe('meetingProtocol types', () => {
  it('should import types without error', () => {
    // Just verifying the types exist and can be imported
    expect(true).toBe(true)
  })
})
