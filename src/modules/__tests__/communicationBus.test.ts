import { CommunicationBus } from '../communicationBus'
import { MessageType, MessageStatus } from '../communicationProtocol'

describe('CommunicationBus', () => {
    let bus: CommunicationBus

    afterEach(() => {
        bus?.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('message send and receive', () => {
        beforeEach(() => {
            bus = new CommunicationBus()
        })

        it('should deliver message to registered handler and mark as processed', async () => {
            const handler = vi.fn().mockResolvedValue(null)
            bus.registerHandler({ messageType: MessageType.Heartbeat, handler })

            const message = await bus.sendMessage(
                MessageType.Heartbeat,
                'sender',
                'receiver',
                { value: 42 },
            )

            expect(handler).toHaveBeenCalledTimes(1)
            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: MessageType.Heartbeat,
                    senderId: 'sender',
                    receiverId: 'receiver',
                    payload: { value: 42 },
                }),
            )
            expect(message.status).toBe(MessageStatus.Processed)
        })

        it('should mark message as failed when no handler exists', async () => {
            const message = await bus.sendMessage(
                MessageType.Heartbeat,
                'sender',
                'receiver',
                {},
            )

            expect(message.status).toBe(MessageStatus.Failed)
            expect(bus.getDeadLetterQueue()).toHaveLength(1)
        })
    })

    describe('message deduplication', () => {
        beforeEach(() => {
            bus = new CommunicationBus()
        })

        it('should not process the same message twice', async () => {
            const handler = vi.fn().mockResolvedValue(null)
            bus.registerHandler({ messageType: MessageType.Heartbeat, handler })

            const message = await bus.sendMessage(
                MessageType.Heartbeat,
                'sender',
                'receiver',
                {},
            )

            expect(handler).toHaveBeenCalledTimes(1)

            await (bus as any).processMessage(message)

            expect(handler).toHaveBeenCalledTimes(1)
        })
    })

    describe('retry mechanism', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            bus = new CommunicationBus()
        })

        it('should retry failed message and succeed on second attempt', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            const handler = vi.fn()
                .mockRejectedValueOnce(new Error('transient'))
                .mockResolvedValueOnce(null)
            bus.registerHandler({ messageType: MessageType.Heartbeat, handler })

            const message = await bus.sendMessage(
                MessageType.Heartbeat,
                'sender',
                'receiver',
                {},
            )

            expect(handler).toHaveBeenCalledTimes(1)
            expect(message.status).toBe(MessageStatus.Pending)

            await vi.advanceTimersByTimeAsync(1000)

            expect(handler).toHaveBeenCalledTimes(2)
            expect(message.status).toBe(MessageStatus.Processed)
        })

        it('should apply increasing delay between retries', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            const handler = vi.fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockResolvedValueOnce(null)
            bus.registerHandler({ messageType: MessageType.Heartbeat, handler })

            const message = await bus.sendMessage(
                MessageType.Heartbeat,
                'sender',
                'receiver',
                {},
            )

            expect(handler).toHaveBeenCalledTimes(1)

            await vi.advanceTimersByTimeAsync(1000)
            expect(handler).toHaveBeenCalledTimes(2)

            await vi.advanceTimersByTimeAsync(2000)
            expect(handler).toHaveBeenCalledTimes(3)
            expect(message.status).toBe(MessageStatus.Processed)
        })
    })

    describe('dead letter queue', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            bus = new CommunicationBus()
        })

        it('should move message to DLQ after exhausting all retries', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            const handler = vi.fn().mockRejectedValue(new Error('permanent'))
            bus.registerHandler({ messageType: MessageType.Heartbeat, handler })

            await bus.sendMessage(MessageType.Heartbeat, 'sender', 'receiver', {})

            await vi.advanceTimersByTimeAsync(1000)
            await vi.advanceTimersByTimeAsync(2000)
            await vi.advanceTimersByTimeAsync(3000)

            expect(handler).toHaveBeenCalledTimes(4)
            const dlq = bus.getDeadLetterQueue()
            expect(dlq).toHaveLength(1)
            expect(dlq[0].status).toBe(MessageStatus.Failed)
        })
    })

    describe('DLQ threshold alert', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            bus = new CommunicationBus()
        })

        it('should trigger callback when DLQ size reaches threshold', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {})
            const callback = vi.fn()
            bus.setDlqThreshold(2)
            bus.setDlqAlertCallback(callback)

            const handler = vi.fn().mockRejectedValue(new Error('fail'))
            bus.registerHandler({ messageType: MessageType.Heartbeat, handler })

            await bus.sendMessage(MessageType.Heartbeat, 'agent-1', 'receiver', {})
            await vi.advanceTimersByTimeAsync(1000)
            await vi.advanceTimersByTimeAsync(2000)
            await vi.advanceTimersByTimeAsync(3000)

            expect(callback).not.toHaveBeenCalled()

            await bus.sendMessage(MessageType.Heartbeat, 'agent-2', 'receiver', {})
            await vi.advanceTimersByTimeAsync(1000)
            await vi.advanceTimersByTimeAsync(2000)
            await vi.advanceTimersByTimeAsync(3000)

            expect(callback).toHaveBeenCalledWith(2)
        })
    })

    describe('broadcast', () => {
        beforeEach(() => {
            bus = new CommunicationBus()
        })

        it('should send message to all participants except sender', async () => {
            const handler = vi.fn().mockResolvedValue(null)
            bus.registerHandler({ messageType: MessageType.Heartbeat, handler })

            const channel = bus.createChannel('test-broadcast', 'broadcast', ['A', 'B', 'C'])

            const messages = await bus.broadcastMessage(
                MessageType.Heartbeat,
                'A',
                { data: 'hello' },
                channel.id,
            )

            expect(messages).toHaveLength(2)
            expect(handler).toHaveBeenCalledTimes(2)
            const receivers = messages.map(m => m.receiverId).sort()
            expect(receivers).toEqual(['B', 'C'])
            expect(messages.every(m => m.senderId === 'A')).toBe(true)
            expect(messages.every(m => m.broadcast === true)).toBe(true)
        })

        it('should throw for non-existent channel', async () => {
            await expect(
                bus.broadcastMessage(MessageType.Heartbeat, 'A', {}, 'missing'),
            ).rejects.toThrow('Channel missing not found')
        })
    })

    describe('channel management', () => {
        beforeEach(() => {
            bus = new CommunicationBus()
        })

        it('should create and retrieve a channel', () => {
            const channel = bus.createChannel('test', 'direct', ['A', 'B'])

            expect(channel.name).toBe('test')
            expect(channel.type).toBe('direct')
            expect(channel.participants).toEqual(['A', 'B'])

            const retrieved = bus.getChannel(channel.id)
            expect(retrieved).toBeDefined()
            expect(retrieved!.id).toBe(channel.id)
        })

        it('should remove a channel', () => {
            const channel = bus.createChannel('test', 'direct', ['A', 'B'])

            expect(bus.removeChannel(channel.id)).toBe(true)
            expect(bus.getChannel(channel.id)).toBeUndefined()
        })

        it('should return false when removing non-existent channel', () => {
            expect(bus.removeChannel('non-existent')).toBe(false)
        })

        it('should add participant to channel', () => {
            const channel = bus.createChannel('test', 'broadcast', ['A', 'B'])

            expect(bus.addParticipantToChannel(channel.id, 'C')).toBe(true)
            expect(bus.getChannel(channel.id)!.participants).toContain('C')
        })

        it('should not duplicate existing participant', () => {
            const channel = bus.createChannel('test', 'broadcast', ['A', 'B'])

            bus.addParticipantToChannel(channel.id, 'A')
            expect(bus.getChannel(channel.id)!.participants.filter(p => p === 'A')).toHaveLength(1)
        })

        it('should return false when adding to non-existent channel', () => {
            expect(bus.addParticipantToChannel('non-existent', 'C')).toBe(false)
        })

        it('should remove participant from channel', () => {
            const channel = bus.createChannel('test', 'broadcast', ['A', 'B', 'C'])

            expect(bus.removeParticipantFromChannel(channel.id, 'B')).toBe(true)
            expect(bus.getChannel(channel.id)!.participants).toEqual(['A', 'C'])
        })

        it('should return false when removing non-existent participant', () => {
            const channel = bus.createChannel('test', 'broadcast', ['A', 'B'])

            expect(bus.removeParticipantFromChannel(channel.id, 'Z')).toBe(false)
        })

        it('should return false when removing from non-existent channel', () => {
            expect(bus.removeParticipantFromChannel('non-existent', 'A')).toBe(false)
        })
    })
})
