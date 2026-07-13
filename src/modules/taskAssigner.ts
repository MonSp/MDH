import {
  AgentCapability,
  AgentInstance,
  AgentInstanceStatus,
  AgentConfig,
} from './agentTypes'
import {
  SubTask,
  Task,
  TaskAssignment,
  TaskStatus,
  TaskPriority,
} from './taskTypes'
import { AgentRegistry } from './agentRegistry'
import { CommunicationBus } from './communicationBus'
import {
  MessageType,
  MessagePriority,
  TaskAssignmentPayload,
} from './communicationProtocol'

export interface AssignmentStrategy {
  name: string
  selectAgent(
    candidates: AgentCandidate[],
    task: SubTask | Task,
  ): AgentCandidate | null
}

export interface AgentCandidate {
  instance: AgentInstance
  config: AgentConfig
  score: number
  matchingCapabilities: AgentCapability[]
  currentLoad: number
  successRate: number
}

export class TaskAssigner {
  private registry: AgentRegistry
  private communicationBus: CommunicationBus
  private assignments: Map<string, TaskAssignment> = new Map()
  private completedAssignments: Map<string, TaskAssignment> = new Map()
  private strategies: Map<string, AssignmentStrategy> = new Map()
  private defaultStrategy: AssignmentStrategy

  constructor(registry: AgentRegistry, communicationBus: CommunicationBus) {
    this.registry = registry
    this.communicationBus = communicationBus
    this.defaultStrategy = this.createBalancedStrategy()
    this.registerDefaultStrategies()
  }

  private registerDefaultStrategies(): void {
    this.registerStrategy(this.createBalancedStrategy())
    this.registerStrategy(this.createLoadBalancingStrategy())
    this.registerStrategy(this.createCapabilityFirstStrategy())
    this.registerStrategy(this.createRoundRobinStrategy())
  }

  private createBalancedStrategy(): AssignmentStrategy {
    return {
      name: 'balanced',
      selectAgent: (candidates, task) => {
        if (candidates.length === 0) return null

        const scored = candidates.map(c => ({
          ...c,
          score: this.calculateBalancedScore(c, task),
        }))

        scored.sort((a, b) => b.score - a.score)
        return scored[0]
      },
    }
  }

  private createLoadBalancingStrategy(): AssignmentStrategy {
    return {
      name: 'loadBalancing',
      selectAgent: (candidates, task) => {
        if (candidates.length === 0) return null

        const scored = candidates.map(c => ({
          ...c,
          score: (1 - c.currentLoad) * 0.7 + c.successRate * 0.3,
        }))

        scored.sort((a, b) => b.score - a.score)
        return scored[0]
      },
    }
  }

  private createCapabilityFirstStrategy(): AssignmentStrategy {
    return {
      name: 'capabilityFirst',
      selectAgent: (candidates, task) => {
        if (candidates.length === 0) return null

        const requiredCapabilities = this.getTaskCapabilities(task)

        const scored = candidates.map(c => {
          const matchCount = c.matchingCapabilities.length
          const totalRequired = requiredCapabilities.length
          const capabilityScore = totalRequired > 0 ? matchCount / totalRequired : 0

          return {
            ...c,
            score: capabilityScore * 0.8 + c.successRate * 0.2,
          }
        })

        scored.sort((a, b) => b.score - a.score)
        return scored[0]
      },
    }
  }

  private createRoundRobinStrategy(): AssignmentStrategy {
    let lastIndex = -1
    return {
      name: 'roundRobin',
      selectAgent: (candidates, task) => {
        if (candidates.length === 0) return null

        lastIndex = (lastIndex + 1) % candidates.length
        return candidates[lastIndex]
      },
    }
  }

  registerStrategy(strategy: AssignmentStrategy): void {
    this.strategies.set(strategy.name, strategy)
  }

  getStrategy(name: string): AssignmentStrategy | undefined {
    return this.strategies.get(name)
  }

  async assignTask(
    task: SubTask | Task,
    strategyName?: string,
  ): Promise<TaskAssignment | null> {
    const strategy = strategyName
      ? this.strategies.get(strategyName) ?? this.defaultStrategy
      : this.defaultStrategy

    const candidates = this.findCandidates(task)
    if (candidates.length === 0) {
      return null
    }

    const selected = strategy.selectAgent(candidates, task)
    if (!selected) {
      return null
    }

    const assignment = await this.executeAssignment(task, selected)
    return assignment
  }

  findCandidates(task: SubTask | Task): AgentCandidate[] {
    const requiredCapabilities = this.getTaskCapabilities(task)
    const availableInstances = this.registry.getAvailableInstances()

    const candidates: AgentCandidate[] = []

    for (const instance of availableInstances) {
      const config = this.registry.getInstanceConfig(instance.id)
      if (!config) continue

      const matchingCapabilities = config.capabilities.filter(c =>
        requiredCapabilities.includes(c),
      )

      if (requiredCapabilities.length > 0 && matchingCapabilities.length === 0) {
        continue
      }

      const currentLoad = this.calculateLoad(instance)
      const successRate = this.calculateSuccessRate(instance)

      candidates.push({
        instance,
        config,
        score: 0,
        matchingCapabilities,
        currentLoad,
        successRate,
      })
    }

    return candidates
  }

  private getTaskCapabilities(task: SubTask | Task): AgentCapability[] {
    return task.requiredCapabilities
  }

  private calculateLoad(instance: AgentInstance): number {
    const config = this.registry.getInstanceConfig(instance.id)
    if (!config) return 1

    const busyInstances = this.registry
      .getInstancesByConfig(instance.configId)
      .filter(i => i.status === AgentInstanceStatus.Busy).length

    return busyInstances / config.maxConcurrentTasks
  }

  private calculateSuccessRate(instance: AgentInstance): number {
    const totalTasks = instance.completedTaskCount + instance.failedTaskCount
    if (totalTasks === 0) return 0.5
    return instance.completedTaskCount / totalTasks
  }

  private calculateBalancedScore(candidate: AgentCandidate, task: SubTask | Task): number {
    const capabilityScore = candidate.matchingCapabilities.length / 
      Math.max(this.getTaskCapabilities(task).length, 1)
    const loadScore = 1 - candidate.currentLoad
    const successScore = candidate.successRate

    return capabilityScore * 0.4 + loadScore * 0.3 + successScore * 0.3
  }

  private async executeAssignment(
    task: SubTask | Task,
    candidate: AgentCandidate,
  ): Promise<TaskAssignment> {
    const assignment: TaskAssignment = {
      taskId: task.id,
      agentId: candidate.instance.id,
      assignedAt: Date.now(),
      reason: `Assigned based on capabilities: ${candidate.matchingCapabilities.join(', ')}`,
    }

    this.assignments.set(task.id, assignment)

    this.registry.assignTaskToInstance(candidate.instance.id, task.id)

    const payload: TaskAssignmentPayload = {
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description,
      input: task.input,
      constraints: 'constraints' in task ? { constraints: task.constraints } : {},
      deadline: null,
    }

    const priority = this.mapTaskPriorityToMessagePriority(task.priority)

    await this.communicationBus.sendMessage(
      MessageType.TaskAssignment,
      'task-assigner',
      candidate.instance.id,
      payload,
      { priority },
    )

    return assignment
  }

  private mapTaskPriorityToMessagePriority(taskPriority: TaskPriority): MessagePriority {
    const mapping: Record<TaskPriority, MessagePriority> = {
      [TaskPriority.Low]: MessagePriority.Low,
      [TaskPriority.Medium]: MessagePriority.Normal,
      [TaskPriority.High]: MessagePriority.High,
      [TaskPriority.Critical]: MessagePriority.Urgent,
    }
    return mapping[taskPriority] ?? MessagePriority.Normal
  }

  getAssignment(taskId: string): TaskAssignment | undefined {
    return this.assignments.get(taskId)
  }

  getAllAssignments(): TaskAssignment[] {
    return Array.from(this.assignments.values())
  }

  getAssignmentsByAgent(agentId: string): TaskAssignment[] {
    return this.getAllAssignments().filter(a => a.agentId === agentId)
  }

  removeAssignment(taskId: string): boolean {
    const assignment = this.assignments.get(taskId)
    if (!assignment) return false

    this.registry.completeTaskForInstance(assignment.agentId, true)
    this.completedAssignments.set(taskId, { ...assignment })
    this.assignments.delete(taskId)
    return true
  }

  async reassignTask(
    taskId: string,
    newAgentId: string,
    reason: string,
  ): Promise<TaskAssignment | null> {
    const oldAssignment = this.assignments.get(taskId)
    if (!oldAssignment) return null

    const newInstance = this.registry.getInstance(newAgentId)
    if (!newInstance) return null

    const newConfig = this.registry.getInstanceConfig(newAgentId)
    if (!newConfig) return null

    this.registry.completeTaskForInstance(oldAssignment.agentId, false)

    const newAssignment: TaskAssignment = {
      taskId,
      agentId: newAgentId,
      assignedAt: Date.now(),
      reason,
    }

    this.assignments.set(taskId, newAssignment)
    this.registry.assignTaskToInstance(newAgentId, taskId)

    return newAssignment
  }

  getAssignmentStats(): {
    totalAssignments: number
    activeAssignments: number
    completedAssignments: number
    averageSuccessRate: number
  } {
    const active = this.getAllAssignments()
    const completed = Array.from(this.completedAssignments.values())
    const allAssignments = [...active, ...completed]
    const instances = new Set(allAssignments.map(a => a.agentId))

    let totalSuccessRate = 0
    instances.forEach(instanceId => {
      const instance = this.registry.getInstance(instanceId)
      if (instance) {
        totalSuccessRate += this.calculateSuccessRate(instance)
      }
    })

    return {
      totalAssignments: allAssignments.length,
      activeAssignments: active.length,
      completedAssignments: completed.length,
      averageSuccessRate: instances.size > 0 ? totalSuccessRate / instances.size : 0,
    }
  }

  findBestAgentForTask(
    task: SubTask | Task,
    strategyName?: string,
  ): AgentCandidate | null {
    const strategy = strategyName
      ? this.strategies.get(strategyName) ?? this.defaultStrategy
      : this.defaultStrategy

    const candidates = this.findCandidates(task)
    return strategy.selectAgent(candidates, task)
  }

  canAssignTask(task: SubTask | Task): boolean {
    const candidates = this.findCandidates(task)
    return candidates.length > 0
  }

  getTaskRequirements(task: SubTask | Task): {
    requiredCapabilities: AgentCapability[]
    availableAgents: number
    canAssign: boolean
  } {
    const requiredCapabilities = this.getTaskCapabilities(task)
    const candidates = this.findCandidates(task)

    return {
      requiredCapabilities,
      availableAgents: candidates.length,
      canAssign: candidates.length > 0,
    }
  }
}