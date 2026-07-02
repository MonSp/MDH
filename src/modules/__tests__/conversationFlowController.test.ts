import { describe, it, expect } from 'vitest'
import {
  ConversationPhase,
  FlowControlAction,
} from '../conversationFlowController'

describe('conversationFlowController', () => {
  it('should have conversation phases', () => {
    expect(ConversationPhase.Initialization).toBe('initialization')
    expect(ConversationPhase.Discussion).toBe('discussion')
    expect(ConversationPhase.Decision).toBe('decision')
    expect(ConversationPhase.Conclusion).toBe('conclusion')
  })

  it('should have flow control actions', () => {
    expect(FlowControlAction.Start).toBe('start')
    expect(FlowControlAction.Pause).toBe('pause')
    expect(FlowControlAction.Resume).toBe('resume')
    expect(FlowControlAction.NextPhase).toBe('next_phase')
    expect(FlowControlAction.End).toBe('end')
  })
})
