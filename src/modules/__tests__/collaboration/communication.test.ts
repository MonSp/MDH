import { describe, it, expect, beforeEach } from 'vitest';
import {
  MessageType,
  InMemoryCommunication,
  CommunicationManager,
  createMessage,
  Message,
} from '../../collaboration/communication';

describe('MessageType enum', () => {
  it('has all 10 message types', () => {
    expect(MessageType.TASK_DELEGATION).toBe('task_delegation');
    expect(MessageType.TASK_RESULT).toBe('task_result');
    expect(MessageType.STATUS_REPORT).toBe('status_report');
    expect(MessageType.ERROR_REPORT).toBe('error_report');
    expect(MessageType.HELP_REQUEST).toBe('help_request');
    expect(MessageType.COLLABORATION_REQUEST).toBe('collaboration_request');
    expect(MessageType.HEARTBEAT).toBe('heartbeat');
    expect(MessageType.ACKNOWLEDGEMENT).toBe('acknowledgement');
    expect(MessageType.BROADCAST).toBe('broadcast');
    expect(MessageType.DIRECT).toBe('direct');
  });
});

describe('createMessage', () => {
  it('creates a message with defaults', () => {
    const msg = createMessage();
    expect(msg.id).toBeTruthy();
    expect(msg.type).toBe(MessageType.DIRECT);
    expect(msg.sender).toBe('');
    expect(msg.receiver).toBe('');
    expect(msg.content).toBeNull();
    expect(msg.priority).toBe(0);
    expect(msg.requiresResponse).toBe(false);
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it('creates a message with custom options', () => {
    const msg = createMessage({
      type: MessageType.TASK_DELEGATION,
      sender: 'agent-1',
      receiver: 'agent-2',
      content: { task: 'build UI' },
      priority: 2,
      requiresResponse: true,
      taskId: 'plan-1',
      correlationId: 'corr-1',
    });
    expect(msg.type).toBe(MessageType.TASK_DELEGATION);
    expect(msg.sender).toBe('agent-1');
    expect(msg.receiver).toBe('agent-2');
    expect(msg.content).toEqual({ task: 'build UI' });
    expect(msg.priority).toBe(2);
    expect(msg.requiresResponse).toBe(true);
    expect(msg.taskId).toBe('plan-1');
    expect(msg.correlationId).toBe('corr-1');
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createMessage().id));
    expect(ids.size).toBe(100);
  });
});

describe('InMemoryCommunication', () => {
  let comm: InMemoryCommunication;

  beforeEach(() => {
    comm = new InMemoryCommunication();
  });

  it('send and receive messages', () => {
    const msg = createMessage({ receiver: 'agent-1', content: 'hello' });
    comm.send(msg);
    expect(comm.hasMessages('agent-1')).toBe(true);
    expect(comm.messageCount('agent-1')).toBe(1);

    const received = comm.receive('agent-1');
    expect(received).not.toBeNull();
    expect(received!.content).toBe('hello');
    expect(comm.hasMessages('agent-1')).toBe(false);
  });

  it('returns null when no messages', () => {
    expect(comm.receive('nonexistent')).toBeNull();
  });

  it('queues are FIFO', () => {
    comm.send(createMessage({ receiver: 'a', content: 'first' }));
    comm.send(createMessage({ receiver: 'a', content: 'second' }));
    expect(comm.receive('a')!.content).toBe('first');
    expect(comm.receive('a')!.content).toBe('second');
  });

  it('clearMessages empties queue', () => {
    comm.send(createMessage({ receiver: 'a', content: 'msg' }));
    comm.clearMessages('a');
    expect(comm.hasMessages('a')).toBe(false);
    expect(comm.messageCount('a')).toBe(0);
  });

  it('peek returns first message without removing', () => {
    comm.send(createMessage({ receiver: 'a', content: 'peeked' }));
    const peeked = comm.peek('a');
    expect(peeked!.content).toBe('peeked');
    expect(comm.messageCount('a')).toBe(1);
  });

  it('peek returns null for empty queue', () => {
    expect(comm.peek('empty')).toBeNull();
  });

  it('broadcast sends to all registered queues except sender', () => {
    // Register queues by sending a message to each
    comm.send(createMessage({ receiver: 'a', content: 'init' }));
    comm.send(createMessage({ receiver: 'b', content: 'init' }));
    comm.send(createMessage({ receiver: 'c', content: 'init' }));

    // Drain init messages
    comm.receive('a');
    comm.receive('b');
    comm.receive('c');

    // Broadcast from 'a'
    const broadcastMsg = createMessage({ sender: 'a', content: 'announcement' });
    comm.broadcast(broadcastMsg, true);

    expect(comm.hasMessages('a')).toBe(false); // excluded
    expect(comm.hasMessages('b')).toBe(true);
    expect(comm.hasMessages('c')).toBe(true);
    const receivedB = comm.receive('b')!;
    expect(receivedB.content).toBe('announcement');
    expect(receivedB.type).toBe(MessageType.BROADCAST);
  });

  it('broadcast includes sender when excludeSender=false', () => {
    comm.send(createMessage({ receiver: 'a', content: 'init' }));
    comm.receive('a');

    comm.broadcast(createMessage({ sender: 'a', content: 'hi' }), false);
    expect(comm.hasMessages('a')).toBe(true);
  });
});

describe('CommunicationManager', () => {
  let comm: InMemoryCommunication;
  let manager: CommunicationManager;

  beforeEach(() => {
    comm = new InMemoryCommunication();
    manager = new CommunicationManager(comm);
  });

  it('register and unregister agents', () => {
    manager.registerAgent('agent-1', { name: 'Agent 1' });
    expect(manager.getRegisteredAgents()).toEqual(['agent-1']);
    expect(manager.getAgent('agent-1')).toEqual({ name: 'Agent 1' });

    manager.unregisterAgent('agent-1');
    expect(manager.getRegisteredAgents()).toEqual([]);
    expect(manager.getAgent('agent-1')).toBeUndefined();
  });

  it('sendMessage delivers to queue', () => {
    manager.registerAgent('a');
    manager.registerAgent('b');
    manager.sendMessage(createMessage({ sender: 'a', receiver: 'b', content: 'data' }));
    expect(manager.hasMessages('b')).toBe(true);
    const msg = manager.receiveMessage('b');
    expect(msg!.content).toBe('data');
  });

  it('sendMessage throws for unregistered sender', () => {
    manager.registerAgent('b');
    expect(() =>
      manager.sendMessage(createMessage({ sender: 'unknown', receiver: 'b' })),
    ).toThrow("Sender 'unknown' is not registered");
  });

  it('sendMessage throws for unregistered receiver', () => {
    manager.registerAgent('a');
    expect(() =>
      manager.sendMessage(createMessage({ sender: 'a', receiver: 'unknown' })),
    ).toThrow("Receiver 'unknown' is not registered");
  });

  it('broadcastMessage works', () => {
    manager.registerAgent('a');
    manager.registerAgent('b');
    // Pre-register queues by sending a message first (broadcast iterates existing queues only)
    manager.sendMessage(createMessage({ sender: 'a', receiver: 'b', content: 'init' }));
    manager.receiveMessage('b'); // drain
    manager.broadcastMessage(createMessage({ sender: 'a', content: 'hi' }));
    expect(manager.hasMessages('a')).toBe(false);
    expect(manager.hasMessages('b')).toBe(true);
  });

  it('registerHandler and processMessages calls handlers', async () => {
    manager.registerAgent('a');
    const received: Message[] = [];
    manager.registerHandler('a', (msg) => {
      received.push(msg);
    });

    manager.sendMessage(createMessage({ sender: 'a', receiver: 'a', content: 'test' }));
    await manager.processMessages('a');
    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('test');
  });

  it('processMessages handles async handlers', async () => {
    manager.registerAgent('a');
    const received: string[] = [];
    manager.registerHandler('a', async (msg) => {
      received.push(msg.content);
    });

    manager.sendMessage(createMessage({ sender: 'a', receiver: 'a', content: 'async' }));
    await manager.processMessages('a');
    expect(received).toEqual(['async']);
  });

  it('unregisterAgent removes handlers', async () => {
    manager.registerAgent('a');
    const received: Message[] = [];
    manager.registerHandler('a', (msg) => received.push(msg));

    manager.unregisterAgent('a');
    // Re-register agent but handler is gone
    manager.registerAgent('a');
    manager.sendMessage(createMessage({ sender: 'a', receiver: 'a', content: 'test' }));
    await manager.processMessages('a');
    expect(received).toHaveLength(0);
  });
});
