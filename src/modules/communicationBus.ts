import {
  MessageType,
  MessagePriority,
  MessageStatus,
  MessageEnvelope,
  CommunicationChannel,
  MessageHandler,
  createMessage,
  createReply,
  isMessageExpired,
  createCommunicationChannel,
} from './communicationProtocol'
import { configManager } from './configSchema'
import type { CollaborationConfig } from './configSchema'

export class CommunicationBus {
  private channels: Map<string, CommunicationChannel> = new Map()
  private handlers: Map<MessageType, MessageHandler[]> = new Map()
  private pendingMessages: MessageEnvelope[] = []
  private deadLetterQueue: MessageEnvelope[] = []
  private messageHistory: Map<string, MessageEnvelope[]> = new Map()
  private processedMessageIds: Map<string, number> = new Map()
  private sequenceCounters: Map<string, number> = new Map()
  private messageRetryCounts: Map<string, number> = new Map()
  private dlqThreshold: number
  private onDlqThresholdExceeded: ((count: number) => void) | null = null
  private DEDUP_TTL_MS: number
  private maxRetries: number
  private retryDelayMs: number
  private configListener: (config: CollaborationConfig) => void

  constructor() {
    const commConfig = configManager.getConfig().communication
    this.dlqThreshold = commConfig.dlqThreshold
    this.DEDUP_TTL_MS = commConfig.dedupTtlMs
    this.maxRetries = commConfig.maxRetries
    this.retryDelayMs = commConfig.retryDelayMs

    this.configListener = (config: CollaborationConfig) => {
      this.dlqThreshold = config.communication.dlqThreshold
      this.DEDUP_TTL_MS = config.communication.dedupTtlMs
      this.maxRetries = config.communication.maxRetries
      this.retryDelayMs = config.communication.retryDelayMs
    }
    configManager.addListener(this.configListener)
  }

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
      const currentSeq = this.sequenceCounters.get(options.channelId) ?? 0
      message.sequenceNo = currentSeq
      this.sequenceCounters.set(options.channelId, currentSeq + 1)

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
    const now = Date.now()
    this.cleanupExpiredDedupEntries(now)
    if (this.processedMessageIds.has(message.id)) {
      return
    }

    if (isMessageExpired(message)) {
      message.status = MessageStatus.Expired
      this.deadLetterQueue.push(message)
      if (this.deadLetterQueue.length >= this.dlqThreshold && this.onDlqThresholdExceeded) {
        this.onDlqThresholdExceeded(this.deadLetterQueue.length)
      }
      this.removeFromPending(message.id)
      return
    }

    const handlers = this.handlers.get(message.type) ?? []
    if (handlers.length === 0) {
      message.status = MessageStatus.Failed
      this.deadLetterQueue.push(message)
      if (this.deadLetterQueue.length >= this.dlqThreshold && this.onDlqThresholdExceeded) {
        this.onDlqThresholdExceeded(this.deadLetterQueue.length)
      }
      this.removeFromPending(message.id)
      return
    }

    message.status = MessageStatus.Sent

    const sortedHandlers = this.sortHandlersByPriority(handlers)

    for (const handler of sortedHandlers) {
      try {
        const response = await handler.handler(message)
        message.status = MessageStatus.Processed
        this.processedMessageIds.set(message.id, Date.now())
        this.messageRetryCounts.delete(message.id)
        this.sendAcknowledgement(message)

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
      const retryCount = this.messageRetryCounts.get(message.id) ?? 0
      if (retryCount < this.maxRetries) {
        this.messageRetryCounts.set(message.id, retryCount + 1)
        message.status = MessageStatus.Pending
        setTimeout(() => {
          this.processMessage(message)
        }, this.retryDelayMs * (retryCount + 1))
        return
      }
      this.messageRetryCounts.delete(message.id)
      message.status = MessageStatus.Failed
      this.deadLetterQueue.push(message)
      if (this.deadLetterQueue.length >= this.dlqThreshold && this.onDlqThresholdExceeded) {
        this.onDlqThresholdExceeded(this.deadLetterQueue.length)
      }
    }

    this.removeFromPending(message.id)
  }

  private sortHandlersByPriority(handlers: MessageHandler[]): MessageHandler[] {
    return [...handlers]
  }

  private sendAcknowledgement(message: MessageEnvelope): void {
    const ack = createReply(message, MessageType.Acknowledgement, message.receiverId ?? message.senderId, {
      originalMessageId: message.id,
      status: 'acknowledged',
      timestamp: Date.now(),
    })
    this.pendingMessages.push(ack)
  }

  private cleanupExpiredDedupEntries(now: number): void {
    for (const [id, timestamp] of this.processedMessageIds) {
      if (now - timestamp > this.DEDUP_TTL_MS) {
        this.processedMessageIds.delete(id)
      }
    }
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

  getChannelSequenceNo(channelId: string): number {
    return this.sequenceCounters.get(channelId) ?? 0
  }

  setDlqThreshold(threshold: number): void {
    this.dlqThreshold = threshold
  }

  setDlqAlertCallback(callback: (count: number) => void): void {
    this.onDlqThresholdExceeded = callback
  }

  updateConfig(config: Partial<CollaborationConfig['communication']>): void {
    configManager.updateConfig({ communication: config } as Partial<CollaborationConfig>)
  }

  destroy(): void {
    this.messageRetryCounts.clear()
    configManager.removeListener(this.configListener)
  }
}