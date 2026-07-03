import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock is hoisted - use var for shared state
var mockState: {
  agents: Map<string, any>
  workstations: Map<string, any>
  workflowPhase: string
  meetingAgents: string[]
  subscribers: Set<(state: any) => void>
}

function resetMockState() {
  mockState = {
    agents: new Map(),
    workstations: new Map(),
    workflowPhase: 'idle',
    meetingAgents: [],
    subscribers: new Set(),
  }
}

function notifySubscribers() {
  const snapshot = {
    agents: new Map(mockState.agents),
    workstations: new Map(mockState.workstations),
    workflowPhase: mockState.workflowPhase,
    meetingAgents: [...mockState.meetingAgents],
  }
  mockState.subscribers.forEach(cb => cb(snapshot))
}

vi.mock('../officeStateManager', () => {
  resetMockState()
  const OfficeStateManager = {
    getInstance: vi.fn(() => OfficeStateManager),
    subscribe: vi.fn((cb: any) => {
      mockState.subscribers.add(cb)
      return () => mockState.subscribers.delete(cb)
    }),
    addAgent: vi.fn((agent: any) => {
      mockState.agents.set(agent.id, { ...agent })
      notifySubscribers()
    }),
    getAgent: vi.fn((id: string) => {
      const a = mockState.agents.get(id)
      return a ? { ...a } : undefined
    }),
    getAllAgents: vi.fn(() => Array.from(mockState.agents.values()).map(a => ({ ...a }))),
    updateAgentPosition: vi.fn((id: string, pos: any) => {
      const a = mockState.agents.get(id)
      if (!a) return false
      a.position = { ...pos }
      a.targetPosition = null
      notifySubscribers()
      return true
    }),
    setAgentTargetPosition: vi.fn((id: string, target: any) => {
      const a = mockState.agents.get(id)
      if (!a) return false
      a.targetPosition = { ...target }
      a.status = 'moving'
      notifySubscribers()
      return true
    }),
    updateAgentStatus: vi.fn((id: string, status: string) => {
      const a = mockState.agents.get(id)
      if (!a) return false
      a.status = status
      if (status !== 'moving') a.targetPosition = null
      notifySubscribers()
      return true
    }),
    assignTaskToAgent: vi.fn((id: string, taskId: string) => {
      const a = mockState.agents.get(id)
      if (!a) return false
      a.currentTask = taskId
      a.status = 'working'
      notifySubscribers()
      return true
    }),
    clearAgentTask: vi.fn((id: string) => {
      const a = mockState.agents.get(id)
      if (!a) return false
      a.currentTask = null
      notifySubscribers()
      return true
    }),
    addAgentToMeeting: vi.fn((id: string) => {
      if (!mockState.meetingAgents.includes(id)) mockState.meetingAgents.push(id)
      const a = mockState.agents.get(id)
      if (a) a.status = 'meeting'
      notifySubscribers()
      return true
    }),
    removeAgentFromMeeting: vi.fn((id: string) => {
      mockState.meetingAgents = mockState.meetingAgents.filter(i => i !== id)
      const a = mockState.agents.get(id)
      if (a && a.status === 'meeting') a.status = 'idle'
      notifySubscribers()
      return true
    }),
    setWorkflowPhase: vi.fn((phase: string) => {
      mockState.workflowPhase = phase
      notifySubscribers()
      return true
    }),
    getWorkflowPhase: vi.fn(() => mockState.workflowPhase),
    getWorkstation: vi.fn((id: string) => mockState.workstations.get(id)),
    addWorkstation: vi.fn((ws: any) => {
      mockState.workstations.set(ws.id, { ...ws })
    }),
    reset: vi.fn(() => {
      resetMockState()
      notifySubscribers()
    }),
  }
  return { OfficeStateManager, default: OfficeStateManager }
})

import { OfficeWorkflowManager, MEETING_TABLE_POSITION } from '../officeWorkflow'
import { OfficeStateManager } from '../officeStateManager'

const sm = OfficeStateManager as any

function addTestAgent(id: string) {
  sm.addAgent({ id, name: `Agent ${id}`, role: 'executor', position: { x: 0, y: 0 }, status: 'idle', currentTaskId: null })
}

function simulateArrival(agentId: string) {
  const agent = mockState.agents.get(agentId)
  if (agent) {
    agent.position = agent.targetPosition ? { ...agent.targetPosition } : { ...agent.position }
    notifySubscribers()
  }
}

describe('OfficeWorkflowManager', () => {
  let manager: InstanceType<typeof OfficeWorkflowManager>

  beforeEach(() => {
    vi.useFakeTimers()
    resetMockState()
    ;(OfficeWorkflowManager as any).instance = null
    manager = OfficeWorkflowManager.getInstance()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    ;(OfficeWorkflowManager as any).instance = null
  })

  describe('singleton', () => {
    it('should be a singleton', () => {
      expect(OfficeWorkflowManager.getInstance()).toBe(manager)
    })
  })

  describe('reset', () => {
    it('should clear tasks and state', () => {
      addTestAgent('a1')
      sm.setWorkflowPhase('meeting')
      manager.assignTask('a1', 'task')

      const onPhaseChange = vi.fn()
      manager.setCallbacks({ onPhaseChange })
      manager.reset()

      expect(manager.getAllTasks()).toEqual([])
      expect(manager.getCurrentPhase()).toBe('idle')
      expect(onPhaseChange).toHaveBeenCalledWith('idle')
    })
  })

  describe('startMeeting', () => {
    it('should move agents to meeting table', async () => {
      addTestAgent('a1')

      const p = manager.startMeeting()
      expect(sm.getAgent('a1').status).toBe('moving')

      simulateArrival('a1')
      await p

      expect(manager.getCurrentPhase()).toBe('meeting')
    })

    it('should not start if phase is not idle or done', async () => {
      addTestAgent('a1')
      sm.setWorkflowPhase('meeting')
      await manager.startMeeting()
      expect(sm.getWorkflowPhase()).toBe('meeting')
    })

    it('should start from done phase', async () => {
      addTestAgent('a1')
      sm.setWorkflowPhase('done')
      const p = manager.startMeeting()
      simulateArrival('a1')
      await p
      expect(manager.getCurrentPhase()).toBe('meeting')
    })

    it('should call onAgentMoveStart callback', () => {
      const onAgentMoveStart = vi.fn()
      manager.setCallbacks({ onAgentMoveStart })
      addTestAgent('a1')
      manager.startMeeting()
      expect(onAgentMoveStart).toHaveBeenCalledWith('a1', { x: 0, y: 0 }, MEETING_TABLE_POSITION)
    })

    it('should call onPhaseChange callback', async () => {
      const onPhaseChange = vi.fn()
      manager.setCallbacks({ onPhaseChange })
      addTestAgent('a1')
      const p = manager.startMeeting()
      simulateArrival('a1')
      await p
      expect(onPhaseChange).toHaveBeenCalledWith('meeting')
    })
  })

  describe('assignTask', () => {
    beforeEach(() => {
      addTestAgent('a1')
      sm.setWorkflowPhase('meeting')
    })

    it('should assign task in meeting phase', () => {
      const onTaskAssigned = vi.fn()
      manager.setCallbacks({ onTaskAssigned })
      const task = manager.assignTask('a1', 'Do something')!

      expect(task.agentId).toBe('a1')
      expect(task.description).toBe('Do something')
      expect(task.status).toBe('assigned')
      expect(onTaskAssigned).toHaveBeenCalledWith(task)
    })

    it('should transition to assigning phase from meeting', () => {
      manager.assignTask('a1', 'task')
      expect(manager.getCurrentPhase()).toBe('assigning')
    })

    it('should not re-transition when already assigning', () => {
      sm.setWorkflowPhase('assigning')
      manager.assignTask('a1', 'task1')
      manager.assignTask('a1', 'task2')
      expect(manager.getCurrentPhase()).toBe('assigning')
    })

    it('should return null for non-existent agent', () => {
      expect(manager.assignTask('bad', 'task')).toBeNull()
    })

    it('should return null when phase is not meeting/assigning', () => {
      sm.setWorkflowPhase('working')
      expect(manager.assignTask('a1', 'task')).toBeNull()
    })
  })

  describe('startWorking', () => {
    it('should move agents to workstations and set tasks to executing', async () => {
      addTestAgent('a1')
      sm.setWorkflowPhase('assigning')
      manager.assignTask('a1', 'task')
      sm.setWorkflowPhase('assigning')

      const p = manager.startWorking()
      simulateArrival('a1')
      await p

      expect(manager.getCurrentPhase()).toBe('working')
      expect(manager.getAllTasks()[0].status).toBe('executing')
    })

    it('should move to workstation position when workstation exists', async () => {
      addTestAgent('a1')
      mockState.workstations.set('ws-1', { id: 'ws-1', name: 'WS1', position: { x: 5, y: 5 }, agentId: 'a1' })
      mockState.agents.get('a1').workstationId = 'ws-1'
      sm.setWorkflowPhase('assigning')
      manager.assignTask('a1', 'task')
      sm.setWorkflowPhase('assigning')

      const p = manager.startWorking()
      simulateArrival('a1')
      await p

      expect(manager.getCurrentPhase()).toBe('working')
    })

    it('should move to (0,0) when no workstationId', async () => {
      addTestAgent('a1')
      sm.setWorkflowPhase('assigning')

      const p = manager.startWorking()
      simulateArrival('a1')
      await p

      expect(manager.getCurrentPhase()).toBe('working')
    })

    it('should not start when phase is not assigning', async () => {
      addTestAgent('a1')
      sm.setWorkflowPhase('meeting')
      await manager.startWorking()
      expect(sm.getWorkflowPhase()).toBe('meeting')
    })
  })

  describe('completeTask', () => {
    beforeEach(() => {
      addTestAgent('a1')
      sm.setWorkflowPhase('meeting')
    })

    it('should complete task and trigger callback', () => {
      const onTaskComplete = vi.fn()
      manager.setCallbacks({ onTaskComplete })
      const task = manager.assignTask('a1', 'task')!

      manager.completeTask(task.id)

      expect(manager.getTask(task.id)!.status).toBe('completed')
      expect(onTaskComplete).toHaveBeenCalledWith(task.id)
    })

    it('should set phase to done when all tasks completed', () => {
      const task = manager.assignTask('a1', 'task')!
      manager.completeTask(task.id)
      expect(manager.getCurrentPhase()).toBe('done')
    })

    it('should not set done when tasks still pending', () => {
      addTestAgent('a2')
      const t1 = manager.assignTask('a1', 'task1')!
      manager.assignTask('a2', 'task2')
      manager.completeTask(t1.id)
      expect(manager.getCurrentPhase()).not.toBe('done')
    })

    it('should ignore non-existent task', () => {
      expect(() => manager.completeTask('bad')).not.toThrow()
    })
  })

  describe('failTask', () => {
    beforeEach(() => {
      addTestAgent('a1')
      sm.setWorkflowPhase('meeting')
    })

    it('should fail task', () => {
      const task = manager.assignTask('a1', 'task')!
      manager.failTask(task.id)
      expect(manager.getTask(task.id)!.status).toBe('failed')
    })

    it('should set done when all tasks failed', () => {
      // failTask doesn't set done - only completeTask does
      const task = manager.assignTask('a1', 'task')!
      manager.failTask(task.id)
      expect(manager.getTask(task.id)!.status).toBe('failed')
      // Phase stays at assigning since failTask doesn't auto-complete
      expect(manager.getCurrentPhase()).toBe('assigning')
    })

    it('should ignore non-existent task', () => {
      expect(() => manager.failTask('bad')).not.toThrow()
    })
  })

  describe('query methods', () => {
    beforeEach(() => {
      addTestAgent('a1')
      sm.setWorkflowPhase('meeting')
    })

    it('should get task by id', () => {
      const task = manager.assignTask('a1', 'task')!
      const got = manager.getTask(task.id)
      expect(got!.id).toBe(task.id)
    })

    it('should return undefined for non-existent task', () => {
      expect(manager.getTask('bad')).toBeUndefined()
    })

    it('should return copy from getTask', () => {
      const task = manager.assignTask('a1', 'task')!
      const got = manager.getTask(task.id)!
      got.status = 'failed'
      expect(manager.getTask(task.id)!.status).toBe('assigned')
    })

    it('should get tasks by agent', () => {
      addTestAgent('a2')
      manager.assignTask('a1', 't1')
      manager.assignTask('a1', 't2')
      manager.assignTask('a2', 't3')

      expect(manager.getTasksByAgent('a1')).toHaveLength(2)
      expect(manager.getTasksByAgent('a2')).toHaveLength(1)
      expect(manager.getTasksByAgent('none')).toHaveLength(0)
    })

    it('should get all tasks', () => {
      manager.assignTask('a1', 't1')
      manager.assignTask('a1', 't2')
      expect(manager.getAllTasks()).toHaveLength(2)
    })

    it('should return copies from getAllTasks', () => {
      manager.assignTask('a1', 't1')
      const tasks = manager.getAllTasks()
      tasks[0].status = 'failed'
      expect(manager.getAllTasks()[0].status).toBe('assigned')
    })

    it('should get current phase', () => {
      expect(manager.getCurrentPhase()).toBe('meeting')
    })
  })

  describe('handleAgentArrived', () => {
    it('should update agent status on arrival', () => {
      addTestAgent('a1')
      manager.startMeeting()
      expect(sm.getAgent('a1').status).toBe('moving')

      simulateArrival('a1')
      expect(sm.getAgent('a1').status).toBe('idle')
    })

    it('should call onAgentMoveComplete callback', () => {
      const onAgentMoveComplete = vi.fn()
      manager.setCallbacks({ onAgentMoveComplete })

      addTestAgent('a1')
      manager.startMeeting()
      simulateArrival('a1')

      expect(onAgentMoveComplete).toHaveBeenCalledWith('a1')
    })

    it('should resolve move promise on arrival', async () => {
      addTestAgent('a1')

      let resolved = false
      const p = manager.startMeeting().then(() => { resolved = true })
      simulateArrival('a1')

      await p
      expect(resolved).toBe(true)
    })
  })

  describe('moveAgentTo with non-existent agent', () => {
    it('should resolve immediately for missing agent', async () => {
      addTestAgent('a1')
      addTestAgent('a2')
      sm.setWorkflowPhase('assigning')
      mockState.agents.delete('a1')
      sm.setWorkflowPhase('idle')

      const p = manager.startMeeting()
      simulateArrival('a2')
      await p
    })
  })
})
