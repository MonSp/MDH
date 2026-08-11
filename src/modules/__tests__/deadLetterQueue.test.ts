import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DeadLetterQueue, type DeadLetterMessage } from '../deadLetterQueue'

function makeMessage(overrides: Partial<DeadLetterMessage> = {}): DeadLetterMessage {
  return {
    messageId: 'msg-1',
    topic: 'test-topic',
    payload: { data: 'test' },
    error: 'handler failed',
    retryCount: 3,
    maxRetries: 3,
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue

  beforeEach(() => {
    dlq = new DeadLetterQueue()
  })

  describe('enqueue and dequeue', () => {
    it('should enqueue and dequeue messages in FIFO order', () => {
      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))
      dlq.enqueue(makeMessage({ messageId: 'msg-2' }))
      dlq.enqueue(makeMessage({ messageId: 'msg-3' }))

      expect(dlq.dequeue()!.messageId).toBe('msg-1')
      expect(dlq.dequeue()!.messageId).toBe('msg-2')
      expect(dlq.dequeue()!.messageId).toBe('msg-3')
    })

    it('should return null when dequeuing empty queue', () => {
      expect(dlq.dequeue()).toBeNull()
    })
  })

  describe('peek', () => {
    it('should return first message without removing', () => {
      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))
      dlq.enqueue(makeMessage({ messageId: 'msg-2' }))

      expect(dlq.peek()!.messageId).toBe('msg-1')
      expect(dlq.size()).toBe(2)
    })

    it('should return null for empty queue', () => {
      expect(dlq.peek()).toBeNull()
    })
  })

  describe('size', () => {
    it('should return correct size', () => {
      expect(dlq.size()).toBe(0)

      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))
      expect(dlq.size()).toBe(1)

      dlq.enqueue(makeMessage({ messageId: 'msg-2' }))
      expect(dlq.size()).toBe(2)

      dlq.dequeue()
      expect(dlq.size()).toBe(1)
    })
  })

  describe('getAll', () => {
    it('should return all messages', () => {
      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))
      dlq.enqueue(makeMessage({ messageId: 'msg-2' }))

      const all = dlq.getAll()
      expect(all).toHaveLength(2)
      expect(all[0].messageId).toBe('msg-1')
      expect(all[1].messageId).toBe('msg-2')
    })

    it('should return a copy (not a reference)', () => {
      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))

      const all = dlq.getAll()
      all.pop()

      expect(dlq.size()).toBe(1)
    })

    it('should return empty array for empty queue', () => {
      expect(dlq.getAll()).toEqual([])
    })
  })

  describe('clear', () => {
    it('should remove all messages', () => {
      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))
      dlq.enqueue(makeMessage({ messageId: 'msg-2' }))

      dlq.clear()

      expect(dlq.size()).toBe(0)
      expect(dlq.getAll()).toEqual([])
    })
  })

  describe('setThreshold and setOnThresholdExceeded', () => {
    it('should call callback when threshold exceeded', () => {
      const callback = vi.fn()
      dlq.setThreshold(2)
      dlq.setOnThresholdExceeded(callback)

      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))
      expect(callback).not.toHaveBeenCalled()

      dlq.enqueue(makeMessage({ messageId: 'msg-2' }))
      expect(callback).not.toHaveBeenCalled()

      dlq.enqueue(makeMessage({ messageId: 'msg-3' }))
      expect(callback).toHaveBeenCalledWith(3)
    })

    it('should call callback on every enqueue after threshold', () => {
      const callback = vi.fn()
      dlq.setThreshold(1)
      dlq.setOnThresholdExceeded(callback)

      dlq.enqueue(makeMessage({ messageId: 'msg-1' }))
      expect(callback).not.toHaveBeenCalled()

      dlq.enqueue(makeMessage({ messageId: 'msg-2' }))
      expect(callback).toHaveBeenCalledTimes(1)

      dlq.enqueue(makeMessage({ messageId: 'msg-3' }))
      expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should work with default threshold (100)', () => {
      const callback = vi.fn()
      dlq.setOnThresholdExceeded(callback)

      for (let i = 0; i < 101; i++) {
        dlq.enqueue(makeMessage({ messageId: `msg-${i}` }))
      }

      expect(callback).toHaveBeenCalledWith(101)
    })
  })
})
