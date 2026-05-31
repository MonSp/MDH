import { MultiAgentConversation, ConversationStatus, ConversationContext } from './multiAgentConversation'
import { AgentCoordinator } from './agentCoordinator'
import { CommunicationBus } from './communicationBus'
import { MessageType, MessagePriority, MessageEnvelope } from './communicationProtocol'
import { AgentInstance, AgentRole } from './agentTypes'

export enum ConversationPhase {
  Initialization = 'initialization',
  Introduction = 'introduction',
  Discussion = 'discussion',
  Decision = 'decision',
  Conclusion = 'conclusion',
  FollowUp = 'follow_up',
}

export enum FlowControlAction {
  Start = 'start',
  Pause = 'pause',
  Resume = 'resume',
  NextPhase = 'next_phase',
  PreviousPhase = 'previous_phase',
  End = 'end',
  Skip = 'skip',
}

export interface PhaseTransition {
  from: ConversationPhase
  to: ConversationPhase
  condition: (context: ConversationContext) => boolean
  action?: (context: ConversationContext) => Promise<void>
}

export interface FlowRule {
  id: string
  name: string
  description: string
  phase: ConversationPhase
  condition: (context: ConversationContext) => boolean
  action: (context: ConversationContext) => Promise<void>
  priority: number
}

export interface ConversationFlowConfig {
  autoProgressPhases: boolean
  phaseTimeoutMs: number
  requireAllParticipants: boolean
  minParticipants: number
  maxMessagesPerPhase: number
  enableFlowRules: boolean
}

export class ConversationFlowController {
  private conversationManager: MultiAgentConversation
  private coordinator: AgentCoordinator
  private communicationBus: CommunicationBus
  private config: ConversationFlowConfig
  private phaseTransitions: Map<ConversationPhase, PhaseTransition[]> = new Map()
  private flowRules: Map<string, FlowRule> = new Map()
  private conversationPhases: Map<string, ConversationPhase> = new Map()
  private phaseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(
    conversationManager: MultiAgentConversation,
    coordinator: AgentCoordinator,
    communicationBus: CommunicationBus,
    config?: Partial<ConversationFlowConfig>,
  ) {
    this.conversationManager = conversationManager
    this.coordinator = coordinator
    this.communicationBus = communicationBus
    this.config = {
      autoProgressPhases: config?.autoProgressPhases ?? true,
      phaseTimeoutMs: config?.phaseTimeoutMs ?? 300000,
      requireAllParticipants: config?.requireAllParticipants ?? false,
      minParticipants: config?.minParticipants ?? 2,
      maxMessagesPerPhase: config?.maxMessagesPerPhase ?? 50,
      enableFlowRules: config?.enableFlowRules ?? true,
    }

    this.setupDefaultPhaseTransitions()
    this.setupMessageHandlers()
  }

  private setupDefaultPhaseTransitions(): void {
    this.addPhaseTransition(
      ConversationPhase.Initialization,
      ConversationPhase.Introduction,
      (context) => context.participants.size >= this.config.minParticipants,
    )

    this.addPhaseTransition(
      ConversationPhase.Introduction,
      ConversationPhase.Discussion,
      (context) => context.messages.length >= context.participants.size,
    )

    this.addPhaseTransition(
      ConversationPhase.Discussion,
      ConversationPhase.Decision,
      (context) => this.hasReachedConsensus(context),
    )

    this.addPhaseTransition(
      ConversationPhase.Decision,
      ConversationPhase.Conclusion,
      (context) => this.isDecisionMade(context),
    )

    this.addPhaseTransition(
      ConversationPhase.Conclusion,
      ConversationPhase.FollowUp,
      (context) => context.messages.length > 0,
    )
  }

  private setupMessageHandlers(): void {
    this.communicationBus.registerHandler({
      messageType: MessageType.ControlCommand,
      handler: this.handleFlowControlCommand.bind(this),
    })
  }

  addPhaseTransition(
    from: ConversationPhase,
    to: ConversationPhase,
    condition: (context: ConversationContext) => boolean,
    action?: (context: ConversationContext) => Promise<void>,
  ): void {
    const transition: PhaseTransition = { from, to, condition, action }
    const transitions = this.phaseTransitions.get(from) ?? []
    transitions.push(transition)
    this.phaseTransitions.set(from, transitions)
  }

  addFlowRule(rule: FlowRule): void {
    this.flowRules.set(rule.id, rule)
  }

  removeFlowRule(ruleId: string): boolean {
    return this.flowRules.delete(ruleId)
  }

  async initializeConversation(conversationId: string): Promise<boolean> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return false

    this.conversationPhases.set(conversationId, ConversationPhase.Initialization)
    this.startPhaseTimer(conversationId)

    if (this.config.enableFlowRules) {
      await this.applyFlowRules(conversationId)
    }

    return true
  }

  async controlFlow(conversationId: string, action: FlowControlAction): Promise<boolean> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return false

    const currentPhase = this.conversationPhases.get(conversationId)
    if (!currentPhase) return false

    switch (action) {
      case FlowControlAction.Start:
        return await this.startFlow(conversationId)
      case FlowControlAction.Pause:
        return await this.pauseFlow(conversationId)
      case FlowControlAction.Resume:
        return await this.resumeFlow(conversationId)
      case FlowControlAction.NextPhase:
        return await this.progressToNextPhase(conversationId)
      case FlowControlAction.PreviousPhase:
        return await this.regressToPreviousPhase(conversationId)
      case FlowControlAction.End:
        return await this.endFlow(conversationId)
      case FlowControlAction.Skip:
        return await this.skipPhase(conversationId)
      default:
        return false
    }
  }

  private async startFlow(conversationId: string): Promise<boolean> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return false

    if (conversation.status !== ConversationStatus.Idle) return false

    const success = await this.conversationManager.startConversation(conversationId)
    if (!success) return false

    await this.notifyPhaseChange(conversationId, ConversationPhase.Initialization)
    return true
  }

  private async pauseFlow(conversationId: string): Promise<boolean> {
    this.clearPhaseTimer(conversationId)
    return await this.conversationManager.pauseConversation(conversationId)
  }

  private async resumeFlow(conversationId: string): Promise<boolean> {
    const success = await this.conversationManager.resumeConversation(conversationId)
    if (success) {
      this.startPhaseTimer(conversationId)
    }
    return success
  }

  private async endFlow(conversationId: string): Promise<boolean> {
    this.clearPhaseTimer(conversationId)
    this.conversationPhases.delete(conversationId)
    return await this.conversationManager.endConversation(conversationId)
  }

  private async progressToNextPhase(conversationId: string): Promise<boolean> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return false

    const currentPhase = this.conversationPhases.get(conversationId)
    if (!currentPhase) return false

    const transitions = this.phaseTransitions.get(currentPhase) ?? []
    
    for (const transition of transitions) {
      if (transition.condition(conversation)) {
        if (transition.action) {
          await transition.action(conversation)
        }

        this.conversationPhases.set(conversationId, transition.to)
        this.clearPhaseTimer(conversationId)
        this.startPhaseTimer(conversationId)

        await this.notifyPhaseChange(conversationId, transition.to)

        if (this.config.enableFlowRules) {
          await this.applyFlowRules(conversationId)
        }

        return true
      }
    }

    return false
  }

  private async regressToPreviousPhase(conversationId: string): Promise<boolean> {
    const currentPhase = this.conversationPhases.get(conversationId)
    if (!currentPhase) return false

    const previousPhase = this.getPreviousPhase(currentPhase)
    if (!previousPhase) return false

    this.conversationPhases.set(conversationId, previousPhase)
    this.clearPhaseTimer(conversationId)
    this.startPhaseTimer(conversationId)

    await this.notifyPhaseChange(conversationId, previousPhase)
    return true
  }

  private async skipPhase(conversationId: string): Promise<boolean> {
    return await this.progressToNextPhase(conversationId)
  }

  private getPreviousPhase(currentPhase: ConversationPhase): ConversationPhase | null {
    const phases = Object.values(ConversationPhase)
    const currentIndex = phases.indexOf(currentPhase)
    return currentIndex > 0 ? phases[currentIndex - 1] : null
  }

  private startPhaseTimer(conversationId: string): void {
    if (this.config.phaseTimeoutMs <= 0) return

    const timer = setTimeout(async () => {
      await this.handlePhaseTimeout(conversationId)
    }, this.config.phaseTimeoutMs)

    this.phaseTimers.set(conversationId, timer)
  }

  private clearPhaseTimer(conversationId: string): void {
    const timer = this.phaseTimers.get(conversationId)
    if (timer) {
      clearTimeout(timer)
      this.phaseTimers.delete(conversationId)
    }
  }

  private async handlePhaseTimeout(conversationId: string): Promise<void> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return

    if (this.config.autoProgressPhases) {
      await this.progressToNextPhase(conversationId)
    } else {
      await this.notifyPhaseTimeout(conversationId)
    }
  }

  private async applyFlowRules(conversationId: string): Promise<void> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return

    const currentPhase = this.conversationPhases.get(conversationId)
    if (!currentPhase) return

    const applicableRules = Array.from(this.flowRules.values())
      .filter(rule => rule.phase === currentPhase)
      .sort((a, b) => b.priority - a.priority)

    for (const rule of applicableRules) {
      if (rule.condition(conversation)) {
        await rule.action(conversation)
      }
    }
  }

  private hasReachedConsensus(context: ConversationContext): boolean {
    const recentMessages = context.messages.slice(-10)
    const uniqueSenders = new Set(recentMessages.map(m => m.senderId))
    return uniqueSenders.size >= Math.min(context.participants.size, 3)
  }

  private isDecisionMade(context: ConversationContext): boolean {
    const recentMessages = context.messages.slice(-5)
    return recentMessages.some(m => 
      m.content.toLowerCase().includes('decision') ||
      m.content.toLowerCase().includes('agreed') ||
      m.content.toLowerCase().includes('conclusion')
    )
  }

  private async notifyPhaseChange(conversationId: string, newPhase: ConversationPhase): Promise<void> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return

    const activeParticipants = this.conversationManager.getActiveParticipants(conversationId)
    
    for (const participant of activeParticipants) {
      await this.communicationBus.sendMessage(
        MessageType.StatusReport,
        'flow-controller',
        participant.agentId,
        {
          agentId: 'flow-controller',
          status: `Phase changed to: ${newPhase}`,
          currentTaskId: null,
          completedTaskCount: 0,
          failedTaskCount: 0,
          uptime: 0,
        },
        { priority: MessagePriority.Normal },
      )
    }
  }

  private async notifyPhaseTimeout(conversationId: string): Promise<void> {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return

    const activeParticipants = this.conversationManager.getActiveParticipants(conversationId)
    
    for (const participant of activeParticipants) {
      await this.communicationBus.sendMessage(
        MessageType.ErrorReport,
        'flow-controller',
        participant.agentId,
        {
          taskId: conversationId,
          errorCode: 'PHASE_TIMEOUT',
          errorMessage: 'Phase timeout exceeded',
          recoverable: true,
        },
        { priority: MessagePriority.High },
      )
    }
  }

  private async handleFlowControlCommand(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const payload = message.payload as { command: string; targetTaskId?: string; reason?: string }
    
    if (payload.targetTaskId) {
      const conversation = this.conversationManager.getConversation(payload.targetTaskId)
      if (conversation) {
        const action = this.mapCommandToAction(payload.command)
        if (action) {
          await this.controlFlow(payload.targetTaskId, action)
        }
      }
    }

    return null
  }

  private mapCommandToAction(command: string): FlowControlAction | null {
    switch (command) {
      case 'pause': return FlowControlAction.Pause
      case 'resume': return FlowControlAction.Resume
      case 'cancel': return FlowControlAction.End
      case 'restart': return FlowControlAction.Start
      default: return null
    }
  }

  getCurrentPhase(conversationId: string): ConversationPhase | undefined {
    return this.conversationPhases.get(conversationId)
  }

  getPhaseProgress(conversationId: string): {
    currentPhase: ConversationPhase
    phaseIndex: number
    totalPhases: number
    progress: number
  } | null {
    const currentPhase = this.conversationPhases.get(conversationId)
    if (!currentPhase) return null

    const phases = Object.values(ConversationPhase)
    const phaseIndex = phases.indexOf(currentPhase)
    
    return {
      currentPhase,
      phaseIndex,
      totalPhases: phases.length,
      progress: (phaseIndex + 1) / phases.length,
    }
  }

  getConversationFlowStats(conversationId: string): {
    phase: ConversationPhase | undefined
    messageCount: number
    participantCount: number
    activeParticipantCount: number
    duration: number
  } | null {
    const conversation = this.conversationManager.getConversation(conversationId)
    if (!conversation) return null

    const phase = this.conversationPhases.get(conversationId)
    const stats = this.conversationManager.getConversationStats(conversationId)
    
    return {
      phase,
      messageCount: stats?.totalMessages ?? 0,
      participantCount: conversation.participants.size,
      activeParticipantCount: stats?.activeParticipants ?? 0,
      duration: stats?.duration ?? 0,
    }
  }

  setAutoProgress(enabled: boolean): void {
    this.config.autoProgressPhases = enabled
  }

  setPhaseTimeout(timeoutMs: number): void {
    this.config.phaseTimeoutMs = timeoutMs
  }

  setMinParticipants(count: number): void {
    this.config.minParticipants = count
  }

  exportFlowConfig(): ConversationFlowConfig {
    return { ...this.config }
  }

  importFlowConfig(config: Partial<ConversationFlowConfig>): void {
    this.config = { ...this.config, ...config }
  }
}