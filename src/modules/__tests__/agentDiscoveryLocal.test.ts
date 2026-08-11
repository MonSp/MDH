import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CrossNetworkBridgeLocal, type AgentEndpointLocal } from '../crossNetworkBridgeLocal'
import { AgentDiscoveryLocal } from '../agentDiscoveryLocal'

function makeEndpoint(overrides: Partial<AgentEndpointLocal> = {}): AgentEndpointLocal {
  return {
    agentId: 'agent-1',
    name: 'Test Agent',
    role: 'executor',
    location: 'local',
    networkId: 'net-1',
    capabilities: [],
    status: 'online',
    lastHeartbeat: Date.now(),
    ...overrides,
  }
}

describe('AgentDiscoveryLocal', () => {
  let bridge: CrossNetworkBridgeLocal
  let discovery: AgentDiscoveryLocal

  beforeEach(() => {
    vi.useFakeTimers()
    bridge = new CrossNetworkBridgeLocal()
    discovery = new AgentDiscoveryLocal(bridge, 10_000)
  })

  afterEach(() => {
    discovery.stop()
    vi.useRealTimers()
  })

  describe('registerLocalAgent / registerRemoteAgent', () => {
    it('should register a local agent via discovery', () => {
      discovery.registerLocalAgent({
        agentId: 'local-1',
        name: 'Local Agent',
        role: 'executor',
        networkId: 'net-1',
        capabilities: ['read'],
      })

      const agents = discovery.getAllAgents()
      expect(agents).toHaveLength(1)
      expect(agents[0].location).toBe('local')
      expect(agents[0].agentId).toBe('local-1')
    })

    it('should register a remote agent via discovery', () => {
      discovery.registerRemoteAgent({
        agentId: 'remote-1',
        name: 'Remote Agent',
        role: 'reviewer',
        networkId: 'net-2',
        capabilities: ['review'],
      })

      const agents = discovery.getAllAgents()
      expect(agents).toHaveLength(1)
      expect(agents[0].location).toBe('remote')
    })

    it('should set status to online and lastHeartbeat to now', () => {
      const before = Date.now()
      discovery.registerLocalAgent({
        agentId: 'a1',
        name: 'A',
        role: 'dev',
        networkId: 'n1',
        capabilities: [],
      })

      const agent = bridge.getEndpoint('a1')!
      expect(agent.status).toBe('online')
      expect(agent.lastHeartbeat).toBeGreaterThanOrEqual(before)
    })
  })

  describe('getAgentsByRole', () => {
    it('should return agents matching the role', () => {
      discovery.registerLocalAgent({
        agentId: 'a1', name: 'A', role: 'executor', networkId: 'n1', capabilities: [],
      })
      discovery.registerLocalAgent({
        agentId: 'a2', name: 'B', role: 'reviewer', networkId: 'n1', capabilities: [],
      })

      const executors = discovery.getAgentsByRole('executor')
      expect(executors).toHaveLength(1)
      expect(executors[0].agentId).toBe('a1')
    })
  })

  describe('getAgentsByLocation', () => {
    it('should return agents matching the location', () => {
      discovery.registerLocalAgent({
        agentId: 'a1', name: 'A', role: 'dev', networkId: 'n1', capabilities: [],
      })
      discovery.registerRemoteAgent({
        agentId: 'a2', name: 'B', role: 'dev', networkId: 'n2', capabilities: [],
      })

      const locals = discovery.getAgentsByLocation('local')
      expect(locals).toHaveLength(1)
      expect(locals[0].agentId).toBe('a1')

      const remotes = discovery.getAgentsByLocation('remote')
      expect(remotes).toHaveLength(1)
      expect(remotes[0].agentId).toBe('a2')
    })
  })

  describe('start / stop', () => {
    it('should call onDiscovered for new agents', () => {
      const onDiscovered = vi.fn()
      discovery.setCallbacks({ onDiscovered })

      // Register agent after setCallbacks but before start
      bridge.registerEndpoint(makeEndpoint({ agentId: 'new-1' }))

      discovery.start()
      // The immediate discover call should detect the new agent
      expect(onDiscovered).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'new-1' })
      )
    })

    it('should call onLost when agent disappears', () => {
      const onLost = vi.fn()
      discovery.setCallbacks({ onLost })

      discovery.registerLocalAgent({
        agentId: 'a1', name: 'A', role: 'dev', networkId: 'n1', capabilities: [],
      })

      discovery.start()
      expect(onLost).not.toHaveBeenCalled()

      // Remove agent from bridge
      bridge.unregisterEndpoint('a1')

      // Advance timer to trigger next discovery
      vi.advanceTimersByTime(10_000)

      expect(onLost).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'a1' })
      )
    })

    it('should not start twice', () => {
      const spy = vi.spyOn(globalThis, 'setInterval')
      discovery.start()
      discovery.start() // second call should be no-op

      // Only one interval should be created (plus the immediate discover call doesn't use setInterval)
      discovery.stop()
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should stop the interval', () => {
      discovery.start()
      discovery.stop()

      // After stop, advancing time should not trigger callbacks
      const onDiscovered = vi.fn()
      discovery.setCallbacks({ onDiscovered })

      bridge.registerEndpoint(makeEndpoint({ agentId: 'late-1' }))
      vi.advanceTimersByTime(60_000)

      // The agent was registered but since discovery is stopped, onDiscovered won't fire
      // (unless we re-start)
      expect(onDiscovered).not.toHaveBeenCalled()
    })
  })

  describe('getAllAgents', () => {
    it('should return all available agents', () => {
      discovery.registerLocalAgent({
        agentId: 'a1', name: 'A', role: 'dev', networkId: 'n1', capabilities: [],
      })
      discovery.registerRemoteAgent({
        agentId: 'a2', name: 'B', role: 'dev', networkId: 'n2', capabilities: [],
      })

      expect(discovery.getAllAgents()).toHaveLength(2)
    })

    it('should return empty when no agents registered', () => {
      expect(discovery.getAllAgents()).toHaveLength(0)
    })
  })

  describe('setCallbacks', () => {
    it('should allow setting callbacks separately', () => {
      const onDiscovered = vi.fn()
      const onLost = vi.fn()

      discovery.setCallbacks({ onDiscovered })
      discovery.setCallbacks({ onLost })

      // Both should be set
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a1' }))
      discovery.start()
      expect(onDiscovered).toHaveBeenCalled()
    })
  })
})
