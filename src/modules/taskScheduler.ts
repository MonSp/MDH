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

export class TaskScheduler {
  private config: SchedulingConfig
  private queue: TaskQueue
  private currentTime: number
  private resourceUsage: ResourceLimits

  constructor(config: SchedulingConfig = {}) {
    this.config = {
      maxConcurrentTasks: 5,
      priorityWeights: {
        critical: 100,
        high: 75,
        medium: 50,
        low: 25,
      },
      enablePreemption: false,
      schedulingAlgorithm: 'hybrid',
      ...config,
    }

    this.queue = {
      pending: [],
      ready: [],
      running: [],
      completed: [],
      failed: [],
    }

    this.currentTime = 0
    this.resourceUsage = {
      maxCpu: 0,
      maxMemory: 0,
      maxNetworkBandwidth: 0,
    }
  }

  scheduleTasks(tasks: SubTask[], dependencies: TaskDependency[]): ScheduledTask[] {
    const startTime = Date.now()

    const scheduledTasks = this.initializeScheduledTasks(tasks, dependencies)

    this.calculatePriorityScores(scheduledTasks, dependencies)

    this.updateReadyStatus(scheduledTasks, dependencies)

    const sortedTasks = this.applySchedulingAlgorithm(scheduledTasks)

    this.assignTimeSlots(sortedTasks, dependencies)

    const endTime = Date.now()

    return sortedTasks
  }

  private initializeScheduledTasks(
    tasks: SubTask[],
    dependencies: TaskDependency[]
  ): ScheduledTask[] {
    return tasks.map(task => ({
      ...task,
      scheduledStartTime: 0,
      scheduledEndTime: 0,
      assignedSlot: -1,
      priorityScore: 0,
      isReady: false,
      waitingReason: undefined,
    }))
  }

  private calculatePriorityScores(
    tasks: ScheduledTask[],
    dependencies: TaskDependency[]
  ): void {
    const dependencyMap = this.buildDependencyMap(dependencies)
    const reverseDependencyMap = this.buildReverseDependencyMap(dependencies)

    tasks.forEach(task => {
      let score = 0

      const priorityWeight = this.config.priorityWeights?.[task.priority] ?? 50
      score += priorityWeight * 10

      const dependencyCount = reverseDependencyMap.get(task.id)?.length ?? 0
      score += dependencyCount * 20

      const dependentCount = dependencyMap.get(task.id)?.length ?? 0
      score += dependentCount * 15

      const duration = task.estimatedDuration ?? 60000
      const durationScore = Math.max(0, 100 - (duration / 10000))
      score += durationScore

      task.priorityScore = score
    })
  }

  private buildDependencyMap(dependencies: TaskDependency[]): Map<string, string[]> {
    const map = new Map<string, string[]>()

    dependencies.forEach(dep => {
      if (!map.has(dep.fromTaskId)) {
        map.set(dep.fromTaskId, [])
      }
      map.get(dep.fromTaskId)!.push(dep.toTaskId)
    })

    return map
  }

  private buildReverseDependencyMap(dependencies: TaskDependency[]): Map<string, string[]> {
    const map = new Map<string, string[]>()

    dependencies.forEach(dep => {
      if (!map.has(dep.toTaskId)) {
        map.set(dep.toTaskId, [])
      }
      map.get(dep.toTaskId)!.push(dep.fromTaskId)
    })

    return map
  }

  private updateReadyStatus(
    tasks: ScheduledTask[],
    dependencies: TaskDependency[]
  ): void {
    const completedTaskIds = new Set(
      this.queue.completed.map(t => t.id)
    )

    const reverseDependencyMap = this.buildReverseDependencyMap(dependencies)

    tasks.forEach(task => {
      const prerequisites = reverseDependencyMap.get(task.id) ?? []
      
      if (prerequisites.length === 0) {
        task.isReady = true
        task.waitingReason = undefined
      } else {
        const allPrerequisitesMet = prerequisites.every(prereqId => 
          completedTaskIds.has(prereqId)
        )

        if (allPrerequisitesMet) {
          task.isReady = true
          task.waitingReason = undefined
        } else {
          task.isReady = false
          const pendingPrereqs = prerequisites.filter(id => !completedTaskIds.has(id))
          task.waitingReason = `等待前置任务完成: ${pendingPrereqs.join(', ')}`
        }
      }
    })
  }

  private applySchedulingAlgorithm(tasks: ScheduledTask[]): ScheduledTask[] {
    const algorithm = this.config.schedulingAlgorithm ?? 'hybrid'

    switch (algorithm) {
      case 'priority':
        return this.scheduleByPriority(tasks)
      case 'fifo':
        return this.scheduleByFIFO(tasks)
      case 'sjf':
        return this.scheduleByShortestJobFirst(tasks)
      case 'critical-path':
        return this.scheduleByCriticalPath(tasks)
      case 'hybrid':
      default:
        return this.scheduleHybrid(tasks)
    }
  }

  private scheduleByPriority(tasks: ScheduledTask[]): ScheduledTask[] {
    return [...tasks].sort((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      }

      const aPriority = priorityOrder[a.priority] ?? 0
      const bPriority = priorityOrder[b.priority] ?? 0

      if (aPriority !== bPriority) {
        return bPriority - aPriority
      }

      return b.priorityScore - a.priorityScore
    })
  }

  private scheduleByFIFO(tasks: ScheduledTask[]): ScheduledTask[] {
    return [...tasks].sort((a, b) => a.createdAt - b.createdAt)
  }

  private scheduleByShortestJobFirst(tasks: ScheduledTask[]): ScheduledTask[] {
    return [...tasks].sort((a, b) => {
      const aDuration = a.estimatedDuration ?? 60000
      const bDuration = b.estimatedDuration ?? 60000
      return aDuration - bDuration
    })
  }

  private scheduleByCriticalPath(tasks: ScheduledTask[]): ScheduledTask[] {
    return [...tasks].sort((a, b) => {
      const aIsCritical = a.metadata?.isCriticalPath === true
      const bIsCritical = b.metadata?.isCriticalPath === true

      if (aIsCritical && !bIsCritical) return -1
      if (!aIsCritical && bIsCritical) return 1

      return b.priorityScore - a.priorityScore
    })
  }

  private scheduleHybrid(tasks: ScheduledTask[]): ScheduledTask[] {
    return [...tasks].sort((a, b) => {
      if (a.isReady && !b.isReady) return -1
      if (!a.isReady && b.isReady) return 1

      if (a.isReady && b.isReady) {
        const priorityOrder: Record<TaskPriority, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        }

        const aPriority = priorityOrder[a.priority] ?? 0
        const bPriority = priorityOrder[b.priority] ?? 0

        if (aPriority !== bPriority) {
          return bPriority - aPriority
        }

        const aDuration = a.estimatedDuration ?? 60000
        const bDuration = b.estimatedDuration ?? 60000
        if (Math.abs(aDuration - bDuration) > 30000) {
          return aDuration - bDuration
        }

        return b.priorityScore - a.priorityScore
      }

      return b.priorityScore - a.priorityScore
    })
  }

  private assignTimeSlots(tasks: ScheduledTask[], dependencies: TaskDependency[]): void {
    const dependencyMap = this.buildDependencyMap(dependencies)
    const reverseDependencyMap = this.buildReverseDependencyMap(dependencies)

    const taskStartTimes = new Map<string, number>()
    const taskEndTimes = new Map<string, number>()
    const slotAssignments = new Map<number, string[]>()

    let currentSlot = 0
    let maxEndTime = 0

    const readyQueue: ScheduledTask[] = []
    const processed = new Set<string>()

    const getEarliestStartTime = (task: ScheduledTask): number => {
      const prerequisites = reverseDependencyMap.get(task.id) ?? []
      if (prerequisites.length === 0) return 0

      return Math.max(
        ...prerequisites.map(prereqId => taskEndTimes.get(prereqId) ?? 0)
      )
    }

    const getAvailableSlot = (startTime: number): number => {
      for (let slot = 0; slot < this.config.maxConcurrentTasks!; slot++) {
        const slotTasks = slotAssignments.get(slot) ?? []
        const isSlotFree = slotTasks.every(taskId => {
          const endTime = taskEndTimes.get(taskId) ?? 0
          return endTime <= startTime
        })

        if (isSlotFree) return slot
      }
      return -1
    }

    tasks.forEach(task => {
      if (!processed.has(task.id)) {
        readyQueue.push(task)
      }
    })

    while (readyQueue.length > 0 || processed.size < tasks.length) {
      const readyTasks = readyQueue.filter(task => {
        if (processed.has(task.id)) return false
        
        const prerequisites = reverseDependencyMap.get(task.id) ?? []
        return prerequisites.every(prereqId => processed.has(prereqId))
      })

      if (readyTasks.length === 0 && processed.size < tasks.length) {
        const nextReady = tasks.find(t => {
          if (processed.has(t.id)) return false
          const prerequisites = reverseDependencyMap.get(t.id) ?? []
          return prerequisites.every(prereqId => processed.has(prereqId))
        })

        if (nextReady) {
          readyQueue.push(nextReady)
          continue
        } else {
          break
        }
      }

      readyTasks.sort((a, b) => b.priorityScore - a.priorityScore)

      for (const task of readyTasks) {
        const startTime = getEarliestStartTime(task)
        const duration = task.estimatedDuration ?? 60000
        const endTime = startTime + duration

        const slot = getAvailableSlot(startTime)
        if (slot === -1) {
          // 无可用 slot，标记为已处理避免死循环，放到队尾重试
          processed.add(task.id)
          const queueIndex = readyQueue.indexOf(task)
          if (queueIndex > -1) readyQueue.splice(queueIndex, 1)
          continue
        }

        task.scheduledStartTime = startTime
        task.scheduledEndTime = endTime
        task.assignedSlot = slot

        taskStartTimes.set(task.id, startTime)
        taskEndTimes.set(task.id, endTime)

        if (!slotAssignments.has(slot)) {
          slotAssignments.set(slot, [])
        }
        slotAssignments.get(slot)!.push(task.id)

        if (endTime > maxEndTime) {
          maxEndTime = endTime
        }

        processed.add(task.id)

        const queueIndex = readyQueue.indexOf(task)
        if (queueIndex > -1) {
          readyQueue.splice(queueIndex, 1)
        }
      }
    }

    tasks.forEach(task => {
      if (!processed.has(task.id)) {
        task.scheduledStartTime = maxEndTime
        task.scheduledEndTime = maxEndTime + (task.estimatedDuration ?? 60000)
        task.assignedSlot = 0
        maxEndTime = task.scheduledEndTime
      }
    })
  }

  getReadyTasks(): ScheduledTask[] {
    return this.queue.ready.filter(t => t.isReady)
  }

  getTasksByStatus(status: TaskStatus): ScheduledTask[] {
    switch (status) {
      case 'pending':
        return this.queue.pending
      case 'running':
        return this.queue.running
      case 'completed':
        return this.queue.completed
      case 'failed':
        return this.queue.failed
      default:
        return []
    }
  }

  getHighestPriorityTask(): ScheduledTask | null {
    const readyTasks = this.getReadyTasks()
    if (readyTasks.length === 0) return null

    return readyTasks.reduce((highest, task) => 
      task.priorityScore > highest.priorityScore ? task : highest
    )
  }

  updateTaskStatus(taskId: string, status: TaskStatus): void {
    const allTasks = [
      ...this.queue.pending,
      ...this.queue.ready,
      ...this.queue.running,
      ...this.queue.completed,
      ...this.queue.failed,
    ]

    const task = allTasks.find(t => t.id === taskId)
    if (!task) return

    this.removeFromAllQueues(taskId)

    switch (status) {
      case 'pending':
        this.queue.pending.push(task)
        break
      case 'running':
        this.queue.running.push(task)
        break
      case 'completed':
        this.queue.completed.push(task)
        break
      case 'failed':
        this.queue.failed.push(task)
        break
    }
  }

  private removeFromAllQueues(taskId: string): void {
    this.queue.pending = this.queue.pending.filter(t => t.id !== taskId)
    this.queue.ready = this.queue.ready.filter(t => t.id !== taskId)
    this.queue.running = this.queue.running.filter(t => t.id !== taskId)
    this.queue.completed = this.queue.completed.filter(t => t.id !== taskId)
    this.queue.failed = this.queue.failed.filter(t => t.id !== taskId)
  }

  getSchedulingStats(): {
    totalTasks: number
    pendingTasks: number
    readyTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
    averageWaitTime: number
    averageExecutionTime: number
    throughput: number
  } {
    const totalTasks = 
      this.queue.pending.length +
      this.queue.ready.length +
      this.queue.running.length +
      this.queue.completed.length +
      this.queue.failed.length

    const completedTasks = this.queue.completed.length
    const failedTasks = this.queue.failed.length

    const averageWaitTime = completedTasks > 0
      ? this.queue.completed.reduce((sum, task) => {
          return sum + (task.scheduledStartTime - task.createdAt)
        }, 0) / completedTasks
      : 0

    const averageExecutionTime = completedTasks > 0
      ? this.queue.completed.reduce((sum, task) => {
          return sum + (task.scheduledEndTime - task.scheduledStartTime)
        }, 0) / completedTasks
      : 0

    const throughput = completedTasks > 0
      ? completedTasks / (Date.now() / 1000)
      : 0

    return {
      totalTasks,
      pendingTasks: this.queue.pending.length,
      readyTasks: this.queue.ready.length,
      runningTasks: this.queue.running.length,
      completedTasks,
      failedTasks,
      averageWaitTime,
      averageExecutionTime,
      throughput,
    }
  }

  updateConfig(newConfig: Partial<SchedulingConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  getConfig(): SchedulingConfig {
    return { ...this.config }
  }

  reset(): void {
    this.queue = {
      pending: [],
      ready: [],
      running: [],
      completed: [],
      failed: [],
    }
    this.currentTime = 0
    this.resourceUsage = {
      maxCpu: 0,
      maxMemory: 0,
      maxNetworkBandwidth: 0,
    }
  }
}