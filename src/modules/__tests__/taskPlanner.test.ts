import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskPlanner } from '../taskPlanner'

describe('TaskPlanner', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should initialize with default config', () => {
    const planner = new TaskPlanner()
    expect(planner).toBeDefined()
  })

  it('should create plan from input', async () => {
    const planner = new TaskPlanner()
    const result = await planner.createPlanFromInput('创建一个计算器应用')

    expect(result.success).toBe(true)
    expect(result.plan).not.toBeNull()
    expect(result.plan!.subTasks.length).toBeGreaterThan(0)
    expect(result.analysis).toBeDefined()
    expect(result.analysis.estimatedComplexity).toBeDefined()
  })

  it('should handle simple input', async () => {
    const planner = new TaskPlanner()
    const result = await planner.createPlanFromInput('hello')

    expect(result.analysis).toBeDefined()
    expect(result.analysis.originalInput).toBe('hello')
  })
})
