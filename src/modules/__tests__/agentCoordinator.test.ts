import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentCoordinator } from '../agentCoordinator'
import { AgentRegistry } from '../agentRegistry'
import { CommunicationBus } from '../communicationBus'
import { TaskAssigner } from '../taskAssigner'

describe('AgentCoordinator', () => {
  let coordinator: InstanceType<typeof AgentCoordinator>
  let registry: InstanceType<typeof AgentRegistry>
  let bus: InstanceType<typeof CommunicationBus>
  let assigner: InstanceType<typeof TaskAssigner>

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new AgentRegistry()
    bus = new CommunicationBus()
    assigner = new TaskAssigner(registry, bus)
    coordinator = new AgentCoordinator({}, { registry, communicationBus: bus, taskAssigner: assigner })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should initialize with default config', () => {
    expect(coordinator).toBeDefined()
    const state = coordinator.getCoordinatorState()
    expect(state.isRunning).toBe(false)
    expect(state.activeAgents).toBe(0)
  })

  it('should get coordinator state', () => {
    const state = coordinator.getCoordinatorState()
    expect(state).toBeDefined()
    expect(typeof state.isRunning).toBe('boolean')
    expect(typeof state.activeAgents).toBe('number')
    expect(typeof state.pendingTasks).toBe('number')
    expect(typeof state.completedTasks).toBe('number')
    expect(typeof state.failedTasks).toBe('number')
  })
})
