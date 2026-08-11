/**
 * CollaborativeAgent - orchestrates PlannerAgent + ExecutorAgents.
 * Ported from Python mock-sso/collaboration/collaborative_agent.py
 */

import {
  CommunicationManager,
  InMemoryCommunication,
  Message,
  MessageType,
  createMessage,
} from './communication';
import { PlannerAgent, TaskPlan, TaskStatus } from './plannerAgent';
import { ExecutorAgent, AgentStatus } from './executorAgent';

// ──────────────────── CollaborativeAgent ────────────────────

export class CollaborativeAgent {
  name: string;
  communication: InMemoryCommunication;
  communicationManager: CommunicationManager;
  planner: PlannerAgent;
  executors: Map<string, ExecutorAgent>;
  currentPlan: TaskPlan | null;
  private _running: boolean;

  constructor(name: string = 'coordinator', communication?: InMemoryCommunication) {
    this.name = name;
    this.communication = communication ?? new InMemoryCommunication();
    this.communicationManager = new CommunicationManager(this.communication);
    this.planner = new PlannerAgent(
      `${name}_planner`,
      this.communication,
      this.communicationManager,
    );
    this.executors = new Map();
    this.currentPlan = null;
    this._running = false;
  }

  get agentId(): string {
    return this.name;
  }

  addExecutor(name: string, capabilities: string[] = []): ExecutorAgent {
    const executor = new ExecutorAgent(
      name,
      capabilities,
      this.communication,
      this.communicationManager,
      true,
    );
    executor.setParentAgent(this.planner.name);
    this.executors.set(name, executor);
    this.planner.registerChildAgent(name, executor);
    return executor;
  }

  removeExecutor(name: string): void {
    this.executors.delete(name);
  }

  async start(): Promise<void> {
    this._running = true;
    this.communicationManager.registerAgent(this.name, this);
    this.communicationManager.registerAgent(this.planner.name, this.planner);

    for (const executor of this.executors.values()) {
      executor.start();
    }

    this.communicationManager.registerHandler(
      this.planner.name,
      (msg) => this._handlePlannerMessage(msg),
    );
  }

  async stop(): Promise<void> {
    this._running = false;
    for (const executor of this.executors.values()) {
      executor.stop();
    }
  }

  private async _handlePlannerMessage(message: Message): Promise<void> {
    if (message.type !== MessageType.TASK_RESULT) return;

    const taskData = message.content;
    const taskId = taskData.task_id;
    const success = taskData.success ?? false;
    const result = taskData.result;
    const error = taskData.error;

    if (success) {
      await this.planner.updateSubtaskStatus(taskId, TaskStatus.COMPLETED, result);
    } else {
      await this.planner.updateSubtaskStatus(taskId, TaskStatus.FAILED, undefined, error);
    }
  }

  async executeTask(
    taskDescription: string,
    context?: Record<string, any>,
  ): Promise<Record<string, any>> {
    this.currentPlan = await this.planner.planTask(taskDescription, context);

    // Run the plan with message processing between iterations
    this.currentPlan.status = TaskStatus.RUNNING;
    const results: Record<string, any> = {};

    let maxLoops = 100; // safety limit
    while (maxLoops-- > 0) {
      const assignments = await this.planner.assignTasks();

      if (Object.keys(assignments).length === 0) {
        const allDone = this.currentPlan.subtasks.every(
          (s) =>
            s.status === TaskStatus.COMPLETED ||
            s.status === TaskStatus.FAILED ||
            s.status === TaskStatus.CANCELLED,
        );
        if (allDone) break;

        // Process executor messages to unblock subtasks
        for (const executor of this.executors.values()) {
          await this.communicationManager.processMessages(executor.name);
        }
        // Also process planner messages (TASK_RESULT from executors)
        await this.communicationManager.processMessages(this.planner.name);
        continue;
      }

      // After assigning, process executor messages so they can complete tasks
      for (const executor of this.executors.values()) {
        await this.communicationManager.processMessages(executor.name);
      }
      // Process planner messages (TASK_RESULT from executors)
      await this.communicationManager.processMessages(this.planner.name);
    }

    for (const subtask of this.currentPlan.subtasks) {
      results[subtask.id] = {
        name: subtask.name,
        status: subtask.status,
        result: subtask.result,
        error: subtask.error,
      };
    }

    return {
      plan_id: this.currentPlan.id,
      title: this.currentPlan.title,
      status: this.currentPlan.status,
      results,
      plan_status: this.planner.getPlanStatus(),
    };
  }

  getStatus(): Record<string, any> {
    const executorStatuses: Record<string, any> = {};
    for (const [name, executor] of this.executors) {
      executorStatuses[name] = executor.getStatus();
    }

    return {
      coordinator: this.name,
      planner: this.planner.getPlanStatus(),
      executors: executorStatuses,
      is_running: this._running,
    };
  }

  getExecutor(name: string): ExecutorAgent | null {
    return this.executors.get(name) ?? null;
  }

  listExecutors(): string[] {
    return Array.from(this.executors.keys());
  }

  async addExecutorAndStart(
    name: string,
    capabilities: string[] = [],
  ): Promise<ExecutorAgent> {
    const executor = this.addExecutor(name, capabilities);
    if (this._running) {
      executor.start();
    }
    return executor;
  }

  async removeExecutorAndStop(name: string): Promise<void> {
    const executor = this.executors.get(name);
    if (executor) {
      executor.stop();
      this.removeExecutor(name);
    }
  }

  async broadcastToExecutors(messageContent: any): Promise<void> {
    const message = createMessage({
      type: MessageType.BROADCAST,
      sender: this.name,
      content: messageContent,
    });
    this.communicationManager.broadcastMessage(message);
  }

  async sendToExecutor(executorName: string, messageContent: any): Promise<void> {
    if (!this.executors.has(executorName)) {
      throw new Error(`Executor '${executorName}' not found`);
    }

    const message = createMessage({
      type: MessageType.DIRECT,
      sender: this.name,
      receiver: executorName,
      content: messageContent,
    });
    this.communicationManager.sendMessage(message);
  }

  getPlanProgress(): ReturnType<PlannerAgent['getPlanStatus']> {
    return this.planner.getPlanStatus();
  }

  getExecutorStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, executor] of this.executors) {
      stats[name] = {
        tasks_completed: executor.stats.tasksCompleted,
        tasks_failed: executor.stats.tasksFailed,
        total_duration: executor.stats.totalDuration,
        status: executor.status,
      };
    }
    return stats;
  }
}
