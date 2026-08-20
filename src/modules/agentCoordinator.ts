import {
  AgentConfig,
  AgentInstance,
  AgentInstanceStatus,
  AgentRole,
  AgentCapability,
  createAgentConfig,
  createAgentInstance,
  DEFAULT_AGENT_CONFIGS,
} from './agentTypes'
import {
  SubTask,
  Task,
  TaskAssignment,
  TaskStatus,
  TaskPriority,
  TaskPlan,
} from './taskTypes'
import {
  MessageType,
  MessagePriority,
  MessageEnvelope,
  StatusReportPayload,
  ErrorReportPayload,
  TaskResultPayload,
  TaskUpdatePayload,
  ControlCommandPayload,
  HeartbeatPayload,
} from './communicationProtocol'
import { AgentRegistry } from './agentRegistry'
import { CommunicationBus } from './communicationBus'
import { TaskAssigner } from './taskAssigner'
import {
  type CoordinatorConfig,
  type CoordinatorDeps,
  type CoordinatorState,
  type AgentCandidate,
} from './agentCoordinator.types'

// Re-export types for external consumers
export {
  type CoordinatorConfig,
  type CoordinatorDeps,
  type CoordinatorState,
  type AgentCandidate,
} from './agentCoordinator.types'

export class AgentCoordinator {
  private registry: AgentRegistry
  private communicationBus: CommunicationBus
  private taskAssigner: TaskAssigner
  private config: CoordinatorConfig
  private state: CoordinatorState
  private startTime: number
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private statusSyncTimer: ReturnType<typeof setTimeout> | null = null
  private taskTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(config?: Partial<CoordinatorConfig>, deps?: CoordinatorDeps) {
    this.registry = deps?.registry ?? new AgentRegistry()
    this.communicationBus = deps?.communicationBus ?? new CommunicationBus()
    this.taskAssigner = deps?.taskAssigner ?? new TaskAssigner(this.registry, this.communicationBus)
    this.config = {
      heartbeatInterval: config?.heartbeatInterval ?? 30000,
      statusSyncInterval: config?.statusSyncInterval ?? 10000,
      taskTimeout: config?.taskTimeout ?? 300000,
      maxRetries: config?.maxRetries ?? 3,
      enableAutoRecovery: config?.enableAutoRecovery ?? true,
      enableLoadBalancing: config?.enableLoadBalancing ?? true,
    }
    this.startTime = Date.now()
    this.state = {
      isRunning: false,
      activeAgents: 0,
      pendingTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      uptime: 0,
    }
    this.setupMessageHandlers()
  }

  private setupMessageHandlers(): void {
    this.communicationBus.registerHandler({
      messageType: MessageType.StatusReport,
      handler: this.handleStatusReport.bind(this),
    })

    this.communicationBus.registerHandler({
      messageType: MessageType.ErrorReport,
      handler: this.handleErrorReport.bind(this),
    })

    this.communicationBus.registerHandler({
      messageType: MessageType.TaskResult,
      handler: this.handleTaskResult.bind(this),
    })

    this.communicationBus.registerHandler({
      messageType: MessageType.TaskUpdate,
      handler: this.handleTaskUpdate.bind(this),
    })

    this.communicationBus.registerHandler({
      messageType: MessageType.Heartbeat,
      handler: this.handleHeartbeat.bind(this),
    })
  }

  async start(): Promise<void> {
    if (this.state.isRunning) return

    this.state.isRunning = true
    this.startTime = Date.now()

    this.startHeartbeatMonitoring()
    this.startStatusSync()

    console.log('AgentCoordinator started')
  }

  async stop(): Promise<void> {
    if (!this.state.isRunning) return

    this.state.isRunning = false

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.statusSyncTimer) {
      clearInterval(this.statusSyncTimer)
      this.statusSyncTimer = null
    }

    this.taskTimeouts.forEach(timeout => clearTimeout(timeout))
    this.taskTimeouts.clear()

    console.log('AgentCoordinator stopped')
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkAgentHeartbeats()
    }, this.config.heartbeatInterval)
  }

  private startStatusSync(): void {
    this.statusSyncTimer = setInterval(() => {
      this.syncAgentStatuses()
    }, this.config.statusSyncInterval)
  }

  private async checkAgentHeartbeats(): Promise<void> {
    const instances = this.registry.getAllInstances()
    const now = Date.now()
    const heartbeatTimeout = this.config.heartbeatInterval * 2

    for (const instance of instances) {
      if (instance.status === AgentInstanceStatus.Offline) continue

      const timeSinceLastActive = now - instance.lastActiveAt
      if (timeSinceLastActive > heartbeatTimeout) {
        this.registry.updateInstanceStatus(instance.id, AgentInstanceStatus.Offline)
        this.state.activeAgents--
        console.warn(`Agent ${instance.id} marked as offline due to missed heartbeat`)
      }
    }
  }

  private async syncAgentStatuses(): Promise<void> {
    const instances = this.registry.getAllInstances()
    this.state.activeAgents = instances.filter(
      i => i.status !== AgentInstanceStatus.Offline && i.status !== AgentInstanceStatus.Error,
    ).length
    this.state.uptime = Date.now() - this.startTime
  }

  registerAgent(config: AgentConfig): AgentConfig {
    this.registry.registerConfig(config)
    return config
  }

  registerDefaultAgent(role: AgentRole, name: string, model: AgentConfig['model']): AgentConfig {
    return this.registry.registerDefaultConfig(role, name, model)
  }

  spawnAgent(configId: string): AgentInstance | null {
    const instance = this.registry.spawnInstance(configId)
    if (instance) {
      this.state.activeAgents++
      this.sendControlCommand(instance.id, 'restart', 'Agent spawned by coordinator')
    }
    return instance
  }

  removeAgent(instanceId: string): boolean {
    const instance = this.registry.getInstance(instanceId)
    if (!instance) return false

    if (instance.status === AgentInstanceStatus.Busy && instance.currentTaskId) {
      this.handleAgentFailure(instanceId, instance.currentTaskId)
    }

    const removed = this.registry.removeInstance(instanceId)
    if (removed) {
      this.state.activeAgents--
    }
    return removed
  }

  async assignTask(task: SubTask | Task, strategyName?: string): Promise<TaskAssignment | null> {
    const assignment = await this.taskAssigner.assignTask(task, strategyName)
    if (assignment) {
      this.state.pendingTasks++
      const timeout = 'timeout' in task ? task.timeout : this.config.taskTimeout
      this.setupTaskTimeout(task.id, timeout ?? this.config.taskTimeout)
    }
    return assignment
  }

  private setupTaskTimeout(taskId: string, timeout: number): void {
    if (timeout <= 0) return

    const existingTimeout = this.taskTimeouts.get(taskId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const timeoutHandle = setTimeout(() => {
      this.handleTaskTimeout(taskId)
    }, timeout)

    this.taskTimeouts.set(taskId, timeoutHandle)
  }

  private async handleTaskTimeout(taskId: string): Promise<void> {
    const assignment = this.taskAssigner.getAssignment(taskId)
    if (!assignment) return

    console.warn(`Task ${taskId} timed out`)
    await this.handleTaskFailure(taskId, assignment.agentId, 'Task execution timed out')
  }

  private async handleTaskFailure(taskId: string, agentId: string, reason: string): Promise<void> {
    this.registry.completeTaskForInstance(agentId, false)
    this.taskAssigner.removeAssignment(taskId)
    this.state.pendingTasks--
    this.state.failedTasks++

    this.taskTimeouts.delete(taskId)

    await this.sendControlCommand(agentId, 'cancel', reason)
  }

  private async handleTaskSuccess(taskId: string, agentId: string): Promise<void> {
    this.registry.completeTaskForInstance(agentId, true)
    this.taskAssigner.removeAssignment(taskId)
    this.state.pendingTasks--
    this.state.completedTasks++

    this.taskTimeouts.delete(taskId)
  }

  private async handleStatusReport(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as StatusReportPayload
    const instance = this.registry.getInstance(payload.agentId)

    if (instance) {
      this.registry.updateInstanceStatus(instance.id, payload.status as AgentInstanceStatus)
      instance.completedTaskCount = payload.completedTaskCount
      instance.failedTaskCount = payload.failedTaskCount
    }

    return null
  }

  private async handleErrorReport(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as ErrorReportPayload
    const assignment = this.taskAssigner.getAssignment(payload.taskId)

    if (assignment) {
      if (payload.recoverable && this.config.enableAutoRecovery) {
        await this.retryTask(payload.taskId)
      } else {
        await this.handleTaskFailure(payload.taskId, assignment.agentId, payload.errorMessage)
      }
    }

    return null
  }

  private async handleTaskResult(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as TaskResultPayload
    const assignment = this.taskAssigner.getAssignment(payload.taskId)

    if (assignment) {
      if (payload.success) {
        await this.handleTaskSuccess(payload.taskId, assignment.agentId)
      } else {
        await this.handleTaskFailure(payload.taskId, assignment.agentId, 'Task execution failed')
      }
    }

    return null
  }

  private async handleTaskUpdate(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as TaskUpdatePayload
    const assignment = this.taskAssigner.getAssignment(payload.taskId)

    if (assignment) {
      const instance = this.registry.getInstance(assignment.agentId)
      if (instance) {
        instance.lastActiveAt = Date.now()
      }
    }

    return null
  }

  private async handleHeartbeat(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as HeartbeatPayload
    const instance = this.registry.getInstance(payload.agentId)

    if (instance) {
      instance.lastActiveAt = Date.now()
      if (instance.status === AgentInstanceStatus.Offline) {
        this.registry.updateInstanceStatus(instance.id, AgentInstanceStatus.Idle)
        this.state.activeAgents++
      }
    }

    return null
  }

  private async retryTask(taskId: string): Promise<void> {
    const assignment = this.taskAssigner.getAssignment(taskId)
    if (!assignment) return

    const instance = this.registry.getInstance(assignment.agentId)
    if (!instance) return

    this.registry.completeTaskForInstance(assignment.agentId, false)

    const newAssignment = await this.taskAssigner.assignTask(
      { id: taskId } as SubTask,
    )

    if (newAssignment) {
      console.log(`Task ${taskId} reassigned to agent ${newAssignment.agentId}`)
    } else {
      this.state.pendingTasks--
      this.state.failedTasks++
    }
  }

  private async handleAgentFailure(agentId: string, taskId: string): Promise<void> {
    this.registry.updateInstanceStatus(agentId, AgentInstanceStatus.Error)
    this.state.activeAgents--

    if (this.config.enableAutoRecovery) {
      await this.retryTask(taskId)
    } else {
      await this.handleTaskFailure(taskId, agentId, 'Agent failure')
    }
  }

  async sendControlCommand(
    agentId: string,
    command: ControlCommandPayload['command'],
    reason?: string,
  ): Promise<void> {
    const payload: ControlCommandPayload = {
      command,
      reason,
    }

    await this.communicationBus.sendMessage(
      MessageType.ControlCommand,
      'coordinator',
      agentId,
      payload,
      { priority: MessagePriority.High },
    )
  }

  getAgent(instanceId: string): AgentInstance | undefined {
    return this.registry.getInstance(instanceId)
  }

  getAgentConfig(instanceId: string): AgentConfig | undefined {
    return this.registry.getInstanceConfig(instanceId)
  }

  getAllAgents(): AgentInstance[] {
    return this.registry.getAllInstances()
  }

  getAvailableAgents(): AgentInstance[] {
    return this.registry.getAvailableInstances()
  }

  getAgentsByRole(role: AgentRole): AgentInstance[] {
    return this.registry.getInstancesByRole(role)
  }

  getAgentsWithCapability(capability: AgentCapability): AgentInstance[] {
    return this.registry.getInstancesWithCapability(capability)
  }

  getTaskAssignment(taskId: string): TaskAssignment | undefined {
    return this.taskAssigner.getAssignment(taskId)
  }

  getAllAssignments(): TaskAssignment[] {
    return this.taskAssigner.getAllAssignments()
  }

  getAssignmentStats(): ReturnType<TaskAssigner['getAssignmentStats']> {
    return this.taskAssigner.getAssignmentStats()
  }

  getRegistryStats(): ReturnType<AgentRegistry['getRegistryStats']> {
    return this.registry.getRegistryStats()
  }

  getCommunicationStats(): ReturnType<CommunicationBus['getBusStats']> {
    return this.communicationBus.getBusStats()
  }

  getCoordinatorState(): CoordinatorState {
    return {
      ...this.state,
      uptime: Date.now() - this.startTime,
    }
  }

  canAssignTask(task: SubTask | Task): boolean {
    return this.taskAssigner.canAssignTask(task)
  }

  getTaskRequirements(task: SubTask | Task): ReturnType<TaskAssigner['getTaskRequirements']> {
    return this.taskAssigner.getTaskRequirements(task)
  }

  findBestAgentForTask(
    task: SubTask | Task,
    strategyName?: string,
  ): AgentCandidate | null {
    return this.taskAssigner.findBestAgentForTask(task, strategyName)
  }

  async reassignTask(
    taskId: string,
    newAgentId: string,
    reason: string,
  ): Promise<TaskAssignment | null> {
    return this.taskAssigner.reassignTask(taskId, newAgentId, reason)
  }

  createCommunicationChannel(
    name: string,
    type: 'direct' | 'broadcast' | 'topic',
    participants: string[],
  ) {
    return this.communicationBus.createChannel(name, type, participants)
  }

  async broadcastToAgents(
    type: MessageType,
    payload: unknown,
    channelId: string,
  ): Promise<void> {
    await this.communicationBus.broadcastMessage(
      type,
      'coordinator',
      payload,
      channelId,
    )
  }

  getRegistry(): AgentRegistry {
    return this.registry
  }

  getCommunicationBus(): CommunicationBus {
    return this.communicationBus
  }

  getTaskAssigner(): TaskAssigner {
    return this.taskAssigner
  }

  exportState(): {
    config: CoordinatorConfig
    state: CoordinatorState
    registry: ReturnType<AgentRegistry['exportRegistry']>
    assignments: TaskAssignment[]
  } {
    return {
      config: this.config,
      state: this.getCoordinatorState(),
      registry: this.registry.exportRegistry(),
      assignments: this.taskAssigner.getAllAssignments(),
    }
  }

  importState(data: {
    registry: Parameters<AgentRegistry['importRegistry']>[0]
    assignments: TaskAssignment[]
  }): void {
    this.registry.importRegistry(data.registry)
    data.assignments.forEach(a => {
      this.taskAssigner.getAssignment(a.taskId)
    })
  }
}
