import { AgentRegistry } from './agentRegistry'
import { CommunicationBus } from './communicationBus'
import { MessageType, MessagePriority, MessageStatus, MessageEnvelope } from './communicationProtocol'
import { AgentRole, AgentCapability } from './agentTypes'

export interface BridgeRegistration {
  tsAgentId: string
  pyAgentId: string | null
  name: string
  role: string
  capabilities: string[]
  registered: boolean
}

export class WebSocketBridge {
  private wsRef: React.MutableRefObject<WebSocket | null>
  private agentRegistry: AgentRegistry
  private communicationBus: CommunicationBus
  private idMap: Map<string, string> = new Map()       // tsId -> pyId
  private reverseMap: Map<string, string> = new Map()  // pyId -> tsId
  private registrations: Map<string, BridgeRegistration> = new Map()
  private pendingHandlers: Map<string, (msg: any) => void> = new Map()

  constructor(
    wsRef: React.MutableRefObject<WebSocket | null>,
    agentRegistry: AgentRegistry,
    communicationBus: CommunicationBus,
  ) {
    this.wsRef = wsRef
    this.agentRegistry = agentRegistry
    this.communicationBus = communicationBus

    // Listen for undelivered messages on the bus
    this.communicationBus.registerHandler({
      messageType: MessageType.DataShare,
      handler: this.handleOutgoingMessage.bind(this),
    })
    this.communicationBus.registerHandler({
      messageType: MessageType.TaskAssignment,
      handler: this.handleOutgoingMessage.bind(this),
    })
    this.communicationBus.registerHandler({
      messageType: MessageType.HelpRequest,
      handler: this.handleOutgoingMessage.bind(this),
    })
    this.communicationBus.registerHandler({
      messageType: MessageType.StatusReport,
      handler: this.handleOutgoingMessage.bind(this),
    })
  }

  /**
   * Register a TS agent with the Python backend
   */
  registerAgent(agentId: string): void {
    const config = this.agentRegistry.getInstanceConfig(agentId)
    if (!config) return

    const registration: BridgeRegistration = {
      tsAgentId: agentId,
      pyAgentId: null,
      name: config.name,
      role: config.role,
      capabilities: config.capabilities,
      registered: false,
    }
    this.registrations.set(agentId, registration)

    this.send({
      type: 'bridge_register_agent',
      tsAgentId: agentId,
      name: config.name,
      role: config.role,
      capabilities: config.capabilities,
    })
  }

  /**
   * Unregister a TS agent from the Python backend
   */
  unregisterAgent(agentId: string): void {
    const pyId = this.idMap.get(agentId)

    this.send({
      type: 'bridge_unregister_agent',
      tsAgentId: agentId,
    })

    // Clean up mappings
    if (pyId) {
      this.reverseMap.delete(pyId)
    }
    this.idMap.delete(agentId)
    this.registrations.delete(agentId)
  }

  /**
   * Send a message directly to a Python agent
   */
  sendMessage(fromId: string, toPyId: string, payload: any, messageType?: string): void {
    this.send({
      type: 'bridge_message',
      fromAgentId: fromId,
      toAgentId: toPyId,
      messageType: messageType || 'DataShare',
      payload,
    })
  }

  /**
   * Handle registration confirmation from Python
   */
  handleRegistration(tsAgentId: string, pyAgentId: string, success: boolean): void {
    const reg = this.registrations.get(tsAgentId)
    if (!reg) return

    if (success) {
      reg.pyAgentId = pyAgentId
      reg.registered = true
      this.idMap.set(tsAgentId, pyAgentId)
      this.reverseMap.set(pyAgentId, tsAgentId)

      // Update the agent config with Python ID
      const config = this.agentRegistry.getInstanceConfig(tsAgentId)
      if (config) {
        config.pyAgentId = pyAgentId
        config.remote = false // it's a local agent registered remotely
      }
    }
  }

  /**
   * Handle incoming bridge message from Python
   */
  handleBridgeMessage(msg: any): void {
    const { fromAgentId, toAgentId, messageType, payload } = msg

    // Check if the target is a TS agent
    const tsId = this.reverseMap.get(toAgentId) || toAgentId
    const instance = this.agentRegistry.getInstance(tsId)

    if (instance) {
      // Route to CommunicationBus for local delivery
      const envelope: MessageEnvelope = {
        id: crypto.randomUUID(),
        type: (messageType as MessageType) || MessageType.DataShare,
        senderId: fromAgentId,
        receiverId: tsId,
        payload: payload,
        timestamp: Date.now(),
        priority: MessagePriority.Normal,
        status: MessageStatus.Pending,
        broadcast: false,
        sessionId: '',
        correlationId: null,
        replyTo: null,
        expiresAt: null,
        metadata: {},
      }

      // Directly notify any pending handler
      const handler = this.pendingHandlers.get(tsId)
      if (handler) {
        handler(envelope)
      }
    }
  }

  /**
   * Register a handler for messages from Python agents to a specific TS agent
   */
  onBridgeMessage(agentId: string, handler: (msg: MessageEnvelope) => void): void {
    this.pendingHandlers.set(agentId, handler)
  }

  /**
   * Remove handler for a TS agent
   */
  offBridgeMessage(agentId: string): void {
    this.pendingHandlers.delete(agentId)
  }

  /**
   * Get the Python ID for a TS agent
   */
  getPythonId(tsId: string): string | undefined {
    return this.idMap.get(tsId)
  }

  /**
   * Get the TS ID for a Python agent
   */
  getTsId(pyId: string): string | undefined {
    return this.reverseMap.get(pyId)
  }

  /**
   * Check if an agent ID belongs to a Python agent
   */
  isPythonAgent(agentId: string): boolean {
    return agentId.startsWith('agent-') && !this.reverseMap.has(agentId)
  }

  /**
   * Get all registrations
   */
  getRegistrations(): BridgeRegistration[] {
    return Array.from(this.registrations.values())
  }

  /**
   * Get registration for a specific agent
   */
  getRegistration(agentId: string): BridgeRegistration | undefined {
    return this.registrations.get(agentId)
  }

  /**
   * Handle outgoing messages that couldn't be delivered locally
   * This is the bridge point: if the receiver is a Python agent, forward via WebSocket
   */
  private async handleOutgoingMessage(message: MessageEnvelope): Promise<MessageEnvelope | null> {
    const receiverId = message.receiverId
    if (!receiverId) return null

    // Check if the receiver is a known Python agent
    if (this.isPythonAgent(receiverId)) {
      this.sendMessage(
        message.senderId,
        receiverId,
        {
          type: message.type,
          payload: message.payload,
          correlationId: message.correlationId,
        },
        message.type,
      )
      // Return null to indicate the message was handled (forwarded)
      return null
    }

    // Check if receiver is a TS agent registered with Python
    const pyId = this.idMap.get(receiverId)
    if (pyId) {
      this.sendMessage(
        message.senderId,
        pyId,
        {
          type: message.type,
          payload: message.payload,
          correlationId: message.correlationId,
        },
        message.type,
      )
      return null
    }

    // Not a bridge target — let the bus handle it normally
    return message
  }

  private send(data: Record<string, unknown>): void {
    const ws = this.wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }

  destroy(): void {
    this.idMap.clear()
    this.reverseMap.clear()
    this.registrations.clear()
    this.pendingHandlers.clear()
  }
}
