import type { AgentRole } from './agentTypes'

export interface AgentPosition {
  x: number
  y: number
}

export interface WorkstationBinding {
  workstationId: string
  agentId: string | null
  status: 'idle' | 'busy' | 'meeting'
}

export interface OfficeAgentState {
  id: string
  name: string
  role: AgentRole
  position: AgentPosition
  targetPosition: AgentPosition | null
  status: 'idle' | 'moving' | 'working' | 'meeting'
  workstationId: string | null
  currentTask: string | null
}

export type WorkflowPhase = 'idle' | 'meeting' | 'assigning' | 'working' | 'done'

export interface OfficeState {
  agents: Map<string, OfficeAgentState>
  workstations: Map<string, WorkstationBinding>
  workflowPhase: WorkflowPhase
  meetingAgents: string[]
}

export type StateChangeCallback = (state: OfficeState) => void

export class OfficeStateManager {
  private static instance: OfficeStateManager | null = null

  private state: OfficeState
  private subscribers: Set<StateChangeCallback> = new Set()

  private constructor() {
    this.state = {
      agents: new Map(),
      workstations: new Map(),
      workflowPhase: 'idle',
      meetingAgents: [],
    }
  }

  static getInstance(): OfficeStateManager {
    if (!OfficeStateManager.instance) {
      OfficeStateManager.instance = new OfficeStateManager()
    }
    return OfficeStateManager.instance
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify(): void {
    const snapshot = this.getState()
    this.subscribers.forEach(cb => cb(snapshot))
  }

  getState(): OfficeState {
    return {
      agents: new Map(this.state.agents),
      workstations: new Map(this.state.workstations),
      workflowPhase: this.state.workflowPhase,
      meetingAgents: [...this.state.meetingAgents],
    }
  }

  addAgent(agent: OfficeAgentState): void {
    this.state.agents.set(agent.id, { ...agent })
    this.notify()
  }

  removeAgent(agentId: string): boolean {
    const agent = this.state.agents.get(agentId)
    if (!agent) return false

    if (agent.workstationId) {
      this.unbindWorkstation(agent.workstationId)
    }

    this.state.meetingAgents = this.state.meetingAgents.filter(id => id !== agentId)
    this.state.agents.delete(agentId)
    this.notify()
    return true
  }

  getAgent(agentId: string): OfficeAgentState | undefined {
    const agent = this.state.agents.get(agentId)
    return agent ? { ...agent } : undefined
  }

  getAllAgents(): OfficeAgentState[] {
    return Array.from(this.state.agents.values()).map(a => ({ ...a }))
  }

  updateAgentPosition(agentId: string, position: AgentPosition): boolean {
    const agent = this.state.agents.get(agentId)
    if (!agent) return false

    agent.position = { ...position }
    agent.targetPosition = null
    this.notify()
    return true
  }

  setAgentTargetPosition(agentId: string, targetPosition: AgentPosition): boolean {
    const agent = this.state.agents.get(agentId)
    if (!agent) return false

    agent.targetPosition = { ...targetPosition }
    agent.status = 'moving'
    this.notify()
    return true
  }

  updateAgentStatus(agentId: string, status: OfficeAgentState['status']): boolean {
    const agent = this.state.agents.get(agentId)
    if (!agent) return false

    agent.status = status
    if (status !== 'moving') {
      agent.targetPosition = null
    }
    this.notify()
    return true
  }

  assignTaskToAgent(agentId: string, taskId: string): boolean {
    const agent = this.state.agents.get(agentId)
    if (!agent) return false

    agent.currentTask = taskId
    agent.status = 'working'
    this.notify()
    return true
  }

  clearAgentTask(agentId: string): boolean {
    const agent = this.state.agents.get(agentId)
    if (!agent) return false

    agent.currentTask = null
    agent.status = 'idle'
    this.notify()
    return true
  }

  addWorkstation(workstationId: string): void {
    if (this.state.workstations.has(workstationId)) return

    this.state.workstations.set(workstationId, {
      workstationId,
      agentId: null,
      status: 'idle',
    })
    this.notify()
  }

  removeWorkstation(workstationId: string): boolean {
    const binding = this.state.workstations.get(workstationId)
    if (!binding) return false

    if (binding.agentId) {
      this.unbindWorkstation(workstationId)
    }

    this.state.workstations.delete(workstationId)
    this.notify()
    return true
  }

  bindWorkstation(workstationId: string, agentId: string): boolean {
    const workstation = this.state.workstations.get(workstationId)
    const agent = this.state.agents.get(agentId)
    if (!workstation || !agent) return false
    if (workstation.agentId !== null) return false
    if (agent.workstationId !== null) return false

    workstation.agentId = agentId
    workstation.status = 'busy'
    agent.workstationId = workstationId
    this.notify()
    return true
  }

  unbindWorkstation(workstationId: string): boolean {
    const workstation = this.state.workstations.get(workstationId)
    if (!workstation || !workstation.agentId) return false

    const agent = this.state.agents.get(workstation.agentId)
    if (agent) {
      agent.workstationId = null
    }

    workstation.agentId = null
    workstation.status = 'idle'
    this.notify()
    return true
  }

  getWorkstation(workstationId: string): WorkstationBinding | undefined {
    const binding = this.state.workstations.get(workstationId)
    return binding ? { ...binding } : undefined
  }

  getAllWorkstations(): WorkstationBinding[] {
    return Array.from(this.state.workstations.values()).map(w => ({ ...w }))
  }

  getAvailableWorkstations(): WorkstationBinding[] {
    return this.getAllWorkstations().filter(w => w.agentId === null)
  }

  setWorkflowPhase(phase: WorkflowPhase): boolean {
    if (this.state.workflowPhase === phase) return false

    const valid = this.isValidTransition(this.state.workflowPhase, phase)
    if (!valid) return false

    this.state.workflowPhase = phase

    if (phase === 'meeting') {
      this.enterMeetingPhase()
    } else if (phase === 'idle' || phase === 'done') {
      this.exitMeetingPhase()
    }

    this.notify()
    return true
  }

  getWorkflowPhase(): WorkflowPhase {
    return this.state.workflowPhase
  }

  private isValidTransition(from: WorkflowPhase, to: WorkflowPhase): boolean {
    const transitions: Record<WorkflowPhase, WorkflowPhase[]> = {
      idle: ['meeting'],
      meeting: ['assigning', 'idle'],
      assigning: ['working', 'idle'],
      working: ['done', 'meeting', 'idle'],
      done: ['idle', 'meeting'],
    }
    return transitions[from].includes(to)
  }

  addAgentToMeeting(agentId: string): boolean {
    const agent = this.state.agents.get(agentId)
    if (!agent) return false
    if (this.state.meetingAgents.includes(agentId)) return false

    this.state.meetingAgents.push(agentId)
    agent.status = 'meeting'
    this.notify()
    return true
  }

  removeAgentFromMeeting(agentId: string): boolean {
    const index = this.state.meetingAgents.indexOf(agentId)
    if (index === -1) return false

    this.state.meetingAgents.splice(index, 1)
    const agent = this.state.agents.get(agentId)
    if (agent) {
      agent.status = 'idle'
    }
    this.notify()
    return true
  }

  getMeetingAgents(): string[] {
    return [...this.state.meetingAgents]
  }

  private enterMeetingPhase(): void {
    this.state.meetingAgents.forEach(agentId => {
      const agent = this.state.agents.get(agentId)
      if (agent) {
        agent.status = 'meeting'
      }
    })
  }

  private exitMeetingPhase(): void {
    this.state.meetingAgents.forEach(agentId => {
      const agent = this.state.agents.get(agentId)
      if (agent && agent.status === 'meeting') {
        agent.status = 'idle'
      }
    })
    this.state.meetingAgents = []
  }

  reset(): void {
    this.state.agents.clear()
    this.state.workstations.clear()
    this.state.workflowPhase = 'idle'
    this.state.meetingAgents = []
    this.notify()
  }
}

const officeStateManager = OfficeStateManager.getInstance()

export default officeStateManager
