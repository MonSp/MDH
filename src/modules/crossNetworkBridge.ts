export type AgentLocation = 'local' | 'remote'
export type AgentEndpointStatus = 'online' | 'offline' | 'unhealthy'

export interface AgentEndpointLocal {
  agentId: string
  name: string
  role: string
  location: AgentLocation
  networkId: string
  endpointUrl?: string
  capabilities: string[]
  status: AgentEndpointStatus
  lastHeartbeat: number
}

export interface NetworkMessageLocal {
  messageId: string
  fromAgentId: string
  toAgentId: string
  messageType: string
  payload: unknown
  timestamp: number
  ttl: number
}

export type MessageHandler = (msg: NetworkMessageLocal) => void | Promise<void>

const HEARTBEAT_THRESHOLD_MS = 60_000

export class CrossNetworkBridgeLocal {
  private endpoints: Map<string, AgentEndpointLocal> = new Map()
  private messageHandlers: Map<string, MessageHandler[]> = new Map()
  private messageLog: NetworkMessageLocal[] = []

  registerEndpoint(endpoint: AgentEndpointLocal): void {
    this.endpoints.set(endpoint.agentId, { ...endpoint })
  }

  unregisterEndpoint(agentId: string): boolean {
    return this.endpoints.delete(agentId)
  }

  getEndpoint(agentId: string): AgentEndpointLocal | null {
    const ep = this.endpoints.get(agentId)
    return ep ? { ...ep } : null
  }

  getAvailableAgents(
    location?: AgentLocation,
    role?: string
  ): AgentEndpointLocal[] {
    const now = Date.now()
    const result: AgentEndpointLocal[] = []

    for (const ep of this.endpoints.values()) {
      if (ep.status === 'offline') continue
      if (now - ep.lastHeartbeat > HEARTBEAT_THRESHOLD_MS) continue
      if (location !== undefined && ep.location !== location) continue
      if (role !== undefined && ep.role !== role) continue
      result.push({ ...ep })
    }

    return result
  }

  sendMessage(msg: NetworkMessageLocal): boolean {
    const target = this.endpoints.get(msg.toAgentId)
    if (!target) return false

    const now = Date.now()
    if (now - msg.timestamp > msg.ttl * 1000) return false

    this.messageLog.push({ ...msg })

    if (target.location === 'local') {
      this.dispatchToHandlers(msg)
      return true
    }

    // Remote: would forward via network; for local module just dispatch
    this.dispatchToHandlers(msg)
    return true
  }

  registerMessageHandler(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type) ?? []
    handlers.push(handler)
    this.messageHandlers.set(type, handlers)
  }

  async handleIncomingMessage(msg: NetworkMessageLocal): Promise<void> {
    this.messageLog.push({ ...msg })
    await this.dispatchToHandlers(msg)
  }

  updateHeartbeat(agentId: string): boolean {
    const ep = this.endpoints.get(agentId)
    if (!ep) return false
    ep.lastHeartbeat = Date.now()
    return true
  }

  checkHealth(): { healthy: string[]; unhealthy: string[] } {
    const now = Date.now()
    const healthy: string[] = []
    const unhealthy: string[] = []

    for (const ep of this.endpoints.values()) {
      if (ep.status === 'offline') {
        unhealthy.push(ep.agentId)
        continue
      }
      if (now - ep.lastHeartbeat > HEARTBEAT_THRESHOLD_MS) {
        ep.status = 'unhealthy'
        unhealthy.push(ep.agentId)
      } else {
        healthy.push(ep.agentId)
      }
    }

    return { healthy, unhealthy }
  }

  getMessageLog(): NetworkMessageLocal[] {
    return [...this.messageLog]
  }

  clear(): void {
    this.endpoints.clear()
    this.messageHandlers.clear()
    this.messageLog = []
  }

  private async dispatchToHandlers(msg: NetworkMessageLocal): Promise<void> {
    const handlers = this.messageHandlers.get(msg.messageType) ?? []
    const wildcardHandlers = this.messageHandlers.get('*') ?? []
    const allHandlers = [...handlers, ...wildcardHandlers]

    for (const handler of allHandlers) {
      await handler(msg)
    }
  }
}
