import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MessageQueue, MessagePriority, MessageStatus } from '../messageQueue'
import { DeadLetterQueue } from '../deadLetterQueue'

describe('MessageQueue', () => {
  let mq: MessageQueue
  let dlq: DeadLetterQueue

  beforeEach(() => {
    dlq = new DeadLetterQueue()
    mq = new MessageQueue(dlq)
  })

  describe('publish', () => {
    it('should publish a message and return it', () => {
      const msg = mq.publish('test-topic', { data: 'hello' })

      expect(msg.messageId).toBeDefined()
      expect(msg.topic).toBe('test-topic')
      expect(msg.payload).toEqual({ data: 'hello' })
      expect(msg.priority).toBe(MessagePriority.NORMAL)
      expect(msg.status).toBe(MessageStatus.PENDING)
      expect(msg.retryCount).toBe(0)
      expect(msg.maxRetries).toBe(3)
    })

    it('should publish with custom priority', () => {
      const msg = mq.publish('topic', 'payload', MessagePriority.URGENT)
      expect(msg.priority).toBe(MessagePriority.URGENT)
    })

    it('should publish with custom maxRetries', () => {
      const msg = mq.publish('topic', 'payload', MessagePriority.NORMAL, 5)
      expect(msg.maxRetries).toBe(5)
    })

    it('should increment queue size', () => {
      mq.publish('topic', 'a')
      mq.publish('topic', 'b')

      expect(mq.getQueueSize('topic')).toBe(2)
    })

    it('should sort by priority (highest first)', async () => {
      mq.publish('topic', 'low', MessagePriority.LOW)
      mq.publish('topic', 'urgent', MessagePriority.URGENT)
      mq.publish('topic', 'normal', MessagePriority.NORMAL)
      mq.publish('topic', 'high', MessagePriority.HIGH)

      // consume in priority order
      await expect(mq.consume('topic')).resolves.toMatchObject({ payload: 'urgent' })
      await expect(mq.consume('topic')).resolves.toMatchObject({ payload: 'high' })
      await expect(mq.consume('topic')).resolves.toMatchObject({ payload: 'normal' })
      await expect(mq.consume('topic')).resolves.toMatchObject({ payload: 'low' })
    })

    it('should keep queues separate by topic', () => {
      mq.publish('topic-a', 'a')
      mq.publish('topic-b', 'b')

      expect(mq.getQueueSize('topic-a')).toBe(1)
      expect(mq.getQueueSize('topic-b')).toBe(1)
    })
  })

  describe('subscribe', () => {
    it('should allow subscribing to a topic', () => {
      const handler = vi.fn()
      mq.subscribe('topic', handler)

      // Should not throw
      expect(true).toBe(true)
    })

    it('should allow multiple subscribers', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      mq.subscribe('topic', handler1)
      mq.subscribe('topic', handler2)

      // No assertion needed — just verifying no errors
      expect(true).toBe(true)
    })
  })

  describe('consume', () => {
    it('should consume message and call handlers', async () => {
      const handler = vi.fn()
      mq.subscribe('topic', handler)

      mq.publish('topic', 'test-payload')
      const result = await mq.consume('topic')

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        payload: 'test-payload',
        topic: 'topic',
      }))
      expect(result!.status).toBe(MessageStatus.COMPLETED)
    })

    it('should return null for empty queue', async () => {
      const result = await mq.consume('non-existent')
      expect(result).toBeNull()
    })

    it('should process multiple handlers', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      mq.subscribe('topic', handler1)
      mq.subscribe('topic', handler2)

      mq.publish('topic', 'data')
      await mq.consume('topic')

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('should retry on handler failure', async () => {
      const failOnce = vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce(undefined)

      mq.subscribe('topic', failOnce)
      mq.publish('topic', 'data')

      // First consume: handler fails, message re-enqueued
      const result1 = await mq.consume('topic')
      expect(result1!.status).toBe(MessageStatus.FAILED)
      expect(result1!.retryCount).toBe(1)
      expect(mq.getQueueSize('topic')).toBe(1)

      // Second consume: handler succeeds
      const result2 = await mq.consume('topic')
      expect(result2!.status).toBe(MessageStatus.COMPLETED)
    })

    it('should send to dead letter queue after max retries', async () => {
      const alwaysFail = vi.fn().mockRejectedValue(new Error('permanent failure'))
      mq.subscribe('topic', alwaysFail)
      mq.publish('topic', 'bad-data', MessagePriority.NORMAL, 2)

      // First attempt fails -> retryCount=1, re-enqueued
      await mq.consume('topic')
      expect(mq.getQueueSize('topic')).toBe(1)
      expect(dlq.size()).toBe(0)

      // Second attempt fails -> retryCount=2=maxRetries, sent to DLQ
      await mq.consume('topic')
      expect(mq.getQueueSize('topic')).toBe(0)
      expect(dlq.size()).toBe(1)

      const dlMessage = dlq.peek()!
      expect(dlMessage.topic).toBe('topic')
      expect(dlMessage.payload).toBe('bad-data')
      expect(dlMessage.error).toBe('permanent failure')
      expect(dlMessage.retryCount).toBe(2)
    })

    it('should handle async handlers', async () => {
      const asyncHandler = vi.fn(async (msg: any) => {
        await new Promise(r => setTimeout(r, 10))
      })
      mq.subscribe('topic', asyncHandler)

      mq.publish('topic', 'async-data')
      const result = await mq.consume('topic')

      expect(asyncHandler).toHaveBeenCalledTimes(1)
      expect(result!.status).toBe(MessageStatus.COMPLETED)
    })
  })

  describe('getQueueSize', () => {
    it('should return 0 for non-existent topic', () => {
      expect(mq.getQueueSize('non-existent')).toBe(0)
    })

    it('should track size correctly', () => {
      mq.publish('topic', 'a')
      mq.publish('topic', 'b')
      expect(mq.getQueueSize('topic')).toBe(2)
    })
  })

  describe('clearQueue', () => {
    it('should clear all messages for a topic', () => {
      mq.publish('topic', 'a')
      mq.publish('topic', 'b')

      mq.clearQueue('topic')
      expect(mq.getQueueSize('topic')).toBe(0)
    })

    it('should not affect other topics', () => {
      mq.publish('topic-a', 'a')
      mq.publish('topic-b', 'b')

      mq.clearQueue('topic-a')
      expect(mq.getQueueSize('topic-a')).toBe(0)
      expect(mq.getQueueSize('topic-b')).toBe(1)
    })
  })

  describe('getDeadLetterQueue', () => {
    it('should return the dead letter queue', () => {
      expect(mq.getDeadLetterQueue()).toBe(dlq)
    })
  })

  describe('MessagePriority enum', () => {
    it('should have correct values', () => {
      expect(MessagePriority.LOW).toBe(0)
      expect(MessagePriority.NORMAL).toBe(1)
      expect(MessagePriority.HIGH).toBe(2)
      expect(MessagePriority.URGENT).toBe(3)
    })
  })

  describe('MessageStatus enum', () => {
    it('should have correct values', () => {
      expect(MessageStatus.PENDING).toBe('pending')
      expect(MessageStatus.PROCESSING).toBe('processing')
      expect(MessageStatus.COMPLETED).toBe('completed')
      expect(MessageStatus.FAILED).toBe('failed')
      expect(MessageStatus.DEAD_LETTER).toBe('dead_letter')
    })
  })
})
