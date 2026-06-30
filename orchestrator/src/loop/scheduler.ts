/**
 * Scheduler — 任务调度与优先级排序
 * 
 * 将扫描到的 issues 分类、去重、排优先级，生成可执行的任务计划。
 */
import type { Issue } from './persistence.js';

export interface Task {
  id: string;
  issueIds: string[];       // 关联的 issue IDs（可能多个 issue 合并为一个任务）
  type: 'fix' | 'refactor' | 'test' | 'optimize' | 'feature';
  priority: number;         // 1 = 最高
  title: string;
  description: string;
  files: string[];          // 涉及的文件
  agentType: string;        // 应该用哪种 agent 来修复
  estimatedTokens: number;  // 预估 token 消耗
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
}

export interface ExecutionPlan {
  tasks: Task[];
  totalEstimatedTokens: number;
  createdAt: string;
}

// ====== 优先级规则 ======
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 100,
  high: 50,
  medium: 20,
  low: 5,
};

const TYPE_WEIGHT: Record<string, number> = {
  bug: 80,
  security: 90,
  test: 40,
  perf: 30,
  refactor: 15,
  feature: 10,
  lint: 10,
};

// ====== Agent 类型映射 ======
const AGENT_MAP: Record<string, string> = {
  'bug:critical': 'bugfix',
  'bug:high': 'bugfix',
  'bug:medium': 'bugfix',
  'security:critical': 'security',
  'security:high': 'security',
  'test:high': 'test-generator',
  'test:medium': 'test-generator',
  'perf:medium': 'optimizer',
  'refactor:medium': 'refactor',
  'refactor:low': 'refactor',
  'lint:low': 'refactor',
};

function getAgentType(type: string, severity: string): string {
  return AGENT_MAP[`${type}:${severity}`] || 'general';
}

function estimateTokens(issue: Issue): number {
  // 基于问题类型和严重程度估算
  const base: Record<string, number> = {
    bug: 3000,
    security: 4000,
    test: 2000,
    perf: 3000,
    refactor: 2000,
    feature: 5000,
    lint: 1000,
  };
  const severityMultiplier: Record<string, number> = {
    critical: 2,
    high: 1.5,
    medium: 1,
    low: 0.5,
  };
  return (base[issue.type] || 2000) * (severityMultiplier[issue.severity] || 1);
}

// ====== 去重与合并 ======

function deduplicateIssues(issues: Issue[]): Map<string, Issue[]> {
  // 按文件分组，同一文件的多个问题可能合并为一个任务
  const byFile = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issue.file;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(issue);
  }
  return byFile;
}

// ====== 生成执行计划 ======

export function createExecutionPlan(issues: Issue[], tokenBudget: number = 500000): ExecutionPlan {
  const tasks: Task[] = [];
  const grouped = deduplicateIssues(issues);
  let taskId = 0;

  for (const [file, fileIssues] of grouped) {
    // 按严重程度排序
    fileIssues.sort((a, b) => {
      const sa = SEVERITY_WEIGHT[a.severity] || 0;
      const sb = SEVERITY_WEIGHT[b.severity] || 0;
      return sb - sa;
    });

    // 同类型的问题合并为一个任务
    const byType = new Map<string, Issue[]>();
    for (const issue of fileIssues) {
      const key = issue.type;
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key)!.push(issue);
    }

    for (const [type, typeIssues] of byType) {
      const highestSeverity = typeIssues[0].severity;
      const priority = (SEVERITY_WEIGHT[highestSeverity] || 0) + (TYPE_WEIGHT[type] || 0);
      const agentType = getAgentType(type, highestSeverity);
      const estimatedTokens = typeIssues.reduce((sum, i) => sum + estimateTokens(i), 0);

      tasks.push({
        id: `task-${++taskId}`,
        issueIds: typeIssues.map(i => i.id),
        type: type === 'security' ? 'fix' : (type === 'lint' ? 'refactor' : type) as Task['type'],
        priority,
        title: `[${type}:${highestSeverity}] ${file} — ${typeIssues.length} 个问题`,
        description: typeIssues.map(i => `- ${i.description}`).join('\n'),
        files: [file, ...typeIssues.flatMap(i => i.file !== file ? [i.file] : [])],
        agentType,
        estimatedTokens,
        status: 'pending',
      });
    }
  }

  // 按优先级排序
  tasks.sort((a, b) => b.priority - a.priority);

  // Token 预算裁剪
  let totalTokens = 0;
  for (const task of tasks) {
    if (totalTokens + task.estimatedTokens > tokenBudget) {
      task.status = 'skipped';
    } else {
      totalTokens += task.estimatedTokens;
    }
  }

  return {
    tasks,
    totalEstimatedTokens: totalTokens,
    createdAt: new Date().toISOString(),
  };
}

// ====== 调度决策 ======

export function getNextTask(plan: ExecutionPlan): Task | null {
  return plan.tasks.find(t => t.status === 'pending') || null;
}

export function markTaskDone(plan: ExecutionPlan, taskId: string): void {
  const task = plan.tasks.find(t => t.id === taskId);
  if (task) task.status = 'done';
}

export function markTaskFailed(plan: ExecutionPlan, taskId: string): void {
  const task = plan.tasks.find(t => t.id === taskId);
  if (task) task.status = 'failed';
}

export function getPlanSummary(plan: ExecutionPlan): string {
  const byStatus = {
    pending: plan.tasks.filter(t => t.status === 'pending').length,
    running: plan.tasks.filter(t => t.status === 'running').length,
    done: plan.tasks.filter(t => t.status === 'done').length,
    failed: plan.tasks.filter(t => t.status === 'failed').length,
    skipped: plan.tasks.filter(t => t.status === 'skipped').length,
  };
  return `Tasks: ${plan.tasks.length} total | ${byStatus.done} done, ${byStatus.failed} failed, ${byStatus.pending} pending, ${byStatus.skipped} skipped | Budget: ${plan.totalEstimatedTokens} tokens`;
}
