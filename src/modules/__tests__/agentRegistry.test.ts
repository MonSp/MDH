import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentRegistry } from '../agentRegistry'
import { AgentRole } from '../agentTypes'

describe('AgentRegistry', () => {
  let registry: InstanceType<typeof AgentRegistry>

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new AgentRegistry()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should initialize with empty state', () => {
    expect(registry.getAllConfigs()).toHaveLength(0)
  })

  it('should register default config', () => {
    const config = registry.registerDefaultConfig(
      AgentRole.Executor,
      'Test Executor',
      { provider: 'deepseek', model: 'deepseek-chat' }
    )

    expect(config).toBeDefined()
    expect(config.name).toBe('Test Executor')
    expect(registry.getAllConfigs()).toHaveLength(1)
  })

  it('should get config by id', () => {
    const config = registry.registerDefaultConfig(
      AgentRole.Executor,
      'Test Executor',
      { provider: 'deepseek', model: 'deepseek-chat' }
    )

    const found = registry.getConfig(config.id)
    expect(found?.id).toBe(config.id)
  })

  it('should get configs by role', () => {
    registry.registerDefaultConfig(AgentRole.Executor, 'Exec', { provider: 'deepseek', model: 'deepseek-chat' })
    registry.registerDefaultConfig(AgentRole.Planner, 'Plan', { provider: 'deepseek', model: 'deepseek-chat' })
    registry.registerDefaultConfig(AgentRole.Executor, 'Exec2', { provider: 'deepseek', model: 'deepseek-chat' })

    const executors = registry.getConfigsByRole(AgentRole.Executor)
    expect(executors).toHaveLength(2)
  })

  it('should unregister config', () => {
    const config = registry.registerDefaultConfig(
      AgentRole.Executor,
      'Test',
      { provider: 'deepseek', model: 'deepseek-chat' }
    )

    const result = registry.unregisterConfig(config.id)
    expect(result).toBe(true)
    expect(registry.getAllConfigs()).toHaveLength(0)
  })

  it('should spawn instance from config', () => {
    const config = registry.registerDefaultConfig(
      AgentRole.Executor,
      'Test',
      { provider: 'deepseek', model: 'deepseek-chat' }
    )

    const instance = registry.spawnInstance(config.id)
    expect(instance).not.toBeNull()
    expect(instance?.configId).toBe(config.id)
  })

  it('should return null for non-existent config', () => {
    const instance = registry.spawnInstance('missing')
    expect(instance).toBeNull()
  })
})
