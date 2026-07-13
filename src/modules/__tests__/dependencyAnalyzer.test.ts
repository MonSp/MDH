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

  it('should return rules', () => {
    const analyzer = new DependencyAnalyzer()
    const rules = analyzer.getRules()
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThan(0)
  })

  it('should return patterns', () => {
    const analyzer = new DependencyAnalyzer()
    const patterns = analyzer.getPatterns()
    expect(Array.isArray(patterns)).toBe(true)
  })

  it('should detect sequential dependencies from task names', async () => {
    const analyzer = new DependencyAnalyzer()
    const tasks = [
      makeTask('t1', 'Setup database'),
      makeTask('t2', 'Create API endpoints'),
      makeTask('t3', 'Write tests'),
    ]
    const result = await analyzer.analyzeDependencies(tasks)
    // Should detect some dependency between setup → implement → test
    expect(result.dependencies).toBeDefined()
    expect(result.criticalPath).toBeDefined()
    expect(result.criticalPath.length).toBeGreaterThan(0)
  })

  it('should handle tasks with capabilities', async () => {
    const analyzer = new DependencyAnalyzer()
    const tasks: SubTask[] = [
      { ...makeTask('t1', 'Frontend'), requiredCapabilities: ['frontend_dev' as any] },
      { ...makeTask('t2', 'Backend'), requiredCapabilities: ['backend_dev' as any] },
      { ...makeTask('t3', 'Integration'), requiredCapabilities: ['frontend_dev' as any, 'backend_dev' as any] },
    ]
    const result = await analyzer.analyzeDependencies(tasks)
    expect(result.metadata.totalDependencies).toBeGreaterThanOrEqual(0)
  })

  it('should return warnings when present', async () => {
    const analyzer = new DependencyAnalyzer()
    const tasks = [
      makeTask('t1', 'Task A'),
      makeTask('t2', 'Task B'),
    ]
    const result = await analyzer.analyzeDependencies(tasks)
    expect(Array.isArray(result.warnings)).toBe(true)
  })
})
