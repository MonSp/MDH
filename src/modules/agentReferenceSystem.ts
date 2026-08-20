import { MultiAgentConversation } from './multiAgentConversation'
import { AgentCoordinator } from './agentCoordinator'
import { CommunicationBus } from './communicationBus'
import { MessageType, MessagePriority, MessageEnvelope } from './communicationProtocol'
import {
  ReferenceType,
  ReferenceStatus,
  type AgentReference,
  type ReferenceRequest,
  type ReferenceResponse,
  type CollaborationSession,
} from './agentReferenceSystem.types'

// Re-export types for external consumers
export {
  ReferenceType,
  ReferenceStatus,
  type AgentReference,
  type ReferenceRequest,
  type ReferenceResponse,
  type CollaborationSession,
} from './agentReferenceSystem.types'

export class AgentReferenceSystem {
  private conversationManager: MultiAgentConversation
  private coordinator: AgentCoordinator
  private communicationBus: CommunicationBus
  private references: Map<string, AgentReference> = new Map()
  private referenceRequests: Map<string, ReferenceRequest> = new Map()
  private referenceResponses: Map<string, ReferenceResponse> = new Map()
  private collaborationSessions: Map<string, CollaborationSession> = new Map()
  private agentReferences: Map<string, AgentReference[]> = new Map()

  constructor(
    conversationManager: MultiAgentConversation,
    coordinator: AgentCoordinator,
    communicationBus: CommunicationBus,
  ) {
    this.conversationManager = conversationManager
    this.coordinator = coordinator
    this.communicationBus = communicationBus
    this.setupMessageHandlers()
  }

  private setupMessageHandlers(): void {
    this.communicationBus.registerHandler({
      messageType: MessageType.DataShare,
      handler: this.handleReferenceMessage.bind(this),
    })

    this.communicationBus.registerHandler({
      messageType: MessageType.HelpRequest,
      handler: this.handleCollaborationRequest.bind(this),
    })
  }

  async createReference(
    conversationId: string,
    sourceAgentId: string,
    targetAgentId: string,
    referenceType: ReferenceType,
    messageId: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<AgentReference | null> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return null

    if (!this.conversationManager.isParticipant(conversationId, sourceAgentId)) return null
    if (!this.conversationManager.isParticipant(conversationId, targetAgentId)) return null

    const reference: AgentReference = {
      id: crypto.randomUUID(),
      conversationId,
      sourceAgentId,
      targetAgentId,
      referenceType,
      messageId,
      content,
      timestamp: Date.now(),
      status: ReferenceStatus.Pending,
      metadata,
    }

    this.references.set(reference.id, reference)

    const sourceRefs = this.agentReferences.get(sourceAgentId) ?? []
    sourceRefs.push(reference)
    this.agentReferences.set(sourceAgentId, sourceRefs)

    const targetRefs = this.agentReferences.get(targetAgentId) ?? []
    targetRefs.push(reference)
    this.agentReferences.set(targetAgentId, targetRefs)

    await this.notifyReferenceCreated(reference)

    return reference
  }

  async createReferenceRequest(
    referenceId: string,
    sourceAgentId: string,
    targetAgentId: string,
    requestType: string,
    content: string,
    deadline?: number,
  ): Promise<ReferenceRequest | null> {
    const reference = this.references.get(referenceId)
    if (!reference) return null

    const request: ReferenceRequest = {
      id: crypto.randomUUID(),
      referenceId,
      sourceAgentId,
      targetAgentId,
      requestType,
      content,
      timestamp: Date.now(),
      deadline,
    }

    this.referenceRequests.set(request.id, request)

    await this.sendReferenceRequest(request)

    return request
  }

  async respondToReferenceRequest(
    requestId: string,
    agentId: string,
    accepted: boolean,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<ReferenceResponse | null> {
    const request = this.referenceRequests.get(requestId)
    if (!request) return null

    if (request.targetAgentId !== agentId) return null

    const response: ReferenceResponse = {
      id: crypto.randomUUID(),
      requestId,
      agentId,
      accepted,
      content,
      timestamp: Date.now(),
      metadata,
    }

    this.referenceResponses.set(response.id, response)

    const reference = this.references.get(request.referenceId)
    if (reference) {
      reference.status = accepted ? ReferenceStatus.Accepted : ReferenceStatus.Rejected
      await this.notifyReferenceUpdated(reference)
    }

    await this.sendReferenceResponse(request, response)

    return response
  }

  async acknowledgeReference(referenceId: string, agentId: string): Promise<boolean> {
    const reference = this.references.get(referenceId)
    if (!reference) return false

    if (reference.targetAgentId !== agentId) return false

    reference.status = ReferenceStatus.Acknowledged
    await this.notifyReferenceUpdated(reference)

    return true
  }

  async completeReference(referenceId: string, agentId: string): Promise<boolean> {
    const reference = this.references.get(referenceId)
    if (!reference) return false

    if (reference.targetAgentId !== agentId) return false

    reference.status = ReferenceStatus.Completed
    await this.notifyReferenceUpdated(reference)

    return true
  }

  async startCollaboration(
    conversationId: string,
    initiatorId: string,
    participantIds: string[],
    topic: string,
    metadata: Record<string, unknown> = {},
  ): Promise<CollaborationSession | null> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return null

    if (!this.conversationManager.isParticipant(conversationId, initiatorId)) return null

    for (const participantId of participantIds) {
      if (!this.conversationManager.isParticipant(conversationId, participantId)) return null
    }

    const allParticipants = [initiatorId, ...participantIds.filter(id => id !== initiatorId)]

    const session: CollaborationSession = {
      id: crypto.randomUUID(),
      conversationId,
      participants: allParticipants,
      initiatorId,
      topic,
      status: 'active',
      startTime: Date.now(),
      endTime: null,
      references: [],
      metadata,
    }

    this.collaborationSessions.set(session.id, session)

    await this.notifyCollaborationStarted(session)

    return session
  }

  async endCollaboration(sessionId: string, agentId: string): Promise<boolean> {
    const session = this.collaborationSessions.get(sessionId)
    if (!session) return false

    if (!session.participants.includes(agentId)) return false

    session.status = 'completed'
    session.endTime = Date.now()

    await this.notifyCollaborationEnded(session)

    return true
  }

  async addReferenceToCollaboration(sessionId: string, referenceId: string): Promise<boolean> {
    const session = this.collaborationSessions.get(sessionId)
    if (!session) return false

    const reference = this.references.get(referenceId)
    if (!reference) return false

    if (!session.participants.includes(reference.sourceAgentId)) return false
    if (!session.participants.includes(reference.targetAgentId)) return false

    session.references.push(reference)
    return true
  }

  private async notifyReferenceCreated(reference: AgentReference): Promise<void> {
    await this.communicationBus.sendMessage(
      MessageType.DataShare,
      reference.sourceAgentId,
      reference.targetAgentId,
      {
        key: `reference:${reference.id}:created`,
        data: reference,
        format: 'json',
      },
      { priority: MessagePriority.Normal },
    )
  }

  private async notifyReferenceUpdated(reference: AgentReference): Promise<void> {
    await this.communicationBus.sendMessage(
      MessageType.DataShare,
      'reference-system',
      reference.sourceAgentId,
      {
        key: `reference:${reference.id}:updated`,
        data: reference,
        format: 'json',
      },
      { priority: MessagePriority.Normal },
    )

    await this.communicationBus.sendMessage(
      MessageType.DataShare,
      'reference-system',
      reference.targetAgentId,
      {
        key: `reference:${reference.id}:updated`,
        data: reference,
        format: 'json',
      },
      { priority: MessagePriority.Normal },
    )
  }

  private async sendReferenceRequest(request: ReferenceRequest): Promise<void> {
    await this.communicationBus.sendMessage(
      MessageType.HelpRequest,
      request.sourceAgentId,
      request.targetAgentId,
      {
        taskId: request.referenceId,
        requiredCapabilities: [],
        description: request.content,
        urgency: MessagePriority.Normal,
      },
      { priority: MessagePriority.Normal },
    )
  }

  private async sendReferenceResponse(request: ReferenceRequest, response: ReferenceResponse): Promise<void> {
    await this.communicationBus.sendMessage(
      MessageType.HelpResponse,
      response.agentId,
      request.sourceAgentId,
      {
        requestId: request.id,
        accepted: response.accepted,
        agentId: response.agentId,
        reason: response.content,
      },
      { priority: MessagePriority.Normal },
    )
  }

  private async notifyCollaborationStarted(session: CollaborationSession): Promise<void> {
    for (const participantId of session.participants) {
      await this.communicationBus.sendMessage(
        MessageType.StatusReport,
        'reference-system',
        participantId,
        {
          agentId: 'reference-system',
          status: `Collaboration started: ${session.topic}`,
          currentTaskId: session.id,
          completedTaskCount: 0,
          failedTaskCount: 0,
          uptime: 0,
        },
        { priority: MessagePriority.Normal },
      )
    }
  }

  private async notifyCollaborationEnded(session: CollaborationSession): Promise<void> {
    for (const participantId of session.participants) {
      await this.communicationBus.sendMessage(
        MessageType.StatusReport,
        'reference-system',
        participantId,
        {
          agentId: 'reference-system',
          status: `Collaboration ended: ${session.topic}`,
          currentTaskId: session.id,
          completedTaskCount: 0,
          failedTaskCount: 0,
          uptime: 0,
        },
        { priority: MessagePriority.Low },
      )
    }
  }

  private async handleReferenceMessage(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as { key: string; data: unknown; format: string }
    
    if (payload.key.startsWith('reference:')) {
      const parts = payload.key.split(':')
      if (parts.length >= 3) {
        const referenceId = parts[1]
        const action = parts[2]
        
        if (action === 'created' || action === 'updated') {
          const reference = payload.data as AgentReference
          this.references.set(referenceId, reference)
        }
      }
    }

    return null
  }

  private async handleCollaborationRequest(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as {
      taskId: string
      requiredCapabilities: string[]
      description: string
      urgency: MessagePriority
    }

    return null
  }

  getReference(referenceId: string): AgentReference | undefined {
    return this.references.get(referenceId)
  }

  getReferencesByConversation(conversationId: string): AgentReference[] {
    return Array.from(this.references.values())
      .filter(ref => ref.conversationId === conversationId)
  }

  getReferencesByAgent(agentId: string): AgentReference[] {
    return this.agentReferences.get(agentId) ?? []
  }

  getReferencesByType(referenceType: ReferenceType): AgentReference[] {
    return Array.from(this.references.values())
      .filter(ref => ref.referenceType === referenceType)
  }

  getReferencesByStatus(status: ReferenceStatus): AgentReference[] {
    return Array.from(this.references.values())
      .filter(ref => ref.status === status)
  }

  getReferenceRequest(requestId: string): ReferenceRequest | undefined {
    return this.referenceRequests.get(requestId)
  }

  getReferenceRequestsByAgent(agentId: string): ReferenceRequest[] {
    return Array.from(this.referenceRequests.values())
      .filter(req => req.targetAgentId === agentId)
  }

  getReferenceResponse(responseId: string): ReferenceResponse | undefined {
    return this.referenceResponses.get(responseId)
  }

  getReferenceResponsesByRequest(requestId: string): ReferenceResponse[] {
    return Array.from(this.referenceResponses.values())
      .filter(res => res.requestId === requestId)
  }

  getCollaborationSession(sessionId: string): CollaborationSession | undefined {
    return this.collaborationSessions.get(sessionId)
  }

  getCollaborationSessionsByConversation(conversationId: string): CollaborationSession[] {
    return Array.from(this.collaborationSessions.values())
      .filter(session => session.conversationId === conversationId)
  }

  getCollaborationSessionsByAgent(agentId: string): CollaborationSession[] {
    return Array.from(this.collaborationSessions.values())
      .filter(session => session.participants.includes(agentId))
  }

  getActiveCollaborationSessions(): CollaborationSession[] {
    return Array.from(this.collaborationSessions.values())
      .filter(session => session.status === 'active')
  }

  getReferenceStats(): {
    totalReferences: number
    pendingReferences: number
    completedReferences: number
    totalRequests: number
    acceptedRequests: number
    totalCollaborations: number
    activeCollaborations: number
  } {
    const references = Array.from(this.references.values())
    const requests = Array.from(this.referenceRequests.values())
    const responses = Array.from(this.referenceResponses.values())
    const collaborations = Array.from(this.collaborationSessions.values())

    return {
      totalReferences: references.length,
      pendingReferences: references.filter(r => r.status === ReferenceStatus.Pending).length,
      completedReferences: references.filter(r => r.status === ReferenceStatus.Completed).length,
      totalRequests: requests.length,
      acceptedRequests: responses.filter(r => r.accepted).length,
      totalCollaborations: collaborations.length,
      activeCollaborations: collaborations.filter(c => c.status === 'active').length,
    }
  }

  getAgentReferenceStats(agentId: string): {
    outgoingReferences: number
    incomingReferences: number
    pendingRequests: number
    collaborations: number
  } {
    const outgoing = this.getReferencesByAgent(agentId)
      .filter(ref => ref.sourceAgentId === agentId)
    const incoming = this.getReferencesByAgent(agentId)
      .filter(ref => ref.targetAgentId === agentId)
    const pendingRequests = this.getReferenceRequestsByAgent(agentId)
      .filter(req => {
        const responses = this.getReferenceResponsesByRequest(req.id)
        return responses.length === 0
      })
    const collaborations = this.getCollaborationSessionsByAgent(agentId)

    return {
      outgoingReferences: outgoing.length,
      incomingReferences: incoming.length,
      pendingRequests: pendingRequests.length,
      collaborations: collaborations.length,
    }
  }

  cleanupOldReferences(maxAgeMs: number): number {
    const cutoffTime = Date.now() - maxAgeMs
    let cleanedCount = 0

    for (const [id, reference] of this.references) {
      if (reference.timestamp < cutoffTime && reference.status === ReferenceStatus.Completed) {
        this.references.delete(id)
        cleanedCount++
      }
    }

    return cleanedCount
  }

  exportReferenceSystem(): {
    references: AgentReference[]
    requests: ReferenceRequest[]
    responses: ReferenceResponse[]
    collaborations: CollaborationSession[]
  } {
    return {
      references: Array.from(this.references.values()),
      requests: Array.from(this.referenceRequests.values()),
      responses: Array.from(this.referenceResponses.values()),
      collaborations: Array.from(this.collaborationSessions.values()),
    }
  }

  importReferenceSystem(data: {
    references: AgentReference[]
    requests: ReferenceRequest[]
    responses: ReferenceResponse[]
    collaborations: CollaborationSession[]
  }): void {
    data.references.forEach(ref => this.references.set(ref.id, ref))
    data.requests.forEach(req => this.referenceRequests.set(req.id, req))
    data.responses.forEach(res => this.referenceResponses.set(res.id, res))
    data.collaborations.forEach(collab => this.collaborationSessions.set(collab.id, collab))

    this.rebuildAgentReferenceIndex()
  }

  private rebuildAgentReferenceIndex(): void {
    this.agentReferences.clear()

    for (const reference of this.references.values()) {
      const sourceRefs = this.agentReferences.get(reference.sourceAgentId) ?? []
      sourceRefs.push(reference)
      this.agentReferences.set(reference.sourceAgentId, sourceRefs)

      const targetRefs = this.agentReferences.get(reference.targetAgentId) ?? []
      targetRefs.push(reference)
      this.agentReferences.set(reference.targetAgentId, targetRefs)
    }
  }
}
