/**
 * Communication system for multi-agent collaboration.
 * Ported from Python mock-sso/collaboration/communication.py
 */

import { randomUUID } from 'crypto';

// ──────────────────── Enums ────────────────────

export enum MessageType {
  TASK_DELEGATION = 'task_delegation',
  TASK_RESULT = 'task_result',
  STATUS_REPORT = 'status_report',
  ERROR_REPORT = 'error_report',
  HELP_REQUEST = 'help_request',
  COLLABORATION_REQUEST = 'collaboration_request',
  HEARTBEAT = 'heartbeat',
  ACKNOWLEDGEMENT = 'acknowledgement',
  BROADCAST = 'broadcast',
  DIRECT = 'direct',
}

// ──────────────────── Types ────────────────────

export interface Message {
  id: string;
  type: MessageType;
  sender: string;
  receiver: string;
  content: any;
  timestamp: Date;
  priority: number;
  metadata: Record<string, any>;
  requiresResponse: boolean;
  taskId?: string;
  correlationId?: string;
}

export interface MessageOptions {
  type?: MessageType;
  sender?: string;
  receiver?: string;
  content?: any;
  priority?: number;
  metadata?: Record<string, any>;
  requiresResponse?: boolean;
  taskId?: string;
  correlationId?: string;
}

// ──────────────────── Factory ────────────────────

export function createMessage(opts: MessageOptions = {}): Message {
  return {
    id: randomUUID().replace(/-/g, ''),
    type: opts.type ?? MessageType.DIRECT,
    sender: opts.sender ?? '',
    receiver: opts.receiver ?? '',
    content: opts.content ?? null,
    timestamp: new Date(),
    priority: opts.priority ?? 0,
    metadata: opts.metadata ?? {},
    requiresResponse: opts.requiresResponse ?? false,
    taskId: opts.taskId,
    correlationId: opts.correlationId,
  };
}

// ──────────────────── InMemoryCommunication ────────────────────

export class InMemoryCommunication {
  private _queues: Map<string, Message[]> = new Map();

  private _getQueue(agentId: string): Message[] {
    if (!this._queues.has(agentId)) {
      this._queues.set(agentId, []);
    }
    return this._queues.get(agentId)!;
  }

  send(message: Message): void {
    const queue = this._getQueue(message.receiver);
    queue.push(message);
  }

  receive(agentId: string): Message | null {
    const queue = this._getQueue(agentId);
    return queue.shift() ?? null;
  }

  peek(agentId: string): Message | null {
    const queue = this._getQueue(agentId);
    return queue.length > 0 ? queue[0] : null;
  }

  hasMessages(agentId: string): boolean {
    const queue = this._queues.get(agentId);
    return queue !== undefined && queue.length > 0;
  }

  messageCount(agentId: string): number {
    const queue = this._queues.get(agentId);
    return queue?.length ?? 0;
  }

  clearMessages(agentId: string): void {
    this._queues.set(agentId, []);
  }

  broadcast(message: Message, excludeSender: boolean = true): void {
    for (const [agentId, queue] of this._queues) {
      if (excludeSender && agentId === message.sender) continue;
      queue.push({
        ...message,
        id: randomUUID().replace(/-/g, ''),
        type: MessageType.BROADCAST,
        receiver: agentId,
        timestamp: new Date(),
      });
    }
  }
}

// ──────────────────── CommunicationManager ────────────────────

export type MessageHandler = (message: Message) => void | Promise<void>;

export class CommunicationManager {
  communication: InMemoryCommunication;
  private _agents: Map<string, any> = new Map();
  private _handlers: Map<string, MessageHandler[]> = new Map();

  constructor(communication?: InMemoryCommunication) {
    this.communication = communication ?? new InMemoryCommunication();
  }

  registerAgent(agentId: string, agent?: any): void {
    this._agents.set(agentId, agent ?? null);
  }

  unregisterAgent(agentId: string): void {
    this._agents.delete(agentId);
    this._handlers.delete(agentId);
  }

  getRegisteredAgents(): string[] {
    return Array.from(this._agents.keys());
  }

  getAgent(agentId: string): any | undefined {
    return this._agents.get(agentId);
  }

  sendMessage(message: Message): void {
    if (message.sender && !this._agents.has(message.sender)) {
      throw new Error(`Sender '${message.sender}' is not registered`);
    }
    if (message.receiver && !this._agents.has(message.receiver)) {
      throw new Error(`Receiver '${message.receiver}' is not registered`);
    }
    this.communication.send(message);
  }

  broadcastMessage(message: Message, excludeSender: boolean = true): void {
    this.communication.broadcast(message, excludeSender);
  }

  receiveMessage(agentId: string): Message | null {
    return this.communication.receive(agentId);
  }

  hasMessages(agentId: string): boolean {
    return this.communication.hasMessages(agentId);
  }

  registerHandler(agentId: string, handler: MessageHandler): void {
    if (!this._handlers.has(agentId)) {
      this._handlers.set(agentId, []);
    }
    this._handlers.get(agentId)!.push(handler);
  }

  async processMessages(agentId: string): Promise<void> {
    while (this.hasMessages(agentId)) {
      const message = this.receiveMessage(agentId);
      if (message && this._handlers.has(agentId)) {
        for (const handler of this._handlers.get(agentId)!) {
          await handler(message);
        }
      }
    }
  }
}
