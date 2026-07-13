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

  it('should handle empty input', async () => {
    const planner = new TaskPlanner()
    const result = await planner.createPlanFromInput('')
    expect(result.analysis).toBeDefined()
    expect(result.analysis.originalInput).toBe('')
  })

  it('should detect complex tasks', async () => {
    const planner = new TaskPlanner()
    const result = await planner.createPlanFromInput(
      '构建一个完整的电商平台，包括用户认证、商品管理、购物车、支付系统、订单管理和后台管理系统'
    )
    expect(result.success).toBe(true)
    expect(result.plan).not.toBeNull()
    expect(result.plan!.subTasks.length).toBeGreaterThan(1)
  })

  it('should include planning time', async () => {
    const planner = new TaskPlanner()
    const result = await planner.createPlanFromInput('创建登录页面')
    expect(result.planningTime).toBeGreaterThanOrEqual(0)
  })

  it('should extract entities from input', async () => {
    const planner = new TaskPlanner()
    const result = await planner.createPlanFromInput('创建一个 React 前端项目')
    expect(result.analysis.extractedEntities).toBeDefined()
    expect(Array.isArray(result.analysis.extractedEntities)).toBe(true)
  })

  it('should handle Chinese and English mixed input', async () => {
    const planner = new TaskPlanner()
    const result = await planner.createPlanFromInput('用 TypeScript 实现一个 REST API 服务端')
    expect(result.success).toBe(true)
    expect(result.analysis).toBeDefined()
  })
})
