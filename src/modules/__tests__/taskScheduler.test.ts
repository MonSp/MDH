import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskScheduler } from '../taskScheduler'

function makeTask(id: string, priority = 'medium') {
  return {
    id, title: `Task ${id}`, description: `Desc ${id}`, type: 'development' as const,
    status: 'pending' as const, priority, requiredCapabilities: [],
    preferredRole: null, assignedAgentId: null, parentTaskId: null,
    estimatedDuration: 10000,
  }
}

describe('TaskScheduler', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should schedule empty list', () => {
    const scheduler = new TaskScheduler()
    expect(scheduler.scheduleTasks([], [])).toHaveLength(0)
  })

  it('should schedule single task', () => {
    const scheduler = new TaskScheduler()
    const result = scheduler.scheduleTasks([makeTask('t1')], [])
    expect(result).toHaveLength(1)
  })

  it('should schedule multiple tasks', () => {
    const scheduler = new TaskScheduler()
    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')]
    const result = scheduler.scheduleTasks(tasks, [])
    expect(result).toHaveLength(3)
  })

  it('should get config', () => {
    const scheduler = new TaskScheduler({ maxConcurrentTasks: 3 })
    expect(scheduler.getConfig().maxConcurrentTasks).toBe(3)
  })

  it('should reset state', () => {
    const scheduler = new TaskScheduler()
    scheduler.scheduleTasks([makeTask('t1')], [])
    scheduler.reset()
    expect(scheduler.getReadyTasks()).toHaveLength(0)
  })

  it('should schedule tasks with dependencies', () => {
    const scheduler = new TaskScheduler()
    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')]
    const deps = [
      { fromTaskId: 't1', toTaskId: 't2', type: 'finish-to-start' as const },
      { fromTaskId: 't2', toTaskId: 't3', type: 'finish-to-start' as const },
    ]
    const result = scheduler.scheduleTasks(tasks, deps)
    expect(result).toHaveLength(3)
    // t1 should start before t2, t2 before t3
    const t1 = result.find(t => t.id === 't1')!
    const t2 = result.find(t => t.id === 't2')!
    const t3 = result.find(t => t.id === 't3')!
    expect(t1.scheduledStartTime).toBeLessThanOrEqual(t2.scheduledStartTime)
    expect(t2.scheduledStartTime).toBeLessThanOrEqual(t3.scheduledStartTime)
  })

  it('should assign priority scores', () => {
    const scheduler = new TaskScheduler()
    const tasks = [
      makeTask('t1', 'high'),
      makeTask('t2', 'low'),
      makeTask('t3', 'critical'),
    ]
    const result = scheduler.scheduleTasks(tasks, [])
    const critical = result.find(t => t.id === 't3')!
    const high = result.find(t => t.id === 't1')!
    const low = result.find(t => t.id === 't2')!
    expect(critical.priorityScore).toBeGreaterThan(high.priorityScore)
    expect(high.priorityScore).toBeGreaterThan(low.priorityScore)
  })

  it('should schedule with parallel algorithm', () => {
    const scheduler = new TaskScheduler({ schedulingAlgorithm: 'priority' })
    const tasks = [makeTask('t1'), makeTask('t2')]
    const result = scheduler.scheduleTasks(tasks, [])
    expect(result).toHaveLength(2)
  })

  it('should handle tasks with estimated duration', () => {
    const scheduler = new TaskScheduler()
    const tasks = [
      { ...makeTask('t1'), estimatedDuration: 5000 },
      { ...makeTask('t2'), estimatedDuration: 10000 },
    ]
    const result = scheduler.scheduleTasks(tasks, [])
    const t1 = result.find(t => t.id === 't1')!
    const t2 = result.find(t => t.id === 't2')!
    // t2 should end later than t1 due to longer duration
    expect(t2.scheduledEndTime).toBeGreaterThan(t1.scheduledEndTime)
  })
})
