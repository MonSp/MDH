import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CrossNetworkBridgeLocal,
  type AgentEndpointLocal,
  type NetworkMessageLocal,
} from '../crossNetworkBridgeLocal'

function makeEndpoint(overrides: Partial<AgentEndpointLocal> = {}): AgentEndpointLocal {
  return {
    agentId: 'agent-1',
    name: 'Test Agent',
    role: 'executor',
    location: 'local',
    networkId: 'net-1',
    capabilities: ['read_file', 'write_file'],
    status: 'online',
    lastHeartbeat: Date.now(),
    ...overrides,
  }
}

function makeMessage(overrides: Partial<NetworkMessageLocal> = {}): NetworkMessageLocal {
  return {
    messageId: 'msg-1',
    fromAgentId: 'agent-1',
    toAgentId: 'agent-2',
    messageType: 'task_request',
    payload: { task: 'build module' },
    timestamp: Date.now(),
    ttl: 60,
    ...overrides,
  }
}

describe('CrossNetworkBridgeLocal', () => {
  let bridge: CrossNetworkBridgeLocal

  beforeEach(() => {
    bridge = new CrossNetworkBridgeLocal()
  })

  describe('registerEndpoint / getEndpoint', () => {
    it('should register and retrieve an endpoint', () => {
      const ep = makeEndpoint()
      bridge.registerEndpoint(ep)

      const got = bridge.getEndpoint('agent-1')
      expect(got).not.toBeNull()
      expect(got!.agentId).toBe('agent-1')
      expect(got!.name).toBe('Test Agent')
    })

    it('should return null for unknown agent', () => {
      expect(bridge.getEndpoint('unknown')).toBeNull()
    })

    it('should return a copy, not a reference', () => {
      const ep = makeEndpoint()
      bridge.registerEndpoint(ep)

      const got1 = bridge.getEndpoint('agent-1')!
      got1.name = 'mutated'
      const got2 = bridge.getEndpoint('agent-1')!
      expect(got2.name).toBe('Test Agent')
    })
  })

  describe('unregisterEndpoint', () => {
    it('should remove an endpoint', () => {
      bridge.registerEndpoint(makeEndpoint())
      expect(bridge.unregisterEndpoint('agent-1')).toBe(true)
      expect(bridge.getEndpoint('agent-1')).toBeNull()
    })

    it('should return false for unknown agent', () => {
      expect(bridge.unregisterEndpoint('unknown')).toBe(false)
    })
  })

  describe('getAvailableAgents', () => {
    beforeEach(() => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a1', location: 'local', role: 'executor' }))
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a2', location: 'remote', role: 'executor' }))
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a3', location: 'local', role: 'reviewer' }))
    })

    it('should return all available agents without filters', () => {
      expect(bridge.getAvailableAgents()).toHaveLength(3)
    })

    it('should filter by location', () => {
      const locals = bridge.getAvailableAgents('local')
      expect(locals).toHaveLength(2)
      expect(locals.every(a => a.location === 'local')).toBe(true)
    })

    it('should filter by role', () => {
      const executors = bridge.getAvailableAgents(undefined, 'executor')
      expect(executors).toHaveLength(2)
    })

    it('should filter by both location and role', () => {
      const result = bridge.getAvailableAgents('remote', 'executor')
      expect(result).toHaveLength(1)
      expect(result[0].agentId).toBe('a2')
    })

    it('should exclude offline agents', () => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'off1', status: 'offline' }))
      expect(bridge.getAvailableAgents()).toHaveLength(3) // offline excluded
    })

    it('should exclude agents with stale heartbeat', () => {
      bridge.registerEndpoint(
        makeEndpoint({
          agentId: 'stale',
          lastHeartbeat: Date.now() - 120_000, // 2 min ago
        })
      )
      expect(bridge.getAvailableAgents()).toHaveLength(3) // stale excluded
    })
  })

  describe('sendMessage', () => {
    it('should deliver to a registered target', () => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a1' }))
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a2' }))

      const msg = makeMessage({ fromAgentId: 'a1', toAgentId: 'a2' })
      expect(bridge.sendMessage(msg)).toBe(true)
      expect(bridge.getMessageLog()).toHaveLength(1)
    })

    it('should return false for unregistered target', () => {
      const msg = makeMessage({ toAgentId: 'nonexistent' })
      expect(bridge.sendMessage(msg)).toBe(false)
    })

    it('should return false for expired TTL', () => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a2' }))
      const msg = makeMessage({
        toAgentId: 'a2',
        timestamp: Date.now() - 120_000, // 2 min ago
        ttl: 30, // 30 sec TTL
      })
      expect(bridge.sendMessage(msg)).toBe(false)
    })

    it('should dispatch to message handlers', () => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a2' }))
      const handler = vi.fn()
      bridge.registerMessageHandler('task_request', handler)

      const msg = makeMessage({ toAgentId: 'a2', messageType: 'task_request' })
      bridge.sendMessage(msg)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ messageType: 'task_request' }))
    })

    it('should dispatch to wildcard handlers', () => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'a2' }))
      const handler = vi.fn()
      bridge.registerMessageHandler('*', handler)

      bridge.sendMessage(makeMessage({ toAgentId: 'a2' }))
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('registerMessageHandler / handleIncomingMessage', () => {
    it('should handle incoming messages asynchronously', async () => {
      const handler = vi.fn()
      bridge.registerMessageHandler('status_update', handler)

      const msg = makeMessage({ messageType: 'status_update' })
      await bridge.handleIncomingMessage(msg)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(bridge.getMessageLog()).toHaveLength(1)
    })

    it('should support multiple handlers for same type', async () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bridge.registerMessageHandler('test', h1)
      bridge.registerMessageHandler('test', h2)

      await bridge.handleIncomingMessage(makeMessage({ messageType: 'test' }))
      expect(h1).toHaveBeenCalledTimes(1)
      expect(h2).toHaveBeenCalledTimes(1)
    })
  })

  describe('updateHeartbeat', () => {
    it('should update lastHeartbeat for known agent', () => {
      const ep = makeEndpoint({ agentId: 'a1', lastHeartbeat: 0 })
      bridge.registerEndpoint(ep)

      const before = Date.now()
      expect(bridge.updateHeartbeat('a1')).toBe(true)
      const after = bridge.getEndpoint('a1')!

      expect(after.lastHeartbeat).toBeGreaterThanOrEqual(before)
    })

    it('should return false for unknown agent', () => {
      expect(bridge.updateHeartbeat('unknown')).toBe(false)
    })
  })

  describe('checkHealth', () => {
    it('should identify healthy and unhealthy agents', () => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'h1', lastHeartbeat: Date.now() }))
      bridge.registerEndpoint(makeEndpoint({ agentId: 'u1', lastHeartbeat: Date.now() - 120_000 }))
      bridge.registerEndpoint(makeEndpoint({ agentId: 'off1', status: 'offline' }))

      const health = bridge.checkHealth()
      expect(health.healthy).toContain('h1')
      expect(health.unhealthy).toContain('u1')
      expect(health.unhealthy).toContain('off1')
    })

    it('should mark stale agents as unhealthy', () => {
      bridge.registerEndpoint(makeEndpoint({ agentId: 'stale', lastHeartbeat: Date.now() - 120_000 }))
      bridge.checkHealth()

      const ep = bridge.getEndpoint('stale')!
      expect(ep.status).toBe('unhealthy')
    })

    it('should return empty arrays when no endpoints', () => {
      const health = bridge.checkHealth()
      expect(health.healthy).toHaveLength(0)
      expect(health.unhealthy).toHaveLength(0)
    })
  })

  describe('clear', () => {
    it('should reset all state', () => {
      bridge.registerEndpoint(makeEndpoint())
      bridge.registerMessageHandler('test', vi.fn())
      bridge.sendMessage(makeMessage({ toAgentId: 'agent-1' }))

      bridge.clear()

      expect(bridge.getEndpoint('agent-1')).toBeNull()
      expect(bridge.getMessageLog()).toHaveLength(0)
    })
  })
})
