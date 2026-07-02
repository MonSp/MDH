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
})
