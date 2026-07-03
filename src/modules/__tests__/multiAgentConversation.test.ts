import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MultiAgentConversation, ConversationStatus } from '../multiAgentConversation'
import { AgentCoordinator } from '../agentCoordinator'
import { CommunicationBus } from '../communicationBus'
import { MessageType, MessagePriority } from '../communicationProtocol'
import { AgentRole, AgentInstanceStatus } from '../agentTypes'

function makeCoordinator(overrides: Record<string, any> = {}) {
  return {
    getAgent: vi.fn().mockReturnValue({
      id: 'agent-1',
      configId: 'config-1',
      status: AgentInstanceStatus.Idle,
      currentTasks: [],
      completedTaskCount: 0,
      failedTaskCount: 0,
      startTime: Date.now(),
      ...overrides,
    }),
    getAgentConfig: vi.fn().mockReturnValue({
      id: 'config-1',
      name: 'Test Agent',
      role: AgentRole.Executor,
      capabilities: [],
      model: { provider: 'openai', model: 'gpt-4' },
      maxConcurrentTasks: 3,
      timeout: 30000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      metadata: {},
    }),
  } as unknown as InstanceType<typeof AgentCoordinator>
}

function makeBus() {
  return {
    registerHandler: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({
      id: 'msg-1',
      type: MessageType.DataShare,
      senderId: 'agent-1',
      receiverId: 'agent-2',
      status: 'processed',
      priority: MessagePriority.Normal,
      payload: {},
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3,
    }),
  } as unknown as InstanceType<typeof CommunicationBus>
}

describe('MultiAgentConversation', () => {
  let conversation: MultiAgentConversation
  let coordinator: ReturnType<typeof makeCoordinator>
  let bus: ReturnType<typeof makeBus>

  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid')
    coordinator = makeCoordinator()
    bus = makeBus()
    conversation = new MultiAgentConversation(coordinator, bus)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createConversation', () => {
    it('should create a conversation with correct initial state', async () => {
      const conv = await conversation.createConversation('Test topic')

      expect(conv.id).toBe('test-uuid')
      expect(conv.topic).toBe('Test topic')
      expect(conv.status).toBe(ConversationStatus.Idle)
      expect(conv.participants.size).toBe(0)
      expect(conv.messages).toEqual([])
    })

    it('should store conversation and allow retrieval', async () => {
      const conv = await conversation.createConversation('Topic')
      const retrieved = conversation.getConversation(conv.id)

      expect(retrieved).toBeDefined()
      expect(retrieved!.topic).toBe('Topic')
    })
  })

  describe('joinConversation', () => {
    it('should add participant successfully', async () => {
      const conv = await conversation.createConversation('Topic')
      const result = await conversation.joinConversation(conv.id, 'agent-1')

      expect(result).toBe(true)
      expect(coordinator.getAgent).toHaveBeenCalledWith('agent-1')
      expect(coordinator.getAgentConfig).toHaveBeenCalledWith('agent-1')
      expect(conversation.isParticipant(conv.id, 'agent-1')).toBe(true)
    })

    it('should return false for non-existent conversation', async () => {
      expect(await conversation.joinConversation('bad-id', 'agent-1')).toBe(false)
    })

    it('should return false for non-existent agent', async () => {
      coordinator.getAgent = vi.fn().mockReturnValue(undefined)
      const conv = await conversation.createConversation('Topic')

      expect(await conversation.joinConversation(conv.id, 'bad-agent')).toBe(false)
    })

    it('should return false for non-existent agent config', async () => {
      coordinator.getAgentConfig = vi.fn().mockReturnValue(undefined)
      const conv = await conversation.createConversation('Topic')

      expect(await conversation.joinConversation(conv.id, 'agent-1')).toBe(false)
    })
  })

  describe('leaveConversation', () => {
    it('should mark participant as inactive', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')

      const result = await conversation.leaveConversation(conv.id, 'agent-1')
      expect(result).toBe(true)
      expect(conversation.isParticipant(conv.id, 'agent-1')).toBe(false)
    })

    it('should return false for non-existent conversation', async () => {
      expect(await conversation.leaveConversation('bad-id', 'agent-1')).toBe(false)
    })

    it('should return false for non-participant', async () => {
      const conv = await conversation.createConversation('Topic')
      expect(await conversation.leaveConversation(conv.id, 'agent-1')).toBe(false)
    })
  })

  describe('conversation lifecycle', () => {
    it('should start conversation with participants', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')

      const started = await conversation.startConversation(conv.id)
      expect(started).toBe(true)

      const active = conversation.getActiveConversation()
      expect(active).toBeDefined()
      expect(active!.status).toBe(ConversationStatus.Active)
    })

    it('should not start conversation without participants', async () => {
      const conv = await conversation.createConversation('Topic')
      expect(await conversation.startConversation(conv.id)).toBe(false)
    })

    it('should not start non-existent conversation', async () => {
      expect(await conversation.startConversation('bad-id')).toBe(false)
    })

    it('should pause active conversation', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.startConversation(conv.id)

      const paused = await conversation.pauseConversation(conv.id)
      expect(paused).toBe(true)

      const retrieved = conversation.getConversation(conv.id)
      expect(retrieved!.status).toBe(ConversationStatus.Paused)
    })

    it('should not pause non-active conversation', async () => {
      const conv = await conversation.createConversation('Topic')
      expect(await conversation.pauseConversation(conv.id)).toBe(false)
    })

    it('should resume paused conversation', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.startConversation(conv.id)
      await conversation.pauseConversation(conv.id)

      const resumed = await conversation.resumeConversation(conv.id)
      expect(resumed).toBe(true)

      const retrieved = conversation.getConversation(conv.id)
      expect(retrieved!.status).toBe(ConversationStatus.Active)
    })

    it('should not resume non-paused conversation', async () => {
      const conv = await conversation.createConversation('Topic')
      expect(await conversation.resumeConversation(conv.id)).toBe(false)
    })

    it('should end conversation and clear active', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.startConversation(conv.id)

      const ended = await conversation.endConversation(conv.id)
      expect(ended).toBe(true)

      const retrieved = conversation.getConversation(conv.id)
      expect(retrieved!.status).toBe(ConversationStatus.Completed)
      expect(conversation.getActiveConversation()).toBeUndefined()
    })

    it('should not end non-existent conversation', async () => {
      expect(await conversation.endConversation('bad-id')).toBe(false)
    })
  })

  describe('sendMessage', () => {
    it('should send message in active conversation', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.joinConversation(conv.id, 'agent-2')
      await conversation.startConversation(conv.id)

      const msg = await conversation.sendMessage(conv.id, 'agent-1', 'Hello!')

      expect(msg).toBeDefined()
      expect(msg!.content).toBe('Hello!')
      expect(msg!.senderId).toBe('agent-1')

      const history = conversation.getConversationHistory(conv.id)
      expect(history).toHaveLength(1)
    })

    it('should increment participant message count', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.startConversation(conv.id)

      await conversation.sendMessage(conv.id, 'agent-1', 'msg 1')
      await conversation.sendMessage(conv.id, 'agent-1', 'msg 2')

      const participants = conversation.getParticipants(conv.id)
      expect(participants[0].messageCount).toBe(2)
    })

    it('should broadcast to other active participants', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.joinConversation(conv.id, 'agent-2')
      await conversation.startConversation(conv.id)

      await conversation.sendMessage(conv.id, 'agent-1', 'Hello!')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.DataShare,
        'agent-1',
        'agent-2',
        expect.objectContaining({
          key: `conversation:${conv.id}:message`,
          format: 'json',
        }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should return null for non-existent conversation', async () => {
      expect(await conversation.sendMessage('bad-id', 'agent-1', 'msg')).toBeNull()
    })

    it('should return null for non-active conversation', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')

      expect(await conversation.sendMessage(conv.id, 'agent-1', 'msg')).toBeNull()
    })

    it('should return null for non-participant', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.startConversation(conv.id)

      expect(await conversation.sendMessage(conv.id, 'agent-2', 'msg')).toBeNull()
    })

    it('should return null for inactive participant', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.leaveConversation(conv.id, 'agent-1')
      // rejoin to make active
      await conversation.joinConversation(conv.id, 'agent-2')
      await conversation.startConversation(conv.id)

      // agent-1 is inactive now
      expect(await conversation.sendMessage(conv.id, 'agent-1', 'msg')).toBeNull()
    })
  })

  describe('query methods', () => {
    it('should return empty array for non-existent conversation history', () => {
      expect(conversation.getConversationHistory('bad-id')).toEqual([])
    })

    it('should return empty array for non-existent participants', () => {
      expect(conversation.getParticipants('bad-id')).toEqual([])
    })

    it('should filter active participants', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.joinConversation(conv.id, 'agent-2')
      await conversation.leaveConversation(conv.id, 'agent-1')

      const active = conversation.getActiveParticipants(conv.id)
      expect(active).toHaveLength(1)
      expect(active[0].agentId).toBe('agent-2')
    })

    it('should return false for non-participant isParticipant', () => {
      expect(conversation.isParticipant('bad-id', 'agent-1')).toBe(false)
    })

    it('should get conversations by status', async () => {
      let callCount = 0
      vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `uuid-${++callCount}`)

      await conversation.createConversation('Topic 1')
      const conv2 = await conversation.createConversation('Topic 2')
      await conversation.joinConversation(conv2.id, 'agent-1')
      await conversation.startConversation(conv2.id)

      const idle = conversation.getConversationsByStatus(ConversationStatus.Idle)
      const active = conversation.getConversationsByStatus(ConversationStatus.Active)

      expect(idle).toHaveLength(1)
      expect(active).toHaveLength(1)
    })

    it('should get conversations by agent', async () => {
      let callCount = 0
      vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `uuid-${++callCount}`)

      const conv1 = await conversation.createConversation('Topic 1')
      await conversation.joinConversation(conv1.id, 'agent-1')
      await conversation.createConversation('Topic 2')

      const agentConvs = conversation.getConversationsByAgent('agent-1')
      expect(agentConvs).toHaveLength(1)
    })

    it('should get all conversations', async () => {
      let callCount = 0
      vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `uuid-${++callCount}`)

      await conversation.createConversation('Topic 1')
      await conversation.createConversation('Topic 2')

      expect(conversation.getAllConversations()).toHaveLength(2)
    })
  })

  describe('getConversationStats', () => {
    it('should calculate stats for conversation', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.joinConversation(conv.id, 'agent-2')
      await conversation.startConversation(conv.id)
      await conversation.sendMessage(conv.id, 'agent-1', 'msg 1')
      await conversation.sendMessage(conv.id, 'agent-2', 'msg 2')

      const stats = conversation.getConversationStats(conv.id)
      expect(stats).toBeDefined()
      expect(stats!.totalMessages).toBe(2)
      expect(stats!.activeParticipants).toBe(2)
      expect(stats!.averageMessagesPerParticipant).toBe(1)
      expect(stats!.duration).toBeGreaterThanOrEqual(0)
    })

    it('should return null for non-existent conversation', () => {
      expect(conversation.getConversationStats('bad-id')).toBeNull()
    })
  })

  describe('deleteConversation', () => {
    it('should delete idle conversation', async () => {
      const conv = await conversation.createConversation('Topic')

      expect(conversation.deleteConversation(conv.id)).toBe(true)
      expect(conversation.getConversation(conv.id)).toBeUndefined()
    })

    it('should end active conversation before deleting', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.startConversation(conv.id)

      expect(conversation.deleteConversation(conv.id)).toBe(true)
      expect(conversation.getConversation(conv.id)).toBeUndefined()
    })

    it('should return false for non-existent conversation', () => {
      expect(conversation.deleteConversation('bad-id')).toBe(false)
    })
  })

  describe('exportConversation', () => {
    it('should export conversation data', async () => {
      const conv = await conversation.createConversation('Topic')
      await conversation.joinConversation(conv.id, 'agent-1')
      await conversation.startConversation(conv.id)
      await conversation.sendMessage(conv.id, 'agent-1', 'Hello')

      const exported = conversation.exportConversation(conv.id)
      expect(exported).toBeDefined()
      expect(exported!.context.topic).toBe('Topic')
      expect(exported!.messages).toHaveLength(1)
      expect(exported!.participants).toHaveLength(1)
    })

    it('should return null for non-existent conversation', () => {
      expect(conversation.exportConversation('bad-id')).toBeNull()
    })
  })
})
