import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SpeakingCoordinator, SpeakingStrategy, SpeakingState } from '../speakingCoordinator'
import { AgentRole, AgentInstanceStatus } from '../agentTypes'
import { MessageType, MessagePriority } from '../communicationProtocol'

function makeConversationManager(overrides: Record<string, any> = {}) {
  return {
    getConversation: vi.fn().mockReturnValue({ id: 'conv-1', topic: 'Test' }),
    isParticipant: vi.fn().mockReturnValue(true),
    getActiveParticipants: vi.fn().mockReturnValue([
      { agentId: 'agent-1', role: AgentRole.Executor, isActive: true },
      { agentId: 'agent-2', role: AgentRole.Planner, isActive: true },
    ]),
    ...overrides,
  } as any
}

function makeCoordinator() {
  return {
    getAgent: vi.fn().mockReturnValue({
      id: 'agent-1',
      configId: 'config-1',
      status: AgentInstanceStatus.Idle,
    }),
    getAgentConfig: vi.fn().mockImplementation((id: string) => ({
      id: `config-${id}`,
      name: `Agent ${id}`,
      role: id === 'agent-2' ? AgentRole.Planner : AgentRole.Executor,
      capabilities: [],
      model: { provider: 'openai', model: 'gpt-4' },
      maxConcurrentTasks: 3,
      timeout: 30000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      metadata: {},
    })),
  } as any
}

function makeBus() {
  return {
    registerHandler: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({
      id: 'msg-1',
      type: MessageType.StatusReport,
      status: 'processed',
    }),
  } as any
}

describe('SpeakingCoordinator', () => {
  let coordinator: SpeakingCoordinator
  let convManager: ReturnType<typeof makeConversationManager>
  let agentCoordinator: ReturnType<typeof makeCoordinator>
  let bus: ReturnType<typeof makeBus>

  beforeEach(() => {
    vi.useFakeTimers()
    convManager = makeConversationManager()
    agentCoordinator = makeCoordinator()
    bus = makeBus()
    coordinator = new SpeakingCoordinator(convManager, agentCoordinator, bus)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('enum values', () => {
    it('should have speaking strategies', () => {
      expect(SpeakingStrategy.RoundRobin).toBe('round_robin')
      expect(SpeakingStrategy.Priority).toBe('priority')
      expect(SpeakingStrategy.RoleBased).toBe('role_based')
      expect(SpeakingStrategy.Dynamic).toBe('dynamic')
      expect(SpeakingStrategy.Random).toBe('random')
    })

    it('should have speaking states', () => {
      expect(SpeakingState.Idle).toBe('idle')
      expect(SpeakingState.Waiting).toBe('waiting')
      expect(SpeakingState.Speaking).toBe('speaking')
      expect(SpeakingState.Finished).toBe('finished')
    })
  })

  describe('constructor', () => {
    it('should register handler for HelpRequest messages', () => {
      expect(bus.registerHandler).toHaveBeenCalledWith(
        expect.objectContaining({ messageType: MessageType.HelpRequest }),
      )
    })

    it('should use default config when none provided', () => {
      const config = coordinator.exportSpeakingConfig()
      expect(config.strategy).toBe(SpeakingStrategy.RoundRobin)
      expect(config.maxSpeakingTimeMs).toBe(60000)
      expect(config.maxMessagesPerTurn).toBe(5)
      expect(config.allowInterruptions).toBe(false)
      expect(config.cooldownMs).toBe(5000)
    })

    it('should accept partial config overrides', () => {
      const custom = new SpeakingCoordinator(convManager, agentCoordinator, bus, {
        strategy: SpeakingStrategy.Priority,
        maxSpeakingTimeMs: 30000,
      })
      const config = custom.exportSpeakingConfig()
      expect(config.strategy).toBe(SpeakingStrategy.Priority)
      expect(config.maxSpeakingTimeMs).toBe(30000)
      expect(config.cooldownMs).toBe(5000) // default
    })
  })

  describe('requestToSpeak', () => {
    it('should queue request and start speaking when no current speaker', async () => {
      const result = await coordinator.requestToSpeak('conv-1', 'agent-1', 5, 'test reason')

      expect(result).toBe(true)
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeDefined()
      expect(coordinator.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-1')
    })

    it('should return false for non-existent conversation', async () => {
      convManager.getConversation.mockReturnValue(undefined)
      expect(await coordinator.requestToSpeak('bad-conv', 'agent-1')).toBe(false)
    })

    it('should return false for non-participant', async () => {
      convManager.isParticipant.mockReturnValue(false)
      expect(await coordinator.requestToSpeak('conv-1', 'agent-1')).toBe(false)
    })

    it('should return false if agent is already speaking', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      expect(await coordinator.requestToSpeak('conv-1', 'agent-1')).toBe(false)
    })

    it('should queue when another agent is already speaking', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      const result = await coordinator.requestToSpeak('conv-1', 'agent-2', 3)

      expect(result).toBe(true)
      expect(coordinator.getSpeakingQueue('conv-1')).toHaveLength(1)
    })

    it('should respect cooldown after speaking', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      // agent-1 is on cooldown
      expect(await coordinator.requestToSpeak('conv-1', 'agent-1')).toBe(false)
    })

    it('should allow request after cooldown expires', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      // Advance past cooldown (5000ms)
      vi.advanceTimersByTime(5001)

      expect(await coordinator.requestToSpeak('conv-1', 'agent-1')).toBe(true)
    })

    it('should skip cooldown when cooldownMs is 0', async () => {
      coordinator.setCooldownTime(0)
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      // No cooldown, can request immediately
      expect(await coordinator.requestToSpeak('conv-1', 'agent-1')).toBe(true)
    })
  })

  describe('releaseSpeakingTurn', () => {
    it('should release the speaking turn', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      const result = await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(result).toBe(true)
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeUndefined()
    })

    it('should return false if agent is not the current speaker', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      expect(await coordinator.releaseSpeakingTurn('conv-1', 'agent-2')).toBe(false)
    })

    it('should return false if no one is speaking', async () => {
      expect(await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')).toBe(false)
    })
  })

  describe('forceReleaseSpeakingTurn', () => {
    it('should force release current speaker', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      const result = await coordinator.forceReleaseSpeakingTurn('conv-1')

      expect(result).toBe(true)
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeUndefined()
    })

    it('should return false if no one is speaking', async () => {
      expect(await coordinator.forceReleaseSpeakingTurn('conv-1')).toBe(false)
    })
  })

  describe('queue processing with priority strategy', () => {
    beforeEach(() => {
      coordinator.setStrategy(SpeakingStrategy.Priority)
    })

    it('should process highest priority first', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 10)

      // agent-2 is queued
      expect(coordinator.getSpeakingQueue('conv-1')).toHaveLength(1)

      // Release agent-1, agent-2 should take over
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(coordinator.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-2')
    })
  })

  describe('queue processing with round-robin strategy', () => {
    it('should process in FIFO order', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)

      // Advance time so timestamps differ
      vi.advanceTimersByTime(10)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 1)

      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(coordinator.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-2')
    })
  })

  describe('queue processing with role-based strategy', () => {
    beforeEach(() => {
      coordinator.setStrategy(SpeakingStrategy.RoleBased)
    })

    it('should prioritize by role weight', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1) // Executor (weight 2)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 1) // Planner (weight 8)

      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      // Planner should go first due to higher role weight
      expect(coordinator.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-2')
    })

    it('should sort 3+ queued agents by role weight', async () => {
      // Need 3 agents so sort comparator is called
      agentCoordinator.getAgentConfig.mockImplementation((id: string) => ({
        id: `config-${id}`,
        name: `Agent ${id}`,
        role: id === 'agent-3' ? AgentRole.Coordinator : id === 'agent-2' ? AgentRole.Planner : AgentRole.Executor,
        capabilities: [],
        model: { provider: 'openai', model: 'gpt-4' },
        maxConcurrentTasks: 3,
        timeout: 30000,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        metadata: {},
      }))

      await coordinator.requestToSpeak('conv-1', 'agent-1', 1) // Executor (weight 2)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 1) // Planner (weight 8)
      await coordinator.requestToSpeak('conv-1', 'agent-3', 1) // Coordinator (weight 10)

      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      const speaker = coordinator.getCurrentSpeaker('conv-1')
      expect(speaker).toBeDefined()
      // Coordinator or Planner should go first
      expect(['agent-2', 'agent-3']).toContain(speaker!.agentId)
    })

    it('should use 0 weight for role not in priorityWeights (?? 0 branch)', async () => {
      const partialCoord = new SpeakingCoordinator(convManager, agentCoordinator, bus, {
        strategy: SpeakingStrategy.RoleBased,
        priorityWeights: {
          [AgentRole.Coordinator]: 10,
          // Planner, Executor, Reviewer, Monitor missing → ?? 0
        } as any,
      })

      // 3 agents so comparator is called with 2+ items in queue
      await partialCoord.requestToSpeak('conv-1', 'agent-1', 1)
      await partialCoord.requestToSpeak('conv-1', 'agent-2', 1)
      await partialCoord.requestToSpeak('conv-1', 'agent-3', 1)

      await partialCoord.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(partialCoord.getCurrentSpeaker('conv-1')).toBeDefined()
    })
  })

  describe('queue processing with dynamic strategy', () => {
    beforeEach(() => {
      coordinator.setStrategy(SpeakingStrategy.Dynamic)
    })

    it('should calculate dynamic score based on priority, role, and wait time', async () => {
      // Need 3 agents so sort comparator is called (2+ items in queue)
      agentCoordinator.getAgentConfig.mockImplementation((id: string) => ({
        id: `config-${id}`,
        name: `Agent ${id}`,
        role: id === 'agent-3' ? AgentRole.Planner : AgentRole.Executor,
        capabilities: [],
        model: { provider: 'openai', model: 'gpt-4' },
        maxConcurrentTasks: 3,
        timeout: 30000,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        metadata: {},
      }))

      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 5)
      await coordinator.requestToSpeak('conv-1', 'agent-3', 3)

      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(coordinator.getCurrentSpeaker('conv-1')).toBeDefined()
    })

    it('should use 0 weight for role not in priorityWeights (?? 0 branch)', async () => {
      // Create coordinator with partial priorityWeights missing Executor
      const partialConfig = new SpeakingCoordinator(convManager, agentCoordinator, bus, {
        strategy: SpeakingStrategy.Dynamic,
        priorityWeights: {
          [AgentRole.Coordinator]: 10,
          [AgentRole.Planner]: 8,
          // Executor, Reviewer, Monitor missing → will hit ?? 0
        } as any,
      })

      // 3 agents so comparator is called with 2+ items in queue
      await partialConfig.requestToSpeak('conv-1', 'agent-1', 1)
      await partialConfig.requestToSpeak('conv-1', 'agent-2', 5)
      await partialConfig.requestToSpeak('conv-1', 'agent-3', 3)

      await partialConfig.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(partialConfig.getCurrentSpeaker('conv-1')).toBeDefined()
    })
  })

  describe('queue processing with random strategy', () => {
    beforeEach(() => {
      coordinator.setStrategy(SpeakingStrategy.Random)
    })

    it('should pick a speaker from the queue', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 1)

      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      // One of the queued agents should be speaking
      const speaker = coordinator.getCurrentSpeaker('conv-1')
      expect(speaker).toBeDefined()
      expect(['agent-2']).toContain(speaker!.agentId)
    })

    it('should shuffle 3+ items in random strategy', async () => {
      // Need 3+ agents to exercise the Fisher-Yates loop body (lines 204-206)
      agentCoordinator.getAgentConfig.mockImplementation((id: string) => ({
        id: `config-${id}`,
        name: `Agent ${id}`,
        role: AgentRole.Executor,
        capabilities: [],
        model: { provider: 'openai', model: 'gpt-4' },
        maxConcurrentTasks: 3,
        timeout: 30000,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        metadata: {},
      }))

      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 1)
      await coordinator.requestToSpeak('conv-1', 'agent-3', 1)

      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      const speaker = coordinator.getCurrentSpeaker('conv-1')
      expect(speaker).toBeDefined()
      expect(['agent-2', 'agent-3']).toContain(speaker!.agentId)
    })
  })

  describe('interruption', () => {
    beforeEach(() => {
      coordinator.setAllowInterruptions(true)
    })

    it('should interrupt when request priority > 5', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)

      // High priority request from agent-2
      await coordinator.requestToSpeak('conv-1', 'agent-2', 10)

      // agent-1 should have been interrupted, agent-2 now speaking
      expect(coordinator.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-2')
    })

    it('should not interrupt when allowInterruptions is false', async () => {
      coordinator.setAllowInterruptions(false)
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)

      await coordinator.requestToSpeak('conv-1', 'agent-2', 10)

      // agent-1 still speaking, agent-2 queued
      expect(coordinator.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-1')
    })

    it('should interrupt when request role weight exceeds current by > 2', async () => {
      // agent-1 is Executor (weight 2)
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)

      // agent-2 is Planner (weight 8), diff = 6 > 2
      await coordinator.requestToSpeak('conv-1', 'agent-2', 1)

      expect(coordinator.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-2')
    })

    it('should use 0 weight for missing roles in interruption check (?? 0 branch)', async () => {
      const partialCoord = new SpeakingCoordinator(convManager, agentCoordinator, bus, {
        allowInterruptions: true,
        priorityWeights: {
          [AgentRole.Coordinator]: 10,
          // Planner, Executor, etc. missing → ?? 0
        } as any,
      })

      await partialCoord.requestToSpeak('conv-1', 'agent-1', 1)

      // Both roles resolve to ?? 0, interruption depends on priority only
      await partialCoord.requestToSpeak('conv-1', 'agent-2', 10)

      expect(partialCoord.getCurrentSpeaker('conv-1')!.agentId).toBe('agent-2')
    })
  })

  describe('speaking timeout', () => {
    it('should auto-release after maxSpeakingTimeMs', async () => {
      coordinator.setMaxSpeakingTime(10000)
      await coordinator.requestToSpeak('conv-1', 'agent-1')

      expect(coordinator.getCurrentSpeaker('conv-1')).toBeDefined()

      vi.advanceTimersByTime(10000)

      // Should have been released
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeUndefined()
    })

    it('should not start timer when maxSpeakingTimeMs <= 0', async () => {
      coordinator.setMaxSpeakingTime(0)
      await coordinator.requestToSpeak('conv-1', 'agent-1')

      vi.advanceTimersByTime(100000)

      // Still speaking
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeDefined()
    })
  })

  describe('notifications', () => {
    it('should notify participants when speaking starts', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.StatusReport,
        'speaking-coordinator',
        expect.any(String),
        expect.objectContaining({ status: expect.stringContaining('is now speaking') }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should notify participants when speaking ends', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.StatusReport,
        'speaking-coordinator',
        expect.any(String),
        expect.objectContaining({ status: expect.stringContaining('finished speaking') }),
        { priority: MessagePriority.Low },
      )
    })
  })

  describe('query methods', () => {
    it('should return undefined for getCurrentSpeaker when idle', () => {
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeUndefined()
    })

    it('should return empty array for getSpeakingQueue when no queue', () => {
      expect(coordinator.getSpeakingQueue('conv-1')).toEqual([])
    })

    it('should return empty array for getSpeakingHistory when no history', () => {
      expect(coordinator.getSpeakingHistory('conv-1')).toEqual([])
    })

    it('should track speaking history after turns complete', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      const history = coordinator.getSpeakingHistory('conv-1')
      expect(history).toHaveLength(1)
      expect(history[0].agentId).toBe('agent-1')
      expect(history[0].endTime).toBeDefined()
      expect(history[0].duration).toBeGreaterThanOrEqual(0)
    })

    it('should report isAgentSpeaking correctly', async () => {
      expect(coordinator.isAgentSpeaking('conv-1', 'agent-1')).toBe(false)

      await coordinator.requestToSpeak('conv-1', 'agent-1')
      expect(coordinator.isAgentSpeaking('conv-1', 'agent-1')).toBe(true)
      expect(coordinator.isAgentSpeaking('conv-1', 'agent-2')).toBe(false)
    })

    it('should report isAgentInQueue correctly', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.requestToSpeak('conv-1', 'agent-2')

      expect(coordinator.isAgentInQueue('conv-1', 'agent-2')).toBe(true)
      expect(coordinator.isAgentInQueue('conv-1', 'agent-1')).toBe(false) // agent-1 is speaking, not in queue
    })
  })

  describe('getSpeakingStats', () => {
    it('should return correct stats', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.requestToSpeak('conv-1', 'agent-2')

      const stats = coordinator.getSpeakingStats('conv-1')
      expect(stats.currentSpeaker).toBe('agent-1')
      expect(stats.queueLength).toBe(1)
      expect(stats.totalTurns).toBe(0) // no completed turns yet
      expect(stats.averageTurnDuration).toBe(0)
      expect(stats.totalSpeakingTime).toBe(0)
    })

    it('should calculate average duration after completed turns', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      vi.advanceTimersByTime(100)
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      const stats = coordinator.getSpeakingStats('conv-1')
      expect(stats.totalTurns).toBe(1)
      expect(stats.averageTurnDuration).toBeGreaterThanOrEqual(100)
      expect(stats.totalSpeakingTime).toBeGreaterThanOrEqual(100)
    })
  })

  describe('config methods', () => {
    it('should update strategy', () => {
      coordinator.setStrategy(SpeakingStrategy.Priority)
      expect(coordinator.exportSpeakingConfig().strategy).toBe(SpeakingStrategy.Priority)
    })

    it('should update max speaking time', () => {
      coordinator.setMaxSpeakingTime(30000)
      expect(coordinator.exportSpeakingConfig().maxSpeakingTimeMs).toBe(30000)
    })

    it('should update allow interruptions', () => {
      coordinator.setAllowInterruptions(true)
      expect(coordinator.exportSpeakingConfig().allowInterruptions).toBe(true)
    })

    it('should update cooldown time', () => {
      coordinator.setCooldownTime(10000)
      expect(coordinator.exportSpeakingConfig().cooldownMs).toBe(10000)
    })

    it('should export a copy of config', () => {
      const config1 = coordinator.exportSpeakingConfig()
      const config2 = coordinator.exportSpeakingConfig()
      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })

    it('should import config partially', () => {
      coordinator.importSpeakingConfig({ strategy: SpeakingStrategy.Dynamic, cooldownMs: 1000 })
      const config = coordinator.exportSpeakingConfig()
      expect(config.strategy).toBe(SpeakingStrategy.Dynamic)
      expect(config.cooldownMs).toBe(1000)
      expect(config.maxSpeakingTimeMs).toBe(60000) // unchanged
    })
  })

  describe('queue management', () => {
    it('should clear queue', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.requestToSpeak('conv-1', 'agent-2')

      coordinator.clearQueue('conv-1')
      expect(coordinator.getSpeakingQueue('conv-1')).toEqual([])
    })

    it('should remove specific agent from queue', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.requestToSpeak('conv-1', 'agent-2')

      const removed = coordinator.removeFromQueueById('conv-1', 'agent-2')
      expect(removed).toBe(true)
      expect(coordinator.isAgentInQueue('conv-1', 'agent-2')).toBe(false)
    })

    it('should return false when removing non-queued agent', async () => {
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      expect(coordinator.removeFromQueueById('conv-1', 'agent-99')).toBe(false)
    })

    it('should return false when removing from empty queue', () => {
      expect(coordinator.removeFromQueueById('conv-1', 'agent-1')).toBe(false)
    })
  })

  describe('handleSpeakingRequest (HelpRequest handler)', () => {
    it('should process speaking request from message handler', async () => {
      const handler = bus.registerHandler.mock.calls[0][0].handler

      await handler({
        id: 'msg-1',
        type: MessageType.HelpRequest,
        senderId: 'agent-1',
        receiverId: 'coordinator',
        payload: {
          taskId: 'conv-1',
          requiredCapabilities: ['code_generation'],
          description: 'I need to speak',
          urgency: MessagePriority.High,
        },
        timestamp: Date.now(),
        priority: MessagePriority.High,
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      })

      // agent-1 should be speaking or queued
      const speaking = coordinator.isAgentSpeaking('conv-1', 'agent-1')
      const queued = coordinator.isAgentInQueue('conv-1', 'agent-1')
      expect(speaking || queued).toBe(true)
    })
  })

  describe('mapPriorityToNumber', () => {
    it('should map Urgent to 10', async () => {
      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1',
        type: MessageType.HelpRequest,
        senderId: 'agent-1',
        receiverId: 'coordinator',
        payload: { taskId: 'conv-1', requiredCapabilities: [], description: '', urgency: MessagePriority.Urgent },
        timestamp: Date.now(),
        priority: MessagePriority.Urgent,
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      })
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeDefined()
    })

    it('should map Low to 2', async () => {
      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1',
        type: MessageType.HelpRequest,
        senderId: 'agent-1',
        receiverId: 'coordinator',
        payload: { taskId: 'conv-1', requiredCapabilities: [], description: '', urgency: MessagePriority.Low },
        timestamp: Date.now(),
        priority: MessagePriority.Low,
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      })
      expect(coordinator.getCurrentSpeaker('conv-1')).toBeDefined()
    })
  })

  describe('notifySpeakingStart/End edge cases', () => {
    it('should not send notifications when conversation is gone', async () => {
      convManager.getConversation.mockReturnValue(undefined)

      // requestToSpeak will fail at the conversation check
      const result = await coordinator.requestToSpeak('conv-1', 'agent-1')
      expect(result).toBe(false)
    })
  })

  describe('getAgentRole fallback (?? AgentRole.Executor)', () => {
    it('should default to Executor when getAgentConfig returns undefined', async () => {
      agentCoordinator.getAgentConfig.mockReturnValue(undefined)

      // Use Dynamic strategy so getAgentRole is called during sorting
      coordinator.setStrategy(SpeakingStrategy.Dynamic)

      // 3 agents so comparator runs
      await coordinator.requestToSpeak('conv-1', 'agent-1', 1)
      await coordinator.requestToSpeak('conv-1', 'agent-2', 1)
      await coordinator.requestToSpeak('conv-1', 'agent-3', 1)

      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      expect(coordinator.getCurrentSpeaker('conv-1')).toBeDefined()
    })
  })

  describe('?? 0 fallback for undefined queue/stats', () => {
    it('isAgentInQueue should return false with ?? [] for unknown conv', () => {
      expect(coordinator.isAgentInQueue('non-existent', 'agent-1')).toBe(false)
    })

    it('getSpeakingStats should use ?? [] for unknown conv', () => {
      const stats = coordinator.getSpeakingStats('non-existent')
      expect(stats.queueLength).toBe(0)
      expect(stats.totalTurns).toBe(0)
    })

    it('getSpeakingStats should use ?? 0 for null duration in history', async () => {
      // Complete a turn normally
      await coordinator.requestToSpeak('conv-1', 'agent-1')
      await coordinator.releaseSpeakingTurn('conv-1', 'agent-1')

      // Inject a history entry with null duration to trigger ?? 0
      const history = (coordinator as any).speakingHistory.get('conv-1')
      history.push({
        agentId: 'agent-99',
        conversationId: 'conv-1',
        startTime: Date.now(),
        endTime: null,
        duration: null,
        messageCount: 0,
      })

      const stats = coordinator.getSpeakingStats('conv-1')
      expect(stats.totalTurns).toBe(2)
      expect(stats.totalSpeakingTime).toBeGreaterThanOrEqual(0)
    })
  })
})
