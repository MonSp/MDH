import { describe, it, expect } from 'vitest'
import {
  CollaborationMode,
  SessionStatus,
} from '../collaborationState'

describe('collaborationState', () => {
  it('should have collaboration modes', () => {
    expect(CollaborationMode.Sequential).toBe('sequential')
    expect(CollaborationMode.Parallel).toBe('parallel')
    expect(CollaborationMode.Hierarchical).toBe('hierarchical')
    expect(CollaborationMode.Adaptive).toBe('adaptive')
  })

  it('should have session statuses', () => {
    expect(SessionStatus.Initializing).toBe('initializing')
    expect(SessionStatus.Planning).toBe('planning')
    expect(SessionStatus.Executing).toBe('executing')
    expect(SessionStatus.Completed).toBe('completed')
    expect(SessionStatus.Failed).toBe('failed')
  })
})
