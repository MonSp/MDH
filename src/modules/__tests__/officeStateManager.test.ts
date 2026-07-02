import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OfficeStateManager } from '../officeStateManager'

describe('OfficeStateManager', () => {
  let manager: InstanceType<typeof OfficeStateManager>

  beforeEach(() => {
    vi.useFakeTimers()
    // Reset singleton
    ;(OfficeStateManager as any).instance = null
    manager = OfficeStateManager.getInstance()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    ;(OfficeStateManager as any).instance = null
  })

  it('should be a singleton', () => {
    const a = OfficeStateManager.getInstance()
    const b = OfficeStateManager.getInstance()
    expect(a).toBe(b)
  })

  it('should initialize with empty state', () => {
    const state = manager.getState()
    expect(state.agents.size).toBe(0)
    expect(state.workstations.size).toBe(0)
    expect(state.workflowPhase).toBe('idle')
  })

  it('should add agent', () => {
    manager.addAgent({
      id: 'agent-1',
      name: 'CEO',
      role: 'ceo' as any,
      position: { x: 100, y: 200 },
      targetPosition: null,
      status: 'idle',
      workstationId: null,
      currentTask: null,
    })

    const state = manager.getState()
    expect(state.agents.size).toBe(1)
    expect(state.agents.get('agent-1')?.name).toBe('CEO')
  })

  it('should update agent position', () => {
    manager.addAgent({
      id: 'agent-1', name: 'CEO', role: 'ceo' as any,
      position: { x: 0, y: 0 }, targetPosition: null,
      status: 'idle', workstationId: null, currentTask: null,
    })

    manager.updateAgentPosition('agent-1', { x: 100, y: 200 })

    const agent = manager.getState().agents.get('agent-1')
    expect(agent?.position).toEqual({ x: 100, y: 200 })
  })

  it('should update workflow phase with valid transition', () => {
    manager.setWorkflowPhase('meeting')
    expect(manager.getState().workflowPhase).toBe('meeting')

    // Try assigning (valid transition from meeting)
    manager.setWorkflowPhase('assigning')
    expect(manager.getState().workflowPhase).toBe('assigning')
  })

  it('should notify subscribers on state change', () => {
    const callback = vi.fn()
    const unsub = manager.subscribe(callback)

    manager.setWorkflowPhase('meeting')

    expect(callback).toHaveBeenCalled()
    unsub()
  })

  it('should unsubscribe correctly', () => {
    const callback = vi.fn()
    const unsub = manager.subscribe(callback)

    unsub()
    manager.setWorkflowPhase('meeting')

    expect(callback).not.toHaveBeenCalled()
  })

  it('should add workstation', () => {
    manager.addWorkstation({
      workstationId: 'ws-1',
      agentId: null,
      status: 'idle',
    })

    expect(manager.getState().workstations.size).toBe(1)
  })

  it('should bind workstation to agent', () => {
    manager.addAgent({
      id: 'agent-1', name: 'CEO', role: 'ceo' as any,
      position: { x: 0, y: 0 }, targetPosition: null,
      status: 'idle', workstationId: null, currentTask: null,
    })
    manager.addWorkstation('ws-1')

    const result = manager.bindWorkstation('ws-1', 'agent-1')

    expect(result).toBe(true)
    const ws = manager.getState().workstations.get('ws-1')
    expect(ws?.agentId).toBe('agent-1')
    expect(ws?.status).toBe('busy')
  })
})
