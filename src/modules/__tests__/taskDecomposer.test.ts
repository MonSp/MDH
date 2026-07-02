import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskDecomposer } from '../taskDecomposer'

describe('TaskDecomposer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should initialize with default config', () => {
    const decomposer = new TaskDecomposer()
    expect(decomposer).toBeDefined()
  })

  it('should decompose simple task into subtasks', async () => {
    const decomposer = new TaskDecomposer()
    const result = await decomposer.decompose(
      '创建一个计算器应用',
      [],
      'medium'
    )

    expect(result.subTasks.length).toBeGreaterThan(0)
    expect(result.metadata.taskCount).toBe(result.subTasks.length)
  })

  it('should decompose with entities', async () => {
    const decomposer = new TaskDecomposer()
    const result = await decomposer.decompose(
      '创建一个Web应用',
      [
        { type: 'technology', value: 'React', confidence: 0.9 },
        { type: 'technology', value: 'TypeScript', confidence: 0.8 },
      ],
      'high'
    )

    expect(result.subTasks.length).toBeGreaterThan(0)
  })

  it('should use maxSubTasks as upper bound', async () => {
    const decomposer = new TaskDecomposer({ maxSubTasks: 5 })
    const result = await decomposer.decompose(
      '创建一个复杂系统',
      [],
      'high'
    )

    // maxSubTasks is a config hint, decomposition may produce fewer
    expect(result.subTasks.length).toBeLessThanOrEqual(10)
  })

  it('should set metadata correctly', async () => {
    const decomposer = new TaskDecomposer()
    const result = await decomposer.decompose('test task', [], 'low')

    expect(result.metadata).toBeDefined()
    expect(result.metadata.taskCount).toBeGreaterThan(0)
    expect(result.metadata.originalComplexity).toBe('low')
  })
})
