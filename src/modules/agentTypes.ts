export enum AgentRole {
  Planner = 'planner',
  Executor = 'executor',
  Monitor = 'monitor',
  Reviewer = 'reviewer',
  Coordinator = 'coordinator',
}

export enum AgentCapability {
  TaskDecomposition = 'task_decomposition',
  CodeGeneration = 'code_generation',
  CodeReview = 'code_review',
  Testing = 'testing',
  BrowserAutomation = 'browser_automation',
  FileOperation = 'file_operation',
  WebSearch = 'web_search',
  DataAnalysis = 'data_analysis',
  Documentation = 'documentation',
  Monitoring = 'monitoring',
}

export interface AgentModelConfig {
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface AgentConfig {
  id: string
  name: string
  role: AgentRole
  capabilities: AgentCapability[]
  model: AgentModelConfig
  maxConcurrentTasks: number
  timeout: number
  retryPolicy: {
    maxRetries: number
    backoffMs: number
  }
  metadata: Record<string, unknown>
}

export interface AgentInstance {
  id: string
  configId: string
  status: AgentInstanceStatus
  currentTaskId: string | null
  startedAt: number
  lastActiveAt: number
  completedTaskCount: number
  failedTaskCount: number
}

export enum AgentInstanceStatus {
  Idle = 'idle',
  Busy = 'busy',
  Waiting = 'waiting',
  Error = 'error',
  Offline = 'offline',
}

export interface AgentRegistry {
  configs: Map<string, AgentConfig>
  instances: Map<string, AgentInstance>
}

export function createAgentConfig(
  name: string,
  role: AgentRole,
  capabilities: AgentCapability[],
  model: AgentModelConfig,
  options?: Partial<Omit<AgentConfig, 'id' | 'name' | 'role' | 'capabilities' | 'model'>>,
): AgentConfig {
  return {
    id: crypto.randomUUID(),
    name,
    role,
    capabilities,
    model,
    maxConcurrentTasks: options?.maxConcurrentTasks ?? 1,
    timeout: options?.timeout ?? 300_000,
    retryPolicy: options?.retryPolicy ?? { maxRetries: 3, backoffMs: 1000 },
    metadata: options?.metadata ?? {},
  }
}

export function createAgentInstance(configId: string): AgentInstance {
  return {
    id: crypto.randomUUID(),
    configId,
    status: AgentInstanceStatus.Idle,
    currentTaskId: null,
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
    completedTaskCount: 0,
    failedTaskCount: 0,
  }
}

export const DEFAULT_AGENT_CONFIGS: Record<AgentRole, Partial<AgentConfig>> = {
  [AgentRole.Planner]: {
    capabilities: [AgentCapability.TaskDecomposition, AgentCapability.DataAnalysis],
    maxConcurrentTasks: 1,
    timeout: 600_000,
  },
  [AgentRole.Executor]: {
    capabilities: [
      AgentCapability.BrowserAutomation,
      AgentCapability.FileOperation,
      AgentCapability.CodeGeneration,
    ],
    maxConcurrentTasks: 3,
    timeout: 300_000,
  },
  [AgentRole.Monitor]: {
    capabilities: [AgentCapability.Monitoring, AgentCapability.DataAnalysis],
    maxConcurrentTasks: 5,
    timeout: 0,
  },
  [AgentRole.Reviewer]: {
    capabilities: [AgentCapability.CodeReview, AgentCapability.Testing],
    maxConcurrentTasks: 2,
    timeout: 300_000,
  },
  [AgentRole.Coordinator]: {
    capabilities: [AgentCapability.TaskDecomposition, AgentCapability.Monitoring],
    maxConcurrentTasks: 1,
    timeout: 0,
  },
}
