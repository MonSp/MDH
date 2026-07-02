import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  TaskStatus,
  TaskPriority,
  TaskType,
  createSubTask,
  createTaskPlan,
  getTaskDependencies,
  getDependentTasks,
  isTaskReady,
  calculatePlanProgress,
} from '../taskTypes'

describe('taskTypes', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should have task statuses', () => {
    expect(TaskStatus.Pending).toBe('pending')
    expect(TaskStatus.Planning).toBe('planning')
    expect(TaskStatus.Running).toBe('running')
    expect(TaskStatus.Completed).toBe('completed')
    expect(TaskStatus.Failed).toBe('failed')
  })

  it('should have task priorities', () => {
    expect(TaskPriority.Critical).toBeDefined()
    expect(TaskPriority.High).toBeDefined()
    expect(TaskPriority.Medium).toBeDefined()
    expect(TaskPriority.Low).toBeDefined()
  })

  it('should create subtask with defaults', () => {
    const task = createSubTask('Title', 'Description')

    expect(task.title).toBe('Title')
    expect(task.description).toBe('Description')
    expect(task.status).toBe(TaskStatus.Pending)
    expect(task.priority).toBe(TaskPriority.Medium)
    expect(task.type).toBe(TaskType.Atomic)
    expect(task.maxRetries).toBe(3)
  })

  it('should create subtask with options', () => {
    const task = createSubTask('Title', 'Desc', {
      priority: TaskPriority.High,
      type: TaskType.Composite,
      maxRetries: 5,
    })

    expect(task.priority).toBe(TaskPriority.High)
    expect(task.type).toBe(TaskType.Composite)
    expect(task.maxRetries).toBe(5)
  })

  it('should create task plan', () => {
    const plan = createTaskPlan('Test Plan', 'Description', [])

    expect(plan.title).toBe('Test Plan')
    expect(plan.subTasks).toEqual([])
    expect(plan.dependencies).toEqual([])
    expect(plan.status).toBe(TaskStatus.Pending)
  })

  it('should create task plan with subtasks', () => {
    const task = createSubTask('Task 1', 'Desc')
    const plan = createTaskPlan('Test', 'Desc', [task])

    expect(plan.subTasks).toHaveLength(1)
    expect(plan.rootTaskId).toBe(task.id)
  })

  it('should get task dependencies', () => {
    const plan = createTaskPlan('Test', 'Desc', [])
    const deps = getTaskDependencies('task-1', plan)
    expect(Array.isArray(deps)).toBe(true)
  })

  it('should get dependent tasks', () => {
    const plan = createTaskPlan('Test', 'Desc', [])
    const dependents = getDependentTasks('task-1', plan)
    expect(Array.isArray(dependents)).toBe(true)
  })

  it('should check if task is ready', () => {
    const plan = createTaskPlan('Test', 'Desc', [])
    const task = createSubTask('Task', 'Desc')
    const ready = isTaskReady(task, plan)
    expect(typeof ready).toBe('boolean')
  })

  it('should calculate plan progress', () => {
    const plan = createTaskPlan('Test', 'Desc', [])
    const progress = calculatePlanProgress(plan)
    expect(progress).toBe(0)
  })
})
