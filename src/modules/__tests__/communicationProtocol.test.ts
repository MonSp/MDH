import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MessageType,
  MessagePriority,
  MessageStatus,
  createMessage,
  createReply,
  isMessageExpired,
} from '../communicationProtocol'

describe('communicationProtocol', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should have message types', () => {
    expect(MessageType.TaskAssignment).toBeDefined()
    expect(MessageType.TaskResult).toBeDefined()
    expect(MessageType.StatusReport).toBeDefined()
    expect(MessageType.Heartbeat).toBeDefined()
  })

  it('should have message priorities', () => {
    expect(MessagePriority.Low).toBeDefined()
    expect(MessagePriority.Normal).toBeDefined()
    expect(MessagePriority.High).toBeDefined()
    expect(MessagePriority.Urgent).toBeDefined()
  })

  it('should have message statuses', () => {
    expect(MessageStatus.Pending).toBe('pending')
    expect(MessageStatus.Sent).toBe('sent')
    expect(MessageStatus.Delivered).toBe('delivered')
    expect(MessageStatus.Processed).toBe('processed')
    expect(MessageStatus.Failed).toBe('failed')
    expect(MessageStatus.Expired).toBe('expired')
  })

  it('should create message', () => {
    const msg = createMessage(
      MessageType.TaskAssignment,
      'sender-1',
      'receiver-1',
      { taskId: 't1' },
    )

    expect(msg.type).toBe(MessageType.TaskAssignment)
    expect(msg.senderId).toBe('sender-1')
    expect(msg.receiverId).toBe('receiver-1')
    expect(msg.payload).toEqual({ taskId: 't1' })
    expect(msg.status).toBe(MessageStatus.Pending)
  })

  it('should create reply', () => {
    const original = createMessage(
      MessageType.TaskAssignment,
      'sender-1',
      'receiver-1',
      { taskId: 't1' },
    )

    const reply = createReply(original, MessageType.TaskResult, 'receiver-1', { accepted: true })

    expect(reply.type).toBe(MessageType.TaskResult)
    expect(reply.senderId).toBe('receiver-1')
    expect(reply.receiverId).toBe('sender-1')
    expect(reply.replyTo).toBe(original.id)
  })

  it('should check message expiration', () => {
    const msg = createMessage(
      MessageType.Heartbeat,
      'agent-1',
      'system',
      {},
    )

    // Message without TTL should not expire
    expect(isMessageExpired(msg)).toBe(false)
  })
})
