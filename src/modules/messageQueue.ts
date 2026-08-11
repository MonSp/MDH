import { DeadLetterQueue, type DeadLetterMessage } from './deadLetterQueue'

export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
}

export enum MessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export interface QueueMessage {
  messageId: string
  topic: string
  payload: unknown
  priority: MessagePriority
  status: MessageStatus
  retryCount: number
  maxRetries: number
  timestamp: number
}

export type MessageHandler = (message: QueueMessage) => void | Promise<void>

export class MessageQueue {
  private queues: Map<string, QueueMessage[]> = new Map()
  private subscribers: Map<string, MessageHandler[]> = new Map()
  private deadLetterQueue: DeadLetterQueue
  private nextMessageId = 1

  constructor(deadLetterQueue?: DeadLetterQueue) {
    this.deadLetterQueue = deadLetterQueue ?? new DeadLetterQueue()
  }

  publish(
    topic: string,
    payload: unknown,
    priority: MessagePriority = MessagePriority.NORMAL,
    maxRetries: number = 3
  ): QueueMessage {
    const message: QueueMessage = {
      messageId: `msg-${this.nextMessageId++}`,
      topic,
      payload,
      priority,
      status: MessageStatus.PENDING,
      retryCount: 0,
      maxRetries,
      timestamp: Date.now(),
    }

    const queue = this.getOrCreateQueue(topic)
    queue.push(message)
    this.sortQueue(queue)

    return message
  }

  subscribe(topic: string, handler: MessageHandler): void {
    const handlers = this.subscribers.get(topic) ?? []
    handlers.push(handler)
    this.subscribers.set(topic, handlers)
  }

  async consume(topic: string): Promise<QueueMessage | null> {
    const queue = this.queues.get(topic)
    if (!queue || queue.length === 0) return null

    const message = queue.shift()!
    message.status = MessageStatus.PROCESSING

    const handlers = this.subscribers.get(topic) ?? []
    let allSucceeded = true

    for (const handler of handlers) {
      try {
        await handler(message)
      } catch (err: any) {
        allSucceeded = false
        message.retryCount++

        if (message.retryCount >= message.maxRetries) {
          message.status = MessageStatus.DEAD_LETTER
          const dlMessage: DeadLetterMessage = {
            messageId: message.messageId,
            topic: message.topic,
            payload: message.payload,
            error: err.message ?? String(err),
            retryCount: message.retryCount,
            maxRetries: message.maxRetries,
            timestamp: Date.now(),
          }
          this.deadLetterQueue.enqueue(dlMessage)
        } else {
          message.status = MessageStatus.FAILED
          // Re-enqueue for retry
          queue.push(message)
          this.sortQueue(queue)
        }
        return message
      }
    }

    message.status = allSucceeded ? MessageStatus.COMPLETED : MessageStatus.FAILED
    return message
  }

  getQueueSize(topic: string): number {
    return this.queues.get(topic)?.length ?? 0
  }

  clearQueue(topic: string): void {
    this.queues.delete(topic)
  }

  getDeadLetterQueue(): DeadLetterQueue {
    return this.deadLetterQueue
  }

  private getOrCreateQueue(topic: string): QueueMessage[] {
    if (!this.queues.has(topic)) {
      this.queues.set(topic, [])
    }
    return this.queues.get(topic)!
  }

  private sortQueue(queue: QueueMessage[]): void {
    queue.sort((a, b) => b.priority - a.priority)
  }
}
