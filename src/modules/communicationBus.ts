import {
  MessageType,
  MessagePriority,
  MessageStatus,
  MessageEnvelope,
  CommunicationChannel,
  MessageHandler,
  createMessage,
  isMessageExpired,
  createCommunicationChannel,
} from './communicationProtocol'

export class CommunicationBus {
  private channels: Map<string, CommunicationChannel> = new Map()
  private handlers: Map<MessageType, MessageHandler[]> = new Map()
  private pendingMessages: MessageEnvelope[] = []
  private deadLetterQueue: MessageEnvelope[] = []
  private messageHistory: Map<string, MessageEnvelope[]> = new Map()

  createChannel(
    name: string,
    type: CommunicationChannel['type'],
    participants: string[],
  ): CommunicationChannel {
    const channel = createCommunicationChannel(name, type, participants)
    this.channels.set(channel.id, channel)
    this.messageHistory.set(channel.id, [])
    return channel
  }

  removeChannel(channelId: string): boolean {
    this.messageHistory.delete(channelId)
    return this.channels.delete(channelId)
  }

  getChannel(channelId: string): CommunicationChannel | undefined {
    return this.channels.get(channelId)
  }

  getChannelsByParticipant(participantId: string): CommunicationChannel[] {
    return Array.from(this.channels.values()).filter(c =>
      c.participants.includes(participantId),
    )
  }

  registerHandler(handler: MessageHandler): void {
    const handlers = this.handlers.get(handler.messageType) ?? []
    handlers.push(handler)
    this.handlers.set(handler.messageType, handlers)
  }

  unregisterHandler(messageType: MessageType, handler: MessageHandler): boolean {
    const handlers = this.handlers.get(messageType)
    if (!handlers) return false

    const index = handlers.indexOf(handler)
    if (index === -1) return false

    handlers.splice(index, 1)
    if (handlers.length === 0) {
      this.handlers.delete(messageType)
    }
    return true
  }

  async sendMessage<T>(
    type: MessageType,
    senderId: string,
    receiverId: string | null,
    payload: T,
    options?: {
      priority?: MessagePriority
      broadcast?: boolean
      channelId?: string
      expiresAt?: number
      correlationId?: string
    },
  ): Promise<MessageEnvelope<T>> {
    const message = createMessage(type, senderId, receiverId, payload, {
      priority: options?.priority,
      broadcast: options?.broadcast,
      expiresAt: options?.expiresAt,
      correlationId: options?.correlationId,
    })

    if (options?.channelId) {
      const channel = this.channels.get(options.channelId)
      if (channel) {
        message.sessionId = options.channelId
        channel.messageHistory.push(message)
        this.addToHistory(options.channelId, message)
      }
    }

    this.pendingMessages.push(message)
    await this.processMessage(message)

    return message
  }

  async broadcastMessage<T>(
    type: MessageType,
    senderId: string,
    payload: T,
    channelId: string,
    options?: {
      priority?: MessagePriority
      expiresAt?: number
    },
  ): Promise<MessageEnvelope<T>[]> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`)
    }

    const messages: MessageEnvelope<T>[] = []
    const otherParticipants = channel.participants.filter(p => p !== senderId)

    for (const receiverId of otherParticipants) {
      const message = await this.sendMessage(type, senderId, receiverId, payload, {
        ...options,
        broadcast: true,
        channelId,
      })
      messages.push(message)
    }

    return messages
  }

  private async processMessage(message: MessageEnvelope): Promise<void> {
    if (isMessageExpired(message)) {
      message.status = MessageStatus.Expired
      this.deadLetterQueue.push(message)
      this.removeFromPending(message.id)
      return
    }

    const handlers = this.handlers.get(message.type) ?? []
    if (handlers.length === 0) {
      message.status = MessageStatus.Failed
      this.deadLetterQueue.push(message)
      this.removeFromPending(message.id)
      return
    }

    message.status = MessageStatus.Sent

    const sortedHandlers = this.sortHandlersByPriority(handlers, message.priority)

    for (const handler of sortedHandlers) {
      try {
        const response = await handler.handler(message)
        message.status = MessageStatus.Processed

        if (response) {
          this.pendingMessages.push(response)
          await this.processMessage(response)
        }

        break
      } catch (error) {
        console.error(`Handler error for message ${message.id}:`, error)
        continue
      }
    }

    if (message.status !== MessageStatus.Processed) {
      message.status = MessageStatus.Failed
      this.deadLetterQueue.push(message)
    }

    this.removeFromPending(message.id)
  }

  private sortHandlersByPriority(handlers: MessageHandler[], messagePriority: MessagePriority): MessageHandler[] {
    return [...handlers].sort((a, b) => {
      const priorityOrder = {
        [MessagePriority.Urgent]: 0,
        [MessagePriority.High]: 1,
        [MessagePriority.Normal]: 2,
        [MessagePriority.Low]: 3,
      }
      return priorityOrder[messagePriority] - priorityOrder[messagePriority]
    })
  }

  private removeFromPending(messageId: string): void {
    this.pendingMessages = this.pendingMessages.filter(m => m.id !== messageId)
  }

  private addToHistory(channelId: string, message: MessageEnvelope): void {
    const history = this.messageHistory.get(channelId) ?? []
    history.push(message)
    this.messageHistory.set(channelId, history)
  }

  getPendingMessages(): MessageEnvelope[] {
    return [...this.pendingMessages]
  }

  getDeadLetterQueue(): MessageEnvelope[] {
    return [...this.deadLetterQueue]
  }

  getMessageHistory(channelId: string): MessageEnvelope[] {
    return this.messageHistory.get(channelId) ?? []
  }

  getChannelStats(channelId: string): {
    totalMessages: number
    pendingMessages: number
    processedMessages: number
    failedMessages: number
    participants: number
  } {
    const channel = this.channels.get(channelId)
    if (!channel) {
      return {
        totalMessages: 0,
        pendingMessages: 0,
        processedMessages: 0,
        failedMessages: 0,
        participants: 0,
      }
    }

    const history = this.messageHistory.get(channelId) ?? []
    return {
      totalMessages: history.length,
      pendingMessages: history.filter(m => m.status === MessageStatus.Pending).length,
      processedMessages: history.filter(m => m.status === MessageStatus.Processed).length,
      failedMessages: history.filter(m => m.status === MessageStatus.Failed).length,
      participants: channel.participants.length,
    }
  }

  getBusStats(): {
    totalChannels: number
    totalHandlers: number
    pendingMessages: number
    deadLetterMessages: number
    totalMessagesProcessed: number
  } {
    let totalMessagesProcessed = 0
    this.messageHistory.forEach(history => {
      totalMessagesProcessed += history.filter(m => m.status === MessageStatus.Processed).length
    })

    let totalHandlers = 0
    this.handlers.forEach(handlers => {
      totalHandlers += handlers.length
    })

    return {
      totalChannels: this.channels.size,
      totalHandlers,
      pendingMessages: this.pendingMessages.length,
      deadLetterMessages: this.deadLetterQueue.length,
      totalMessagesProcessed,
    }
  }

  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length
    this.deadLetterQueue = []
    return count
  }

  retryDeadLetterMessage(messageId: string): boolean {
    const index = this.deadLetterQueue.findIndex(m => m.id === messageId)
    if (index === -1) return false

    const message = this.deadLetterQueue[index]
    this.deadLetterQueue.splice(index, 1)

    message.status = MessageStatus.Pending
    this.pendingMessages.push(message)
    this.processMessage(message)

    return true
  }

  addParticipantToChannel(channelId: string, participantId: string): boolean {
    const channel = this.channels.get(channelId)
    if (!channel) return false

    if (!channel.participants.includes(participantId)) {
      channel.participants.push(participantId)
    }
    return true
  }

  removeParticipantFromChannel(channelId: string, participantId: string): boolean {
    const channel = this.channels.get(channelId)
    if (!channel) return false

    const index = channel.participants.indexOf(participantId)
    if (index === -1) return false

    channel.participants.splice(index, 1)
    return true
  }

  getDirectChannel(agentId1: string, agentId2: string): CommunicationChannel | undefined {
    return Array.from(this.channels.values()).find(
      c =>
        c.type === 'direct' &&
        c.participants.length === 2 &&
        c.participants.includes(agentId1) &&
        c.participants.includes(agentId2),
    )
  }

  getOrCreateDirectChannel(agentId1: string, agentId2: string): CommunicationChannel {
    const existing = this.getDirectChannel(agentId1, agentId2)
    if (existing) return existing

    return this.createChannel(
      `direct-${agentId1}-${agentId2}`,
      'direct',
      [agentId1, agentId2],
    )
  }
}