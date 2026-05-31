import type { SubTask, TaskPlan } from './taskTypes'
import { TaskStatus } from './taskTypes'

export interface CompensationResult {
  taskId: string
  success: boolean
  action: string
  details: string
  timestamp: number
}

export interface FailureEvent {
  taskId: string
  agentId: string
  error: string
  impact: 'none' | 'local' | 'cascading' | 'critical'
  timestamp: number
}

export class CompensationEngine {
  private compensationLog: CompensationResult[]
  private failureHistory: FailureEvent[]
  private listeners: ((event: FailureEvent) => void)[]

  constructor() {
    this.compensationLog = []
    this.failureHistory = []
    this.listeners = []
  }

  recordFailure(
    taskId: string,
    agentId: string,
    error: string,
    impact: FailureEvent['impact']
  ): FailureEvent {
    const event: FailureEvent = {
      taskId,
      agentId,
      error,
      impact,
      timestamp: Date.now(),
    }

    this.failureHistory.push(event)

    for (const listener of this.listeners) {
      listener(event)
    }

    return event
  }

  findCompensatableTasks(failedTaskId: string, plan: TaskPlan): SubTask[] {
    const compensatable: SubTask[] = []
    const visited = new Set<string>()
    const adjacencyList = this.buildDependencyGraph(plan)

    const walk = (taskId: string) => {
      if (visited.has(taskId)) return
      visited.add(taskId)

      const dependents = adjacencyList.get(taskId) ?? []
      for (const dependentId of dependents) {
        if (visited.has(dependentId)) continue

        const task = plan.subTasks.find(t => t.id === dependentId)
        if (!task) continue

        if (task.compensateAction) {
          compensatable.push(task)
        }

        walk(dependentId)
      }
    }

    walk(failedTaskId)

    return compensatable
  }

  executeCompensation(task: SubTask): CompensationResult {
    if (!task.compensateAction) {
      return {
        taskId: task.id,
        success: false,
        action: 'none',
        details: 'No compensation action defined',
        timestamp: Date.now(),
      }
    }

    const result: CompensationResult = {
      taskId: task.id,
      success: true,
      action: task.compensateAction.actionType,
      details: `Executed compensation: ${task.compensateAction.description}`,
      timestamp: Date.now(),
    }

    this.compensationLog.push(result)

    return result
  }

  getCompensationPlan(failedTaskId: string, plan: TaskPlan): SubTask[] {
    const compensatable = this.findCompensatableTasks(failedTaskId, plan)
    const taskOrder = this.calculateReverseDependencyOrder(compensatable, plan)

    return taskOrder
      .map(id => compensatable.find(t => t.id === id))
      .filter((t): t is SubTask => t !== undefined)
  }

  getCompensationLog(): CompensationResult[] {
    return [...this.compensationLog]
  }

  getFailureHistory(): FailureEvent[] {
    return [...this.failureHistory]
  }

  addListener(listener: (event: FailureEvent) => void): void {
    this.listeners.push(listener)
  }

  removeListener(listener: (event: FailureEvent) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  clear(): void {
    this.compensationLog = []
    this.failureHistory = []
  }

  private buildDependencyGraph(plan: TaskPlan): Map<string, string[]> {
    const graph = new Map<string, string[]>()

    for (const task of plan.subTasks) {
      if (!graph.has(task.id)) {
        graph.set(task.id, [])
      }
    }

    for (const dep of plan.dependencies) {
      if (!graph.has(dep.fromTaskId)) {
        graph.set(dep.fromTaskId, [])
      }
      graph.get(dep.fromTaskId)!.push(dep.toTaskId)
    }

    return graph
  }

  private calculateReverseDependencyOrder(tasks: SubTask[], plan: TaskPlan): string[] {
    const adjacencyList = this.buildDependencyGraph(plan)
    const inDegree = new Map<string, number>()
    const taskIds = new Set(tasks.map(t => t.id))

    for (const task of tasks) {
      inDegree.set(task.id, 0)
    }

    for (const task of tasks) {
      const dependents = adjacencyList.get(task.id) ?? []
      for (const depId of dependents) {
        if (taskIds.has(depId)) {
          inDegree.set(depId, (inDegree.get(depId) ?? 0) + 1)
        }
      }
    }

    const queue: string[] = []
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(taskId)
      }
    }

    const order: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      order.push(current)

      const dependents = adjacencyList.get(current) ?? []
      for (const depId of dependents) {
        if (taskIds.has(depId)) {
          const newDegree = (inDegree.get(depId) ?? 1) - 1
          inDegree.set(depId, newDegree)
          if (newDegree === 0) {
            queue.push(depId)
          }
        }
      }
    }

    return order.reverse()
  }
}
