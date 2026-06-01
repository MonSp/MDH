import type { CollaborationConfig } from '../configSchema'
import { DEFAULT_CONFIG } from '../configSchema'
import type { SubTask, TaskPlan, TaskDependency } from '../taskTypes'
import type { MessageEnvelope, MessageType, MessagePriority, MessageStatus } from '../communicationProtocol'

export function createMockConfig(overrides?: Partial<CollaborationConfig>): CollaborationConfig {
  if (!overrides) return structuredClone(DEFAULT_CONFIG)
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...overrides,
  }
}

export function createMockSubTask(overrides?: Partial<SubTask>): SubTask {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Mock Task',
    description: 'A mock subtask for testing',
    status: 'pending' as any,
    priority: 'medium' as any,
    requiredCapabilities: [],
    estimatedDuration: 60000,
    ...overrides,
  }
}

export function createMockTaskPlan(overrides?: Partial<TaskPlan>): TaskPlan {
  return {
    id: `plan-${Math.random().toString(36).slice(2, 8)}`,
    goal: 'Mock plan goal',
    subTasks: [],
    dependencies: [],
    createdAt: Date.now(),
    ...overrides,
  }
}

export function createMockMessage(type: MessageType, payload: unknown): MessageEnvelope {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    type,
    senderId: 'test-sender',
    receiverId: 'test-receiver',
    payload,
    timestamp: Date.now(),
    status: 'pending' as any,
    priority: 'normal' as any,
    retryCount: 0,
  }
}
