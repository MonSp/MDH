import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskAssigner } from '../taskAssigner'
import { AgentRegistry } from '../agentRegistry'
import { CommunicationBus } from '../communicationBus'
import { AgentCapability, AgentInstanceStatus, AgentRole } from '../agentTypes'
import { TaskType, TaskStatus, TaskPriority } from '../taskTypes'
import { MessageType } from '../communicationProtocol'

function makeTask(overrides: Record<string, any> = {}) {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: 'A test task',
    type: TaskType.Atomic,
    status: TaskStatus.Pending,
    priority: TaskPriority.Medium,
    planId: null,
    subTaskIds: [],
    assignedAgentId: null,
    requiredCapabilities: [AgentCapability.CodeGeneration],
    constraints: [],
    input: {},
    result: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    metadata: {},
    ...overrides,
  }
}

function setupRegistry(registry: AgentRegistry) {
  const config = {
    id: 'config-1',
    name: 'Coder',
    role: AgentRole.Executor,
    capabilities: [AgentCapability.CodeGeneration, AgentCapability.Testing],
    model: { provider: 'openai', model: 'gpt-4' },
    maxConcurrentTasks: 3,
    timeout: 30000,
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    metadata: {},
  }
  registry.registerConfig(config)
  const instance = registry.spawnInstance('config-1')!
  return { config, instance }
}

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

  describe('constructor', () => {
    it('should register default strategies', () => {
      expect(assigner.getStrategy('balanced')).toBeDefined()
      expect(assigner.getStrategy('loadBalancing')).toBeDefined()
      expect(assigner.getStrategy('capabilityFirst')).toBeDefined()
      expect(assigner.getStrategy('roundRobin')).toBeDefined()
    })
  })

  describe('registerStrategy / getStrategy', () => {
    it('should register and retrieve custom strategy', () => {
      const strategy = { name: 'custom', selectAgent: () => null }
      assigner.registerStrategy(strategy)
      expect(assigner.getStrategy('custom')).toBe(strategy)
    })

    it('should return undefined for unknown strategy', () => {
      expect(assigner.getStrategy('unknown')).toBeUndefined()
    })
  })

  describe('findCandidates', () => {
    it('should find candidates with matching capabilities', () => {
      setupRegistry(registry)
      const candidates = assigner.findCandidates(makeTask())
      expect(candidates).toHaveLength(1)
      expect(candidates[0].matchingCapabilities).toContain(AgentCapability.CodeGeneration)
    })

    it('should return empty when no instances available', () => {
      expect(assigner.findCandidates(makeTask())).toEqual([])
    })

    it('should skip instances with no matching capabilities', () => {
      const config = {
        id: 'config-no-match', name: 'NoMatch', role: AgentRole.Executor,
        capabilities: [AgentCapability.WebSearch],
        model: { provider: 'openai', model: 'gpt-4' },
        maxConcurrentTasks: 3, timeout: 30000,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 }, metadata: {},
      }
      registry.registerConfig(config)
      registry.spawnInstance('config-no-match')

      const candidates = assigner.findCandidates(makeTask())
      expect(candidates).toHaveLength(0)
    })

    it('should include candidates when task has no required capabilities', () => {
      setupRegistry(registry)
      const candidates = assigner.findCandidates(makeTask({ requiredCapabilities: [] }))
      expect(candidates).toHaveLength(1)
    })
  })

  describe('assignTask', () => {
    it('should assign task and send message', async () => {
      setupRegistry(registry)
      const busSpy = vi.spyOn(bus, 'sendMessage')

      const assignment = await assigner.assignTask(makeTask())

      expect(assignment).toBeDefined()
      expect(assignment!.taskId).toBe('task-1')
      expect(assignment!.agentId).toBeDefined()
      expect(busSpy).toHaveBeenCalledWith(
        MessageType.TaskAssignment,
        'task-assigner',
        expect.any(String),
        expect.objectContaining({ taskId: 'task-1' }),
        expect.any(Object),
      )
    })

    it('should return null when strategy selects no agent', async () => {
      setupRegistry(registry)
      assigner.registerStrategy({ name: 'null-selector', selectAgent: () => null })
      const result = await assigner.assignTask(makeTask(), 'null-selector')
      expect(result).toBeNull()
    })

    it('should return null when no candidates', async () => {
      expect(await assigner.assignTask(makeTask())).toBeNull()
    })

    it('should use specified strategy', async () => {
      setupRegistry(registry)
      const spy = vi.spyOn(assigner.getStrategy('roundRobin')!, 'selectAgent')

      await assigner.assignTask(makeTask(), 'roundRobin')
      expect(spy).toHaveBeenCalled()
    })

    it('should fall back to default for unknown strategy', async () => {
      setupRegistry(registry)
      const assignment = await assigner.assignTask(makeTask(), 'nonexistent')
      expect(assignment).toBeDefined()
    })
  })

  describe('strategies', () => {
    let candidates: any[]

    beforeEach(() => {
      setupRegistry(registry)
      candidates = assigner.findCandidates(makeTask())
    })

    it('balanced: should select highest scored agent', () => {
      const strategy = assigner.getStrategy('balanced')!
      const selected = strategy.selectAgent(candidates, makeTask())
      expect(selected).toBeDefined()
    })

    it('balanced: should return null for empty candidates', () => {
      const strategy = assigner.getStrategy('balanced')!
      expect(strategy.selectAgent([], makeTask())).toBeNull()
    })

    it('loadBalancing: should select agent with lowest load', () => {
      const strategy = assigner.getStrategy('loadBalancing')!
      const selected = strategy.selectAgent(candidates, makeTask())
      expect(selected).toBeDefined()
    })

    it('loadBalancing: should return null for empty candidates', () => {
      const strategy = assigner.getStrategy('loadBalancing')!
      expect(strategy.selectAgent([], makeTask())).toBeNull()
    })

    it('capabilityFirst: should select agent with most matching capabilities', () => {
      const strategy = assigner.getStrategy('capabilityFirst')!
      const selected = strategy.selectAgent(candidates, makeTask())
      expect(selected).toBeDefined()
    })

    it('capabilityFirst: should return null for empty candidates', () => {
      const strategy = assigner.getStrategy('capabilityFirst')!
      expect(strategy.selectAgent([], makeTask())).toBeNull()
    })

    it('roundRobin: should cycle through candidates', () => {
      // Add a second agent
      registry.spawnInstance('config-1')
      const allCandidates = assigner.findCandidates(makeTask())
      expect(allCandidates.length).toBeGreaterThanOrEqual(2)

      const strategy = assigner.getStrategy('roundRobin')!
      const first = strategy.selectAgent(allCandidates, makeTask())
      const second = strategy.selectAgent(allCandidates, makeTask())
      expect(first!.instance.id).not.toBe(second!.instance.id)
    })

    it('roundRobin: should return null for empty candidates', () => {
      const strategy = assigner.getStrategy('roundRobin')!
      expect(strategy.selectAgent([], makeTask())).toBeNull()
    })
  })

  describe('getAssignment / getAllAssignments / getAssignmentsByAgent', () => {
    it('should track assignments', async () => {
      setupRegistry(registry)
      const assignment = await assigner.assignTask(makeTask())

      expect(assigner.getAssignment('task-1')).toEqual(assignment)
      expect(assigner.getAllAssignments()).toHaveLength(1)
      expect(assigner.getAssignmentsByAgent(assignment!.agentId)).toHaveLength(1)
      expect(assigner.getAssignmentsByAgent('none')).toHaveLength(0)
    })
  })

  describe('removeAssignment', () => {
    it('should remove assignment', async () => {
      setupRegistry(registry)
      await assigner.assignTask(makeTask())

      expect(assigner.removeAssignment('task-1')).toBe(true)
      expect(assigner.getAssignment('task-1')).toBeUndefined()
    })

    it('should return false for non-existent assignment', () => {
      expect(assigner.removeAssignment('bad')).toBe(false)
    })
  })

  describe('reassignTask', () => {
    it('should reassign task to new agent', async () => {
      setupRegistry(registry)
      const instance2 = registry.spawnInstance('config-1')!
      const assignment = await assigner.assignTask(makeTask())

      const newAssignment = await assigner.reassignTask(
        'task-1', instance2.id, 'Load balancing',
      )

      expect(newAssignment).toBeDefined()
      expect(newAssignment!.agentId).toBe(instance2.id)
      expect(newAssignment!.reason).toBe('Load balancing')
    })

    it('should return null for non-existent assignment', async () => {
      setupRegistry(registry)
      expect(await assigner.reassignTask('bad', 'inst-1', 'reason')).toBeNull()
    })

    it('should return null for non-existent new agent', async () => {
      setupRegistry(registry)
      await assigner.assignTask(makeTask())
      expect(await assigner.reassignTask('task-1', 'bad', 'reason')).toBeNull()
    })
  })

  describe('getAssignmentStats', () => {
    it('should return stats with no assignments', () => {
      const stats = assigner.getAssignmentStats()
      expect(stats.totalAssignments).toBe(0)
      expect(stats.averageSuccessRate).toBe(0)
    })

    it('should return stats with assignments', async () => {
      setupRegistry(registry)
      await assigner.assignTask(makeTask())

      const stats = assigner.getAssignmentStats()
      expect(stats.totalAssignments).toBe(1)
      expect(stats.activeAssignments).toBe(1)
      expect(stats.averageSuccessRate).toBeGreaterThan(0)
    })
  })

  describe('findBestAgentForTask', () => {
    it('should find best agent', () => {
      setupRegistry(registry)
      const best = assigner.findBestAgentForTask(makeTask())
      expect(best).toBeDefined()
    })

    it('should return null when no candidates', () => {
      expect(assigner.findBestAgentForTask(makeTask())).toBeNull()
    })

    it('should use specified strategy', () => {
      setupRegistry(registry)
      const best = assigner.findBestAgentForTask(makeTask(), 'roundRobin')
      expect(best).toBeDefined()
    })
  })

  describe('canAssignTask', () => {
    it('should return true when candidates available', () => {
      setupRegistry(registry)
      expect(assigner.canAssignTask(makeTask())).toBe(true)
    })

    it('should return false when no candidates', () => {
      expect(assigner.canAssignTask(makeTask())).toBe(false)
    })
  })

  describe('getTaskRequirements', () => {
    it('should return task requirements', () => {
      setupRegistry(registry)
      const reqs = assigner.getTaskRequirements(makeTask())
      expect(reqs.requiredCapabilities).toContain(AgentCapability.CodeGeneration)
      expect(reqs.availableAgents).toBe(1)
      expect(reqs.canAssign).toBe(true)
    })

    it('should report canAssign false when no agents', () => {
      const reqs = assigner.getTaskRequirements(makeTask())
      expect(reqs.canAssign).toBe(false)
    })
  })

  describe('calculateSuccessRate', () => {
    it('should return 0.5 for new instance with no tasks', async () => {
      setupRegistry(registry)
      const best = assigner.findBestAgentForTask(makeTask())!
      expect(best.successRate).toBe(0.5)
    })

    it('should calculate rate after completed tasks', async () => {
      const { instance } = setupRegistry(registry)
      registry.completeTaskForInstance(instance.id, true)
      registry.completeTaskForInstance(instance.id, true)
      registry.completeTaskForInstance(instance.id, false)

      const best = assigner.findBestAgentForTask(makeTask())!
      expect(best.successRate).toBeCloseTo(2 / 3)
    })
  })

  describe('executeAssignment with SubTask', () => {
    it('should handle SubTask with constraints', async () => {
      setupRegistry(registry)
      const busSpy = vi.spyOn(bus, 'sendMessage')

      const subtask = makeTask({
        parentTaskId: 'parent-1',
        constraints: [{ type: 'time', value: '1h' }],
      })

      await assigner.assignTask(subtask)

      expect(busSpy).toHaveBeenCalledWith(
        MessageType.TaskAssignment,
        'task-assigner',
        expect.any(String),
        expect.objectContaining({
          constraints: { constraints: [{ type: 'time', value: '1h' }] },
        }),
        expect.any(Object),
      )
    })
  })

  describe('mapTaskPriorityToMessagePriority', () => {
    it('should map Low priority', async () => {
      setupRegistry(registry)
      const busSpy = vi.spyOn(bus, 'sendMessage')
      await assigner.assignTask(makeTask({ priority: TaskPriority.Low }))
      expect(busSpy).toHaveBeenCalledWith(
        MessageType.TaskAssignment, 'task-assigner', expect.any(String),
        expect.any(Object), expect.objectContaining({ priority: 'low' }),
      )
    })

    it('should map Medium priority', async () => {
      setupRegistry(registry)
      const busSpy = vi.spyOn(bus, 'sendMessage')
      await assigner.assignTask(makeTask({ priority: TaskPriority.Medium }))
      expect(busSpy).toHaveBeenCalledWith(
        MessageType.TaskAssignment, 'task-assigner', expect.any(String),
        expect.any(Object), expect.objectContaining({ priority: 'normal' }),
      )
    })

    it('should map High priority', async () => {
      setupRegistry(registry)
      const busSpy = vi.spyOn(bus, 'sendMessage')
      await assigner.assignTask(makeTask({ priority: TaskPriority.High }))
      expect(busSpy).toHaveBeenCalledWith(
        MessageType.TaskAssignment, 'task-assigner', expect.any(String),
        expect.any(Object), expect.objectContaining({ priority: 'high' }),
      )
    })

    it('should map Critical priority', async () => {
      setupRegistry(registry)
      const busSpy = vi.spyOn(bus, 'sendMessage')
      await assigner.assignTask(makeTask({ priority: TaskPriority.Critical }))
      expect(busSpy).toHaveBeenCalledWith(
        MessageType.TaskAssignment, 'task-assigner', expect.any(String),
        expect.any(Object), expect.objectContaining({ priority: 'urgent' }),
      )
    })
  })
})
