import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConversationFlowController, ConversationPhase, FlowControlAction } from '../conversationFlowController'
import { ConversationStatus } from '../multiAgentConversation'
import { MessageType, MessagePriority } from '../communicationProtocol'

function makeConversationManager(overrides: Record<string, any> = {}) {
  return {
    getConversation: vi.fn().mockReturnValue({ id: 'conv-1', topic: 'Test', status: ConversationStatus.Idle, participants: new Map([['a1', {}], ['a2', {}]]), messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {} }),
    isParticipant: vi.fn().mockReturnValue(true),
    getActiveParticipants: vi.fn().mockReturnValue([{ agentId: 'a1' }, { agentId: 'a2' }]),
    getConversationStats: vi.fn().mockReturnValue({ totalMessages: 5, activeParticipants: 2, duration: 1000 }),
    startConversation: vi.fn().mockResolvedValue(true),
    pauseConversation: vi.fn().mockResolvedValue(true),
    resumeConversation: vi.fn().mockResolvedValue(true),
    endConversation: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as any
}

function makeBus() {
  return {
    registerHandler: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({ id: 'msg-1', status: 'processed' }),
  } as any
}

describe('ConversationFlowController', () => {
  let controller: ConversationFlowController
  let convManager: ReturnType<typeof makeConversationManager>
  let bus: ReturnType<typeof makeBus>

  beforeEach(() => {
    vi.useFakeTimers()
    convManager = makeConversationManager()
    bus = makeBus()
    controller = new ConversationFlowController(convManager, {} as any, bus)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('enum values', () => {
    it('should have conversation phases', () => {
      expect(ConversationPhase.Initialization).toBe('initialization')
      expect(ConversationPhase.Introduction).toBe('introduction')
      expect(ConversationPhase.Discussion).toBe('discussion')
      expect(ConversationPhase.Decision).toBe('decision')
      expect(ConversationPhase.Conclusion).toBe('conclusion')
      expect(ConversationPhase.FollowUp).toBe('follow_up')
    })

    it('should have flow control actions', () => {
      expect(FlowControlAction.Start).toBe('start')
      expect(FlowControlAction.Pause).toBe('pause')
      expect(FlowControlAction.Resume).toBe('resume')
      expect(FlowControlAction.NextPhase).toBe('next_phase')
      expect(FlowControlAction.PreviousPhase).toBe('previous_phase')
      expect(FlowControlAction.End).toBe('end')
      expect(FlowControlAction.Skip).toBe('skip')
    })
  })

  describe('constructor', () => {
    it('should register ControlCommand handler', () => {
      expect(bus.registerHandler).toHaveBeenCalledWith(
        expect.objectContaining({ messageType: MessageType.ControlCommand }),
      )
    })

    it('should use default config', () => {
      const config = controller.exportFlowConfig()
      expect(config.autoProgressPhases).toBe(true)
      expect(config.phaseTimeoutMs).toBe(300000)
      expect(config.requireAllParticipants).toBe(false)
      expect(config.minParticipants).toBe(2)
      expect(config.maxMessagesPerPhase).toBe(50)
      expect(config.enableFlowRules).toBe(true)
    })

    it('should accept partial config overrides', () => {
      const custom = new ConversationFlowController(convManager, {} as any, bus, { minParticipants: 5 })
      expect(custom.exportFlowConfig().minParticipants).toBe(5)
    })
  })

  describe('initializeConversation', () => {
    it('should initialize and set phase', async () => {
      expect(await controller.initializeConversation('conv-1')).toBe(true)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Initialization)
    })

    it('should return false for non-existent conversation', async () => {
      convManager.getConversation.mockReturnValue(undefined)
      expect(await controller.initializeConversation('bad')).toBe(false)
    })
  })

  describe('controlFlow', () => {
    beforeEach(async () => {
      await controller.initializeConversation('conv-1')
    })

    it('should return false for non-existent conversation', async () => {
      convManager.getConversation.mockReturnValue(undefined)
      expect(await controller.controlFlow('bad', FlowControlAction.Start)).toBe(false)
    })

    it('should return false for uninitialized conversation', async () => {
      expect(await controller.controlFlow('conv-2', FlowControlAction.Start)).toBe(false)
    })
  })

  describe('start flow', () => {
    beforeEach(async () => {
      await controller.initializeConversation('conv-1')
    })

    it('should start flow successfully', async () => {
      expect(await controller.controlFlow('conv-1', FlowControlAction.Start)).toBe(true)
      expect(convManager.startConversation).toHaveBeenCalledWith('conv-1')
    })

    it('should notify phase change on start', async () => {
        await controller.controlFlow('conv-1', FlowControlAction.Start)
      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.StatusReport,
        'flow-controller',
        expect.any(String),
        expect.objectContaining({ status: expect.stringContaining('Phase changed') }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should return false when conversation not idle', async () => {
      convManager.getConversation.mockReturnValue({ id: 'conv-1', status: ConversationStatus.Active, participants: new Map(), messages: [] })
      expect(await controller.controlFlow('conv-1', FlowControlAction.Start)).toBe(false)
    })

    it('should return false when startConversation fails', async () => {
      convManager.startConversation.mockResolvedValue(false)
      expect(await controller.controlFlow('conv-1', FlowControlAction.Start)).toBe(false)
    })
  })

  describe('pause/resume flow', () => {
    beforeEach(async () => {
      await controller.initializeConversation('conv-1')
    })

    it('should pause flow', async () => {
      expect(await controller.controlFlow('conv-1', FlowControlAction.Pause)).toBe(true)
      expect(convManager.pauseConversation).toHaveBeenCalledWith('conv-1')
    })

    it('should resume flow', async () => {
      expect(await controller.controlFlow('conv-1', FlowControlAction.Resume)).toBe(true)
      expect(convManager.resumeConversation).toHaveBeenCalledWith('conv-1')
    })

    it('should not start timer when resume fails', async () => {
      convManager.resumeConversation.mockResolvedValue(false)
      expect(await controller.controlFlow('conv-1', FlowControlAction.Resume)).toBe(false)
    })
  })

  describe('end flow', () => {
    beforeEach(async () => {
      await controller.initializeConversation('conv-1')
    })

    it('should end flow', async () => {
      expect(await controller.controlFlow('conv-1', FlowControlAction.End)).toBe(true)
      expect(convManager.endConversation).toHaveBeenCalledWith('conv-1')
      expect(controller.getCurrentPhase('conv-1')).toBeUndefined()
    })
  })

  describe('nextPhase', () => {
    beforeEach(async () => {
      await controller.initializeConversation('conv-1')
    })

    it('should progress through phases', async () => {
      // Initialization → Introduction (need 2 participants, we have 2)
      convManager.getConversation.mockReturnValue({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}]]),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      expect(await controller.controlFlow('conv-1', FlowControlAction.NextPhase)).toBe(true)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Introduction)
    })

    it('should return false when no transition matches', async () => {
      // 0 participants < minParticipants(2), so condition fails
      convManager.getConversation.mockReturnValue({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map(),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })
      expect(await controller.controlFlow('conv-1', FlowControlAction.NextPhase)).toBe(false)
    })

    it('should execute transition action when present', async () => {
      const action = vi.fn()
      controller.addPhaseTransition(ConversationPhase.Initialization, ConversationPhase.Introduction, () => true, action)

      convManager.getConversation.mockReturnValue({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}]]),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      expect(action).toHaveBeenCalled()
    })
  })

  describe('previousPhase', () => {
    beforeEach(async () => {
      await controller.initializeConversation('conv-1')
    })

    it('should regress to previous phase', async () => {
      // Move to Introduction first
      convManager.getConversation.mockReturnValue({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}]]),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Introduction)

      // Regress
      expect(await controller.controlFlow('conv-1', FlowControlAction.PreviousPhase)).toBe(true)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Initialization)
    })

    it('should return false when already at first phase', async () => {
      expect(await controller.controlFlow('conv-1', FlowControlAction.PreviousPhase)).toBe(false)
    })
  })

  describe('skip phase', () => {
    it('should delegate to progressToNextPhase', async () => {
      await controller.initializeConversation('conv-1')
      convManager.getConversation.mockReturnValue({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}]]),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      expect(await controller.controlFlow('conv-1', FlowControlAction.Skip)).toBe(true)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Introduction)
    })
  })

  describe('default action in controlFlow', () => {
    it('should return false for unknown action', async () => {
      await controller.initializeConversation('conv-1')
      expect(await controller.controlFlow('conv-1', 'unknown' as any)).toBe(false)
    })
  })

  describe('flow rules', () => {
    it('should add and remove flow rules', () => {
      const rule = {
        id: 'rule-1', name: 'Test', description: 'Test rule',
        phase: ConversationPhase.Initialization,
        condition: () => true,
        action: async () => {},
        priority: 1,
      }
      controller.addFlowRule(rule)
      expect(controller.removeFlowRule('rule-1')).toBe(true)
      expect(controller.removeFlowRule('non-existent')).toBe(false)
    })

    it('should apply flow rules on initialize', async () => {
      const action = vi.fn()
      controller.addFlowRule({
        id: 'rule-1', name: 'Test', description: 'Test rule',
        phase: ConversationPhase.Initialization,
        condition: () => true,
        action,
        priority: 1,
      })

      await controller.initializeConversation('conv-1')
      expect(action).toHaveBeenCalled()
    })

    it('should apply flow rules on phase transition', async () => {
      const action = vi.fn()
      controller.addFlowRule({
        id: 'rule-1', name: 'Test', description: 'Test rule',
        phase: ConversationPhase.Introduction,
        condition: () => true,
        action,
        priority: 1,
      })

      await controller.initializeConversation('conv-1')
      action.mockClear()

      convManager.getConversation.mockReturnValue({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}]]),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      expect(action).toHaveBeenCalled()
    })

    it('should not apply rules when condition fails', async () => {
      const action = vi.fn()
      controller.addFlowRule({
        id: 'rule-1', name: 'Test', description: 'Test rule',
        phase: ConversationPhase.Initialization,
        condition: () => false,
        action,
        priority: 1,
      })

      await controller.initializeConversation('conv-1')
      expect(action).not.toHaveBeenCalled()
    })

    it('should sort rules by priority', async () => {
      const order: number[] = []
      controller.addFlowRule({
        id: 'low', name: 'Low', description: '',
        phase: ConversationPhase.Initialization,
        condition: () => true,
        action: async () => { order.push(1) },
        priority: 1,
      })
      controller.addFlowRule({
        id: 'high', name: 'High', description: '',
        phase: ConversationPhase.Initialization,
        condition: () => true,
        action: async () => { order.push(10) },
        priority: 10,
      })

      await controller.initializeConversation('conv-1')
      expect(order).toEqual([10, 1])
    })
  })

  describe('phase timeout', () => {
    it('should auto-progress on timeout when enabled', async () => {
      controller.setAutoProgress(true)
      controller.setPhaseTimeout(5000)
      await controller.initializeConversation('conv-1')

      convManager.getConversation.mockReturnValue({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}]]),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      vi.advanceTimersByTime(5000)
      await vi.runAllTimersAsync()

      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Introduction)
    })

    it('should notify timeout when auto-progress disabled', async () => {
      controller.setAutoProgress(false)
      controller.setPhaseTimeout(5000)
      await controller.initializeConversation('conv-1')
      bus.sendMessage.mockClear()

      vi.advanceTimersByTime(5000)
      await vi.runAllTimersAsync()

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.ErrorReport,
        'flow-controller',
        expect.any(String),
        expect.objectContaining({ errorCode: 'PHASE_TIMEOUT' }),
        { priority: MessagePriority.High },
      )
    })

    it('should not start timer when phaseTimeoutMs <= 0', async () => {
      controller.setPhaseTimeout(0)
      await controller.initializeConversation('conv-1')
      bus.sendMessage.mockClear()

      vi.advanceTimersByTime(999999)
      await vi.runAllTimersAsync()

      expect(bus.sendMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleFlowControlCommand', () => {
    it('should handle pause command', async () => {
      await controller.initializeConversation('conv-1')

      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1', type: MessageType.ControlCommand, senderId: 'a1', receiverId: 'flow',
        payload: { command: 'pause', targetTaskId: 'conv-1' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(convManager.pauseConversation).toHaveBeenCalledWith('conv-1')
    })

    it('should handle resume command', async () => {
      await controller.initializeConversation('conv-1')

      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1', type: MessageType.ControlCommand, senderId: 'a1', receiverId: 'flow',
        payload: { command: 'resume', targetTaskId: 'conv-1' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(convManager.resumeConversation).toHaveBeenCalledWith('conv-1')
    })

    it('should handle cancel command', async () => {
      await controller.initializeConversation('conv-1')

      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1', type: MessageType.ControlCommand, senderId: 'a1', receiverId: 'flow',
        payload: { command: 'cancel', targetTaskId: 'conv-1' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(convManager.endConversation).toHaveBeenCalledWith('conv-1')
    })

    it('should handle restart command', async () => {
      await controller.initializeConversation('conv-1')

      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1', type: MessageType.ControlCommand, senderId: 'a1', receiverId: 'flow',
        payload: { command: 'restart', targetTaskId: 'conv-1' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(convManager.startConversation).toHaveBeenCalled()
    })

    it('should ignore unknown commands', async () => {
      await controller.initializeConversation('conv-1')

      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1', type: MessageType.ControlCommand, senderId: 'a1', receiverId: 'flow',
        payload: { command: 'unknown', targetTaskId: 'conv-1' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      // No flow action taken
      expect(convManager.pauseConversation).not.toHaveBeenCalled()
    })

    it('should ignore message without targetTaskId', async () => {
      const handler = bus.registerHandler.mock.calls[0][0].handler
      const result = await handler({
        id: 'msg-1', type: MessageType.ControlCommand, senderId: 'a1', receiverId: 'flow',
        payload: { command: 'pause' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })
      expect(result).toBeNull()
    })

    it('should ignore when conversation not found', async () => {
      convManager.getConversation.mockReturnValue(undefined)
      const handler = bus.registerHandler.mock.calls[0][0].handler
      await handler({
        id: 'msg-1', type: MessageType.ControlCommand, senderId: 'a1', receiverId: 'flow',
        payload: { command: 'pause', targetTaskId: 'bad' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })
      expect(convManager.pauseConversation).not.toHaveBeenCalled()
    })
  })

  describe('query methods', () => {
    it('should return undefined for uninitialized conversation', () => {
      expect(controller.getCurrentPhase('conv-1')).toBeUndefined()
    })

    it('should return null for getPhaseProgress when uninitialized', () => {
      expect(controller.getPhaseProgress('conv-1')).toBeNull()
    })

    it('should return phase progress', async () => {
      await controller.initializeConversation('conv-1')
      const progress = controller.getPhaseProgress('conv-1')
      expect(progress).toBeDefined()
      expect(progress!.currentPhase).toBe(ConversationPhase.Initialization)
      expect(progress!.phaseIndex).toBe(0)
      expect(progress!.totalPhases).toBe(6)
      expect(progress!.progress).toBeGreaterThan(0)
    })

    it('should return null for getConversationFlowStats when conversation missing', () => {
      convManager.getConversation.mockReturnValue(undefined)
      expect(controller.getConversationFlowStats('conv-1')).toBeNull()
    })

    it('should return conversation flow stats', async () => {
      await controller.initializeConversation('conv-1')
      const stats = controller.getConversationFlowStats('conv-1')
      expect(stats).toBeDefined()
      expect(stats!.phase).toBe(ConversationPhase.Initialization)
      expect(stats!.messageCount).toBe(5)
      expect(stats!.participantCount).toBe(2)
    })
  })

  describe('config methods', () => {
    it('should set auto progress', () => {
      controller.setAutoProgress(false)
      expect(controller.exportFlowConfig().autoProgressPhases).toBe(false)
    })

    it('should set phase timeout', () => {
      controller.setPhaseTimeout(10000)
      expect(controller.exportFlowConfig().phaseTimeoutMs).toBe(10000)
    })

    it('should set min participants', () => {
      controller.setMinParticipants(5)
      expect(controller.exportFlowConfig().minParticipants).toBe(5)
    })

    it('should export/import config', () => {
      const config = controller.exportFlowConfig()
      const newController = new ConversationFlowController(convManager, {} as any, bus)
      newController.importFlowConfig({ minParticipants: 99 })
      expect(newController.exportFlowConfig().minParticipants).toBe(99)
      expect(newController.exportFlowConfig().autoProgressPhases).toBe(true) // unchanged
    })
  })

  describe('notify guards', () => {
    it('should skip notifyPhaseChange when conversation gone', async () => {
      await controller.initializeConversation('conv-1')
      convManager.getConversation.mockReturnValue(undefined)

      // controlFlow will fail at conversation check, but we test the guard
      expect(await controller.controlFlow('conv-1', FlowControlAction.NextPhase)).toBe(false)
    })
  })

  describe('consensus and decision detection', () => {
    it('should detect consensus in Discussion phase', async () => {
      // Initialize and progress to Discussion
      await controller.initializeConversation('conv-1')

      // Setup: go through Initialization → Introduction → Discussion
      const makeConv = (msgs: any[]) => ({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}], ['a3', {}]]),
        messages: msgs, createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      // Initialization → Introduction (2+ participants)
      convManager.getConversation.mockReturnValue(makeConv([]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Introduction)

      // Introduction → Discussion (messages >= participants)
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'hi', timestamp: Date.now() },
        { senderId: 'a2', content: 'hello', timestamp: Date.now() },
        { senderId: 'a3', content: 'hey', timestamp: Date.now() },
      ]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Discussion)

      // Discussion → Decision (consensus: 3 unique senders in recent 10 messages)
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'I think X', timestamp: Date.now() },
        { senderId: 'a2', content: 'I agree', timestamp: Date.now() },
        { senderId: 'a3', content: 'Me too', timestamp: Date.now() },
      ]))

      const result = await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      expect(result).toBe(true)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Decision)
    })

    it('should detect decision keyword in Decision phase', async () => {
      await controller.initializeConversation('conv-1')

      const makeConv = (msgs: any[]) => ({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}], ['a3', {}]]),
        messages: msgs, createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      // Fast-track to Decision phase
      convManager.getConversation.mockReturnValue(makeConv([]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase) // → Introduction

      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'hi', timestamp: Date.now() },
        { senderId: 'a2', content: 'hi', timestamp: Date.now() },
        { senderId: 'a3', content: 'hi', timestamp: Date.now() },
      ]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase) // → Discussion

      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'agree', timestamp: Date.now() },
        { senderId: 'a2', content: 'agree', timestamp: Date.now() },
        { senderId: 'a3', content: 'agree', timestamp: Date.now() },
      ]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase) // → Decision

      // Decision → Conclusion (keyword 'decision' in recent messages)
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'The decision is to go with plan A', timestamp: Date.now() },
      ]))

      const result = await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      expect(result).toBe(true)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Conclusion)
    })

    it('should detect "agreed" keyword', async () => {
      await controller.initializeConversation('conv-1')

      const makeConv = (msgs: any[]) => ({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}], ['a3', {}]]),
        messages: msgs, createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      // Fast-track to Decision
      convManager.getConversation.mockReturnValue(makeConv([]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'x', timestamp: Date.now() },
        { senderId: 'a2', content: 'x', timestamp: Date.now() },
        { senderId: 'a3', content: 'x', timestamp: Date.now() },
      ]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'x', timestamp: Date.now() },
        { senderId: 'a2', content: 'x', timestamp: Date.now() },
        { senderId: 'a3', content: 'x', timestamp: Date.now() },
      ]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)

      // Decision → Conclusion with "agreed"
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'We have agreed on the approach', timestamp: Date.now() },
      ]))

      expect(await controller.controlFlow('conv-1', FlowControlAction.NextPhase)).toBe(true)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Conclusion)
    })

    it('should not detect decision without keyword', async () => {
      await controller.initializeConversation('conv-1')

      const makeConv = (msgs: any[]) => ({
        id: 'conv-1', status: ConversationStatus.Active,
        participants: new Map([['a1', {}], ['a2', {}], ['a3', {}]]),
        messages: msgs, createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
      })

      // Fast-track to Decision
      convManager.getConversation.mockReturnValue(makeConv([]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'x', timestamp: Date.now() },
        { senderId: 'a2', content: 'x', timestamp: Date.now() },
        { senderId: 'a3', content: 'x', timestamp: Date.now() },
      ]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'x', timestamp: Date.now() },
        { senderId: 'a2', content: 'x', timestamp: Date.now() },
        { senderId: 'a3', content: 'x', timestamp: Date.now() },
      ]))
      await controller.controlFlow('conv-1', FlowControlAction.NextPhase)

      // No decision keyword → should fail
      convManager.getConversation.mockReturnValue(makeConv([
        { senderId: 'a1', content: 'Still discussing', timestamp: Date.now() },
      ]))

      expect(await controller.controlFlow('conv-1', FlowControlAction.NextPhase)).toBe(false)
      expect(controller.getCurrentPhase('conv-1')).toBe(ConversationPhase.Decision)
    })
  })
})
