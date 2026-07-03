import { useState, useCallback, useRef, useEffect } from 'react'
import { AgentRegistry } from '../modules/agentRegistry'
import { AgentCoordinator } from '../modules/agentCoordinator'
import { CommunicationBus } from '../modules/communicationBus'
import { TaskAssigner } from '../modules/taskAssigner'
import { WebSocketBridge } from '../modules/webSocketBridge'
import {
  AgentRole,
  AgentCapability,
  AgentConfig,
  AgentInstance,
} from '../modules/agentTypes'

export interface AgentSystemState {
  agents: AgentInstance[]
  configs: AgentConfig[]
  bridgeRegistrations: Map<string, string> // tsId -> pyId
}

export function useAgentSystem({
  wsRef,
  autoRegister = true,
}: {
  wsRef: React.MutableRefObject<WebSocket | null>
  autoRegister?: boolean // 自动注册到 Python 端
}) {
  const [agents, setAgents] = useState<AgentInstance[]>([])
  const [bridgeMap, setBridgeMap] = useState<Map<string, string>>(new Map())

  // 初始化核心组件（只创建一次）
  const registryRef = useRef<AgentRegistry | null>(null)
  const busRef = useRef<CommunicationBus | null>(null)
  const coordinatorRef = useRef<AgentCoordinator | null>(null)
  const bridgeRef = useRef<WebSocketBridge | null>(null)

  if (!registryRef.current) {
    registryRef.current = new AgentRegistry()
    busRef.current = new CommunicationBus()
    coordinatorRef.current = new AgentCoordinator(
      {},
      {
        registry: registryRef.current,
        communicationBus: busRef.current,
        taskAssigner: new TaskAssigner(registryRef.current, busRef.current),
      },
    )
    bridgeRef.current = new WebSocketBridge(
      wsRef,
      registryRef.current,
      busRef.current,
    )
  }

  const registry = registryRef.current!
  const coordinator = coordinatorRef.current!
  const bridge = bridgeRef.current!

  // 同步 agent 列表
  const refreshAgents = useCallback(() => {
    setAgents([...coordinator.getAllAgents()])
    setBridgeMap(new Map(bridge.getRegistrations().map(r => [r.tsAgentId, r.pyAgentId || ''])))
  }, [coordinator, bridge])

  /**
   * 创建并注册一个新的 TS 智能体
   */
  const createAgent = useCallback(
    async (params: {
      name: string
      role: AgentRole
      capabilities: AgentCapability[]
      model?: AgentConfig['model']
    }): Promise<AgentInstance | null> => {
      const config: AgentConfig = {
        id: crypto.randomUUID(),
        name: params.name,
        role: params.role,
        capabilities: params.capabilities,
        model: params.model || { provider: 'deepseek', model: 'deepseek-chat' },
        maxConcurrentTasks: 3,
        timeout: 30000,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        metadata: {},
      }

      registry.registerConfig(config)
      const instance = coordinator.spawnAgent(config.id)

      if (instance && autoRegister) {
        bridge.registerAgent(instance.id)
      }

      refreshAgents()
      return instance
    },
    [registry, coordinator, bridge, autoRegister, refreshAgents],
  )

  /**
   * 删除智能体
   */
  const removeAgent = useCallback(
    (agentId: string) => {
      bridge.unregisterAgent(agentId)
      coordinator.removeAgent(agentId)
      refreshAgents()
    },
    [bridge, coordinator, refreshAgents],
  )

  /**
   * 发送消息给另一个智能体（TS 或 Python）
   */
  const sendAgentMessage = useCallback(
    (fromId: string, toId: string, content: string) => {
      bridge.sendMessage(fromId, toId, { content })
    },
    [bridge],
  )

  /**
   * 监听某个智能体收到的消息
   */
  const onAgentMessage = useCallback(
    (agentId: string, callback: (msg: any) => void) => {
      return bridge.onBridgeMessage(agentId, callback)
    },
    [bridge],
  )

  /**
   * 获取智能体的 Python 端 ID
   */
  const getPythonId = useCallback(
    (tsId: string) => bridge.getPythonId(tsId),
    [bridge],
  )

  /**
   * 注册已有智能体到 Python 端
   */
  const registerToPython = useCallback(
    (agentId: string) => {
      bridge.registerAgent(agentId)
      refreshAgents()
    },
    [bridge, refreshAgents],
  )

  /**
   * 获取桥接状态
   */
  const getBridgeStatus = useCallback(() => {
    return {
      registrations: bridge.getRegistrations(),
      idMap: new Map(bridge.getRegistrations().map(r => [r.tsAgentId, r.pyAgentId || ''])),
    }
  }, [bridge])

  // 清理
  useEffect(() => {
    return () => {
      bridge.destroy()
      busRef.current?.destroy()
    }
  }, [bridge])

  return {
    // 状态
    agents,
    bridgeMap,
    registry,
    coordinator,
    bridge,

    // 操作
    createAgent,
    removeAgent,
    sendAgentMessage,
    onAgentMessage,
    getPythonId,
    registerToPython,
    refreshAgents,
    getBridgeStatus,
  }
}
