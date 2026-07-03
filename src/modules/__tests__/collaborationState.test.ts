import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CollaborationMode,
  SessionStatus,
  CollaborationEventType,
  createCollaborationSession,
  createSessionMetrics,
  createAgentStatus,
  createTaskProgress,
  createCollaborationEvent,
  createGlobalMetrics,
  createMonitorAlert,
  calculateSessionProgress,
  getActiveAgents,
  getBusyAgents,
  getSessionTasksByStatus,
  isSessionComplete,
  getLatestEvents,
} from '../collaborationState'
import { AgentCapability, AgentInstanceStatus, AgentRole } from '../agentTypes'
import { TaskStatus, TaskPriority, TaskType } from '../taskTypes'

function makeSubTask(overrides: Record<string, any> = {}) {
  return {
    id: 'sub-1',
    title: 'Sub Task',
    description: 'A sub task',
    type: TaskType.Atomic,
    status: TaskStatus.Pending,
    priority: TaskPriority.Medium,
    requiredCapabilities: [AgentCapability.CodeGeneration],
    preferredRole: null,
    assignedAgentId: null,
    parentTaskId: null,
    dependencies: [],
    constraints: [],
    input: {},
    result: null,
    retryCount: 0,
    maxRetries: 3,
    timeout: 30000,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    estimatedDuration: null,
    metadata: {},
    compensateAction: null,
    rollbackCondition: null,
    failureImpact: 'none' as const,
    ...overrides,
  }
}

describe('collaborationState', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('enums', () => {
    it('should have collaboration modes', () => {
      expect(CollaborationMode.Sequential).toBe('sequential')
      expect(CollaborationMode.Parallel).toBe('parallel')
      expect(CollaborationMode.Hierarchical).toBe('hierarchical')
      expect(CollaborationMode.Adaptive).toBe('adaptive')
    })

    it('should have session statuses', () => {
      expect(SessionStatus.Initializing).toBe('initializing')
      expect(SessionStatus.Planning).toBe('planning')
      expect(SessionStatus.Executing).toBe('executing')
      expect(SessionStatus.Reviewing).toBe('reviewing')
      expect(SessionStatus.Completing).toBe('completing')
      expect(SessionStatus.Completed).toBe('completed')
      expect(SessionStatus.Failed).toBe('failed')
      expect(SessionStatus.Cancelled).toBe('cancelled')
      expect(SessionStatus.Paused).toBe('paused')
    })

    it('should have collaboration event types', () => {
      expect(CollaborationEventType.SessionCreated).toBe('session_created')
      expect(CollaborationEventType.TaskAssigned).toBe('task_assigned')
      expect(CollaborationEventType.DeadlockDetected).toBe('deadlock_detected')
    })
  })

  describe('createCollaborationSession', () => {
    it('should create session with defaults', () => {
      const session = createCollaborationSession('Build a website')

      expect(session.id).toBe('test-uuid')
      expect(session.title).toBe('Build a website')
      expect(session.description).toBe('Build a website')
      expect(session.mode).toBe(CollaborationMode.Adaptive)
      expect(session.status).toBe(SessionStatus.Initializing)
      expect(session.userQuery).toBe('Build a website')
      expect(session.agentIds).toEqual([])
      expect(session.taskProgress).toEqual([])
      expect(session.messageHistory).toEqual([])
    })

    it('should truncate title to 100 chars', () => {
      const longQuery = 'A'.repeat(200)
      const session = createCollaborationSession(longQuery)
      expect(session.title).toHaveLength(100)
    })

    it('should accept custom mode', () => {
      const session = createCollaborationSession('Query', CollaborationMode.Parallel)
      expect(session.mode).toBe(CollaborationMode.Parallel)
    })
  })

  describe('createSessionMetrics', () => {
    it('should create zeroed metrics', () => {
      const metrics = createSessionMetrics()
      expect(metrics.totalTasks).toBe(0)
      expect(metrics.completedTasks).toBe(0)
      expect(metrics.failedTasks).toBe(0)
      expect(metrics.totalDuration).toBe(0)
      expect(metrics.messageCount).toBe(0)
      expect(metrics.errorCount).toBe(0)
      expect(metrics.agentUtilization).toEqual({})
    })
  })

  describe('createAgentStatus', () => {
    it('should create agent status', () => {
      const status = createAgentStatus('a1', 'Coder', AgentRole.Executor, [AgentCapability.CodeGeneration])

      expect(status.agentId).toBe('a1')
      expect(status.agentName).toBe('Coder')
      expect(status.role).toBe(AgentRole.Executor)
      expect(status.status).toBe(AgentInstanceStatus.Idle)
      expect(status.capabilities).toEqual([AgentCapability.CodeGeneration])
      expect(status.completedTasks).toBe(0)
      expect(status.failedTasks).toBe(0)
      expect(status.load).toBe(0)
      expect(status.error).toBeNull()
    })
  })

  describe('createTaskProgress', () => {
    it('should create task progress from subtask', () => {
      const subtask = makeSubTask({ assignedAgentId: 'a1', startedAt: 1000 })
      const progress = createTaskProgress(subtask)

      expect(progress.taskId).toBe('sub-1')
      expect(progress.taskTitle).toBe('Sub Task')
      expect(progress.status).toBe(TaskStatus.Pending)
      expect(progress.priority).toBe(TaskPriority.Medium)
      expect(progress.assignedAgentId).toBe('a1')
      expect(progress.progress).toBe(0)
      expect(progress.startedAt).toBe(1000)
      expect(progress.subProgress).toEqual([])
    })
  })

  describe('createCollaborationEvent', () => {
    it('should create event with defaults', () => {
      const event = createCollaborationEvent('sess-1', CollaborationEventType.SessionCreated, 'Session created')

      expect(event.id).toBe('test-uuid')
      expect(event.sessionId).toBe('sess-1')
      expect(event.type).toBe(CollaborationEventType.SessionCreated)
      expect(event.message).toBe('Session created')
      expect(event.agentId).toBeNull()
      expect(event.taskId).toBeNull()
      expect(event.data).toEqual({})
    })

    it('should accept optional fields', () => {
      const event = createCollaborationEvent('sess-1', CollaborationEventType.TaskAssigned, 'Assigned', {
        agentId: 'a1',
        taskId: 't1',
        data: { key: 'value' },
      })

      expect(event.agentId).toBe('a1')
      expect(event.taskId).toBe('t1')
      expect(event.data).toEqual({ key: 'value' })
    })
  })

  describe('createGlobalMetrics', () => {
    it('should create zeroed global metrics', () => {
      const metrics = createGlobalMetrics()
      expect(metrics.totalSessions).toBe(0)
      expect(metrics.completedSessions).toBe(0)
      expect(metrics.failedSessions).toBe(0)
      expect(metrics.totalTasksExecuted).toBe(0)
      expect(metrics.peakConcurrency).toBe(0)
    })
  })

  describe('createMonitorAlert', () => {
    it('should create alert', () => {
      const alert = createMonitorAlert('a1', 'deadlock', 'critical', 'Deadlock detected', ['t1', 't2'])

      expect(alert.id).toBe('test-uuid')
      expect(alert.agentId).toBe('a1')
      expect(alert.alertType).toBe('deadlock')
      expect(alert.severity).toBe('critical')
      expect(alert.message).toBe('Deadlock detected')
      expect(alert.affectedTaskIds).toEqual(['t1', 't2'])
      expect(alert.resolved).toBe(false)
    })

    it('should default affectedTaskIds to empty', () => {
      const alert = createMonitorAlert('a1', 'timeout', 'warning', 'Timeout')
      expect(alert.affectedTaskIds).toEqual([])
    })
  })

  describe('calculateSessionProgress', () => {
    it('should return 0 for empty tasks', () => {
      const session = createCollaborationSession('Query')
      expect(calculateSessionProgress(session)).toBe(0)
    })

    it('should calculate average progress', () => {
      const session = createCollaborationSession('Query')
      session.taskProgress = [
        { ...createTaskProgress(makeSubTask({ id: 't1' })), progress: 50 },
        { ...createTaskProgress(makeSubTask({ id: 't2' })), progress: 100 },
      ]
      expect(calculateSessionProgress(session)).toBe(75)
    })
  })

  describe('getActiveAgents', () => {
    it('should filter out offline agents', () => {
      const state = {
        agentStatuses: new Map([
          ['a1', createAgentStatus('a1', 'A1', AgentRole.Executor, [])],
          ['a2', { ...createAgentStatus('a2', 'A2', AgentRole.Executor, []), status: AgentInstanceStatus.Offline }],
        ]),
      } as any

      const active = getActiveAgents(state)
      expect(active).toHaveLength(1)
      expect(active[0].agentId).toBe('a1')
    })
  })

  describe('getBusyAgents', () => {
    it('should filter busy agents only', () => {
      const state = {
        agentStatuses: new Map([
          ['a1', { ...createAgentStatus('a1', 'A1', AgentRole.Executor, []), status: AgentInstanceStatus.Busy }],
          ['a2', createAgentStatus('a2', 'A2', AgentRole.Executor, [])],
        ]),
      } as any

      const busy = getBusyAgents(state)
      expect(busy).toHaveLength(1)
      expect(busy[0].agentId).toBe('a1')
    })
  })

  describe('getSessionTasksByStatus', () => {
    it('should filter tasks by status', () => {
      const session = createCollaborationSession('Query')
      session.taskProgress = [
        { ...createTaskProgress(makeSubTask({ id: 't1' })), status: TaskStatus.Completed },
        { ...createTaskProgress(makeSubTask({ id: 't2' })), status: TaskStatus.Pending },
        { ...createTaskProgress(makeSubTask({ id: 't3' })), status: TaskStatus.Completed },
      ]

      expect(getSessionTasksByStatus(session, TaskStatus.Completed)).toHaveLength(2)
      expect(getSessionTasksByStatus(session, TaskStatus.Pending)).toHaveLength(1)
      expect(getSessionTasksByStatus(session, TaskStatus.Failed)).toHaveLength(0)
    })
  })

  describe('isSessionComplete', () => {
    it('should return false for empty tasks', () => {
      const session = createCollaborationSession('Query')
      expect(isSessionComplete(session)).toBe(false)
    })

    it('should return true when all tasks are completed/failed/cancelled', () => {
      const session = createCollaborationSession('Query')
      session.taskProgress = [
        { ...createTaskProgress(makeSubTask({ id: 't1' })), status: TaskStatus.Completed },
        { ...createTaskProgress(makeSubTask({ id: 't2' })), status: TaskStatus.Failed },
        { ...createTaskProgress(makeSubTask({ id: 't3' })), status: TaskStatus.Cancelled },
      ]
      expect(isSessionComplete(session)).toBe(true)
    })

    it('should return false when tasks still pending', () => {
      const session = createCollaborationSession('Query')
      session.taskProgress = [
        { ...createTaskProgress(makeSubTask({ id: 't1' })), status: TaskStatus.Completed },
        { ...createTaskProgress(makeSubTask({ id: 't2' })), status: TaskStatus.Pending },
      ]
      expect(isSessionComplete(session)).toBe(false)
    })
  })

  describe('getLatestEvents', () => {
    it('should return latest N messages', () => {
      const session = createCollaborationSession('Query')
      session.messageHistory = Array.from({ length: 30 }, (_, i) => ({
        id: `msg-${i}`,
        type: 'agent_message' as any,
        senderId: 'a1',
        receiverId: 'a2',
        payload: {},
        timestamp: Date.now(),
        priority: 'normal' as any,
        status: 'processed',
        retryCount: 0,
        maxRetries: 3,
      }))

      expect(getLatestEvents(session)).toHaveLength(20)
      expect(getLatestEvents(session, 5)).toHaveLength(5)
    })

    it('should return all when fewer than limit', () => {
      const session = createCollaborationSession('Query')
      session.messageHistory = [{
        id: 'msg-1',
        type: 'agent_message' as any,
        senderId: 'a1',
        receiverId: 'a2',
        payload: {},
        timestamp: Date.now(),
        priority: 'normal' as any,
        status: 'processed',
        retryCount: 0,
        maxRetries: 3,
      }]
      expect(getLatestEvents(session)).toHaveLength(1)
    })
  })
})
