export interface WaitEdge {
  waiterId: string
  blockerId: string
  resourceId: string
  since: number
}

export interface DeadlockCycle {
  agents: string[]
  edges: WaitEdge[]
  detectedAt: number
}

export type DeadlockResolution = 'timeout' | 'preemption' | 'manual'

export interface DeadlockEvent {
  cycle: DeadlockCycle
  resolution: DeadlockResolution
  resolvedAt: number
  details: string
}

export class DeadlockDetector {
  private waitGraph: Map<string, WaitEdge[]>
  private timeoutMs: number
  private deadlockHistory: DeadlockEvent[]
  private listeners: ((event: DeadlockEvent) => void)[]

  constructor(timeoutMs: number = 30000) {
    this.waitGraph = new Map()
    this.timeoutMs = timeoutMs
    this.deadlockHistory = []
    this.listeners = []
  }

  addWaitEdge(waiterId: string, blockerId: string, resourceId: string): void {
    const edge: WaitEdge = {
      waiterId,
      blockerId,
      resourceId,
      since: Date.now(),
    }
    const edges = this.waitGraph.get(waiterId) ?? []
    edges.push(edge)
    this.waitGraph.set(waiterId, edges)
  }

  removeWaitEdge(waiterId: string, blockerId?: string): void {
    const edges = this.waitGraph.get(waiterId)
    if (!edges) return

    if (blockerId) {
      const filtered = edges.filter(e => e.blockerId !== blockerId)
      if (filtered.length > 0) {
        this.waitGraph.set(waiterId, filtered)
      } else {
        this.waitGraph.delete(waiterId)
      }
    } else {
      this.waitGraph.delete(waiterId)
    }
  }

  detectCycles(): DeadlockCycle[] {
    const cycles: DeadlockCycle[] = []
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const path: string[] = []
    const pathEdges: WaitEdge[] = []

    const dfs = (nodeId: string): void => {
      if (inStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId)
        if (cycleStart >= 0) {
          const agents = path.slice(cycleStart)
          const edges = pathEdges.slice(cycleStart)
          cycles.push({
            agents,
            edges,
            detectedAt: Date.now(),
          })
        }
        return
      }
      if (visited.has(nodeId)) return

      visited.add(nodeId)
      inStack.add(nodeId)
      path.push(nodeId)

      const edges = this.waitGraph.get(nodeId) ?? []
      for (const edge of edges) {
        pathEdges.push(edge)
        dfs(edge.blockerId)
        pathEdges.pop()
      }

      path.pop()
      inStack.delete(nodeId)
    }

    for (const nodeId of this.waitGraph.keys()) {
      dfs(nodeId)
    }

    return cycles
  }

  resolveDeadlock(cycle: DeadlockCycle, resolution: DeadlockResolution): DeadlockEvent {
    let details = ''

    switch (resolution) {
      case 'timeout':
        for (const edge of cycle.edges) {
          this.removeWaitEdge(edge.waiterId, edge.blockerId)
        }
        details = `Released all ${cycle.edges.length} wait edges in cycle [${cycle.agents.join(' -> ')}]`
        break
      case 'preemption': {
        const oldestEdge = cycle.edges.reduce((oldest, edge) =>
          edge.since < oldest.since ? edge : oldest,
        )
        this.removeWaitEdge(oldestEdge.waiterId, oldestEdge.blockerId)
        details = `Preempted wait edge from ${oldestEdge.waiterId} to ${oldestEdge.blockerId} (oldest since ${oldestEdge.since})`
        break
      }
      case 'manual':
        details = `Manual resolution requested for cycle [${cycle.agents.join(' -> ')}]`
        break
    }

    const event: DeadlockEvent = {
      cycle,
      resolution,
      resolvedAt: Date.now(),
      details,
    }

    this.deadlockHistory.push(event)
    for (const listener of this.listeners) {
      listener(event)
    }

    return event
  }

  checkTimeouts(): DeadlockCycle[] {
    const now = Date.now()
    const timedOutEdges: WaitEdge[] = []

    for (const edges of this.waitGraph.values()) {
      for (const edge of edges) {
        if (now - edge.since > this.timeoutMs) {
          timedOutEdges.push(edge)
        }
      }
    }

    if (timedOutEdges.length === 0) return []

    const agentSet = new Set<string>()
    for (const edge of timedOutEdges) {
      agentSet.add(edge.waiterId)
      agentSet.add(edge.blockerId)
    }

    const groups = this.groupConnectedEdges(timedOutEdges, agentSet)
    return groups.map(group => ({
      agents: group.agents,
      edges: group.edges,
      detectedAt: now,
    }))
  }

  private groupConnectedEdges(
    edges: WaitEdge[],
    agentSet: Set<string>,
  ): { agents: string[]; edges: WaitEdge[] }[] {
    const adjacency = new Map<string, string[]>()
    for (const agent of agentSet) {
      adjacency.set(agent, [])
    }
    for (const edge of edges) {
      adjacency.get(edge.waiterId)?.push(edge.blockerId)
      adjacency.get(edge.blockerId)?.push(edge.waiterId)
    }

    const visited = new Set<string>()
    const groups: { agents: string[]; edges: WaitEdge[] }[] = []

    for (const agent of agentSet) {
      if (visited.has(agent)) continue

      const component: string[] = []
      const queue = [agent]
      while (queue.length > 0) {
        const current = queue.shift()!
        if (visited.has(current)) continue
        visited.add(current)
        component.push(current)
        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor)
          }
        }
      }

      const componentSet = new Set(component)
      const groupEdges = edges.filter(
        e => componentSet.has(e.waiterId) && componentSet.has(e.blockerId),
      )

      if (groupEdges.length > 0) {
        groups.push({ agents: component, edges: groupEdges })
      }
    }

    return groups
  }

  getWaitGraph(): Map<string, WaitEdge[]> {
    return new Map(
      Array.from(this.waitGraph.entries()).map(([k, v]) => [k, [...v]]),
    )
  }

  getDeadlockHistory(): DeadlockEvent[] {
    return [...this.deadlockHistory]
  }

  addListener(listener: (event: DeadlockEvent) => void): void {
    this.listeners.push(listener)
  }

  removeListener(listener: (event: DeadlockEvent) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  clear(): void {
    this.waitGraph.clear()
    this.deadlockHistory = []
    this.listeners = []
  }
}
