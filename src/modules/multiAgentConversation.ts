import { AgentCoordinator } from './agentCoordinator'
import { CommunicationBus } from './communicationBus'
import { MessageType, MessagePriority, MessageEnvelope, createMessage } from './communicationProtocol'
import { AgentInstance, AgentInstanceStatus, AgentRole } from './agentTypes'

export enum ConversationStatus {
  Idle = 'idle',
  Active = 'active',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
}

export interface ConversationParticipant {
  agentId: string
  role: AgentRole
  joinedAt: number
  lastActiveAt: number
  messageCount: number
  isActive: boolean
}

export interface ConversationMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  timestamp: number
  metadata: Record<string, unknown>
  references: string[]
}

export interface ConversationContext {
  id: string
  topic: string
  status: ConversationStatus
  participants: Map<string, ConversationParticipant>
  messages: ConversationMessage[]
  createdAt: number
  updatedAt: number
  metadata: Record<string, unknown>
}

export class MultiAgentConversation {
  private coordinator: AgentCoordinator
  private communicationBus: CommunicationBus
  private conversations: Map<string, ConversationContext> = new Map()
  private activeConversationId: string | null = null

  constructor(coordinator: AgentCoordinator, communicationBus: CommunicationBus) {
    this.coordinator = coordinator
    this.communicationBus = communicationBus
    this.setupMessageHandlers()
  }

  private setupMessageHandlers(): void {
    this.communicationBus.registerHandler({
      messageType: MessageType.DataShare,
      handler: this.handleConversationMessage.bind(this),
    })
  }

  async createConversation(topic: string, metadata: Record<string, unknown> = {}): Promise<ConversationContext> {
    const conversationId = crypto.randomUUID()
    const conversation: ConversationContext = {
      id: conversationId,
      topic,
      status: ConversationStatus.Idle,
      participants: new Map(),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata,
    }

    this.conversations.set(conversationId, conversation)
    return conversation
  }

  async joinConversation(conversationId: string, agentId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false

    const agent = this.coordinator.getAgent(agentId)
    if (!agent) return false

    const agentConfig = this.coordinator.getAgentConfig(agentId)
    if (!agentConfig) return false

    const participant: ConversationParticipant = {
      agentId,
      role: agentConfig.role,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
      messageCount: 0,
      isActive: true,
    }

    conversation.participants.set(agentId, participant)
    conversation.updatedAt = Date.now()

    return true
  }

  async leaveConversation(conversationId: string, agentId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false

    const participant = conversation.participants.get(agentId)
    if (!participant) return false

    participant.isActive = false
    conversation.updatedAt = Date.now()

    return true
  }

  async startConversation(conversationId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false

    if (conversation.participants.size === 0) return false

    conversation.status = ConversationStatus.Active
    conversation.updatedAt = Date.now()
    this.activeConversationId = conversationId

    await this.notifyParticipants(conversationId, 'Conversation started')

    return true
  }

  async pauseConversation(conversationId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false

    if (conversation.status !== ConversationStatus.Active) return false

    conversation.status = ConversationStatus.Paused
    conversation.updatedAt = Date.now()

    await this.notifyParticipants(conversationId, 'Conversation paused')

    return true
  }

  async resumeConversation(conversationId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false

    if (conversation.status !== ConversationStatus.Paused) return false

    conversation.status = ConversationStatus.Active
    conversation.updatedAt = Date.now()
    this.activeConversationId = conversationId

    await this.notifyParticipants(conversationId, 'Conversation resumed')

    return true
  }

  async endConversation(conversationId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false

    conversation.status = ConversationStatus.Completed
    conversation.updatedAt = Date.now()

    if (this.activeConversationId === conversationId) {
      this.activeConversationId = null
    }

    await this.notifyParticipants(conversationId, 'Conversation ended')

    return true
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    metadata: Record<string, unknown> = {},
    references: string[] = [],
  ): Promise<ConversationMessage | null> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return null

    if (conversation.status !== ConversationStatus.Active) return null

    const participant = conversation.participants.get(senderId)
    if (!participant || !participant.isActive) return null

    const message: ConversationMessage = {
      id: crypto.randomUUID(),
      conversationId,
      senderId,
      content,
      timestamp: Date.now(),
      metadata,
      references,
    }

    conversation.messages.push(message)
    conversation.updatedAt = Date.now()

    participant.lastActiveAt = Date.now()
    participant.messageCount++

    await this.broadcastMessage(conversationId, message)

    return message
  }

  private async broadcastMessage(conversationId: string, message: ConversationMessage): Promise<void> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return

    const activeParticipants = Array.from(conversation.participants.values())
      .filter(p => p.isActive && p.agentId !== message.senderId)

    for (const participant of activeParticipants) {
      await this.communicationBus.sendMessage(
        MessageType.DataShare,
        message.senderId,
        participant.agentId,
        {
          key: `conversation:${conversationId}:message`,
          data: message,
          format: 'json',
        },
        { priority: MessagePriority.Normal },
      )
    }
  }

  private async notifyParticipants(conversationId: string, notification: string): Promise<void> {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return

    const activeParticipants = Array.from(conversation.participants.values())
      .filter(p => p.isActive)

    for (const participant of activeParticipants) {
      await this.communicationBus.sendMessage(
        MessageType.StatusReport,
        'conversation-manager',
        participant.agentId,
        {
          agentId: 'conversation-manager',
          status: notification,
          currentTaskId: null,
          completedTaskCount: 0,
          failedTaskCount: 0,
          uptime: 0,
        },
        { priority: MessagePriority.Low },
      )
    }
  }

  private async handleConversationMessage(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as { key: string; data: unknown; format: string }
    
    if (payload.key.startsWith('conversation:') && payload.key.endsWith(':message')) {
      const conversationId = payload.key.split(':')[1]
      const conversation = this.conversations.get(conversationId)
      
      if (conversation) {
        const participant = conversation.participants.get(message.receiverId!)
        if (participant) {
          participant.lastActiveAt = Date.now()
        }
      }
    }

    return null
  }

  getConversation(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId)
  }

  getActiveConversation(): ConversationContext | undefined {
    if (!this.activeConversationId) return undefined
    return this.conversations.get(this.activeConversationId)
  }

  getConversationHistory(conversationId: string): ConversationMessage[] {
    const conversation = this.conversations.get(conversationId)
    return conversation?.messages ?? []
  }

  getParticipants(conversationId: string): ConversationParticipant[] {
    const conversation = this.conversations.get(conversationId)
    return conversation ? Array.from(conversation.participants.values()) : []
  }

  getActiveParticipants(conversationId: string): ConversationParticipant[] {
    return this.getParticipants(conversationId).filter(p => p.isActive)
  }

  isParticipant(conversationId: string, agentId: string): boolean {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false
    return conversation.participants.has(agentId) && conversation.participants.get(agentId)!.isActive
  }

  getConversationStats(conversationId: string): {
    totalMessages: number
    activeParticipants: number
    averageMessagesPerParticipant: number
    duration: number
  } | null {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return null

    const activeParticipants = this.getActiveParticipants(conversationId)
    const totalMessages = conversation.messages.length
    const averageMessagesPerParticipant = activeParticipants.length > 0 
      ? totalMessages / activeParticipants.length 
      : 0

    const duration = conversation.status === ConversationStatus.Completed
      ? conversation.updatedAt - conversation.createdAt
      : Date.now() - conversation.createdAt

    return {
      totalMessages,
      activeParticipants: activeParticipants.length,
      averageMessagesPerParticipant,
      duration,
    }
  }

  getAllConversations(): ConversationContext[] {
    return Array.from(this.conversations.values())
  }

  getConversationsByStatus(status: ConversationStatus): ConversationContext[] {
    return this.getAllConversations().filter(c => c.status === status)
  }

  getConversationsByAgent(agentId: string): ConversationContext[] {
    return this.getAllConversations().filter(c => c.participants.has(agentId))
  }

  deleteConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return false

    if (conversation.status === ConversationStatus.Active) {
      this.endConversation(conversationId)
    }

    this.conversations.delete(conversationId)
    return true
  }

  exportConversation(conversationId: string): {
    context: ConversationContext
    messages: ConversationMessage[]
    participants: ConversationParticipant[]
  } | null {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) return null

    return {
      context: conversation,
      messages: conversation.messages,
      participants: Array.from(conversation.participants.values()),
    }
  }
}