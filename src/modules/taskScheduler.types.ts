/**
 * TaskScheduler types and interfaces.
 * Extracted from taskScheduler.ts for reduced file size.
 */

import type { SubTask, TaskDependency, TaskPriority, TaskStatus } from './taskTypes'

export interface SchedulingConfig {
  maxConcurrentTasks?: number
  priorityWeights?: Record<TaskPriority, number>
  enablePreemption?: boolean
  schedulingAlgorithm?: 'priority' | 'fifo' | 'sjf' | 'critical-path' | 'hybrid'
  resourceLimits?: ResourceLimits
}

export interface ResourceLimits {
  maxCpu?: number
  maxMemory?: number
  maxNetworkBandwidth?: number
}

export interface ScheduledTask extends SubTask {
  scheduledStartTime: number
  scheduledEndTime: number
  assignedSlot: number
  priorityScore: number
  isReady: boolean
  waitingReason?: string
}

export interface SchedulingResult {
  scheduledTasks: ScheduledTask[]
  totalDuration: number
  makespan: number
  utilization: number
  metadata: {
    algorithm: string
    taskCount: number
    concurrencyLevel: number
    schedulingTime: number
  }
}

export interface TaskQueue {
  pending: ScheduledTask[]
  ready: ScheduledTask[]
  running: ScheduledTask[]
  completed: ScheduledTask[]
  failed: ScheduledTask[]
}
