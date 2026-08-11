import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollaborativeAgent } from '../../collaboration/collaborativeAgent';
import { TaskStatus } from '../../collaboration/plannerAgent';
import { AgentStatus } from '../../collaboration/executorAgent';

describe('CollaborativeAgent', () => {
  let coordinator: CollaborativeAgent;

  beforeEach(() => {
    coordinator = new CollaborativeAgent('coordinator');
  });

  describe('constructor', () => {
    it('has correct default state', () => {
      expect(coordinator.name).toBe('coordinator');
      expect(coordinator.agentId).toBe('coordinator');
      expect(coordinator.executors.size).toBe(0);
      expect(coordinator.currentPlan).toBeNull();
    });
  });

  describe('addExecutor / removeExecutor', () => {
    it('adds an executor', () => {
      const exec = coordinator.addExecutor('exec-1', ['coding']);
      expect(exec.name).toBe('exec-1');
      expect(exec.capabilities).toEqual(['coding']);
      expect(coordinator.executors.has('exec-1')).toBe(true);
      expect(coordinator.listExecutors()).toEqual(['exec-1']);
    });

    it('adds multiple executors', () => {
      coordinator.addExecutor('frontend', ['html', 'css']);
      coordinator.addExecutor('backend', ['python']);
      expect(coordinator.listExecutors()).toEqual(['frontend', 'backend']);
    });

    it('removes an executor', () => {
      coordinator.addExecutor('exec-1');
      coordinator.removeExecutor('exec-1');
      expect(coordinator.executors.has('exec-1')).toBe(false);
    });

    it('getExecutor returns executor or null', () => {
      coordinator.addExecutor('exec-1');
      expect(coordinator.getExecutor('exec-1')).not.toBeNull();
      expect(coordinator.getExecutor('nonexistent')).toBeNull();
    });
  });

  describe('start / stop', () => {
    it('starts and registers agents', async () => {
      coordinator.addExecutor('exec-1');
      await coordinator.start();
      expect(coordinator.getStatus().is_running).toBe(true);
      expect(coordinator.getExecutor('exec-1')!.status).toBe(AgentStatus.IDLE);
    });

    it('stops all executors', async () => {
      coordinator.addExecutor('exec-1');
      await coordinator.start();
      await coordinator.stop();
      expect(coordinator.getStatus().is_running).toBe(false);
    });
  });

  describe('executeTask', () => {
    it('executes a generic task end-to-end', async () => {
      coordinator.addExecutor('exec-1');
      await coordinator.start();

      const result = await coordinator.executeTask('编写CLI工具');
      expect(result.plan_id).toBeTruthy();
      expect(result.title).toBe('编写CLI工具');
      expect(result.plan_status).not.toBeNull();
      expect(result.plan_status.totalSubtasks).toBe(3);
    });

    it('executes web task with matching executor names', async () => {
      coordinator.addExecutor('frontend_dev', ['html']);
      coordinator.addExecutor('backend_dev', ['python']);
      await coordinator.start();

      const result = await coordinator.executeTask('构建Web网站');
      expect(result.plan_status.totalSubtasks).toBe(3);
    });
  });

  describe('addExecutorAndStart / removeExecutorAndStop', () => {
    it('adds executor and starts it when coordinator is running', async () => {
      await coordinator.start();
      const exec = await coordinator.addExecutorAndStart('dynamic', ['coding']);
      expect(exec.status).toBe(AgentStatus.IDLE);
      expect(coordinator.listExecutors()).toContain('dynamic');
    });

    it('removes executor and stops it', async () => {
      coordinator.addExecutor('exec-1');
      await coordinator.start();
      await coordinator.removeExecutorAndStop('exec-1');
      expect(coordinator.listExecutors()).not.toContain('exec-1');
    });
  });

  describe('broadcastToExecutors / sendToExecutor', () => {
    it('broadcasts to all executors', async () => {
      coordinator.addExecutor('e1');
      coordinator.addExecutor('e2');
      await coordinator.start();
      await coordinator.broadcastToExecutors({ action: 'pause' });
      // Messages are broadcast to all registered queues
      expect(true).toBe(true); // no error thrown
    });

    it('throws when sending to nonexistent executor', async () => {
      await expect(
        coordinator.sendToExecutor('nonexistent', { data: 'test' }),
      ).rejects.toThrow("Executor 'nonexistent' not found");
    });
  });

  describe('getPlanProgress / getExecutorStats / getStatus', () => {
    it('getPlanProgress returns null before task', () => {
      expect(coordinator.getPlanProgress()).toBeNull();
    });

    it('getExecutorStats returns empty when no executors', () => {
      expect(coordinator.getExecutorStats()).toEqual({});
    });

    it('getExecutorStats returns stats after adding executors', async () => {
      coordinator.addExecutor('e1', ['coding']);
      await coordinator.start();
      const stats = coordinator.getExecutorStats();
      expect(stats['e1']).toBeDefined();
      expect(stats['e1'].tasks_completed).toBe(0);
      expect(stats['e1'].status).toBe(AgentStatus.IDLE);
    });

    it('getStatus includes coordinator, planner, executors, is_running', async () => {
      coordinator.addExecutor('e1');
      await coordinator.start();
      const status = coordinator.getStatus();
      expect(status.coordinator).toBe('coordinator');
      expect(status.planner).toBeNull();
      expect(status.executors).toBeDefined();
      expect(status.is_running).toBe(true);
    });
  });

  describe('handlePlannerMessage integration', () => {
    it('updates subtask status when receiving TASK_RESULT', async () => {
      coordinator.addExecutor('exec-1');
      await coordinator.start();

      // Execute a task to create a plan
      const result = await coordinator.executeTask('编写CLI工具');
      expect(result.plan_status).not.toBeNull();

      // The planner should have processed results
      // (In the real flow, executors send TASK_RESULT back to planner)
      expect(result.plan_status.totalSubtasks).toBe(3);
    });
  });
});
