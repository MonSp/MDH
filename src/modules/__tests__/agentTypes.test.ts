import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AgentRole,
  AgentCapability,
  AgentInstanceStatus,
  createAgentConfig,
  createAgentInstance,
  DEFAULT_ROLE_PROFILES,
  DEFAULT_AGENT_CONFIGS,
} from '../agentTypes'

describe('agentTypes', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should have all agent roles', () => {
    expect(AgentRole.CEO).toBe('ceo')
    expect(AgentRole.Planner).toBe('planner')
    expect(AgentRole.Executor).toBe('executor')
    expect(AgentRole.Monitor).toBe('monitor')
    expect(AgentRole.Reviewer).toBe('reviewer')
    expect(AgentRole.Coordinator).toBe('coordinator')
  })

  it('should have agent instance statuses', () => {
    expect(AgentInstanceStatus.Idle).toBe('idle')
    expect(AgentInstanceStatus.Busy).toBe('busy')
    expect(AgentInstanceStatus.Waiting).toBe('waiting')
    expect(AgentInstanceStatus.Error).toBe('error')
    expect(AgentInstanceStatus.Offline).toBe('offline')
  })

  it('should create agent config', () => {
    const config = createAgentConfig(
      'Test Agent',
      AgentRole.Executor,
      [AgentCapability.CodeGeneration],
      { provider: 'deepseek', model: 'deepseek-chat' },
    )

    expect(config.name).toBe('Test Agent')
    expect(config.role).toBe(AgentRole.Executor)
    expect(config.capabilities).toContain(AgentCapability.CodeGeneration)
    expect(config.maxConcurrentTasks).toBe(1)
    expect(config.timeout).toBe(300000)
  })

  it('should create agent config with options', () => {
    const config = createAgentConfig(
      'Fast Agent',
      AgentRole.Executor,
      [],
      { provider: 'deepseek', model: 'deepseek-chat' },
      { maxConcurrentTasks: 5, timeout: 60000 },
    )

    expect(config.maxConcurrentTasks).toBe(5)
    expect(config.timeout).toBe(60000)
  })

  it('should create agent instance', () => {
    const instance = createAgentInstance('config-1')

    expect(instance.configId).toBe('config-1')
    expect(instance.status).toBe(AgentInstanceStatus.Idle)
    expect(instance.currentTaskId).toBeNull()
    expect(instance.completedTaskCount).toBe(0)
  })

  it('should create agent instance with skill', () => {
    const instance = createAgentInstance('config-1', { skillId: 'skill-1', skillPath: '/path' })

    expect(instance.skillId).toBe('skill-1')
    expect(instance.skillPath).toBe('/path')
  })

  it('should have default role profiles', () => {
    expect(DEFAULT_ROLE_PROFILES).toBeDefined()
    expect(DEFAULT_ROLE_PROFILES[AgentRole.CEO]).toBeDefined()
    expect(DEFAULT_ROLE_PROFILES[AgentRole.Executor]).toBeDefined()
  })

  it('should have default agent configs', () => {
    expect(DEFAULT_AGENT_CONFIGS).toBeDefined()
    expect(DEFAULT_AGENT_CONFIGS[AgentRole.Executor]).toBeDefined()
  })

  it('should have role profiles for all roles', () => {
    const roles = Object.values(AgentRole)
    for (const role of roles) {
      expect(DEFAULT_ROLE_PROFILES[role]).toBeDefined()
    }
  })

  it('should create instance with default idle status', () => {
    const config = createAgentConfig({ name: 'Test', role: AgentRole.Executor })
    const instance = createAgentInstance(config)
    expect(instance.status).toBe(AgentInstanceStatus.Idle)
    expect(instance.completedTaskCount).toBe(0)
    expect(instance.failedTaskCount).toBe(0)
  })

  it('should have known capability values', () => {
    expect(AgentCapability.CodeReview).toBe('code_review')
    expect(AgentCapability.Testing).toBe('testing')
    expect(AgentCapability.Monitoring).toBe('monitoring')
  })

  it('should create config with custom capabilities', () => {
    const config = createAgentConfig(
      'Specialist',
      AgentRole.Executor,
      [AgentCapability.CodeReview, AgentCapability.Testing],
      { provider: 'deepseek', modelName: 'deepseek-chat' },
    )
    expect(config.capabilities).toContain(AgentCapability.CodeReview)
    expect(config.capabilities).toContain(AgentCapability.Testing)
    expect(config.name).toBe('Specialist')
  })
})
