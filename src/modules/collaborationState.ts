import type { AgentRole, AgentCapability } from './agentTypes'
import { AgentInstanceStatus } from './agentTypes'
import type { TaskPriority, TaskResult, SubTask, TaskPlan } from './taskTypes'
import { TaskStatus } from './taskTypes'
import type { MessageEnvelope, MessageType } from './communicationProtocol'

export enum CollaborationMode {
  Sequential = 'sequential',
  Parallel = 'parallel',
  Hierarchical = 'hierarchical',
  Adaptive = 'adaptive',
}

export enum SessionStatus {
  Initializing = 'initializing',
  Planning = 'planning',
  Executing = 'executing',
  Reviewing = 'reviewing',
  Completing = 'completing',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
  Paused = 'paused',
}

export interface AgentStatus {
  agentId: string
  agentName: string
  role: AgentRole
  status: AgentInstanceStatus
  currentTaskId: string | null
  capabilities: AgentCapability[]
  completedTasks: number
  failedTasks: number
  averageTaskDuration: number
  lastHeartbeat: number
  load: number
  error: string | null
}

export interface TaskProgress {
  taskId: string
  taskTitle: string
  status: TaskStatus
  priority: TaskPriority
  assignedAgentId: string | null
  progress: number
  startedAt: number | null
  estimatedCompletionAt: number | null
  completedAt: number | null
  retryCount: number
  error: string | null
  subProgress: SubTaskProgress[]
}

export interface SubTaskProgress {
  subTaskId: string
  title: string
  status: TaskStatus
  progress: number
  assignedAgentId: string | null
  startedAt: number | null
  completedAt: number | null
}

export interface CollaborationSession {
  id: string
  title: string
  description: string
  mode: CollaborationMode
  status: SessionStatus
  createdAt: number
  updatedAt: number
  startedAt: number | null
  completedAt: number | null
  userQuery: string
  planId: string | null
  agentIds: string[]
  taskProgress: TaskProgress[]
  messageHistory: MessageEnvelope[]
  metrics: SessionMetrics
  metadata: Record<string, unknown>
}

export interface SessionMetrics {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  totalDuration: number
  averageTaskDuration: number
  agentUtilization: Record<string, number>
  messageCount: number
  errorCount: number
}

export interface CollaborationState {
  activeSessionId: string | null
  sessions: Map<string, CollaborationSession>
  agentStatuses: Map<string, AgentStatus>
  plans: Map<string, TaskPlan>
  pendingAssignments: PendingAssignment[]
  globalMetrics: GlobalMetrics
}

export interface PendingAssignment {
  taskId: string
  requiredCapabilities: AgentCapability[]
  preferredRole: AgentRole | null
  priority: TaskPriority
  createdAt: number
  deadline: number | null
}

export interface GlobalMetrics {
  totalSessions: number
  completedSessions: number
  failedSessions: number
  totalTasksExecuted: number
  averageSessionDuration: number
  peakConcurrency: number
}

export interface MonitorAlert {
  id: string
  agentId: string
  alertType: 'deadlock' | 'resource_leak' | 'infinite_loop' | 'high_error_rate' | 'timeout'
  severity: 'warning' | 'critical'
  message: string
  affectedTaskIds: string[]
  timestamp: number
  resolved: boolean
}

export interface CollaborationEvent {
  id: string
  sessionId: string
  type: CollaborationEventType
  timestamp: number
  agentId: string | null
  taskId: string | null
  message: string
  data: Record<string, unknown>
}

export enum CollaborationEventType {
  SessionCreated = 'session_created',
  SessionStarted = 'session_started',
  SessionCompleted = 'session_completed',
  SessionFailed = 'session_failed',
  SessionPaused = 'session_paused',
  SessionResumed = 'session_resumed',
  PlanCreated = 'plan_created',
  PlanUpdated = 'plan_updated',
  TaskAssigned = 'task_assigned',
  TaskStarted = 'task_started',
  TaskProgressed = 'task_progressed',
  TaskCompleted = 'task_completed',
  TaskFailed = 'task_failed',
  TaskRetried = 'task_retried',
  AgentJoined = 'agent_joined',
  AgentLeft = 'agent_left',
  AgentStatusChanged = 'agent_status_changed',
  MessageSent = 'message_sent',
  MessageReceived = 'message_received',
  ErrorOccurred = 'error_occurred',
  HelpRequested = 'help_requested',
  HelpProvided = 'help_provided',
  DeadlockDetected = 'deadlock_detected',
  DeadlockResolved = 'deadlock_resolved',
  MonitorAlert = 'monitor_alert',
  TaskPausedByMonitor = 'task_paused_by_monitor',
}

export function createCollaborationSession(
  userQuery: string,
  mode: CollaborationMode = CollaborationMode.Adaptive,
): CollaborationSession {
  return {
    id: crypto.randomUUID(),
    title: userQuery.slice(0, 100),
    description: userQuery,
    mode,
    status: SessionStatus.Initializing,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    userQuery,
    planId: null,
    agentIds: [],
    taskProgress: [],
    messageHistory: [],
    metrics: createSessionMetrics(),
    metadata: {},
  }
}

export function createSessionMetrics(): SessionMetrics {
  return {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalDuration: 0,
    averageTaskDuration: 0,
    agentUtilization: {},
    messageCount: 0,
    errorCount: 0,
  }
}

export function createAgentStatus(
  agentId: string,
  agentName: string,
  role: AgentRole,
  capabilities: AgentCapability[],
): AgentStatus {
  return {
    agentId,
    agentName,
    role,
    status: AgentInstanceStatus.Idle,
    currentTaskId: null,
    capabilities,
    completedTasks: 0,
    failedTasks: 0,
    averageTaskDuration: 0,
    lastHeartbeat: Date.now(),
    load: 0,
    error: null,
  }
}

export function createTaskProgress(subTask: SubTask): TaskProgress {
  return {
    taskId: subTask.id,
    taskTitle: subTask.title,
    status: subTask.status,
    priority: subTask.priority,
    assignedAgentId: subTask.assignedAgentId,
    progress: 0,
    startedAt: subTask.startedAt,
    estimatedCompletionAt: null,
    completedAt: subTask.completedAt,
    retryCount: subTask.retryCount,
    error: null,
    subProgress: [],
  }
}

export function createCollaborationEvent(
  sessionId: string,
  type: CollaborationEventType,
  message: string,
  options?: Partial<Omit<CollaborationEvent, 'id' | 'sessionId' | 'type' | 'timestamp' | 'message'>>,
): CollaborationEvent {
  return {
    id: crypto.randomUUID(),
    sessionId,
    type,
    timestamp: Date.now(),
    agentId: options?.agentId ?? null,
    taskId: options?.taskId ?? null,
    message,
    data: options?.data ?? {},
  }
}

export function createGlobalMetrics(): GlobalMetrics {
  return {
    totalSessions: 0,
    completedSessions: 0,
    failedSessions: 0,
    totalTasksExecuted: 0,
    averageSessionDuration: 0,
    peakConcurrency: 0,
  }
}

export function createMonitorAlert(
  agentId: string,
  alertType: MonitorAlert['alertType'],
  severity: MonitorAlert['severity'],
  message: string,
  affectedTaskIds: string[] = [],
): MonitorAlert {
  return {
    id: crypto.randomUUID(),
    agentId,
    alertType,
    severity,
    message,
    affectedTaskIds,
    timestamp: Date.now(),
    resolved: false,
  }
}

export function calculateSessionProgress(session: CollaborationSession): number {
  if (session.taskProgress.length === 0) return 0
  const total = session.taskProgress.reduce((sum, t) => sum + t.progress, 0)
  return total / session.taskProgress.length
}

export function getActiveAgents(state: CollaborationState): AgentStatus[] {
  return Array.from(state.agentStatuses.values()).filter(
    a => a.status !== AgentInstanceStatus.Offline,
  )
}

export function getBusyAgents(state: CollaborationState): AgentStatus[] {
  return Array.from(state.agentStatuses.values()).filter(
    a => a.status === AgentInstanceStatus.Busy,
  )
}

export function getSessionTasksByStatus(
  session: CollaborationSession,
  status: TaskStatus,
): TaskProgress[] {
  return session.taskProgress.filter(t => t.status === status)
}

export function isSessionComplete(session: CollaborationSession): boolean {
  return session.taskProgress.length > 0 &&
    session.taskProgress.every(t =>
      t.status === TaskStatus.Completed ||
      t.status === TaskStatus.Failed ||
      t.status === TaskStatus.Cancelled,
    )
}

export function getLatestEvents(
  session: CollaborationSession,
  limit: number = 20,
): MessageEnvelope[] {
  return session.messageHistory.slice(-limit)
}
