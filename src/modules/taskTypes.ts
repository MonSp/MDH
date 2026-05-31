import type { AgentRole, AgentCapability } from './agentTypes'

export enum TaskStatus {
  Pending = 'pending',
  Planning = 'planning',
  Assigned = 'assigned',
  Running = 'running',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum TaskPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export enum TaskType {
  Atomic = 'atomic',
  Composite = 'composite',
}

export interface TaskConstraint {
  type: 'dependency' | 'resource' | 'time' | 'capability'
  target: string
  condition?: string
}

export interface TaskResult {
  output: unknown
  artifacts: TaskArtifact[]
  summary: string
  metrics?: Record<string, number>
}

export interface TaskArtifact {
  id: string
  type: 'file' | 'url' | 'data' | 'log'
  name: string
  content?: string
  url?: string
  mimeType?: string
  createdAt: number
}

export interface CompensateAction {
  description: string
  actionType: string
  params: Record<string, unknown>
}

export interface SubTask {
  id: string
  title: string
  description: string
  type: TaskType
  status: TaskStatus
  priority: TaskPriority
  requiredCapabilities: AgentCapability[]
  preferredRole: AgentRole | null
  assignedAgentId: string | null
  parentTaskId: string | null
  dependencies: string[]
  constraints: TaskConstraint[]
  input: Record<string, unknown>
  result: TaskResult | null
  retryCount: number
  maxRetries: number
  timeout: number
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  estimatedDuration: number | null
  metadata: Record<string, unknown>
  compensateAction: CompensateAction | null
  rollbackCondition: string | null
  failureImpact: 'none' | 'local' | 'cascading' | 'critical'
}

export interface TaskDependency {
  fromTaskId: string
  toTaskId: string
  type: 'blocks' | 'requires_output' | 'soft'
}

export interface TaskPlan {
  id: string
  title: string
  description: string
  rootTaskId: string
  subTasks: SubTask[]
  dependencies: TaskDependency[]
  status: TaskStatus
  createdAt: number
  updatedAt: number
  estimatedTotalDuration: number | null
  metadata: Record<string, unknown>
}

export interface Task {
  id: string
  title: string
  description: string
  type: TaskType
  status: TaskStatus
  priority: TaskPriority
  planId: string | null
  subTaskIds: string[]
  assignedAgentId: string | null
  requiredCapabilities: AgentCapability[]
  constraints: TaskConstraint[]
  input: Record<string, unknown>
  result: TaskResult | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  metadata: Record<string, unknown>
}

export interface TaskDecompositionResult {
  rootTask: Task
  subTasks: SubTask[]
  dependencies: TaskDependency[]
  estimatedDuration: number
}

export interface TaskAssignment {
  taskId: string
  agentId: string
  assignedAt: number
  reason: string
}

export interface TaskExecutionLog {
  taskId: string
  agentId: string
  action: string
  timestamp: number
  details: Record<string, unknown>
  duration?: number
}

export function createSubTask(
  title: string,
  description: string,
  options?: Partial<Omit<SubTask, 'id' | 'title' | 'description' | 'status' | 'createdAt'>>,
): SubTask {
  return {
    id: crypto.randomUUID(),
    title,
    description,
    type: options?.type ?? TaskType.Atomic,
    status: TaskStatus.Pending,
    priority: options?.priority ?? TaskPriority.Medium,
    requiredCapabilities: options?.requiredCapabilities ?? [],
    preferredRole: options?.preferredRole ?? null,
    assignedAgentId: options?.assignedAgentId ?? null,
    parentTaskId: options?.parentTaskId ?? null,
    dependencies: options?.dependencies ?? [],
    constraints: options?.constraints ?? [],
    input: options?.input ?? {},
    result: options?.result ?? null,
    retryCount: options?.retryCount ?? 0,
    maxRetries: options?.maxRetries ?? 3,
    timeout: options?.timeout ?? 300_000,
    createdAt: Date.now(),
    startedAt: options?.startedAt ?? null,
    completedAt: options?.completedAt ?? null,
    estimatedDuration: options?.estimatedDuration ?? null,
    metadata: options?.metadata ?? {},
    compensateAction: options?.compensateAction ?? null,
    rollbackCondition: options?.rollbackCondition ?? null,
    failureImpact: options?.failureImpact ?? 'local',
  }
}

export function createTaskPlan(
  title: string,
  description: string,
  subTasks: SubTask[],
  dependencies: TaskDependency[] = [],
): TaskPlan {
  return {
    id: crypto.randomUUID(),
    title,
    description,
    rootTaskId: subTasks[0]?.id ?? '',
    subTasks,
    dependencies,
    status: TaskStatus.Pending,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    estimatedTotalDuration: null,
    metadata: {},
  }
}

export function getTaskDependencies(taskId: string, plan: TaskPlan): string[] {
  return plan.dependencies
    .filter(d => d.toTaskId === taskId)
    .map(d => d.fromTaskId)
}

export function getDependentTasks(taskId: string, plan: TaskPlan): string[] {
  return plan.dependencies
    .filter(d => d.fromTaskId === taskId)
    .map(d => d.toTaskId)
}

export function isTaskReady(task: SubTask, plan: TaskPlan): boolean {
  const deps = getTaskDependencies(task.id, plan)
  if (deps.length === 0) return true
  return deps.every(depId => {
    const dep = plan.subTasks.find(t => t.id === depId)
    return dep?.status === TaskStatus.Completed
  })
}

export function calculatePlanProgress(plan: TaskPlan): number {
  if (plan.subTasks.length === 0) return 0
  const completed = plan.subTasks.filter(t => t.status === TaskStatus.Completed).length
  return completed / plan.subTasks.length
}
