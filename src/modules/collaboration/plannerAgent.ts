/**
 * PlannerAgent - task decomposition and planning.
 * Ported from Python mock-sso/collaboration/planner_agent.py
 */

import {
  CommunicationManager,
  InMemoryCommunication,
  MessageType,
  createMessage,
} from './communication';
import {
  TaskStatus,
  TaskPriority,
  type SubTask,
  type TaskPlan,
  type PlanStatus,
  type ReviewFeedback,
  createSubTask,
  createTaskPlan,
} from './plannerAgent.types';

// Re-export types for external consumers
export {
  TaskStatus,
  TaskPriority,
  type SubTask,
  type TaskPlan,
  type PlanStatus,
  type ReviewFeedback,
  createSubTask,
  createTaskPlan,
} from './plannerAgent.types';

// ──────────────────── PlannerAgent ────────────────────

export class PlannerAgent {
  name: string;
  communication: InMemoryCommunication | null;
  communicationManager: CommunicationManager | null;
  currentPlan: TaskPlan | null;
  private _childAgents: Map<string, any>;

  constructor(
    name: string = 'planner',
    communication?: InMemoryCommunication,
    communicationManager?: CommunicationManager,
  ) {
    this.name = name;
    this.communication = communication ?? null;
    this.communicationManager = communicationManager ?? null;
    this.currentPlan = null;
    this._childAgents = new Map();
  }

  get agentId(): string {
    return this.name;
  }

  async planTask(taskDescription: string, context?: Record<string, any>): Promise<TaskPlan> {
    const subtasks = this._decomposeTask(taskDescription, context);
    this.currentPlan = createTaskPlan({
      title: taskDescription.slice(0, 100),
      description: taskDescription,
      subtasks,
      status: TaskStatus.PLANNING,
    });
    return this.currentPlan;
  }

  private _decomposeTask(taskDescription: string, context?: Record<string, any>): SubTask[] {
    const subtasks: SubTask[] = [];
    const keywords = taskDescription.toLowerCase();

    if (
      keywords.includes('网站') ||
      keywords.includes('web') ||
      keywords.includes('前端')
    ) {
      const frontend = createSubTask({
        name: '前端开发',
        description: '负责前端界面和交互开发',
        priority: TaskPriority.HIGH,
        acceptanceCriteria: [
          '页面布局符合设计稿',
          '交互功能正常响应',
          '兼容主流浏览器',
        ],
        requiredSkills: ['frontend', 'html', 'css', 'javascript'],
        inputSpec: { name: '设计稿', type: 'dict', description: 'UI设计稿和交互规格' },
        outputSpec: { name: '前端代码', type: 'str', description: '前端页面代码和静态资源' },
      });
      const backend = createSubTask({
        name: '后端开发',
        description: '负责后端API和数据处理',
        priority: TaskPriority.HIGH,
        acceptanceCriteria: [
          'API接口返回格式正确',
          '数据校验和错误处理完善',
          '接口响应时间符合要求',
        ],
        requiredSkills: ['backend', 'python', 'database', 'api'],
        inputSpec: { name: 'API规格', type: 'dict', description: '接口定义和数据模型' },
        outputSpec: { name: '后端代码', type: 'str', description: '后端API服务代码' },
      });
      const test = createSubTask({
        name: '测试',
        description: '负责功能测试和集成测试',
        priority: TaskPriority.MEDIUM,
        dependencies: [frontend.id, backend.id],
        acceptanceCriteria: [
          '所有功能测试用例通过',
          '无严重级别缺陷',
          '集成测试覆盖核心流程',
        ],
        requiredSkills: ['testing', 'qa'],
        inputSpec: { name: '测试需求', type: 'dict', description: '前端和后端代码及测试需求' },
        outputSpec: { name: '测试报告', type: 'str', description: '测试结果和缺陷报告' },
      });
      subtasks.push(frontend, backend, test);
    } else if (keywords.includes('数据分析') || keywords.includes('data')) {
      const collect = createSubTask({
        name: '数据收集',
        description: '收集和整理数据',
        priority: TaskPriority.HIGH,
        acceptanceCriteria: [
          '数据来源明确且可追溯',
          '数据格式统一规范',
          '数据量满足分析需求',
        ],
        requiredSkills: ['data', 'python', 'etl'],
        inputSpec: { name: '数据需求', type: 'dict', description: '数据来源和采集范围' },
        outputSpec: { name: '原始数据', type: 'str', description: '整理后的结构化数据集' },
      });
      const process = createSubTask({
        name: '数据处理',
        description: '清洗和处理数据',
        priority: TaskPriority.HIGH,
        dependencies: [collect.id],
        acceptanceCriteria: [
          '缺失值已合理填充或剔除',
          '异常值已识别并处理',
          '数据质量报告已生成',
        ],
        requiredSkills: ['data', 'python', 'pandas'],
        inputSpec: { name: '原始数据', type: 'str', description: '收集到的原始数据集' },
        outputSpec: { name: '清洗数据', type: 'str', description: '清洗处理后的数据集' },
      });
      const analyze = createSubTask({
        name: '数据分析',
        description: '分析数据并生成报告',
        priority: TaskPriority.MEDIUM,
        dependencies: [process.id],
        acceptanceCriteria: [
          '分析结论有数据支撑',
          '可视化图表清晰准确',
          '报告结构完整',
        ],
        requiredSkills: ['data', 'python', 'statistics', 'visualization'],
        inputSpec: { name: '清洗数据', type: 'str', description: '清洗后的数据集' },
        outputSpec: { name: '分析报告', type: 'str', description: '数据分析报告和可视化图表' },
      });
      subtasks.push(collect, process, analyze);
    } else {
      const analysis = createSubTask({
        name: '任务分析',
        description: '分析任务需求和目标',
        priority: TaskPriority.HIGH,
        acceptanceCriteria: [
          '需求清单完整无遗漏',
          '技术方案可行',
          '任务拆分合理',
        ],
        requiredSkills: ['analysis'],
        inputSpec: { name: '任务描述', type: 'str', description: '原始任务描述和上下文' },
        outputSpec: { name: '分析文档', type: 'str', description: '需求分析和技术方案' },
      });
      const execution = createSubTask({
        name: '任务执行',
        description: '执行具体任务',
        priority: TaskPriority.HIGH,
        dependencies: [analysis.id],
        acceptanceCriteria: [
          '功能实现符合需求',
          '代码质量达标',
          '无阻塞性问题',
        ],
        requiredSkills: ['coding'],
        inputSpec: { name: '分析文档', type: 'str', description: '需求分析和技术方案' },
        outputSpec: { name: '实现代码', type: 'str', description: '任务实现的代码和产出物' },
      });
      const verification = createSubTask({
        name: '结果验证',
        description: '验证任务结果',
        priority: TaskPriority.MEDIUM,
        dependencies: [execution.id],
        acceptanceCriteria: [
          '所有验收标准通过',
          '无遗留缺陷',
          '文档齐全',
        ],
        requiredSkills: ['testing', 'qa'],
        inputSpec: { name: '实现代码', type: 'str', description: '任务实现的代码和产出物' },
        outputSpec: { name: '验证报告', type: 'str', description: '验证结果和通过/不通过结论' },
      });
      subtasks.push(analysis, execution, verification);
    }

    return subtasks;
  }

  registerChildAgent(agentId: string, agent: any): void {
    this._childAgents.set(agentId, agent);
  }

  getAvailableAgents(): string[] {
    return Array.from(this._childAgents.keys());
  }

  async assignTasks(): Promise<Record<string, string[]>> {
    if (!this.currentPlan) {
      throw new Error('No current plan to assign tasks');
    }

    const assignments: Record<string, string[]> = {};
    const availableAgents = this.getAvailableAgents();

    if (availableAgents.length === 0) {
      throw new Error('No child agents available for task assignment');
    }

    for (const subtask of this.currentPlan.subtasks) {
      if (subtask.status !== TaskStatus.PENDING) continue;

      if (subtask.dependencies.length > 0) {
        const depsCompleted = subtask.dependencies.every((depId) => {
          const dep = this._getSubtask(depId);
          return dep && dep.status === TaskStatus.COMPLETED;
        });
        if (!depsCompleted) continue;
      }

      const agentId = this._selectAgentForTask(subtask, availableAgents);
      subtask.assignedTo = agentId;
      subtask.status = TaskStatus.ASSIGNED;

      if (!assignments[agentId]) {
        assignments[agentId] = [];
      }
      assignments[agentId].push(subtask.id);

      if (this.communicationManager) {
        const message = createMessage({
          type: MessageType.TASK_DELEGATION,
          sender: this.name,
          receiver: agentId,
          content: {
            task_id: subtask.id,
            task_name: subtask.name,
            description: subtask.description,
            priority: subtask.priority,
            acceptance_criteria: subtask.acceptanceCriteria,
            required_skills: subtask.requiredSkills,
            input_spec: subtask.inputSpec,
            output_spec: subtask.outputSpec,
          },
          taskId: this.currentPlan.id,
        });
        this.communicationManager.sendMessage(message);
      }
    }

    return assignments;
  }

  private _selectAgentForTask(subtask: SubTask, availableAgents: string[]): string {
    if (availableAgents.length === 0) {
      throw new Error('No available agents');
    }

    const taskKeywords = `${subtask.name} ${subtask.description}`.toLowerCase();

    if (taskKeywords.includes('前端') || taskKeywords.includes('frontend')) {
      for (const agentId of availableAgents) {
        if (agentId.toLowerCase().includes('frontend') || agentId.includes('前端'))
          return agentId;
      }
    }

    if (taskKeywords.includes('后端') || taskKeywords.includes('backend')) {
      for (const agentId of availableAgents) {
        if (agentId.toLowerCase().includes('backend') || agentId.includes('后端'))
          return agentId;
      }
    }

    if (taskKeywords.includes('测试') || taskKeywords.includes('test')) {
      for (const agentId of availableAgents) {
        if (agentId.toLowerCase().includes('test') || agentId.includes('测试'))
          return agentId;
      }
    }

    return availableAgents[0];
  }

  private _getSubtask(subtaskId: string): SubTask | null {
    if (!this.currentPlan) return null;
    return this.currentPlan.subtasks.find((s) => s.id === subtaskId) ?? null;
  }

  async updateSubtaskStatus(
    subtaskId: string,
    status: TaskStatus,
    result?: any,
    error?: string,
  ): Promise<void> {
    const subtask = this._getSubtask(subtaskId);
    if (!subtask) {
      throw new Error(`Subtask ${subtaskId} not found`);
    }

    subtask.status = status;
    if (result !== undefined) subtask.result = result;
    if (error) subtask.error = error;

    if (status === TaskStatus.RUNNING) {
      subtask.startedAt = new Date();
    } else if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      subtask.completedAt = new Date();
    }

    if (this.currentPlan) {
      const allCompleted = this.currentPlan.subtasks.every(
        (s) =>
          s.status === TaskStatus.COMPLETED ||
          s.status === TaskStatus.FAILED ||
          s.status === TaskStatus.CANCELLED,
      );
      if (allCompleted) {
        this.currentPlan.status = TaskStatus.COMPLETED;
        this.currentPlan.completedAt = new Date();
      }
    }
  }

  getPlanStatus(): PlanStatus | null {
    if (!this.currentPlan) return null;

    const total = this.currentPlan.subtasks.length;
    const completed = this.currentPlan.subtasks.filter(
      (s) => s.status === TaskStatus.COMPLETED,
    ).length;
    const failed = this.currentPlan.subtasks.filter(
      (s) => s.status === TaskStatus.FAILED,
    ).length;
    const running = this.currentPlan.subtasks.filter(
      (s) => s.status === TaskStatus.RUNNING,
    ).length;
    const pending = this.currentPlan.subtasks.filter(
      (s) => s.status === TaskStatus.PENDING,
    ).length;

    return {
      planId: this.currentPlan.id,
      title: this.currentPlan.title,
      status: this.currentPlan.status,
      totalSubtasks: total,
      completed,
      failed,
      running,
      pending,
      progress: total > 0 ? completed / total : 0,
    };
  }

  async executePlan(): Promise<Record<string, any>> {
    if (!this.currentPlan) {
      throw new Error('No current plan to execute');
    }

    this.currentPlan.status = TaskStatus.RUNNING;
    const results: Record<string, any> = {};

    while (true) {
      const assignments = await this.assignTasks();

      if (Object.keys(assignments).length === 0) {
        const allDone = this.currentPlan.subtasks.every(
          (s) =>
            s.status === TaskStatus.COMPLETED ||
            s.status === TaskStatus.FAILED ||
            s.status === TaskStatus.CANCELLED,
        );
        if (allDone) break;
        // In TS (single-threaded), we need to yield to allow message handlers to run
        await new Promise((r) => setTimeout(r, 10));
        continue;
      }

      await new Promise((r) => setTimeout(r, 10));
    }

    for (const subtask of this.currentPlan.subtasks) {
      results[subtask.id] = {
        name: subtask.name,
        status: subtask.status,
        result: subtask.result,
        error: subtask.error,
      };
    }

    return results;
  }

  generateReviewFeedback(
    task: SubTask,
    output: string,
    context?: Record<string, any>,
  ): ReviewFeedback {
    const ctx = context ?? {};
    const issues: ReviewFeedback['issues'] = [];
    const outputLower = (output ?? '').toLowerCase();

    if (!task.acceptanceCriteria || task.acceptanceCriteria.length === 0) {
      if (!output || !output.trim()) {
        issues.push({
          type: 'missing_feature',
          location: task.name,
          detail: '产出为空',
          suggestion: '请提供完整的产出内容',
        });
      }
    }

    for (const criterion of task.acceptanceCriteria) {
      const criterionLower = criterion.toLowerCase();
      const keywords = criterionLower
        .replace(/[，。和与以及]/g, ',')
        .split(',')
        .map((kw) => kw.trim())
        .filter(Boolean);

      let criterionMet = false;

      if (!output || !output.trim()) {
        issues.push({
          type: 'missing_feature',
          location: task.name,
          detail: `产出为空，无法验证: ${criterion}`,
          suggestion: '请提供完整的产出内容',
        });
        continue;
      }

      const matchedKeywords = keywords.filter((kw) => outputLower.includes(kw)).length;
      if (keywords.length > 0 && matchedKeywords >= keywords.length * 0.5) {
        criterionMet = true;
      }

      if (
        !criterionMet &&
        !criterionLower.includes('错误') &&
        !criterionLower.includes('缺陷')
      ) {
        if (output.trim().length > 50) {
          criterionMet = true;
        }
      }

      if (!criterionMet) {
        let issueType = 'missing_feature';
        if (criterionLower.includes('性能') || criterionLower.includes('响应时间')) {
          issueType = 'performance';
        } else if (criterionLower.includes('格式') || criterionLower.includes('规范')) {
          issueType = 'style_issue';
        } else if (criterionLower.includes('逻辑') || criterionLower.includes('正确')) {
          issueType = 'logic_error';
        }

        issues.push({
          type: issueType,
          location: task.name,
          detail: `未满足验收标准: ${criterion}`,
          suggestion: `请确保产出满足: ${criterion}`,
        });
      }
    }

    const hasCritical = issues.some(
      (issue) => issue.type === 'logic_error' || issue.type === 'missing_feature',
    );

    const status: ReviewFeedback['status'] =
      issues.length > 0 && hasCritical ? 'revision_required' : 'approved';

    let overallComment: string;
    if (issues.length === 0) {
      overallComment = `任务「${task.name}」验收通过，产出符合所有验收标准。`;
    } else if (status === 'approved') {
      overallComment = `任务「${task.name}」基本达标，存在 ${issues.length} 个非关键问题，建议后续优化。`;
    } else {
      overallComment = `任务「${task.name}」需要修改，发现 ${issues.length} 个问题需要解决。`;
    }

    const currentIteration = (ctx as any).currentIteration ?? 1;

    return {
      status,
      issues,
      maxIterations: 3,
      currentIteration,
      overallComment,
    };
  }
}
