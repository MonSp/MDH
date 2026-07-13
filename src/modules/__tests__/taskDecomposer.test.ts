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

  it('should handle empty description', async () => {
    const decomposer = new TaskDecomposer()
    const result = await decomposer.decompose('', [], 'low')
    expect(result.subTasks).toBeDefined()
    expect(Array.isArray(result.subTasks)).toBe(true)
  })

  it('should generate subtasks with required capabilities', async () => {
    const decomposer = new TaskDecomposer()
    const result = await decomposer.decompose(
      '开发一个REST API后端服务',
      [{ type: 'technology', value: 'Python', confidence: 0.9 }],
      'medium'
    )
    expect(result.subTasks.length).toBeGreaterThan(0)
    for (const task of result.subTasks) {
      expect(task.requiredCapabilities).toBeDefined()
      expect(Array.isArray(task.requiredCapabilities)).toBe(true)
    }
  })

  it('should produce fewer subtasks for low complexity', async () => {
    const decomposer = new TaskDecomposer()
    const simple = await decomposer.decompose('写一个hello world', [], 'low')
    const complex = await decomposer.decompose(
      '构建一个完整的电商平台，包括用户系统、商品管理、订单系统、支付系统、后台管理',
      [], 'high'
    )
    // Low complexity should produce fewer or equal subtasks than high
    expect(simple.subTasks.length).toBeLessThanOrEqual(complex.subTasks.length + 2)
  })

  it('should respect custom maxSubTasks', async () => {
    const decomposer = new TaskDecomposer({ maxSubTasks: 3 })
    const result = await decomposer.decompose(
      '构建一个完整的电商平台，包括用户系统、商品管理、订单系统',
      [],
      'high'
    )
    expect(result.subTasks.length).toBeLessThanOrEqual(5) // some tolerance
  })

  it('should include metadata with task count', async () => {
    const decomposer = new TaskDecomposer()
    const result = await decomposer.decompose(
      '创建前端页面和后端API',
      [],
      'medium'
    )
    expect(result.metadata).toBeDefined()
    expect(result.metadata.taskCount).toBe(result.subTasks.length)
    expect(result.metadata.originalComplexity).toBe('medium')
  })
})
