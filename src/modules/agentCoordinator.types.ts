/**
 * AgentCoordinator types and interfaces.
 * Extracted from agentCoordinator.ts for reduced file size.
 */

import { AgentInstance, AgentConfig, AgentCapability } from './agentTypes'
import { AgentRegistry } from './agentRegistry'
import { CommunicationBus } from './communicationBus'
import { TaskAssigner } from './taskAssigner'

export interface CoordinatorConfig {
  heartbeatInterval: number
  statusSyncInterval: number
  taskTimeout: number
  maxRetries: number
  enableAutoRecovery: boolean
  enableLoadBalancing: boolean
}

export interface CoordinatorDeps {
  registry?: AgentRegistry
  communicationBus?: CommunicationBus
  taskAssigner?: TaskAssigner
}

export interface CoordinatorState {
  isRunning: boolean
  activeAgents: number
  pendingTasks: number
  completedTasks: number
  failedTasks: number
  uptime: number
}

export interface AgentCandidate {
  instance: AgentInstance
  config: AgentConfig
  score: number
  matchingCapabilities: AgentCapability[]
  currentLoad: number
  successRate: number
}
