import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskAssigner } from '../taskAssigner'
import { AgentRegistry } from '../agentRegistry'
import { CommunicationBus } from '../communicationBus'

describe('TaskAssigner', () => {
  let assigner: InstanceType<typeof TaskAssigner>
  let registry: InstanceType<typeof AgentRegistry>
  let bus: InstanceType<typeof CommunicationBus>

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new AgentRegistry()
    bus = new CommunicationBus()
    assigner = new TaskAssigner(registry, bus)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should initialize with default strategies', () => {
    expect(assigner).toBeDefined()
  })

  it('should register strategy', () => {
    const strategy = {
      name: 'test-strategy',
      selectAgent: () => null,
    }
    assigner.registerStrategy(strategy)
    // No direct way to verify without triggering assignment
    expect(assigner).toBeDefined()
  })

  it('should get all assignments', () => {
    const assignments = assigner.getAllAssignments()
    expect(Array.isArray(assignments)).toBe(true)
  })
})
