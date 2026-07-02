import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DependencyAnalyzer } from '../dependencyAnalyzer'
import type { SubTask } from '../../taskTypes'

function makeTask(id: string, title: string, priority = 'medium'): SubTask {
  return {
    id,
    title,
    description: `Description for ${title}`,
    type: 'development' as any,
    status: 'pending' as any,
    priority: priority as any,
    requiredCapabilities: [],
    preferredRole: null,
    assignedAgentId: null,
    parentTaskId: null,
  }
}

describe('DependencyAnalyzer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should initialize with default rules and patterns', () => {
    const analyzer = new DependencyAnalyzer()
    expect(analyzer).toBeDefined()
  })

  it('should analyze empty task list', async () => {
    const analyzer = new DependencyAnalyzer()
    const result = await analyzer.analyzeDependencies([])

    expect(result.dependencies).toHaveLength(0)
    expect(result.criticalPath).toHaveLength(0)
    expect(result.cycles).toHaveLength(0)
  })

  it('should analyze single task', async () => {
    const analyzer = new DependencyAnalyzer()
    const result = await analyzer.analyzeDependencies([makeTask('t1', 'Task 1')])

    expect(result.dependencies).toHaveLength(0)
    expect(result.criticalPath).toContain('t1')
  })

  it('should analyze multiple tasks', async () => {
    const analyzer = new DependencyAnalyzer()
    const tasks = [
      makeTask('t1', 'Setup'),
      makeTask('t2', 'Implement'),
      makeTask('t3', 'Test'),
    ]
    const result = await analyzer.analyzeDependencies(tasks)

    expect(result.metadata.totalDependencies).toBeGreaterThanOrEqual(0)
    expect(result.metadata.analysisTime).toBeGreaterThanOrEqual(0)
  })

  it('should detect parallel groups', async () => {
    const analyzer = new DependencyAnalyzer()
    const tasks = [
      makeTask('t1', 'Task A'),
      makeTask('t2', 'Task B'),
      makeTask('t3', 'Task C'),
    ]
    const result = await analyzer.analyzeDependencies(tasks)

    expect(result.parallelGroups.length).toBeGreaterThan(0)
  })

  it('should calculate parallelization score', async () => {
    const analyzer = new DependencyAnalyzer()
    const tasks = [
      makeTask('t1', 'Task A'),
      makeTask('t2', 'Task B'),
    ]
    const result = await analyzer.analyzeDependencies(tasks)

    expect(result.metadata.parallelizationScore).toBeGreaterThanOrEqual(0)
    expect(result.metadata.parallelizationScore).toBeLessThanOrEqual(1)
  })
})
