import { MultiAgentConversation, ConversationContext, ConversationParticipant } from './multiAgentConversation'
import { AgentCoordinator } from './agentCoordinator'
import { CommunicationBus } from './communicationBus'
import { MessageType, MessagePriority, MessageEnvelope } from './communicationProtocol'
import { AgentInstance, AgentRole } from './agentTypes'

export enum SpeakingStrategy {
  RoundRobin = 'round_robin',
  Priority = 'priority',
  RoleBased = 'role_based',
  Dynamic = 'dynamic',
  Random = 'random',
}

export enum SpeakingState {
  Idle = 'idle',
  Waiting = 'waiting',
  Speaking = 'speaking',
  Finished = 'finished',
}

export interface SpeakingRequest {
  agentId: string
  conversationId: string
  priority: number
  timestamp: number
  reason?: string
}

export interface SpeakingTurn {
  agentId: string
  conversationId: string
  startTime: number
  endTime: number | null
  duration: number | null
  messageCount: number
}

export interface SpeakingConfig {
  strategy: SpeakingStrategy
  maxSpeakingTimeMs: number
  maxMessagesPerTurn: number
  allowInterruptions: boolean
  priorityWeights: Record<AgentRole, number>
  cooldownMs: number
}

export class SpeakingCoordinator {
  private conversationManager: MultiAgentConversation
  private coordinator: AgentCoordinator
  private communicationBus: CommunicationBus
  private config: SpeakingConfig
  private speakingQueues: Map<string, SpeakingRequest[]> = new Map()
  private currentSpeakers: Map<string, SpeakingTurn> = new Map()
  private speakingHistory: Map<string, SpeakingTurn[]> = new Map()
  private cooldownTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private speakingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(
    conversationManager: MultiAgentConversation,
    coordinator: AgentCoordinator,
    communicationBus: CommunicationBus,
    config?: Partial<SpeakingConfig>,
  ) {
    this.conversationManager = conversationManager
    this.coordinator = coordinator
    this.communicationBus = communicationBus
    this.config = {
      strategy: config?.strategy ?? SpeakingStrategy.RoundRobin,
      maxSpeakingTimeMs: config?.maxSpeakingTimeMs ?? 60000,
      maxMessagesPerTurn: config?.maxMessagesPerTurn ?? 5,
      allowInterruptions: config?.allowInterruptions ?? false,
      priorityWeights: config?.priorityWeights ?? {
        [AgentRole.Coordinator]: 10,
        [AgentRole.Planner]: 8,
        [AgentRole.Reviewer]: 6,
        [AgentRole.Monitor]: 4,
        [AgentRole.Executor]: 2,
      },
      cooldownMs: config?.cooldownMs ?? 5000,
    }

    this.setupMessageHandlers()
  }

  private setupMessageHandlers(): void {
    this.communicationBus.registerHandler({
      messageType: MessageType.HelpRequest,
      handler: this.handleSpeakingRequest.bind(this),
    })
  }

  async requestToSpeak(
    conversationId: string,
    agentId: string,
    priority: number = 1,
    reason?: string,
  ): Promise<boolean> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return false

    if (!this.conversationManager.isParticipant(conversationId, agentId)) return false

    const currentSpeaker = this.currentSpeakers.get(conversationId)
    if (currentSpeaker && currentSpeaker.agentId === agentId) return false

    if (this.isOnCooldown(conversationId, agentId)) return false

    const request: SpeakingRequest = {
      agentId,
      conversationId,
      priority,
      timestamp: Date.now(),
      reason,
    }

    const queue = this.speakingQueues.get(conversationId) ?? []
    queue.push(request)
    this.speakingQueues.set(conversationId, queue)

    if (!currentSpeaker) {
      await this.processNextSpeaker(conversationId)
    } else if (this.config.allowInterruptions) {
      await this.checkForInterruption(conversationId, request)
    }

    return true
  }

  async releaseSpeakingTurn(conversationId: string, agentId: string): Promise<boolean> {
    const currentSpeaker = this.currentSpeakers.get(conversationId)
    if (!currentSpeaker || currentSpeaker.agentId !== agentId) return false

    await this.finishSpeaking(conversationId, agentId)
    return true
  }

  async forceReleaseSpeakingTurn(conversationId: string): Promise<boolean> {
    const currentSpeaker = this.currentSpeakers.get(conversationId)
    if (!currentSpeaker) return false

    await this.finishSpeaking(conversationId, currentSpeaker.agentId)
    return true
  }

  private async processNextSpeaker(conversationId: string): Promise<void> {
    const queue = this.speakingQueues.get(conversationId)
    if (!queue || queue.length === 0) return

    const sortedQueue = this.sortQueue(queue)
    const nextSpeaker = sortedQueue[0]

    this.removeFromQueue(conversationId, nextSpeaker.agentId)

    await this.startSpeaking(conversationId, nextSpeaker.agentId)
  }

  private sortQueue(queue: SpeakingRequest[]): SpeakingRequest[] {
    switch (this.config.strategy) {
      case SpeakingStrategy.RoundRobin:
        return this.sortByRoundRobin(queue)
      case SpeakingStrategy.Priority:
        return this.sortByPriority(queue)
      case SpeakingStrategy.RoleBased:
        return this.sortByRole(queue)
      case SpeakingStrategy.Dynamic:
        return this.sortByDynamic(queue)
      case SpeakingStrategy.Random:
        return this.sortByRandom(queue)
      default:
        return queue
    }
  }

  private sortByRoundRobin(queue: SpeakingRequest[]): SpeakingRequest[] {
    return [...queue].sort((a, b) => a.timestamp - b.timestamp)
  }

  private sortByPriority(queue: SpeakingRequest[]): SpeakingRequest[] {
    return [...queue].sort((a, b) => b.priority - a.priority)
  }

  private sortByRole(queue: SpeakingRequest[]): SpeakingRequest[] {
    return [...queue].sort((a, b) => {
      const roleA = this.getAgentRole(a.agentId)
      const roleB = this.getAgentRole(b.agentId)
      const weightA = this.config.priorityWeights[roleA] ?? 0
      const weightB = this.config.priorityWeights[roleB] ?? 0
      return weightB - weightA
    })
  }

  private sortByDynamic(queue: SpeakingRequest[]): SpeakingRequest[] {
    return [...queue].sort((a, b) => {
      const scoreA = this.calculateDynamicScore(a)
      const scoreB = this.calculateDynamicScore(b)
      return scoreB - scoreA
    })
  }

  private sortByRandom(queue: SpeakingRequest[]): SpeakingRequest[] {
    const shuffled = [...queue]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  private calculateDynamicScore(request: SpeakingRequest): number {
    let score = request.priority

    const role = this.getAgentRole(request.agentId)
    score += (this.config.priorityWeights[role] ?? 0) * 0.5

    const waitTime = Date.now() - request.timestamp
    score += Math.min(waitTime / 1000, 10)

    return score
  }

  private getAgentRole(agentId: string): AgentRole {
    const agentConfig = this.coordinator.getAgentConfig(agentId)
    return agentConfig?.role ?? AgentRole.Executor
  }

  private async startSpeaking(conversationId: string, agentId: string): Promise<void> {
    const turn: SpeakingTurn = {
      agentId,
      conversationId,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      messageCount: 0,
    }

    this.currentSpeakers.set(conversationId, turn)

    await this.notifySpeakingStart(conversationId, agentId)

    this.startSpeakingTimer(conversationId, agentId)
  }

  private async finishSpeaking(conversationId: string, agentId: string): Promise<void> {
    const turn = this.currentSpeakers.get(conversationId)
    if (!turn || turn.agentId !== agentId) return

    turn.endTime = Date.now()
    turn.duration = turn.endTime - turn.startTime

    this.clearSpeakingTimer(conversationId)

    const history = this.speakingHistory.get(conversationId) ?? []
    history.push(turn)
    this.speakingHistory.set(conversationId, history)

    this.currentSpeakers.delete(conversationId)

    this.startCooldown(conversationId, agentId)

    await this.notifySpeakingEnd(conversationId, agentId)

    await this.processNextSpeaker(conversationId)
  }

  private startSpeakingTimer(conversationId: string, agentId: string): void {
    if (this.config.maxSpeakingTimeMs <= 0) return

    const timer = setTimeout(async () => {
      await this.handleSpeakingTimeout(conversationId, agentId)
    }, this.config.maxSpeakingTimeMs)

    this.speakingTimers.set(conversationId, timer)
  }

  private clearSpeakingTimer(conversationId: string): void {
    const timer = this.speakingTimers.get(conversationId)
    if (timer) {
      clearTimeout(timer)
      this.speakingTimers.delete(conversationId)
    }
  }

  private async handleSpeakingTimeout(conversationId: string, agentId: string): Promise<void> {
    await this.finishSpeaking(conversationId, agentId)
  }

  private startCooldown(conversationId: string, agentId: string): void {
    if (this.config.cooldownMs <= 0) return

    const key = `${conversationId}:${agentId}`
    const timer = setTimeout(() => {
      this.cooldownTimers.delete(key)
    }, this.config.cooldownMs)

    this.cooldownTimers.set(key, timer)
  }

  private isOnCooldown(conversationId: string, agentId: string): boolean {
    const key = `${conversationId}:${agentId}`
    return this.cooldownTimers.has(key)
  }

  private async checkForInterruption(conversationId: string, request: SpeakingRequest): Promise<void> {
    const currentSpeaker = this.currentSpeakers.get(conversationId)
    if (!currentSpeaker) return

    const currentRole = this.getAgentRole(currentSpeaker.agentId)
    const requestRole = this.getAgentRole(request.agentId)

    const currentWeight = this.config.priorityWeights[currentRole] ?? 0
    const requestWeight = this.config.priorityWeights[requestRole] ?? 0

    if (request.priority > 5 || requestWeight > currentWeight + 2) {
      await this.finishSpeaking(conversationId, currentSpeaker.agentId)
    }
  }

  private removeFromQueue(conversationId: string, agentId: string): void {
    const queue = this.speakingQueues.get(conversationId)
    if (!queue) return

    const index = queue.findIndex(r => r.agentId === agentId)
    if (index !== -1) {
      queue.splice(index, 1)
    }
  }

  private async notifySpeakingStart(conversationId: string, agentId: string): Promise<void> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return

    const activeParticipants = this.conversationManager.getActiveParticipants(conversationId)
    
    for (const participant of activeParticipants) {
      await this.communicationBus.sendMessage(
        MessageType.StatusReport,
        'speaking-coordinator',
        participant.agentId,
        {
          agentId: 'speaking-coordinator',
          status: `Agent ${agentId} is now speaking`,
          currentTaskId: null,
          completedTaskCount: 0,
          failedTaskCount: 0,
          uptime: 0,
        },
        { priority: MessagePriority.Normal },
      )
    }
  }

  private async notifySpeakingEnd(conversationId: string, agentId: string): Promise<void> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return

    const activeParticipants = this.conversationManager.getActiveParticipants(conversationId)
    
    for (const participant of activeParticipants) {
      await this.communicationBus.sendMessage(
        MessageType.StatusReport,
        'speaking-coordinator',
        participant.agentId,
        {
          agentId: 'speaking-coordinator',
          status: `Agent ${agentId} finished speaking`,
          currentTaskId: null,
          completedTaskCount: 0,
          failedTaskCount: 0,
          uptime: 0,
        },
        { priority: MessagePriority.Low },
      )
    }
  }

  private async handleSpeakingRequest(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as {
      taskId: string
      requiredCapabilities: string[]
      description: string
      urgency: MessagePriority
    }

    const conversationId = payload.taskId
    const agentId = message.senderId

    await this.requestToSpeak(conversationId, agentId, this.mapPriorityToNumber(payload.urgency), payload.description)

    return null
  }

  private mapPriorityToNumber(priority: MessagePriority): number {
    switch (priority) {
      case MessagePriority.Urgent: return 10
      case MessagePriority.High: return 7
      case MessagePriority.Normal: return 5
      case MessagePriority.Low: return 2
      default: return 1
    }
  }

  getCurrentSpeaker(conversationId: string): SpeakingTurn | undefined {
    return this.currentSpeakers.get(conversationId)
  }

  getSpeakingQueue(conversationId: string): SpeakingRequest[] {
    return this.speakingQueues.get(conversationId) ?? []
  }

  getSpeakingHistory(conversationId: string): SpeakingTurn[] {
    return this.speakingHistory.get(conversationId) ?? []
  }

  isAgentSpeaking(conversationId: string, agentId: string): boolean {
    const currentSpeaker = this.currentSpeakers.get(conversationId)
    return currentSpeaker?.agentId === agentId
  }

  isAgentInQueue(conversationId: string, agentId: string): boolean {
    const queue = this.speakingQueues.get(conversationId) ?? []
    return queue.some(r => r.agentId === agentId)
  }

  getSpeakingStats(conversationId: string): {
    currentSpeaker: string | null
    queueLength: number
    totalTurns: number
    averageTurnDuration: number
    totalSpeakingTime: number
  } {
    const currentSpeaker = this.currentSpeakers.get(conversationId)
    const queue = this.speakingQueues.get(conversationId) ?? []
    const history = this.speakingHistory.get(conversationId) ?? []

    const totalTurns = history.length
    const totalSpeakingTime = history.reduce((sum, turn) => sum + (turn.duration ?? 0), 0)
    const averageTurnDuration = totalTurns > 0 ? totalSpeakingTime / totalTurns : 0

    return {
      currentSpeaker: currentSpeaker?.agentId ?? null,
      queueLength: queue.length,
      totalTurns,
      averageTurnDuration,
      totalSpeakingTime,
    }
  }

  setStrategy(strategy: SpeakingStrategy): void {
    this.config.strategy = strategy
  }

  setMaxSpeakingTime(timeMs: number): void {
    this.config.maxSpeakingTimeMs = timeMs
  }

  setAllowInterruptions(allow: boolean): void {
    this.config.allowInterruptions = allow
  }

  setCooldownTime(timeMs: number): void {
    this.config.cooldownMs = timeMs
  }

  clearQueue(conversationId: string): void {
    this.speakingQueues.delete(conversationId)
  }

  removeFromQueueById(conversationId: string, agentId: string): boolean {
    const queue = this.speakingQueues.get(conversationId)
    if (!queue) return false

    const index = queue.findIndex(r => r.agentId === agentId)
    if (index === -1) return false

    queue.splice(index, 1)
    return true
  }

  exportSpeakingConfig(): SpeakingConfig {
    return { ...this.config }
  }

  importSpeakingConfig(config: Partial<SpeakingConfig>): void {
    this.config = { ...this.config, ...config }
  }
}