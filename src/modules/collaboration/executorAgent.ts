/**
 * ExecutorAgent - task execution with iterative refinement.
 * Ported from Python mock-sso/collaboration/executor_agent.py
 */

import { randomUUID } from 'crypto';
import {
  CommunicationManager,
  InMemoryCommunication,
  Message,
  MessageType,
  createMessage,
} from './communication';

// ──────────────────── Enums ────────────────────

export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  WAITING = 'waiting',
  ERROR = 'error',
  OFFLINE = 'offline',
}

// ──────────────────── Types ────────────────────

export interface TaskResult {
  taskId: string;
  success: boolean;
  result: any;
  error: string | null;
  duration: number;
  timestamp: Date;
}

export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  totalDuration: number;
  lastActive: Date | null;
}

export type TaskExecutorFn = (
  taskId: string,
  taskName: string,
  description: string,
) => Promise<any>;

export type ReviewCallbackFn = (taskOutput: any) => any | Promise<any>;

// ──────────────────── ExecutorAgent ────────────────────

export class ExecutorAgent {
  name: string;
  capabilities: string[];
  status: AgentStatus;
  currentTask: Record<string, any> | null;
  taskHistory: TaskResult[];
  stats: AgentStats;
  private _parentAgent: string | null;
  private _taskExecutor: TaskExecutorFn | null;
  private _running: boolean;
  private communicationManager: CommunicationManager | null;
  private autoReport: boolean;

  constructor(
    name: string = 'executor',
    capabilities: string[] = [],
    communication?: InMemoryCommunication,
    communicationManager?: CommunicationManager,
    autoReport: boolean = true,
  ) {
    this.name = name;
    this.capabilities = capabilities;
    this.communicationManager = communicationManager ?? null;
    this.autoReport = autoReport;
    this.status = AgentStatus.IDLE;
    this.currentTask = null;
    this.taskHistory = [];
    this.stats = { tasksCompleted: 0, tasksFailed: 0, totalDuration: 0, lastActive: null };
    this._parentAgent = null;
    this._taskExecutor = null;
    this._running = false;
  }

  get agentId(): string {
    return this.name;
  }

  setParentAgent(parentId: string): void {
    this._parentAgent = parentId;
  }

  setTaskExecutor(executor: TaskExecutorFn): void {
    this._taskExecutor = executor;
  }

  start(): void {
    this._running = true;
    if (this.communicationManager) {
      this.communicationManager.registerAgent(this.name, this);
      this.communicationManager.registerHandler(this.name, (msg) => this._handleMessage(msg));
    }
  }

  stop(): void {
    this._running = false;
  }

  private async _handleMessage(message: Message): Promise<void> {
    if (message.type === MessageType.TASK_DELEGATION) {
      await this._handleTaskDelegation(message);
    } else if (message.type === MessageType.COLLABORATION_REQUEST) {
      await this._handleCollaborationRequest(message);
    }
  }

  private async _handleTaskDelegation(message: Message): Promise<void> {
    const taskData = message.content;
    const taskId = taskData.task_id;
    const taskName = taskData.task_name;
    const description = taskData.description;

    this.currentTask = {
      task_id: taskId,
      task_name: taskName,
      description,
      assigned_by: message.sender,
      assigned_at: new Date(),
    };
    this.status = AgentStatus.BUSY;

    try {
      const result = await this.executeTask(taskId, taskName, description);
      await this._reportResult(taskId, result, true);
    } catch (e: any) {
      await this._reportResult(taskId, null, false, String(e));
    } finally {
      this.currentTask = null;
      this.status = AgentStatus.IDLE;
    }
  }

  private async _handleCollaborationRequest(message: Message): Promise<void> {
    const requestType = message.content?.type;
    let result: Record<string, any>;

    if (requestType === 'review') {
      result = { status: 'approved', comments: 'Looks good' };
    } else if (requestType === 'assist') {
      result = { status: 'assisted', help: 'Provided assistance' };
    } else if (requestType === 'consult') {
      result = { status: 'consulted', advice: 'Provided advice' };
    } else {
      result = { status: 'unknown_request' };
    }

    if (this.communicationManager) {
      const response = createMessage({
        type: MessageType.COLLABORATION_REQUEST,
        sender: this.name,
        receiver: message.sender,
        content: { type: 'response', request_type: requestType, result },
        correlationId: message.id,
      });
      this.communicationManager.sendMessage(response);
    }
  }

  async executeTask(taskId: string, taskName: string, description: string): Promise<any> {
    const startTime = Date.now();

    let result: any;
    if (this._taskExecutor) {
      result = await this._taskExecutor(taskId, taskName, description);
    } else {
      result = await this._defaultTaskExecution(taskId, taskName, description);
    }

    const duration = (Date.now() - startTime) / 1000;

    const taskResult: TaskResult = {
      taskId,
      success: true,
      result,
      error: null,
      duration,
      timestamp: new Date(),
    };
    this.taskHistory.push(taskResult);
    this.stats.tasksCompleted++;
    this.stats.totalDuration += duration;
    this.stats.lastActive = new Date();

    return result;
  }

  private async _defaultTaskExecution(
    taskId: string,
    taskName: string,
    description: string,
  ): Promise<any> {
    return {
      task_id: taskId,
      task_name: taskName,
      status: 'completed',
      output: `Task '${taskName}' completed by ${this.name}`,
    };
  }

  private async _reportResult(
    taskId: string,
    result: any = null,
    success: boolean = true,
    error?: string,
  ): Promise<void> {
    if (!this.autoReport || !this._parentAgent) return;

    if (!success) {
      this.stats.tasksFailed++;
    }

    if (this.communicationManager) {
      const message = createMessage({
        type: MessageType.TASK_RESULT,
        sender: this.name,
        receiver: this._parentAgent,
        content: {
          task_id: taskId,
          success,
          result,
          error: error ?? null,
          agent_name: this.name,
        },
      });
      this.communicationManager.sendMessage(message);
    }
  }

  getStatus(): Record<string, any> {
    return {
      agent_id: this.name,
      status: this.status,
      capabilities: this.capabilities,
      current_task: this.currentTask,
      stats: {
        tasks_completed: this.stats.tasksCompleted,
        tasks_failed: this.stats.tasksFailed,
        total_duration: this.stats.totalDuration,
        last_active: this.stats.lastActive?.toISOString() ?? null,
      },
    };
  }

  getTaskHistory(): Array<Record<string, any>> {
    return this.taskHistory.map((r) => ({
      task_id: r.taskId,
      success: r.success,
      result: r.result,
      error: r.error,
      duration: r.duration,
      timestamp: r.timestamp.toISOString(),
    }));
  }

  clearHistory(): void {
    this.taskHistory = [];
    this.stats = { tasksCompleted: 0, tasksFailed: 0, totalDuration: 0, lastActive: null };
  }

  // ──────────────────── Revision feedback handling ────────────────────

  handleRevisionFeedback(feedback: Record<string, any>): {
    handled: boolean;
    corrections: Array<Record<string, any>>;
    needsRetry: boolean;
  } {
    const result = {
      handled: true,
      corrections: [] as Array<Record<string, any>>,
      needsRetry: false,
    };

    if (!feedback || typeof feedback !== 'object') return result;

    const status = feedback.status ?? '';
    if (status !== 'revision_required') return result;

    const currentIteration = feedback.current_iteration ?? 1;
    const maxIterations = feedback.max_iterations ?? 3;

    if (currentIteration >= maxIterations) {
      result.needsRetry = false;
      return result;
    }

    const issues = feedback.issues ?? [];
    for (const issue of issues) {
      if (!issue || typeof issue !== 'object') continue;
      result.corrections.push({
        issue_type: issue.type ?? 'unknown',
        location: issue.location ?? '',
        detail: issue.detail ?? '',
        suggestion: issue.suggestion ?? '',
        applied: false,
      });
    }

    result.needsRetry = result.corrections.length > 0;
    return result;
  }

  // ──────────────────── Iterative execution ────────────────────

  async executeWithIteration(
    taskDescription: string,
    taskContext: Record<string, any> = {},
    maxIterations: number = 3,
    reviewCallback?: ReviewCallbackFn,
  ): Promise<{
    status: 'approved' | 'max_iterations_reached';
    output: any;
    iterations: number;
    corrections: Array<Record<string, any>>;
  }> {
    const taskId = taskContext.task_id ?? randomUUID().replace(/-/g, '');
    const allCorrections: Array<Record<string, any>> = [];
    let taskOutput: any = null;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      try {
        if (this._taskExecutor) {
          taskOutput = await this._taskExecutor(
            taskId,
            taskContext.task_name ?? '',
            taskDescription,
          );
        } else {
          taskOutput = await this._defaultTaskExecution(
            taskId,
            taskContext.task_name ?? '',
            taskDescription,
          );
        }
      } catch (e: any) {
        taskOutput = { error: String(e) };
      }

      if (!reviewCallback) {
        return {
          status: 'approved',
          output: taskOutput,
          iterations: iteration,
          corrections: allCorrections,
        };
      }

      let reviewResult: any;
      try {
        reviewResult = await reviewCallback(taskOutput);
      } catch {
        reviewResult = { status: 'approved' };
      }

      if (reviewResult.status === 'approved') {
        return {
          status: 'approved',
          output: taskOutput,
          iterations: iteration,
          corrections: allCorrections,
        };
      }

      reviewResult.current_iteration = iteration;
      reviewResult.max_iterations = maxIterations;
      const feedbackResult = this.handleRevisionFeedback(reviewResult);
      allCorrections.push(...feedbackResult.corrections);

      if (!feedbackResult.needsRetry) break;
    }

    return {
      status: 'max_iterations_reached',
      output: taskOutput,
      iterations: maxIterations,
      corrections: allCorrections,
    };
  }
}
