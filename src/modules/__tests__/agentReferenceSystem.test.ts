import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentReferenceSystem, ReferenceType, ReferenceStatus } from '../agentReferenceSystem'
import { MessageType, MessagePriority } from '../communicationProtocol'

function makeConversationManager() {
  return {
    getConversation: vi.fn().mockReturnValue({ id: 'conv-1', topic: 'Test' }),
    isParticipant: vi.fn().mockReturnValue(true),
    getActiveParticipants: vi.fn().mockReturnValue([
      { agentId: 'agent-1', isActive: true },
      { agentId: 'agent-2', isActive: true },
    ]),
  } as any
}

function makeBus() {
  return {
    registerHandler: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({ id: 'msg-1', status: 'processed' }),
  } as any
}

function mockUUIDs() {
  let n = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => 'uuid-' + ++n)
}

describe('AgentReferenceSystem', () => {
  let system: AgentReferenceSystem
  let convManager: ReturnType<typeof makeConversationManager>
  let bus: ReturnType<typeof makeBus>

  beforeEach(() => {
    mockUUIDs()
    convManager = makeConversationManager()
    bus = makeBus()
    system = new AgentReferenceSystem(convManager, {} as any, bus)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('enum values', () => {
    it('should have reference types', () => {
      expect(ReferenceType.DirectMention).toBe('direct_mention')
      expect(ReferenceType.Quote).toBe('quote')
      expect(ReferenceType.Response).toBe('response')
      expect(ReferenceType.Collaboration).toBe('collaboration')
      expect(ReferenceType.Delegation).toBe('delegation')
      expect(ReferenceType.Feedback).toBe('feedback')
    })

    it('should have reference statuses', () => {
      expect(ReferenceStatus.Pending).toBe('pending')
      expect(ReferenceStatus.Acknowledged).toBe('acknowledged')
      expect(ReferenceStatus.Accepted).toBe('accepted')
      expect(ReferenceStatus.Rejected).toBe('rejected')
      expect(ReferenceStatus.Completed).toBe('completed')
    })
  })

  describe('constructor', () => {
    it('should register DataShare and HelpRequest handlers', () => {
      expect(bus.registerHandler).toHaveBeenCalledTimes(2)
      expect(bus.registerHandler).toHaveBeenCalledWith(
        expect.objectContaining({ messageType: MessageType.DataShare }),
      )
      expect(bus.registerHandler).toHaveBeenCalledWith(
        expect.objectContaining({ messageType: MessageType.HelpRequest }),
      )
    })
  })

  describe('createReference', () => {
    it('should create reference successfully', async () => {
      const ref = await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello agent-2',
      )

      expect(ref).toBeDefined()
      expect(ref!.id).toBe('uuid-1')
      expect(ref!.sourceAgentId).toBe('agent-1')
      expect(ref!.targetAgentId).toBe('agent-2')
      expect(ref!.referenceType).toBe(ReferenceType.DirectMention)
      expect(ref!.status).toBe(ReferenceStatus.Pending)
    })

    it('should notify target agent via DataShare', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.DataShare,
        'agent-1',
        'agent-2',
        expect.objectContaining({ key: expect.stringContaining('created') }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should return null for non-existent conversation', async () => {
      convManager.getConversation.mockReturnValue(undefined)
      expect(await system.createReference(
        'bad-conv', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )).toBeNull()
    })

    it('should return null for non-participant source', async () => {
      convManager.isParticipant.mockImplementation((_cid: string, aid: string) => aid === 'agent-2')
      expect(await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )).toBeNull()
    })

    it('should return null for non-participant target', async () => {
      convManager.isParticipant.mockImplementation((_cid: string, aid: string) => aid === 'agent-1')
      expect(await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )).toBeNull()
    })

    it('should index references by both source and target agent', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      expect(system.getReferencesByAgent('agent-1')).toHaveLength(1)
      expect(system.getReferencesByAgent('agent-2')).toHaveLength(1)
    })
  })

  describe('createReferenceRequest', () => {
    it('should create request successfully', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      const req = await system.createReferenceRequest(
        'uuid-1', 'agent-1', 'agent-2', 'review', 'Please review',
      )

      expect(req).toBeDefined()
      expect(req!.referenceId).toBe('uuid-1')
      expect(req!.requestType).toBe('review')
    })

    it('should send HelpRequest to target', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      await system.createReferenceRequest('uuid-1', 'agent-1', 'agent-2', 'review', 'Please review')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.HelpRequest,
        'agent-1',
        'agent-2',
        expect.objectContaining({ description: 'Please review' }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should return null for non-existent reference', async () => {
      expect(await system.createReferenceRequest(
        'bad-ref', 'agent-1', 'agent-2', 'review', 'Please review',
      )).toBeNull()
    })
  })

  describe('respondToReferenceRequest', () => {
    beforeEach(async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.createReferenceRequest(
        'uuid-1', 'agent-1', 'agent-2', 'review', 'Please review',
      )
    })

    it('should accept reference request', async () => {
      const resp = await system.respondToReferenceRequest('uuid-2', 'agent-2', true, 'Done!')

      expect(resp).toBeDefined()
      expect(resp!.accepted).toBe(true)
      expect(resp!.content).toBe('Done!')
    })

    it('should update reference status on accept', async () => {
      await system.respondToReferenceRequest('uuid-2', 'agent-2', true, 'Done!')

      const ref = system.getReference('uuid-1')
      expect(ref!.status).toBe(ReferenceStatus.Accepted)
    })

    it('should update reference status on reject', async () => {
      await system.respondToReferenceRequest('uuid-2', 'agent-2', false, 'Cannot do')

      const ref = system.getReference('uuid-1')
      expect(ref!.status).toBe(ReferenceStatus.Rejected)
    })

    it('should send HelpResponse', async () => {
      await system.respondToReferenceRequest('uuid-2', 'agent-2', true, 'Done!')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.HelpResponse,
        'agent-2',
        'agent-1',
        expect.objectContaining({ accepted: true }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should return null for non-existent request', async () => {
      expect(await system.respondToReferenceRequest('bad-req', 'agent-2', true, 'Done!')).toBeNull()
    })

    it('should return null for wrong agent', async () => {
      expect(await system.respondToReferenceRequest('uuid-2', 'agent-99', true, 'Done!')).toBeNull()
    })
  })

  describe('acknowledgeReference', () => {
    it('should acknowledge reference', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      const result = await system.acknowledgeReference('uuid-1', 'agent-2')
      expect(result).toBe(true)
      expect(system.getReference('uuid-1')!.status).toBe(ReferenceStatus.Acknowledged)
    })

    it('should notify on update', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      bus.sendMessage.mockClear()

      await system.acknowledgeReference('uuid-1', 'agent-2')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.DataShare,
        'reference-system',
        expect.any(String),
        expect.objectContaining({ key: expect.stringContaining('updated') }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should return false for non-existent reference', async () => {
      expect(await system.acknowledgeReference('bad-id', 'agent-1')).toBe(false)
    })

    it('should return false for wrong agent', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      expect(await system.acknowledgeReference('uuid-1', 'agent-99')).toBe(false)
    })
  })

  describe('completeReference', () => {
    it('should complete reference', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      const result = await system.completeReference('uuid-1', 'agent-2')
      expect(result).toBe(true)
      expect(system.getReference('uuid-1')!.status).toBe(ReferenceStatus.Completed)
    })

    it('should return false for non-existent reference', async () => {
      expect(await system.completeReference('bad-id', 'agent-1')).toBe(false)
    })

    it('should return false for wrong agent', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      expect(await system.completeReference('uuid-1', 'agent-99')).toBe(false)
    })
  })

  describe('startCollaboration', () => {
    it('should start collaboration successfully', async () => {
      const session = await system.startCollaboration(
        'conv-1', 'agent-1', ['agent-2', 'agent-3'], 'Code review',
      )

      expect(session).toBeDefined()
      expect(session!.topic).toBe('Code review')
      expect(session!.status).toBe('active')
      expect(session!.participants).toContain('agent-1')
      expect(session!.participants).toContain('agent-2')
      expect(session!.participants).toContain('agent-3')
    })

    it('should deduplicate initiator from participants', async () => {
      const session = await system.startCollaboration(
        'conv-1', 'agent-1', ['agent-1', 'agent-2'], 'Topic',
      )

      const count = session!.participants.filter(p => p === 'agent-1').length
      expect(count).toBe(1)
    })

    it('should notify all participants', async () => {
      await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.StatusReport,
        'reference-system',
        expect.any(String),
        expect.objectContaining({ status: expect.stringContaining('started') }),
        { priority: MessagePriority.Normal },
      )
    })

    it('should return null for non-existent conversation', async () => {
      convManager.getConversation.mockReturnValue(undefined)
      expect(await system.startCollaboration('bad-conv', 'agent-1', ['agent-2'], 'Topic')).toBeNull()
    })

    it('should return null for non-participant initiator', async () => {
      convManager.isParticipant.mockImplementation((_cid: string, aid: string) => aid !== 'agent-1')
      expect(await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')).toBeNull()
    })

    it('should return null for non-participant in list', async () => {
      convManager.isParticipant.mockImplementation((_cid: string, aid: string) => aid !== 'agent-3')
      expect(await system.startCollaboration('conv-1', 'agent-1', ['agent-2', 'agent-3'], 'Topic')).toBeNull()
    })
  })

  describe('endCollaboration', () => {
    it('should end collaboration', async () => {
      const session = await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      const result = await system.endCollaboration(session!.id, 'agent-1')
      expect(result).toBe(true)

      const ended = system.getCollaborationSession(session!.id)
      expect(ended!.status).toBe('completed')
      expect(ended!.endTime).toBeDefined()
    })

    it('should notify participants on end', async () => {
      const session = await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')
      bus.sendMessage.mockClear()

      await system.endCollaboration(session!.id, 'agent-1')

      expect(bus.sendMessage).toHaveBeenCalledWith(
        MessageType.StatusReport,
        'reference-system',
        expect.any(String),
        expect.objectContaining({ status: expect.stringContaining('ended') }),
        { priority: MessagePriority.Low },
      )
    })

    it('should return false for non-existent session', async () => {
      expect(await system.endCollaboration('bad-id', 'agent-1')).toBe(false)
    })

    it('should return false for non-participant', async () => {
      const session = await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')
      expect(await system.endCollaboration(session!.id, 'agent-99')).toBe(false)
    })
  })

  describe('addReferenceToCollaboration', () => {
    it('should add reference to collaboration', async () => {
      const session = await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.Collaboration, 'msg-1', 'Ref',
      )

      const result = await system.addReferenceToCollaboration(session!.id, 'uuid-2')
      expect(result).toBe(true)
      expect(system.getCollaborationSession(session!.id)!.references).toHaveLength(1)
    })

    it('should return false for non-existent session', async () => {
      expect(await system.addReferenceToCollaboration('bad-session', 'ref-1')).toBe(false)
    })

    it('should return false for non-existent reference', async () => {
      const session = await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')
      expect(await system.addReferenceToCollaboration(session!.id, 'bad-ref')).toBe(false)
    })

    it('should return false when source not in session', async () => {
      const session = await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      await system.createReference(
        'conv-1', 'agent-3', 'agent-2',
        ReferenceType.Collaboration, 'msg-1', 'Ref',
      )

      expect(await system.addReferenceToCollaboration(session!.id, 'uuid-2')).toBe(false)
    })

    it('should return false when target not in session', async () => {
      const session = await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      await system.createReference(
        'conv-1', 'agent-1', 'agent-3',
        ReferenceType.Collaboration, 'msg-1', 'Ref',
      )

      expect(await system.addReferenceToCollaboration(session!.id, 'uuid-2')).toBe(false)
    })
  })

  describe('handleReferenceMessage', () => {
    it('should store reference on created message', async () => {
      const handler = bus.registerHandler.mock.calls.find(
        (c: any) => c[0].messageType === MessageType.DataShare,
      )[0].handler

      const ref = {
        id: 'ref-1', conversationId: 'conv-1', sourceAgentId: 'agent-1', targetAgentId: 'agent-2',
        referenceType: ReferenceType.DirectMention, messageId: 'msg-1', content: 'Hello',
        timestamp: Date.now(), status: ReferenceStatus.Pending, metadata: {},
      }

      await handler({
        id: 'msg-1', type: MessageType.DataShare, senderId: 'agent-1', receiverId: 'agent-2',
        payload: { key: 'reference:ref-1:created', data: ref, format: 'json' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(system.getReference('ref-1')).toEqual(ref)
    })

    it('should store reference on updated message', async () => {
      const handler = bus.registerHandler.mock.calls.find(
        (c: any) => c[0].messageType === MessageType.DataShare,
      )[0].handler

      await handler({
        id: 'msg-1', type: MessageType.DataShare, senderId: 'agent-1', receiverId: 'agent-2',
        payload: { key: 'reference:ref-2:updated', data: { id: 'ref-2', status: ReferenceStatus.Accepted }, format: 'json' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(system.getReference('ref-2')).toBeDefined()
    })

    it('should ignore non-reference messages', async () => {
      const handler = bus.registerHandler.mock.calls.find(
        (c: any) => c[0].messageType === MessageType.DataShare,
      )[0].handler

      const result = await handler({
        id: 'msg-1', type: MessageType.DataShare, senderId: 'agent-1', receiverId: 'agent-2',
        payload: { key: 'other:key', data: {}, format: 'json' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(result).toBeNull()
    })

    it('should ignore reference messages with insufficient parts', async () => {
      const handler = bus.registerHandler.mock.calls.find(
        (c: any) => c[0].messageType === MessageType.DataShare,
      )[0].handler

      const result = await handler({
        id: 'msg-1', type: MessageType.DataShare, senderId: 'agent-1', receiverId: 'agent-2',
        payload: { key: 'reference:only-one', data: {}, format: 'json' },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(result).toBeNull()
    })
  })

  describe('handleCollaborationRequest', () => {
    it('should return null (placeholder)', async () => {
      const handler = bus.registerHandler.mock.calls.find(
        (c: any) => c[0].messageType === MessageType.HelpRequest,
      )[0].handler

      const result = await handler({
        id: 'msg-1', type: MessageType.HelpRequest, senderId: 'agent-1', receiverId: 'system',
        payload: { taskId: 't1', requiredCapabilities: [], description: 'Help', urgency: MessagePriority.Normal },
        timestamp: Date.now(), priority: MessagePriority.Normal, status: 'processed',
        retryCount: 0, maxRetries: 3,
      })

      expect(result).toBeNull()
    })
  })

  describe('query methods', () => {
    beforeEach(async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.createReference(
        'conv-1', 'agent-2', 'agent-1',
        ReferenceType.Response, 'msg-2', 'Reply',
      )
    })

    it('should get reference by id', () => {
      const ref = system.getReference('uuid-1')
      expect(ref).toBeDefined()
      expect(ref!.content).toBe('Hello')
    })

    it('should get references by conversation', () => {
      expect(system.getReferencesByConversation('conv-1')).toHaveLength(2)
    })

    it('should get references by agent', () => {
      expect(system.getReferencesByAgent('agent-1')).toHaveLength(2)
      expect(system.getReferencesByAgent('non-existent')).toEqual([])
    })

    it('should get references by type', () => {
      expect(system.getReferencesByType(ReferenceType.DirectMention)).toHaveLength(1)
      expect(system.getReferencesByType(ReferenceType.Response)).toHaveLength(1)
      expect(system.getReferencesByType(ReferenceType.Quote)).toHaveLength(0)
    })

    it('should get references by status', () => {
      expect(system.getReferencesByStatus(ReferenceStatus.Pending)).toHaveLength(2)
      expect(system.getReferencesByStatus(ReferenceStatus.Completed)).toHaveLength(0)
    })

    it('should return undefined for non-existent reference', () => {
      expect(system.getReference('bad-id')).toBeUndefined()
    })
  })

  describe('request/response query methods', () => {
    beforeEach(async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.createReferenceRequest('uuid-1', 'agent-1', 'agent-2', 'review', 'Please review')
      await system.respondToReferenceRequest('uuid-2', 'agent-2', true, 'Done!')
    })

    it('should get request by id', () => {
      const req = system.getReferenceRequest('uuid-2')
      expect(req).toBeDefined()
      expect(req!.requestType).toBe('review')
    })

    it('should get requests by target agent', () => {
      expect(system.getReferenceRequestsByAgent('agent-2')).toHaveLength(1)
    })

    it('should return empty for non-target agent', () => {
      expect(system.getReferenceRequestsByAgent('agent-99')).toEqual([])
    })

    it('should get response by id', () => {
      const resp = system.getReferenceResponse('uuid-3')
      expect(resp).toBeDefined()
      expect(resp!.accepted).toBe(true)
    })

    it('should get responses by request', () => {
      expect(system.getReferenceResponsesByRequest('uuid-2')).toHaveLength(1)
    })

    it('should return empty for non-existent request', () => {
      expect(system.getReferenceResponsesByRequest('bad-req')).toEqual([])
    })
  })

  describe('collaboration query methods', () => {
    beforeEach(async () => {
      await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic 1')
      await system.startCollaboration('conv-1', 'agent-2', ['agent-3'], 'Topic 2')
    })

    it('should get session by id', () => {
      const session = system.getCollaborationSession('uuid-1')
      expect(session).toBeDefined()
      expect(session!.topic).toBe('Topic 1')
    })

    it('should get sessions by conversation', () => {
      expect(system.getCollaborationSessionsByConversation('conv-1')).toHaveLength(2)
      expect(system.getCollaborationSessionsByConversation('other')).toHaveLength(0)
    })

    it('should get sessions by agent', () => {
      expect(system.getCollaborationSessionsByAgent('agent-1')).toHaveLength(1)
      expect(system.getCollaborationSessionsByAgent('agent-2')).toHaveLength(2)
    })

    it('should get active sessions', () => {
      expect(system.getActiveCollaborationSessions()).toHaveLength(2)
    })

    it('should filter active sessions after ending one', async () => {
      await system.endCollaboration('uuid-1', 'agent-1')
      expect(system.getActiveCollaborationSessions()).toHaveLength(1)
    })

    it('should return undefined for non-existent session', () => {
      expect(system.getCollaborationSession('bad-id')).toBeUndefined()
    })
  })

  describe('getReferenceStats', () => {
    it('should return correct stats', async () => {
      const ref = await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      await system.createReferenceRequest(ref!.id, 'agent-1', 'agent-2', 'review', 'Please')
      const reqs = system.getReferenceRequestsByAgent('agent-2')
      await system.respondToReferenceRequest(reqs[0].id, 'agent-2', true, 'Done')
      await system.completeReference(ref!.id, 'agent-2')

      await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      const stats = system.getReferenceStats()
      expect(stats.totalReferences).toBe(1)
      expect(stats.pendingReferences).toBe(0)
      expect(stats.completedReferences).toBe(1)
      expect(stats.totalRequests).toBe(1)
      expect(stats.acceptedRequests).toBe(1)
      expect(stats.totalCollaborations).toBe(1)
      expect(stats.activeCollaborations).toBe(1)
    })

    it('should return zeros when empty', () => {
      const stats = system.getReferenceStats()
      expect(stats.totalReferences).toBe(0)
      expect(stats.totalRequests).toBe(0)
      expect(stats.totalCollaborations).toBe(0)
    })
  })

  describe('getAgentReferenceStats', () => {
    it('should return correct per-agent stats', async () => {
      const ref = await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.createReferenceRequest(ref!.id, 'agent-1', 'agent-2', 'review', 'Please')
      const reqs = system.getReferenceRequestsByAgent('agent-2')
      await system.respondToReferenceRequest(reqs[0].id, 'agent-2', true, 'Done')
      await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      const stats = system.getAgentReferenceStats('agent-1')
      expect(stats.outgoingReferences).toBe(1)
      expect(stats.incomingReferences).toBe(0)
      expect(stats.pendingRequests).toBe(0)
      expect(stats.collaborations).toBe(1)
    })

    it('should count pending requests correctly', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.createReferenceRequest('uuid-1', 'agent-1', 'agent-2', 'review', 'Please')

      const stats = system.getAgentReferenceStats('agent-2')
      expect(stats.pendingRequests).toBe(1)
    })
  })

  describe('cleanupOldReferences', () => {
    it('should clean up old completed references', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.completeReference('uuid-1', 'agent-2')

      const ref = system.getReference('uuid-1')!
      ref.timestamp = Date.now() - 100000

      expect(system.cleanupOldReferences(50000)).toBe(1)
      expect(system.getReference('uuid-1')).toBeUndefined()
    })

    it('should not clean up non-completed references', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )

      const ref = system.getReference('uuid-1')!
      ref.timestamp = Date.now() - 100000

      expect(system.cleanupOldReferences(50000)).toBe(0)
      expect(system.getReference('uuid-1')).toBeDefined()
    })

    it('should not clean up recent references', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.completeReference('uuid-1', 'agent-2')

      expect(system.cleanupOldReferences(999999999)).toBe(0)
    })
  })

  describe('export/import', () => {
    it('should export and re-import all data', async () => {
      await system.createReference(
        'conv-1', 'agent-1', 'agent-2',
        ReferenceType.DirectMention, 'msg-1', 'Hello',
      )
      await system.createReferenceRequest('uuid-1', 'agent-1', 'agent-2', 'review', 'Please')
      await system.respondToReferenceRequest('uuid-2', 'agent-2', true, 'Done')
      await system.startCollaboration('conv-1', 'agent-1', ['agent-2'], 'Topic')

      const exported = system.exportReferenceSystem()
      expect(exported.references).toHaveLength(1)
      expect(exported.requests).toHaveLength(1)
      expect(exported.responses).toHaveLength(1)
      expect(exported.collaborations).toHaveLength(1)

      const system2 = new AgentReferenceSystem(convManager, {} as any, bus)
      system2.importReferenceSystem(exported)

      expect(system2.getReference('uuid-1')).toBeDefined()
      expect(system2.getReferenceRequest('uuid-2')).toBeDefined()
      expect(system2.getCollaborationSession('uuid-4')).toBeDefined()
    })

    it('should rebuild agent reference index on import', () => {
      const data = {
        references: [{
          id: 'ref-1', conversationId: 'conv-1', sourceAgentId: 'agent-1', targetAgentId: 'agent-2',
          referenceType: ReferenceType.DirectMention, messageId: 'msg-1', content: 'Hello',
          timestamp: Date.now(), status: ReferenceStatus.Pending, metadata: {},
        }],
        requests: [],
        responses: [],
        collaborations: [],
      }

      system.importReferenceSystem(data)

      expect(system.getReferencesByAgent('agent-1')).toHaveLength(1)
      expect(system.getReferencesByAgent('agent-2')).toHaveLength(1)
    })
  })
})
