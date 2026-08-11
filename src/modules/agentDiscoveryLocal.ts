import type {
  AgentEndpointLocal,
  AgentLocation,
  CrossNetworkBridgeLocal,
} from './crossNetworkBridgeLocal'

export type DiscoveryCallback = (agent: AgentEndpointLocal) => void

export class AgentDiscoveryLocal {
  private bridge: CrossNetworkBridgeLocal
  private discoveryInterval: number
  private timer: ReturnType<typeof setInterval> | null = null
  private knownAgents: Map<string, AgentEndpointLocal> = new Map()
  private onDiscovered: DiscoveryCallback | null = null
  private onLost: DiscoveryCallback | null = null

  constructor(bridge: CrossNetworkBridgeLocal, interval = 30_000) {
    this.bridge = bridge
    this.discoveryInterval = interval
  }

  setCallbacks(opts: {
    onDiscovered?: DiscoveryCallback
    onLost?: DiscoveryCallback
  }): void {
    if (opts.onDiscovered) this.onDiscovered = opts.onDiscovered
    if (opts.onLost) this.onLost = opts.onLost
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.discover(), this.discoveryInterval)
    // Run an immediate discovery on start
    this.discover()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  registerLocalAgent(agent: Omit<AgentEndpointLocal, 'location' | 'lastHeartbeat' | 'status'>): void {
    const full: AgentEndpointLocal = {
      ...agent,
      location: 'local',
      status: 'online',
      lastHeartbeat: Date.now(),
    }
    this.bridge.registerEndpoint(full)
    this.knownAgents.set(full.agentId, full)
  }

  registerRemoteAgent(agent: Omit<AgentEndpointLocal, 'location' | 'lastHeartbeat' | 'status'>): void {
    const full: AgentEndpointLocal = {
      ...agent,
      location: 'remote',
      status: 'online',
      lastHeartbeat: Date.now(),
    }
    this.bridge.registerEndpoint(full)
    this.knownAgents.set(full.agentId, full)
  }

  getAgentsByRole(role: string): AgentEndpointLocal[] {
    return this.bridge.getAvailableAgents(undefined, role)
  }

  getAgentsByLocation(location: AgentLocation): AgentEndpointLocal[] {
    return this.bridge.getAvailableAgents(location)
  }

  getAllAgents(): AgentEndpointLocal[] {
    return this.bridge.getAvailableAgents()
  }

  private discover(): void {
    const current = this.bridge.getAvailableAgents()
    const currentIds = new Set(current.map(a => a.agentId))

    // Detect newly discovered agents
    for (const agent of current) {
      if (!this.knownAgents.has(agent.agentId)) {
        this.knownAgents.set(agent.agentId, agent)
        this.onDiscovered?.(agent)
      }
    }

    // Detect lost agents
    for (const [id, agent] of this.knownAgents) {
      if (!currentIds.has(id)) {
        this.knownAgents.delete(id)
        this.onLost?.(agent)
      }
    }
  }
}
