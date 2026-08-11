export type AgentStatus = 'idle' | 'busy' | 'unhealthy' | 'offline'

export interface PoolAgentInstance {
  instanceId: string
  role: string
  status: AgentStatus
  useCount: number
  errorCount: number
  lastUsed: number
}

export interface TeamTemplate {
  name: string
  roles: Array<{ role: string; count: number }>
}

export interface PoolStatus {
  total: number
  idle: number
  busy: number
  unhealthy: number
  offline: number
  roles: Record<string, number>
}

export class AgentPool {
  private agents: PoolAgentInstance[] = []
  private roundRobinIndex: Map<string, number> = new Map()
  private nextInstanceId = 1

  createTeam(template: TeamTemplate): PoolAgentInstance[] {
    const created: PoolAgentInstance[] = []
    for (const { role, count } of template.roles) {
      for (let i = 0; i < count; i++) {
        const agent: PoolAgentInstance = {
          instanceId: `${role}-${this.nextInstanceId++}`,
          role,
          status: 'idle',
          useCount: 0,
          errorCount: 0,
          lastUsed: 0,
        }
        this.agents.push(agent)
        created.push(agent)
      }
    }
    return created
  }

  getAgentByRole(role: string): PoolAgentInstance | null {
    const eligible = this.agents.filter(
      a => a.role === role && a.status !== 'unhealthy' && a.status !== 'offline'
    )
    if (eligible.length === 0) return null

    const currentIndex = this.roundRobinIndex.get(role) ?? 0
    const idx = currentIndex % eligible.length
    this.roundRobinIndex.set(role, idx + 1)

    const agent = eligible[idx]
    agent.status = 'busy'
    agent.useCount++
    agent.lastUsed = Date.now()
    return agent
  }

  getAllAgents(): PoolAgentInstance[] {
    return [...this.agents]
  }

  getPoolStatus(): PoolStatus {
    const status: PoolStatus = {
      total: this.agents.length,
      idle: 0,
      busy: 0,
      unhealthy: 0,
      offline: 0,
      roles: {},
    }

    for (const agent of this.agents) {
      status[agent.status]++
      status.roles[agent.role] = (status.roles[agent.role] ?? 0) + 1
    }

    return status
  }

  markUnhealthy(instanceId: string): boolean {
    const agent = this.agents.find(a => a.instanceId === instanceId)
    if (!agent) return false
    agent.status = 'unhealthy'
    agent.errorCount++
    return true
  }

  scaleUp(role: string, count: number): PoolAgentInstance[] {
    const created: PoolAgentInstance[] = []
    for (let i = 0; i < count; i++) {
      const agent: PoolAgentInstance = {
        instanceId: `${role}-${this.nextInstanceId++}`,
        role,
        status: 'idle',
        useCount: 0,
        errorCount: 0,
        lastUsed: 0,
      }
      this.agents.push(agent)
      created.push(agent)
    }
    return created
  }

  scaleDown(role: string, count: number): PoolAgentInstance[] {
    const removed: PoolAgentInstance[] = []
    const idleAgents = this.agents.filter(a => a.role === role && a.status === 'idle')
    const toRemove = Math.min(count, idleAgents.length)

    for (let i = 0; i < toRemove; i++) {
      const agent = idleAgents[i]
      const idx = this.agents.indexOf(agent)
      if (idx !== -1) {
        this.agents.splice(idx, 1)
        removed.push(agent)
      }
    }
    return removed
  }

  clear(): void {
    this.agents = []
    this.roundRobinIndex.clear()
    this.nextInstanceId = 1
  }
}
