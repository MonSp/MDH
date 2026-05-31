import officeStateManager from './officeStateManager'
import type { AgentPosition, WorkflowPhase, OfficeAgentState } from './officeStateManager'

export interface WorkflowTask {
  id: string
  agentId: string
  description: string
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed'
}

export interface WorkflowCallbacks {
  onPhaseChange?: (phase: WorkflowPhase) => void
  onAgentMoveStart?: (agentId: string, from: AgentPosition, to: AgentPosition) => void
  onAgentMoveComplete?: (agentId: string) => void
  onTaskAssigned?: (task: WorkflowTask) => void
  onTaskComplete?: (taskId: string) => void
}

export const MEETING_TABLE_POSITION: AgentPosition = { x: 1, y: 1 }

export class OfficeWorkflowManager {
  private static instance: OfficeWorkflowManager | null = null

  private tasks: Map<string, WorkflowTask> = new Map()
  private callbacks: WorkflowCallbacks = {}
  private moveResolvers: Map<string, () => void> = new Map()

  private constructor() {
    this.setupSubscription()
  }

  static getInstance(): OfficeWorkflowManager {
    if (!OfficeWorkflowManager.instance) {
      OfficeWorkflowManager.instance = new OfficeWorkflowManager()
    }
    return OfficeWorkflowManager.instance
  }

  private setupSubscription(): void {
    officeStateManager.subscribe((state) => {
      state.agents.forEach((agent) => {
        if (agent.status === 'moving' && agent.targetPosition) {
          const reachedTarget =
            agent.position.x === agent.targetPosition.x &&
            agent.position.y === agent.targetPosition.y
          if (reachedTarget) {
            this.handleAgentArrived(agent)
          }
        }
      })
    })
  }

  private handleAgentArrived(agent: OfficeAgentState): void {
    officeStateManager.updateAgentPosition(agent.id, agent.position)
    officeStateManager.updateAgentStatus(agent.id, 'idle')

    const resolver = this.moveResolvers.get(agent.id)
    if (resolver) {
      this.moveResolvers.delete(agent.id)
      resolver()
    }

    this.callbacks.onAgentMoveComplete?.(agent.id)
  }

  setCallbacks(callbacks: WorkflowCallbacks): void {
    this.callbacks = callbacks
  }

  private setPhase(phase: WorkflowPhase): void {
    const success = officeStateManager.setWorkflowPhase(phase)
    if (success) {
      this.callbacks.onPhaseChange?.(phase)
    }
  }

  private moveAgentTo(agentId: string, target: AgentPosition): Promise<void> {
    return new Promise<void>((resolve) => {
      const agent = officeStateManager.getAgent(agentId)
      if (!agent) {
        resolve()
        return
      }

      this.moveResolvers.set(agentId, resolve)

      const from = { ...agent.position }
      this.callbacks.onAgentMoveStart?.(agentId, from, target)

      officeStateManager.setAgentTargetPosition(agentId, target)
      officeStateManager.updateAgentStatus(agentId, 'moving')
    })
  }

  async startMeeting(): Promise<void> {
    const currentPhase = officeStateManager.getWorkflowPhase()
    if (currentPhase !== 'idle' && currentPhase !== 'done') {
      return
    }

    this.setPhase('meeting')

    const agents = officeStateManager.getAllAgents()
    const movePromises = agents.map((agent) =>
      this.moveAgentTo(agent.id, MEETING_TABLE_POSITION),
    )

    await Promise.all(movePromises)

    agents.forEach((agent) => {
      officeStateManager.addAgentToMeeting(agent.id)
    })
  }

  assignTask(agentId: string, description: string): WorkflowTask | null {
    const currentPhase = officeStateManager.getWorkflowPhase()
    if (currentPhase !== 'meeting' && currentPhase !== 'assigning') {
      return null
    }

    if (currentPhase === 'meeting') {
      this.setPhase('assigning')
    }

    const agent = officeStateManager.getAgent(agentId)
    if (!agent) return null

    const task: WorkflowTask = {
      id: crypto.randomUUID(),
      agentId,
      description,
      status: 'pending',
    }

    this.tasks.set(task.id, task)

    task.status = 'assigned'
    officeStateManager.assignTaskToAgent(agentId, task.id)

    this.callbacks.onTaskAssigned?.(task)

    return task
  }

  async startWorking(): Promise<void> {
    const currentPhase = officeStateManager.getWorkflowPhase()
    if (currentPhase !== 'assigning') {
      return
    }

    this.setPhase('working')

    const agents = officeStateManager.getAllAgents()
    const movePromises = agents.map((agent) => {
      const workstationId = agent.workstationId
      if (!workstationId) {
        return this.moveAgentTo(agent.id, { x: 0, y: 0 })
      }

      const workstation = officeStateManager.getWorkstation(workstationId)
      if (!workstation) {
        return this.moveAgentTo(agent.id, { x: 0, y: 0 })
      }

      const agentIndex = agents.indexOf(agent)
      const workstationPosition: AgentPosition = {
        x: agentIndex % 3,
        y: Math.floor(agentIndex / 3) * 2,
      }

      return this.moveAgentTo(agent.id, workstationPosition)
    })

    await Promise.all(movePromises)

    agents.forEach((agent) => {
      officeStateManager.removeAgentFromMeeting(agent.id)
    })

    this.tasks.forEach((task) => {
      if (task.status === 'assigned') {
        task.status = 'executing'
      }
    })
  }

  completeTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = 'completed'
    officeStateManager.clearAgentTask(task.agentId)

    this.callbacks.onTaskComplete?.(taskId)

    const allCompleted = Array.from(this.tasks.values()).every(
      (t) => t.status === 'completed' || t.status === 'failed',
    )

    if (allCompleted && this.tasks.size > 0) {
      this.setPhase('done')
    }
  }

  failTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = 'failed'
    officeStateManager.clearAgentTask(task.agentId)
  }

  getTask(taskId: string): WorkflowTask | undefined {
    const task = this.tasks.get(taskId)
    return task ? { ...task } : undefined
  }

  getTasksByAgent(agentId: string): WorkflowTask[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.agentId === agentId)
      .map((t) => ({ ...t }))
  }

  getAllTasks(): WorkflowTask[] {
    return Array.from(this.tasks.values()).map((t) => ({ ...t }))
  }

  getCurrentPhase(): WorkflowPhase {
    return officeStateManager.getWorkflowPhase()
  }

  reset(): void {
    this.tasks.clear()
    this.moveResolvers.clear()
    officeStateManager.reset()
    this.callbacks.onPhaseChange?.('idle')
  }
}

const officeWorkflow = OfficeWorkflowManager.getInstance()

export default officeWorkflow
