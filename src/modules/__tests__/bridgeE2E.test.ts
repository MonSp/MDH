/**
 * 端到端测试：TS-Python 智能体桥接完整消息流
 *
 * 模拟场景：
 * 1. TS 端创建智能体并注册到 Python 端
 * 2. TS 智能体发送消息给 Python agent-executor
 * 3. Python 端处理消息并返回响应
 * 4. TS 智能体收到 Python 的回复
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketBridge } from '../webSocketBridge'
import { AgentRegistry } from '../agentRegistry'
import { CommunicationBus } from '../communicationBus'
import { AgentRole, AgentCapability } from '../agentTypes'
import { MessageType } from '../communicationProtocol'

// ============================================================
// Mock WebSocket — 模拟真实 WebSocket
// ============================================================
class MockWebSocket {
  static OPEN = 1
  readyState = MockWebSocket.OPEN
  send = vi.fn()
  private listeners: Record<string, Function[]> = {}

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }
  removeEventListener(event: string, handler: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler)
    }
  }
  emit(event: string, data?: any) {
    for (const h of this.listeners[event] || []) h(data)
  }
}

// ============================================================
// Mock Python AgentBridge — 模拟 Python 端处理
// ============================================================
class MockPythonAgentBridge {
  private idMap = new Map<string, string>()
  private ws: MockWebSocket

  constructor(ws: MockWebSocket) {
    this.ws = ws
  }

  /** 模拟 Python 端处理 register */
  handleRegister(msg: any) {
    const pyAgentId = `ts-${msg.tsAgentId.substring(0, 8)}`
    this.idMap.set(msg.tsAgentId, pyAgentId)

    // 同步发送注册确认
    this.ws.emit('message', {
      data: JSON.stringify({
        type: 'bridge_agent_registered',
        tsAgentId: msg.tsAgentId,
        pyAgentId,
        success: true,
      }),
    })
  }

  /** 模拟 Python 端处理 bridge_message — 模拟 LLM reply */
  handleMessage(msg: any) {
    const { fromAgentId, toAgentId, payload } = msg
    const responseContent = `[${toAgentId}] 已处理: ${payload?.content || ''}`

    this.ws.emit('message', {
      data: JSON.stringify({
        type: 'bridge_message',
        fromAgentId: toAgentId,
        toAgentId: fromAgentId,
        payload: { content: responseContent, messageType: 'TaskResult' },
      }),
    })
  }

  /** 模拟 Python 端处理 unregister */
  handleUnregister(msg: any) {
    this.idMap.delete(msg.tsAgentId)
  }

  getRegistered() { return Array.from(this.idMap.entries()) }
}

// ============================================================
// E2E 测试
// ============================================================
describe('Bridge E2E: TS-Python 消息流', () => {
  let ws: MockWebSocket
  let wsRef: { current: MockWebSocket | null }
  let registry: AgentRegistry
  let bus: CommunicationBus
  let bridge: WebSocketBridge
  let pythonBridge: MockPythonAgentBridge
  let instanceId: string

  beforeEach(() => {
    ws = new MockWebSocket()
    wsRef = { current: ws }

    registry = new AgentRegistry()
    registry.registerConfig({
      id: 'config-coder', name: 'TS-Coder', role: AgentRole.Executor,
      capabilities: [AgentCapability.CodeGeneration, AgentCapability.Testing],
      model: { provider: 'openai', model: 'gpt-4' },
      maxConcurrentTasks: 3, timeout: 30000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000 }, metadata: {},
    })
    instanceId = registry.spawnInstance('config-coder')!.id

    bus = new CommunicationBus()
    bridge = new WebSocketBridge(wsRef as any, registry, bus)

    // Python 端模拟：拦截 WebSocket.send() 并同步模拟响应
    pythonBridge = new MockPythonAgentBridge(ws)
    ws.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data)
      if (msg.type === 'bridge_register_agent') {
        pythonBridge.handleRegister(msg)
      } else if (msg.type === 'bridge_unregister_agent') {
        pythonBridge.handleUnregister(msg)
      } else if (msg.type === 'bridge_message') {
        pythonBridge.handleMessage(msg)
      }
    })

    // 模拟 useMeetingSocket 的消息路由：WebSocket 收到消息后路由到 bridge
    ws.addEventListener('message', (event: any) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'bridge_agent_registered') {
        bridge.handleRegistration(msg.tsAgentId, msg.pyAgentId, msg.success)
      } else if (msg.type === 'bridge_message') {
        bridge.handleBridgeMessage(msg)
      }
    })
  })

  afterEach(() => {
    bridge.destroy()
    bus.destroy()
    vi.restoreAllMocks()
  })

  it('完整流程：注册 → 发消息 → 收回复 → 注销', () => {
    // ===== Step 1: 注册 =====
    bridge.registerAgent(instanceId)

    const pyId = bridge.getPythonId(instanceId)
    expect(pyId).toBeDefined()
    expect(pyId).toMatch(/^ts-/)
    expect(bridge.getRegistration(instanceId)?.registered).toBe(true)
    expect(pythonBridge.getRegistered()).toHaveLength(1)

    // ===== Step 2: 发消息 =====
    const responses: any[] = []
    bridge.onBridgeMessage(instanceId, (msg) => responses.push(msg))

    bridge.sendMessage(instanceId, 'agent-executor', {
      content: '请帮我写一个快速排序算法',
    })

    // ===== Step 3: 验证收到回复 =====
    expect(responses).toHaveLength(1)
    expect(responses[0].senderId).toBe('agent-executor')
    expect(responses[0].receiverId).toBe(instanceId)
    expect(responses[0].payload.content).toContain('快速排序算法')
    expect(responses[0].payload.messageType).toBe('TaskResult')

    // ===== Step 4: 注销 =====
    bridge.unregisterAgent(instanceId)
    expect(bridge.getPythonId(instanceId)).toBeUndefined()
    expect(bridge.getRegistration(instanceId)).toBeUndefined()
    expect(pythonBridge.getRegistered()).toHaveLength(0)
  })

  it('双向消息流：TS ↔ Python 多轮对话', () => {
    bridge.registerAgent(instanceId)

    const responses: any[] = []
    bridge.onBridgeMessage(instanceId, (msg) => responses.push(msg))

    // 三轮对话
    bridge.sendMessage(instanceId, 'agent-executor', { content: '分析需求' })
    bridge.sendMessage(instanceId, 'agent-planner', { content: '制定计划' })
    bridge.sendMessage(instanceId, 'agent-reviewer', { content: '审查代码' })

    expect(responses).toHaveLength(3)
    expect(responses[0].payload.content).toContain('分析需求')
    expect(responses[1].payload.content).toContain('制定计划')
    expect(responses[2].payload.content).toContain('审查代码')

    expect(responses[0].senderId).toBe('agent-executor')
    expect(responses[1].senderId).toBe('agent-planner')
    expect(responses[2].senderId).toBe('agent-reviewer')
  })

  it('多个 TS 智能体同时与 Python 通信', () => {
    registry.registerConfig({
      id: 'config-reviewer', name: 'TS-Reviewer', role: AgentRole.Reviewer,
      capabilities: [AgentCapability.CodeReview],
      model: { provider: 'openai', model: 'gpt-4' },
      maxConcurrentTasks: 3, timeout: 30000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000 }, metadata: {},
    })
    const instance2Id = registry.spawnInstance('config-reviewer')!.id

    bridge.registerAgent(instanceId)
    bridge.registerAgent(instance2Id)

    expect(bridge.getPythonId(instanceId)).toBeDefined()
    expect(bridge.getPythonId(instance2Id)).toBeDefined()

    const resp1: any[] = []
    const resp2: any[] = []
    bridge.onBridgeMessage(instanceId, (msg) => resp1.push(msg))
    bridge.onBridgeMessage(instance2Id, (msg) => resp2.push(msg))

    bridge.sendMessage(instanceId, 'agent-executor', { content: '写代码' })
    bridge.sendMessage(instance2Id, 'agent-executor', { content: '审查代码' })

    expect(resp1).toHaveLength(1)
    expect(resp2).toHaveLength(1)
    expect(resp1[0].payload.content).toContain('写代码')
    expect(resp2[0].payload.content).toContain('审查代码')
  })

  it('通过 CommunicationBus 发送 bridge 消息', () => {
    bridge.registerAgent(instanceId)

    const responses: any[] = []
    bridge.onBridgeMessage(instanceId, (msg) => responses.push(msg))

    // 通过 CommunicationBus 发消息（模拟 AgentCoordinator 行为）
    bus.sendMessage(
      MessageType.DataShare,
      instanceId,
      'agent-executor',
      { key: 'task', data: '实现登录功能', format: 'json' },
    )

    expect(responses).toHaveLength(1)
    expect(responses[0].senderId).toBe('agent-executor')
  })

  it('Python 智能体主动发消息给 TS 智能体', () => {
    bridge.registerAgent(instanceId)
    const pyId = bridge.getPythonId(instanceId)!

    const responses: any[] = []
    bridge.onBridgeMessage(instanceId, (msg) => responses.push(msg))

    // Python 端主动推送消息
    ws.emit('message', {
      data: JSON.stringify({
        type: 'bridge_message',
        fromAgentId: 'agent-ceo',
        toAgentId: pyId,
        payload: { content: '紧急任务', messageType: 'ControlCommand' },
      }),
    })

    expect(responses).toHaveLength(1)
    expect(responses[0].senderId).toBe('agent-ceo')
    expect(responses[0].payload.content).toContain('紧急任务')
  })

  it('错误处理：WebSocket 未连接时不崩溃', () => {
    wsRef.current = null
    expect(() => bridge.registerAgent(instanceId)).not.toThrow()
    expect(() => bridge.sendMessage(instanceId, 'agent-executor', { content: 'test' })).not.toThrow()
  })

  it('错误处理：Python 端注册失败', () => {
    ws.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data)
      if (msg.type === 'bridge_register_agent') {
        ws.emit('message', {
          data: JSON.stringify({
            type: 'bridge_agent_registered',
            tsAgentId: msg.tsAgentId,
            pyAgentId: null,
            success: false,
          }),
        })
      }
    })

    bridge.registerAgent(instanceId)
    expect(bridge.getPythonId(instanceId)).toBeUndefined()
    expect(bridge.getRegistration(instanceId)?.registered).toBe(false)
  })

  it('完整数据流验证：消息包含正确的元数据', () => {
    bridge.registerAgent(instanceId)

    const sentMessages: any[] = []
    ws.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data)
      sentMessages.push(msg)
      // 仍然模拟 Python 响应
      if (msg.type === 'bridge_message') {
        pythonBridge.handleMessage(msg)
      }
    })

    const responses: any[] = []
    bridge.onBridgeMessage(instanceId, (msg) => responses.push(msg))

    bridge.sendMessage(instanceId, 'agent-executor', {
      content: '测试消息',
      metadata: { priority: 'high' },
    })

    // 验证发出的消息格式
    const bridgeMsg = sentMessages.find(m => m.type === 'bridge_message')
    expect(bridgeMsg).toBeDefined()
    expect(bridgeMsg.fromAgentId).toBe(instanceId)
    expect(bridgeMsg.toAgentId).toBe('agent-executor')
    expect(bridgeMsg.payload.content).toBe('测试消息')
    expect(bridgeMsg.messageType).toBe('DataShare')

    // 验证回复格式
    expect(responses).toHaveLength(1)
    expect(responses[0].type).toBe(MessageType.DataShare) // 消息类型映射
    expect(responses[0].priority).toBe('normal')
  })
})
