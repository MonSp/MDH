import { CompensationEngine } from '../compensationEngine'
import { TaskType, TaskStatus, TaskPriority, createTaskPlan } from '../taskTypes'
import type { SubTask, TaskDependency, CompensateAction } from '../taskTypes'

function createTestSubTask(id: string, compensateAction?: CompensateAction | null): SubTask {
  return {
    id,
    title: `Task ${id}`,
    description: `Test task ${id}`,
    type: TaskType.Atomic,
    status: TaskStatus.Pending,
    priority: TaskPriority.Medium,
    requiredCapabilities: [],
    preferredRole: null,
    assignedAgentId: null,
    parentTaskId: null,
    dependencies: [],
    constraints: [],
    input: {},
    result: null,
    retryCount: 0,
    maxRetries: 3,
    timeout: 300000,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    estimatedDuration: 60000,
    metadata: {},
    compensateAction: compensateAction ?? null,
    rollbackCondition: null,
    failureImpact: 'local',
  }
}

const rollbackAction: CompensateAction = {
  actionType: 'rollback',
  description: 'Rollback changes',
  params: {},
}

describe('CompensationEngine', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('normal compensation flow', () => {
    it('should execute compensation successfully with a valid action executor', async () => {
      const engine = new CompensationEngine()
      engine.setActionExecutor(() => true)
      const task = createTestSubTask('t1', rollbackAction)
      const result = await engine.executeCompensation(task)
      expect(result.success).toBe(true)
      expect(result.taskId).toBe('t1')
      expect(result.action).toBe('rollback')
      expect(result.details).toContain('Executed compensation')
      engine.destroy()
    })
  })

  describe('depth limit', () => {
    it('should fail when depth >= maxDepth and increment depthExceededCount', async () => {
      const engine = new CompensationEngine({ maxDepth: 2 })
      engine.setActionExecutor(() => true)
      const task = createTestSubTask('t1', rollbackAction)
      const result = await engine.executeCompensation(task, 2)
      expect(result.success).toBe(false)
      expect(result.details).toContain('depth')
      expect(result.details).toContain('exceeded')
      expect(engine.getCompensationStats().depthExceededCount).toBe(1)
      engine.destroy()
    })
  })

  describe('timeout protection', () => {
    it('should timeout when action exceeds timeoutMs and increment timeoutCount', async () => {
      vi.useFakeTimers()
      const engine = new CompensationEngine({ timeoutMs: 50 })
      engine.setActionExecutor(
        () => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 200)),
      )
      const task = createTestSubTask('t1', rollbackAction)
      const promise = engine.executeCompensation(task)
      vi.advanceTimersByTime(100)
      const result = await promise
      expect(result.success).toBe(false)
      expect(result.details).toContain('timed out')
      expect(engine.getCompensationStats().timeoutCount).toBe(1)
      vi.advanceTimersByTime(300)
      engine.destroy()
    })
  })

  describe('dependency graph and reverse topological sort', () => {
    it('should return compensatable tasks in reverse dependency order', () => {
      const engine = new CompensationEngine()
      const taskA = createTestSubTask('A', rollbackAction)
      const taskB = createTestSubTask('B', rollbackAction)
      const taskC = createTestSubTask('C', rollbackAction)
      const taskD = createTestSubTask('D', rollbackAction)
      const dependencies: TaskDependency[] = [
        { fromTaskId: 'A', toTaskId: 'B', type: 'blocks' },
        { fromTaskId: 'B', toTaskId: 'C', type: 'blocks' },
        { fromTaskId: 'C', toTaskId: 'D', type: 'blocks' },
      ]
      const plan = createTaskPlan('Test Plan', 'Test', [taskA, taskB, taskC, taskD], dependencies)
      const order = engine.getCompensationPlan('A', plan)
      const ids = order.map(t => t.id)
      expect(ids).toEqual(['D', 'C', 'B'])
      engine.destroy()
    })
  })

  describe('failure strategies', () => {
    it('should append [strategy: abort] when onFailure is abort', async () => {
      const engine = new CompensationEngine({ onFailure: 'abort' })
      engine.setActionExecutor(() => false)
      const task = createTestSubTask('t1', rollbackAction)
      const result = await engine.executeCompensation(task)
      expect(result.success).toBe(false)
      expect(result.details).toContain('[strategy: abort]')
      engine.destroy()
    })

    it('should append [strategy: skip] when onFailure is skip', async () => {
      const engine = new CompensationEngine({ onFailure: 'skip' })
      engine.setActionExecutor(() => false)
      const task = createTestSubTask('t1', rollbackAction)
      const result = await engine.executeCompensation(task)
      expect(result.success).toBe(false)
      expect(result.details).toContain('[strategy: skip]')
      engine.destroy()
    })

    it('should append [strategy: manual intervention required] when onFailure is manual', async () => {
      const engine = new CompensationEngine({ onFailure: 'manual' })
      engine.setActionExecutor(() => false)
      const task = createTestSubTask('t1', rollbackAction)
      const result = await engine.executeCompensation(task)
      expect(result.success).toBe(false)
      expect(result.details).toContain('[strategy: manual intervention required]')
      engine.destroy()
    })
  })

  describe('getCompensationStats', () => {
    it('should track total, success, failure counts and average duration', async () => {
      const engine = new CompensationEngine()
      let callCount = 0
      engine.setActionExecutor(() => {
        callCount++
        return callCount !== 2
      })
      const t1 = createTestSubTask('t1', rollbackAction)
      const t2 = createTestSubTask('t2', rollbackAction)
      const t3 = createTestSubTask('t3', rollbackAction)
      await engine.executeCompensation(t1)
      await engine.executeCompensation(t2)
      await engine.executeCompensation(t3)
      const stats = engine.getCompensationStats()
      expect(stats.totalCompensations).toBe(3)
      expect(stats.successCount).toBe(2)
      expect(stats.failureCount).toBe(1)
      expect(stats.averageDurationMs).toBeGreaterThanOrEqual(0)
      engine.destroy()
    })
  })

  describe('failure recording and listeners', () => {
    it('should call listeners with FailureEvent when recordFailure is called', () => {
      const engine = new CompensationEngine()
      const listener = vi.fn()
      engine.addListener(listener)
      const event = engine.recordFailure('task-1', 'agent-1', 'Something failed', 'local')
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-1',
          agentId: 'agent-1',
          error: 'Something failed',
          impact: 'local',
        }),
      )
      expect(event.taskId).toBe('task-1')
      expect(event.agentId).toBe('agent-1')
      expect(event.error).toBe('Something failed')
      expect(event.impact).toBe('local')
      expect(typeof event.timestamp).toBe('number')
      engine.destroy()
    })

    it('should track failure history via getFailureHistory', () => {
      const engine = new CompensationEngine()
      engine.recordFailure('t1', 'a1', 'err1', 'local')
      engine.recordFailure('t2', 'a2', 'err2', 'global')
      const history = engine.getFailureHistory()
      expect(history.length).toBe(2)
      expect(history[0].taskId).toBe('t1')
      expect(history[1].taskId).toBe('t2')
      engine.destroy()
    })

    it('should remove listener', () => {
      const engine = new CompensationEngine()
      const listener = vi.fn()
      engine.addListener(listener)
      engine.removeListener(listener)
      engine.recordFailure('t1', 'a1', 'err', 'local')
      expect(listener).not.toHaveBeenCalled()
      engine.destroy()
    })
  })

  describe('log and stats', () => {
    it('should return empty compensation log initially', () => {
      const engine = new CompensationEngine()
      const log = engine.getCompensationLog()
      expect(log).toEqual([])
      engine.destroy()
    })

    it('should return stats with zero counts initially', () => {
      const engine = new CompensationEngine()
      const stats = engine.getCompensationStats()
      expect(stats.successCount).toBe(0)
      expect(stats.failureCount).toBe(0)
      expect(stats.totalCompensations).toBe(0)
      engine.destroy()
    })
  })
})
