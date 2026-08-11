import { describe, it, expect, beforeEach } from 'vitest';
import {
  PlannerAgent,
  TaskStatus,
  TaskPriority,
  SubTask,
  TaskPlan,
} from '../../collaboration/plannerAgent';
import {
  CommunicationManager,
  InMemoryCommunication,
  MessageType,
  createMessage,
} from '../../collaboration/communication';

describe('PlannerAgent', () => {
  let planner: PlannerAgent;

  beforeEach(() => {
    planner = new PlannerAgent('test_planner');
  });

  describe('planTask', () => {
    it('decomposes web/frontend task into frontend + backend + test subtasks', async () => {
      const plan = await planner.planTask('构建一个Web网站');
      expect(plan.title).toBe('构建一个Web网站');
      expect(plan.status).toBe(TaskStatus.PLANNING);
      expect(plan.subtasks).toHaveLength(3);
      expect(plan.subtasks[0].name).toBe('前端开发');
      expect(plan.subtasks[1].name).toBe('后端开发');
      expect(plan.subtasks[2].name).toBe('测试');
      expect(plan.subtasks[2].dependencies).toContain(plan.subtasks[0].id);
      expect(plan.subtasks[2].dependencies).toContain(plan.subtasks[1].id);
    });

    it('decomposes data analysis task into 3 subtasks', async () => {
      const plan = await planner.planTask('数据分析报告');
      expect(plan.subtasks).toHaveLength(3);
      expect(plan.subtasks[0].name).toBe('数据收集');
      expect(plan.subtasks[1].name).toBe('数据处理');
      expect(plan.subtasks[2].name).toBe('数据分析');
      expect(plan.subtasks[1].dependencies).toContain(plan.subtasks[0].id);
      expect(plan.subtasks[2].dependencies).toContain(plan.subtasks[1].id);
    });

    it('decomposes generic task into analysis + execution + verification', async () => {
      const plan = await planner.planTask('编写一个CLI工具');
      expect(plan.subtasks).toHaveLength(3);
      expect(plan.subtasks[0].name).toBe('任务分析');
      expect(plan.subtasks[1].name).toBe('任务执行');
      expect(plan.subtasks[2].name).toBe('结果验证');
    });

    it('recognizes "web" keyword', async () => {
      const plan = await planner.planTask('Build a web app');
      expect(plan.subtasks[0].name).toBe('前端开发');
    });

    it('recognizes "前端" keyword', async () => {
      const plan = await planner.planTask('前端页面开发');
      expect(plan.subtasks[0].name).toBe('前端开发');
    });

    it('sets currentPlan', async () => {
      await planner.planTask('test');
      expect(planner.currentPlan).not.toBeNull();
    });

    it('subtasks have acceptance criteria', async () => {
      const plan = await planner.planTask('web project');
      for (const st of plan.subtasks) {
        expect(st.acceptanceCriteria.length).toBeGreaterThan(0);
      }
    });

    it('subtasks have required skills', async () => {
      const plan = await planner.planTask('web project');
      expect(plan.subtasks[0].requiredSkills).toContain('frontend');
      expect(plan.subtasks[1].requiredSkills).toContain('backend');
    });

    it('subtasks have input/output specs', async () => {
      const plan = await planner.planTask('web project');
      expect(plan.subtasks[0].inputSpec.name).toBeTruthy();
      expect(plan.subtasks[0].outputSpec.name).toBeTruthy();
    });
  });

  describe('registerChildAgent / getAvailableAgents', () => {
    it('registers and lists child agents', () => {
      planner.registerChildAgent('exec-1', {});
      planner.registerChildAgent('exec-2', {});
      expect(planner.getAvailableAgents()).toEqual(['exec-1', 'exec-2']);
    });
  });

  describe('assignTasks', () => {
    it('throws if no current plan', async () => {
      await expect(planner.assignTasks()).rejects.toThrow('No current plan to assign tasks');
    });

    it('throws if no child agents', async () => {
      await planner.planTask('generic task');
      await expect(planner.assignTasks()).rejects.toThrow(
        'No child agents available for task assignment',
      );
    });

    it('assigns pending subtasks with no dependencies', async () => {
      await planner.planTask('编写CLI工具');
      planner.registerChildAgent('exec-1', {});
      const assignments = await planner.assignTasks();
      expect(assignments['exec-1']).toBeDefined();
      // First subtask (任务分析) has no deps, should be assigned
      expect(assignments['exec-1'].length).toBeGreaterThanOrEqual(1);
    });

    it('skips subtasks with unmet dependencies', async () => {
      await planner.planTask('编写CLI工具');
      planner.registerChildAgent('exec-1', {});
      const assignments = await planner.assignTasks();
      // Only first subtask should be assigned (others have deps)
      const allAssignedIds = Object.values(assignments).flat();
      expect(allAssignedIds).toHaveLength(1);
    });

    it('sends TASK_DELEGATION messages via CommunicationManager', async () => {
      const comm = new InMemoryCommunication();
      const manager = new CommunicationManager(comm);
      manager.registerAgent('planner');
      manager.registerAgent('exec-1');
      const p = new PlannerAgent('planner', comm, manager);
      await p.planTask('编写CLI工具');
      p.registerChildAgent('exec-1', {});
      await p.assignTasks();
      expect(manager.hasMessages('exec-1')).toBe(true);
    });
  });

  describe('updateSubtaskStatus', () => {
    it('updates subtask status', async () => {
      await planner.planTask('编写CLI工具');
      const subtaskId = planner.currentPlan!.subtasks[0].id;
      await planner.updateSubtaskStatus(subtaskId, TaskStatus.RUNNING);
      expect(planner.currentPlan!.subtasks[0].status).toBe(TaskStatus.RUNNING);
      expect(planner.currentPlan!.subtasks[0].startedAt).toBeInstanceOf(Date);
    });

    it('sets completedAt on COMPLETED', async () => {
      await planner.planTask('编写CLI工具');
      const subtaskId = planner.currentPlan!.subtasks[0].id;
      await planner.updateSubtaskStatus(subtaskId, TaskStatus.COMPLETED, 'result');
      expect(planner.currentPlan!.subtasks[0].completedAt).toBeInstanceOf(Date);
      expect(planner.currentPlan!.subtasks[0].result).toBe('result');
    });

    it('marks plan as COMPLETED when all subtasks are terminal', async () => {
      await planner.planTask('编写CLI工具');
      for (const st of planner.currentPlan!.subtasks) {
        await planner.updateSubtaskStatus(st.id, TaskStatus.COMPLETED);
      }
      expect(planner.currentPlan!.status).toBe(TaskStatus.COMPLETED);
      expect(planner.currentPlan!.completedAt).toBeInstanceOf(Date);
    });

    it('throws for nonexistent subtask', async () => {
      await planner.planTask('test');
      await expect(
        planner.updateSubtaskStatus('nonexistent', TaskStatus.COMPLETED),
      ).rejects.toThrow('Subtask nonexistent not found');
    });
  });

  describe('getPlanStatus', () => {
    it('returns null if no plan', () => {
      expect(planner.getPlanStatus()).toBeNull();
    });

    it('returns correct status counts', async () => {
      await planner.planTask('编写CLI工具');
      const status = planner.getPlanStatus()!;
      expect(status.totalSubtasks).toBe(3);
      expect(status.pending).toBe(3);
      expect(status.completed).toBe(0);
      expect(status.progress).toBe(0);
    });

    it('updates progress after completing subtasks', async () => {
      await planner.planTask('编写CLI工具');
      const stId = planner.currentPlan!.subtasks[0].id;
      await planner.updateSubtaskStatus(stId, TaskStatus.COMPLETED);
      const status = planner.getPlanStatus()!;
      expect(status.completed).toBe(1);
      expect(status.pending).toBe(2);
      expect(status.progress).toBeCloseTo(1 / 3);
    });
  });

  describe('generateReviewFeedback', () => {
    it('approves when output matches criteria', () => {
      const task: SubTask = {
        id: 't1', name: 'Build UI', description: '',
        status: TaskStatus.PENDING, priority: TaskPriority.HIGH,
        assignedTo: null, dependencies: [], result: null, error: null,
        createdAt: new Date(), startedAt: null, completedAt: null,
        acceptanceCriteria: ['页面布局, 设计稿'],
        requiredSkills: [], inputSpec: {}, outputSpec: {},
      };
      const feedback = planner.generateReviewFeedback(
        task,
        '页面布局已经按照设计稿完成，布局正确',
      );
      expect(feedback.status).toBe('approved');
    });

    it('returns revision_required when output is empty', () => {
      const task: SubTask = {
        id: 't1', name: 'Build UI', description: '',
        status: TaskStatus.PENDING, priority: TaskPriority.HIGH,
        assignedTo: null, dependencies: [], result: null, error: null,
        createdAt: new Date(), startedAt: null, completedAt: null,
        acceptanceCriteria: ['页面布局'],
        requiredSkills: [], inputSpec: {}, outputSpec: {},
      };
      const feedback = planner.generateReviewFeedback(task, '');
      expect(feedback.status).toBe('revision_required');
      expect(feedback.issues.length).toBeGreaterThan(0);
    });

    it('handles empty acceptance criteria', () => {
      const task: SubTask = {
        id: 't1', name: 'Test', description: '',
        status: TaskStatus.PENDING, priority: TaskPriority.MEDIUM,
        assignedTo: null, dependencies: [], result: null, error: null,
        createdAt: new Date(), startedAt: null, completedAt: null,
        acceptanceCriteria: [], requiredSkills: [], inputSpec: {}, outputSpec: {},
      };
      const feedback = planner.generateReviewFeedback(task, 'done');
      expect(feedback.status).toBe('approved');
    });

    it('sets maxIterations to 3', () => {
      const task: SubTask = {
        id: 't1', name: 'Test', description: '',
        status: TaskStatus.PENDING, priority: TaskPriority.MEDIUM,
        assignedTo: null, dependencies: [], result: null, error: null,
        createdAt: new Date(), startedAt: null, completedAt: null,
        acceptanceCriteria: [], requiredSkills: [], inputSpec: {}, outputSpec: {},
      };
      expect(planner.generateReviewFeedback(task, 'ok').maxIterations).toBe(3);
    });
  });
});
