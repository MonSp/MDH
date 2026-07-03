import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketBridge } from '../webSocketBridge'
import { AgentRegistry } from '../agentRegistry'
import { CommunicationBus } from '../communicationBus'
import { AgentRole, AgentCapability, AgentInstanceStatus } from '../agentTypes'
import { MessageType, MessagePriority } from '../communicationProtocol'

function makeWsRef() {
  return { current: { readyState: 1, send: vi.fn() } as any }
}

function makeRegistry() {
  const registry = new AgentRegistry()
  registry.registerConfig({
    id: 'config-1', name: 'Coder', role: AgentRole.Executor,
    capabilities: [AgentCapability.CodeGeneration],
    model: { provider: 'openai', model: 'gpt-4' },
    maxConcurrentTasks: 3, timeout: 30000,
    retryPolicy: { maxRetries: 3, backoffMs: 1000 }, metadata: {},
  })
  const instance = registry.spawnInstance('config-1')!
  return { registry, instance }
}

describe('WebSocketBridge', () => {
  let bridge: WebSocketBridge
  let wsRef: ReturnType<typeof makeWsRef>
  let registry: AgentRegistry
  let bus: CommunicationBus
  let instanceId: string

  beforeEach(() => {
    wsRef = makeWsRef()
    const r = makeRegistry()
    registry = r.registry
    instanceId = r.instance.id
    bus = new CommunicationBus()
    bridge = new WebSocketBridge(wsRef, registry, bus)
  })

  afterEach(() => {
    bridge.destroy()
    bus.destroy()
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should register message handlers on CommunicationBus', () => {
      // Bridge registers 4 handlers (DataShare, TaskAssignment, HelpRequest, StatusReport)
      const busHandlers = (bus as any).handlers
      expect(busHandlers.has(MessageType.DataShare)).toBe(true)
      expect(busHandlers.has(MessageType.TaskAssignment)).toBe(true)
      expect(busHandlers.has(MessageType.HelpRequest)).toBe(true)
      expect(busHandlers.has(MessageType.StatusReport)).toBe(true)
    })
  })

  describe('registerAgent', () => {
    it('should send bridge_register_agent via WebSocket', () => {
      bridge.registerAgent(instanceId)

      expect(wsRef.current.send).toHaveBeenCalled()
      const sent = JSON.parse(wsRef.current.send.mock.calls[0][0])
      expect(sent.type).toBe('bridge_register_agent')
      expect(sent.tsAgentId).toBe(instanceId)
      expect(sent.name).toBe('Coder')
      expect(sent.role).toBe('executor')
      expect(sent.capabilities).toContain('code_generation')
    })

    it('should track registration', () => {
      bridge.registerAgent(instanceId)
      const reg = bridge.getRegistration(instanceId)
      expect(reg).toBeDefined()
      expect(reg!.registered).toBe(false)
    })

    it('should not send for unknown agent', () => {
      bridge.registerAgent('unknown')
      expect(wsRef.current.send).not.toHaveBeenCalled()
    })
  })

  describe('handleRegistration', () => {
    it('should map TS ID to Python ID on success', () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', true)

      expect(bridge.getPythonId(instanceId)).toBe('ts-abc12345')
      expect(bridge.getTsId('ts-abc12345')).toBe(instanceId)
      expect(bridge.getRegistration(instanceId)!.registered).toBe(true)
    })

    it('should update agent config with pyAgentId', () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', true)

      const config = registry.getInstanceConfig(instanceId)
      expect(config!.pyAgentId).toBe('ts-abc12345')
    })

    it('should not map on failure', () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', false)

      expect(bridge.getPythonId(instanceId)).toBeUndefined()
      expect(bridge.getRegistration(instanceId)!.registered).toBe(false)
    })
  })

  describe('unregisterAgent', () => {
    it('should send bridge_unregister_agent and clean up', () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', true)
      bridge.unregisterAgent(instanceId)

      const sent = JSON.parse(wsRef.current.send.mock.calls[1][0])
      expect(sent.type).toBe('bridge_unregister_agent')
      expect(sent.tsAgentId).toBe(instanceId)

      expect(bridge.getPythonId(instanceId)).toBeUndefined()
      expect(bridge.getRegistration(instanceId)).toBeUndefined()
    })
  })

  describe('sendMessage', () => {
    it('should send bridge_message via WebSocket', () => {
      bridge.sendMessage(instanceId, 'agent-executor', { content: 'Hello' }, 'DataShare')

      const sent = JSON.parse(wsRef.current.send.mock.calls[0][0])
      expect(sent.type).toBe('bridge_message')
      expect(sent.fromAgentId).toBe(instanceId)
      expect(sent.toAgentId).toBe('agent-executor')
      expect(sent.payload.content).toBe('Hello')
      expect(sent.messageType).toBe('DataShare')
    })
  })

  describe('handleBridgeMessage', () => {
    it('should notify registered handler', () => {
      const handler = vi.fn()
      bridge.onBridgeMessage(instanceId, handler)

      bridge.handleBridgeMessage({
        fromAgentId: 'agent-executor',
        toAgentId: instanceId,
        payload: { content: 'Response from Python' },
      })

      expect(handler).toHaveBeenCalled()
      const received = handler.mock.calls[0][0]
      expect(received.senderId).toBe('agent-executor')
      expect(received.receiverId).toBe(instanceId)
      expect(received.payload.content).toBe('Response from Python')
    })

    it('should handle message for registered TS agent via reverseMap', () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', true)

      const handler = vi.fn()
      bridge.onBridgeMessage(instanceId, handler)

      bridge.handleBridgeMessage({
        fromAgentId: 'agent-ceo',
        toAgentId: 'ts-abc12345', // Python ID
        payload: { content: 'Hello' },
      })

      expect(handler).toHaveBeenCalled()
    })

    it('should not crash for unknown target', () => {
      expect(() => {
        bridge.handleBridgeMessage({
          fromAgentId: 'agent-ceo',
          toAgentId: 'unknown-agent',
          payload: {},
        })
      }).not.toThrow()
    })
  })

  describe('onBridgeMessage / offBridgeMessage', () => {
    it('should register and unregister handlers', () => {
      const handler = vi.fn()
      bridge.onBridgeMessage('a1', handler)
      bridge.offBridgeMessage('a1')

      bridge.handleBridgeMessage({
        fromAgentId: 'agent-ceo',
        toAgentId: 'a1',
        payload: {},
      })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('isPythonAgent', () => {
    it('should identify Python agents by prefix', () => {
      expect(bridge.isPythonAgent('agent-executor')).toBe(true)
      expect(bridge.isPythonAgent('agent-ceo')).toBe(true)
    })

    it('should not identify TS agents as Python', () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', true)
      // TS-registered agents are in reverseMap, so not pure Python agents
      expect(bridge.isPythonAgent('ts-abc12345')).toBe(false)
    })

    it('should not identify random UUIDs as Python', () => {
      expect(bridge.isPythonAgent('a1b2c3d4-e5f6')).toBe(false)
    })
  })

  describe('getRegistrations', () => {
    it('should return all registrations', () => {
      bridge.registerAgent(instanceId)
      const regs = bridge.getRegistrations()
      expect(regs).toHaveLength(1)
      expect(regs[0].tsAgentId).toBe(instanceId)
    })
  })

  describe('destroy', () => {
    it('should clear all state', () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', true)

      bridge.destroy()

      expect(bridge.getPythonId(instanceId)).toBeUndefined()
      expect(bridge.getRegistrations()).toHaveLength(0)
    })
  })

  describe('outgoing message forwarding', () => {
    it('should forward DataShare messages to Python agents', async () => {
      bridge.registerAgent(instanceId)
      bridge.handleRegistration(instanceId, 'ts-abc12345', true)

      // Send a message via CommunicationBus to a Python agent
      await bus.sendMessage(
        MessageType.DataShare,
        instanceId,
        'agent-executor', // Python agent ID
        { key: 'test', data: 'hello', format: 'json' },
      )

      // The bridge should have forwarded it via WebSocket
      const sent = JSON.parse(wsRef.current.send.mock.calls.find(
        (c: any) => c[0].includes('bridge_message'),
      )![0])
      expect(sent.type).toBe('bridge_message')
      expect(sent.toAgentId).toBe('agent-executor')
    })

    it('should not forward messages to local TS agents', async () => {
      // Create a second instance
      const instance2 = registry.spawnInstance('config-1')!

      // Send message to local agent — bridge should NOT forward via WebSocket
      wsRef.current.send.mockClear()
      await bus.sendMessage(
        MessageType.DataShare,
        instanceId,
        instance2.id,
        { key: 'test', data: 'hello', format: 'json' },
      )

      // WebSocket should NOT have been called with a bridge_message
      const bridgeCalls = wsRef.current.send.mock.calls.filter(
        (c: any) => c[0].includes('bridge_message'),
      )
      expect(bridgeCalls).toHaveLength(0)
    })
  })
})
