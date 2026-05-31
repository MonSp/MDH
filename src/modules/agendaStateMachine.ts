export type AgendaPhase = 'idle' | 'open_topic' | 'discussion' | 'proposal' | 'voting' | 'accepted' | 'rejected' | 'closed' | 'emergency'

export interface AgendaTransition {
  from: AgendaPhase
  to: AgendaPhase
  trigger: string
  condition?: () => boolean
}

export interface SpeakingToken {
  agentId: string
  grantedAt: number
  expiresAt: number
  relevanceScore: number
}

export interface AgendaEvent {
  type: 'phase_change' | 'token_granted' | 'token_revoked' | 'emergency_declared' | 'emergency_resolved' | 'state_timeout'
  from?: AgendaPhase
  to?: AgendaPhase
  agentId?: string
  timestamp: number
  reason?: string
}

export interface StateTimeoutConfig {
  idle?: number
  open_topic?: number
  discussion?: number
  proposal?: number
  voting?: number
  emergency?: number
}

export interface AgendaSnapshot {
  phase: AgendaPhase
  currentToken: SpeakingToken | null
  tokenQueue: SpeakingToken[]
  eventHistory: AgendaEvent[]
  topic: string
  stateEnteredAt: number
  serializedAt: number
}

const VALID_TRANSITIONS: Record<AgendaPhase, AgendaPhase[]> = {
  idle: ['open_topic', 'emergency'],
  open_topic: ['discussion', 'closed', 'emergency'],
  discussion: ['proposal', 'closed', 'emergency'],
  proposal: ['voting', 'discussion', 'closed', 'emergency'],
  voting: ['accepted', 'rejected', 'emergency'],
  accepted: ['closed', 'discussion', 'emergency'],
  rejected: ['discussion', 'closed', 'emergency'],
  emergency: ['discussion'],
  closed: ['idle'],
}

export class AgendaStateMachine {
  private phase: AgendaPhase
  private currentToken: SpeakingToken | null
  private tokenQueue: SpeakingToken[]
  private eventHistory: AgendaEvent[]
  private readonly TOKEN_DURATION_MS = 60000
  private listeners: ((event: AgendaEvent) => void)[]
  private topic: string
  private stateTimeouts: StateTimeoutConfig
  private stateEnteredAt: number

  constructor(stateTimeouts?: StateTimeoutConfig) {
    this.phase = 'idle'
    this.currentToken = null
    this.tokenQueue = []
    this.eventHistory = []
    this.listeners = []
    this.topic = ''
    this.stateTimeouts = stateTimeouts ?? {}
    this.stateEnteredAt = Date.now()
  }

  getPhase(): AgendaPhase {
    this.checkTokenExpiration()
    this.checkStateTimeout()
    return this.phase
  }

  getCurrentSpeaker(): string | null {
    this.checkTokenExpiration()
    return this.currentToken?.agentId ?? null
  }

  openTopic(topic: string): boolean {
    if (!this.canTransition('open_topic')) return false
    this.topic = topic
    this.transition('open_topic', 'openTopic')
    return true
  }

  startDiscussion(): boolean {
    if (!this.canTransition('discussion')) return false
    this.transition('discussion', 'startDiscussion')
    return true
  }

  propose(proposalId: string): boolean {
    if (!this.canTransition('proposal')) return false
    this.transition('proposal', 'propose')
    return true
  }

  startVoting(): boolean {
    if (!this.canTransition('voting')) return false
    this.transition('voting', 'startVoting')
    return true
  }

  accept(): boolean {
    if (!this.canTransition('accepted')) return false
    this.transition('accepted', 'accept')
    return true
  }

  reject(): boolean {
    if (!this.canTransition('rejected')) return false
    this.transition('rejected', 'reject')
    return true
  }

  close(): boolean {
    if (!this.canTransition('closed')) return false
    this.transition('closed', 'close')
    return true
  }

  declareEmergency(reason: string): boolean {
    const allowed: AgendaPhase[] = ['idle', 'open_topic', 'discussion', 'proposal', 'voting', 'accepted', 'rejected']
    if (!allowed.includes(this.phase)) return false
    const from = this.phase
    this.phase = 'emergency'
    this.stateEnteredAt = Date.now()
    this.emit({
      type: 'emergency_declared',
      from,
      to: 'emergency',
      timestamp: Date.now(),
      reason,
    })
    return true
  }

  resolveEmergency(): boolean {
    if (this.phase !== 'emergency') return false
    this.transition('discussion', 'resolveEmergency')
    return true
  }

  requestToken(agentId: string, relevanceScore: number): boolean {
    const now = Date.now()
    if (!this.currentToken) {
      this.currentToken = {
        agentId,
        grantedAt: now,
        expiresAt: now + this.TOKEN_DURATION_MS,
        relevanceScore,
      }
      this.emit({
        type: 'token_granted',
        agentId,
        timestamp: now,
      })
      return true
    }
    const token: SpeakingToken = {
      agentId,
      grantedAt: 0,
      expiresAt: 0,
      relevanceScore,
    }
    this.tokenQueue.push(token)
    this.tokenQueue.sort((a, b) => b.relevanceScore - a.relevanceScore)
    return true
  }

  releaseToken(): void {
    if (!this.currentToken) return
    const now = Date.now()
    this.currentToken = null
    if (this.tokenQueue.length > 0) {
      const next = this.tokenQueue.shift()!
      this.currentToken = {
        agentId: next.agentId,
        grantedAt: now,
        expiresAt: now + this.TOKEN_DURATION_MS,
        relevanceScore: next.relevanceScore,
      }
      this.emit({
        type: 'token_granted',
        agentId: next.agentId,
        timestamp: now,
      })
    }
  }

  forceToken(agentId: string, reason: string): boolean {
    const now = Date.now()
    if (this.currentToken) {
      this.emit({
        type: 'token_revoked',
        agentId: this.currentToken.agentId,
        timestamp: now,
        reason,
      })
    }
    this.tokenQueue = this.tokenQueue.filter(t => t.agentId !== agentId)
    this.currentToken = {
      agentId,
      grantedAt: now,
      expiresAt: now + this.TOKEN_DURATION_MS,
      relevanceScore: Infinity,
    }
    this.emit({
      type: 'token_granted',
      agentId,
      timestamp: now,
      reason,
    })
    return true
  }

  addListener(listener: (event: AgendaEvent) => void): void {
    this.listeners.push(listener)
  }

  removeListener(listener: (event: AgendaEvent) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  getEventHistory(): AgendaEvent[] {
    return [...this.eventHistory]
  }

  getTokenQueue(): SpeakingToken[] {
    return [...this.tokenQueue]
  }

  reset(): void {
    this.phase = 'idle'
    this.currentToken = null
    this.tokenQueue = []
    this.topic = ''
    this.stateEnteredAt = Date.now()
  }

  getRemainingTime(): number {
    const timeout = this.stateTimeouts[this.phase]
    if (timeout === undefined) return 0
    const elapsed = Date.now() - this.stateEnteredAt
    const remaining = timeout - elapsed
    return remaining > 0 ? remaining : 0
  }

  resetTimer(): void {
    this.stateEnteredAt = Date.now()
  }

  serialize(): AgendaSnapshot {
    return {
      phase: this.phase,
      currentToken: this.currentToken ? { ...this.currentToken } : null,
      tokenQueue: this.tokenQueue.map(t => ({ ...t })),
      eventHistory: this.eventHistory.map(e => ({ ...e })),
      topic: this.topic,
      stateEnteredAt: this.stateEnteredAt,
      serializedAt: Date.now(),
    }
  }

  static deserialize(snapshot: AgendaSnapshot, stateTimeouts?: StateTimeoutConfig): AgendaStateMachine {
    const sm = new AgendaStateMachine(stateTimeouts)
    sm.phase = snapshot.phase
    sm.currentToken = snapshot.currentToken ? { ...snapshot.currentToken } : null
    sm.tokenQueue = snapshot.tokenQueue.map(t => ({ ...t }))
    sm.eventHistory = snapshot.eventHistory.map(e => ({ ...e }))
    sm.topic = snapshot.topic
    sm.stateEnteredAt = snapshot.stateEnteredAt
    return sm
  }

  private canTransition(to: AgendaPhase): boolean {
    return VALID_TRANSITIONS[this.phase]?.includes(to) ?? false
  }

  private transition(to: AgendaPhase, trigger: string): void {
    const from = this.phase
    this.phase = to
    this.stateEnteredAt = Date.now()
    this.emit({
      type: 'phase_change',
      from,
      to,
      timestamp: Date.now(),
    })
  }

  private emit(event: AgendaEvent): void {
    this.eventHistory.push(event)
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  private checkTokenExpiration(): void {
    if (!this.currentToken) return
    if (Date.now() >= this.currentToken.expiresAt) {
      this.releaseToken()
    }
  }

  private checkStateTimeout(): void {
    const timeout = this.stateTimeouts[this.phase]
    if (timeout === undefined) return
    if (Date.now() - this.stateEnteredAt > timeout) {
      this.emit({
        type: 'state_timeout',
        to: this.phase,
        timestamp: Date.now(),
      })
    }
  }
}
