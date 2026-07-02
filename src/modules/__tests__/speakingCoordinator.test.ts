import { describe, it, expect } from 'vitest'
import {
  SpeakingStrategy,
  SpeakingState,
} from '../speakingCoordinator'

describe('speakingCoordinator', () => {
  it('should have speaking strategies', () => {
    expect(SpeakingStrategy.RoundRobin).toBe('round_robin')
    expect(SpeakingStrategy.Priority).toBe('priority')
    expect(SpeakingStrategy.RoleBased).toBe('role_based')
    expect(SpeakingStrategy.Dynamic).toBe('dynamic')
  })

  it('should have speaking states', () => {
    expect(SpeakingState.Idle).toBe('idle')
    expect(SpeakingState.Waiting).toBe('waiting')
    expect(SpeakingState.Speaking).toBe('speaking')
    expect(SpeakingState.Finished).toBe('finished')
  })
})
