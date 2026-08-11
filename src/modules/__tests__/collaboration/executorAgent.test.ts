import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutorAgent,
  AgentStatus,
  TaskResult,
} from '../../collaboration/executorAgent';
import {
  CommunicationManager,
  InMemoryCommunication,
  MessageType,
  createMessage,
} from '../../collaboration/communication';

describe('ExecutorAgent', () => {
  let executor: ExecutorAgent;

  beforeEach(() => {
    executor = new ExecutorAgent('exec-1', ['coding', 'testing']);
  });

  describe('initial state', () => {
    it('has correct default state', () => {
      expect(executor.name).toBe('exec-1');
      expect(executor.capabilities).toEqual(['coding', 'testing']);
      expect(executor.status).toBe(AgentStatus.IDLE);
      expect(executor.currentTask).toBeNull();
      expect(executor.taskHistory).toEqual([]);
      expect(executor.stats.tasksCompleted).toBe(0);
      expect(executor.stats.tasksFailed).toBe(0);
      expect(executor.stats.totalDuration).toBe(0);
    });

    it('agentId returns name', () => {
      expect(executor.agentId).toBe('exec-1');
    });
  });

  describe('setParentAgent / setTaskExecutor', () => {
    it('sets parent agent', () => {
      executor.setParentAgent('planner');
      // No direct assertion, but verifies no error
      expect(true).toBe(true);
    });

    it('sets custom task executor', async () => {
      const customFn = vi.fn().mockResolvedValue({ output: 'custom' });
      executor.setTaskExecutor(customFn);
      const result = await executor.executeTask('t1', 'task1', 'do something');
      expect(customFn).toHaveBeenCalledWith('t1', 'task1', 'do something');
      expect(result).toEqual({ output: 'custom' });
    });
  });

  describe('executeTask', () => {
    it('returns default result when no executor set', async () => {
      const result = await executor.executeTask('t1', 'Build UI', 'Create buttons');
      expect(result.task_id).toBe('t1');
      expect(result.task_name).toBe('Build UI');
      expect(result.status).toBe('completed');
      expect(result.output).toContain('exec-1');
    });

    it('updates stats after execution', async () => {
      await executor.executeTask('t1', 'task', 'desc');
      expect(executor.stats.tasksCompleted).toBe(1);
      expect(executor.stats.totalDuration).toBeGreaterThanOrEqual(0);
      expect(executor.stats.lastActive).toBeInstanceOf(Date);
    });

    it('appends to task history', async () => {
      await executor.executeTask('t1', 'task', 'desc');
      expect(executor.taskHistory).toHaveLength(1);
      expect(executor.taskHistory[0].taskId).toBe('t1');
      expect(executor.taskHistory[0].success).toBe(true);
    });

    it('uses custom executor', async () => {
      executor.setTaskExecutor(async (id, name, desc) => ({
        id,
        custom: true,
      }));
      const result = await executor.executeTask('t1', 'task', 'desc');
      expect(result).toEqual({ id: 't1', custom: true });
    });
  });

  describe('getStatus / getTaskHistory', () => {
    it('getStatus returns correct structure', () => {
      const status = executor.getStatus();
      expect(status.agent_id).toBe('exec-1');
      expect(status.status).toBe(AgentStatus.IDLE);
      expect(status.capabilities).toEqual(['coding', 'testing']);
      expect(status.current_task).toBeNull();
      expect(status.stats.tasks_completed).toBe(0);
    });

    it('getTaskHistory returns history', async () => {
      await executor.executeTask('t1', 'task', 'desc');
      const history = executor.getTaskHistory();
      expect(history).toHaveLength(1);
      expect(history[0].task_id).toBe('t1');
      expect(history[0].timestamp).toBeTruthy();
    });

    it('clearHistory resets everything', async () => {
      await executor.executeTask('t1', 'task', 'desc');
      executor.clearHistory();
      expect(executor.taskHistory).toEqual([]);
      expect(executor.stats.tasksCompleted).toBe(0);
    });
  });

  describe('handleRevisionFeedback', () => {
    it('returns needsRetry=false for approved status', () => {
      const result = executor.handleRevisionFeedback({ status: 'approved' });
      expect(result.handled).toBe(true);
      expect(result.needsRetry).toBe(false);
      expect(result.corrections).toEqual([]);
    });

    it('returns corrections for revision_required', () => {
      const result = executor.handleRevisionFeedback({
        status: 'revision_required',
        current_iteration: 1,
        max_iterations: 3,
        issues: [
          { type: 'logic_error', location: 'file.ts', detail: 'bug', suggestion: 'fix it' },
        ],
      });
      expect(result.needsRetry).toBe(true);
      expect(result.corrections).toHaveLength(1);
      expect(result.corrections[0].issue_type).toBe('logic_error');
    });

    it('returns needsRetry=false when max iterations reached', () => {
      const result = executor.handleRevisionFeedback({
        status: 'revision_required',
        current_iteration: 3,
        max_iterations: 3,
        issues: [{ type: 'bug', location: '', detail: '', suggestion: '' }],
      });
      expect(result.needsRetry).toBe(false);
    });

    it('handles null/undefined feedback gracefully', () => {
      expect(executor.handleRevisionFeedback(null as any).handled).toBe(true);
      expect(executor.handleRevisionFeedback(undefined as any).handled).toBe(true);
    });
  });

  describe('executeWithIteration', () => {
    it('returns approved when no review callback', async () => {
      const result = await executor.executeWithIteration('do task', {});
      expect(result.status).toBe('approved');
      expect(result.iterations).toBe(1);
      expect(result.corrections).toEqual([]);
    });

    it('iterates when review returns revision_required', async () => {
      let callCount = 0;
      const reviewFn = vi.fn().mockImplementation((output: any) => {
        callCount++;
        if (callCount < 3) {
          return {
            status: 'revision_required',
            issues: [{ type: 'logic_error', location: 'x', detail: 'd', suggestion: 's' }],
          };
        }
        return { status: 'approved' };
      });

      const result = await executor.executeWithIteration('task', {}, 3, reviewFn);
      expect(result.status).toBe('approved');
      expect(result.iterations).toBe(3);
      expect(reviewFn).toHaveBeenCalledTimes(3);
    });

    it('stops at maxIterations', async () => {
      const reviewFn = vi.fn().mockReturnValue({
        status: 'revision_required',
        issues: [{ type: 'bug', location: '', detail: '', suggestion: '' }],
      });

      const result = await executor.executeWithIteration('task', {}, 2, reviewFn);
      expect(result.status).toBe('max_iterations_reached');
      expect(result.iterations).toBe(2);
    });

    it('uses custom task executor in iteration', async () => {
      const customFn = vi.fn().mockResolvedValue({ done: true });
      executor.setTaskExecutor(customFn);

      const result = await executor.executeWithIteration('my task', { task_name: 'T' }, 1);
      expect(customFn).toHaveBeenCalled();
      expect(result.output).toEqual({ done: true });
    });
  });

  describe('message handling (start/stop)', () => {
    it('registers with CommunicationManager on start', () => {
      const comm = new InMemoryCommunication();
      const manager = new CommunicationManager(comm);
      manager.registerAgent('exec-1');
      manager.registerAgent('planner');

      const exec = new ExecutorAgent('exec-1', [], comm, manager);
      exec.start();
      expect(manager.getRegisteredAgents()).toContain('exec-1');
    });

    it('handles TASK_DELEGATION message', async () => {
      const comm = new InMemoryCommunication();
      const manager = new CommunicationManager(comm);
      manager.registerAgent('exec-1');
      manager.registerAgent('planner');

      const exec = new ExecutorAgent('exec-1', [], comm, manager);
      exec.setParentAgent('planner');
      exec.start();

      // Send a task delegation message
      const msg = createMessage({
        type: MessageType.TASK_DELEGATION,
        sender: 'planner',
        receiver: 'exec-1',
        content: {
          task_id: 't1',
          task_name: 'Build UI',
          description: 'Create the frontend',
        },
      });
      manager.sendMessage(msg);

      // Process messages
      await manager.processMessages('exec-1');

      // Agent should have completed and reported result
      expect(exec.stats.tasksCompleted).toBe(1);
      expect(manager.hasMessages('planner')).toBe(true);
    });

    it('handles COLLABORATION_REQUEST message', async () => {
      const comm = new InMemoryCommunication();
      const manager = new CommunicationManager(comm);
      manager.registerAgent('exec-1');
      manager.registerAgent('other');

      const exec = new ExecutorAgent('exec-1', [], comm, manager);
      exec.start();

      const msg = createMessage({
        type: MessageType.COLLABORATION_REQUEST,
        sender: 'other',
        receiver: 'exec-1',
        content: { type: 'review' },
      });
      manager.sendMessage(msg);
      await manager.processMessages('exec-1');

      expect(manager.hasMessages('other')).toBe(true);
      const response = manager.receiveMessage('other');
      expect(response!.content.type).toBe('response');
      expect(response!.content.result.status).toBe('approved');
    });

    it('stop sets running to false', () => {
      const exec = new ExecutorAgent('exec-1');
      exec.start();
      exec.stop();
      // No error thrown = success
      expect(true).toBe(true);
    });
  });
});
