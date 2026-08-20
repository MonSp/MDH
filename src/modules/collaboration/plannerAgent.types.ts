/**
 * PlannerAgent types, enums, and factory helpers.
 * Extracted from plannerAgent.ts for reduced file size.
 */

import { randomUUID } from 'crypto';

// ──────────────────── Enums ────────────────────

export enum TaskStatus {
  PENDING = 'pending',
  PLANNING = 'planning',
  ASSIGNED = 'assigned',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}

// ──────────────────── Types ────────────────────

export interface SubTask {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo: string | null;
  dependencies: string[];
  result: any;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  acceptanceCriteria: string[];
  requiredSkills: string[];
  inputSpec: Record<string, string>;
  outputSpec: Record<string, string>;
}

export interface TaskPlan {
  id: string;
  title: string;
  description: string;
  subtasks: SubTask[];
  status: TaskStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export interface PlanStatus {
  planId: string;
  title: string;
  status: string;
  totalSubtasks: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  progress: number;
}

export interface ReviewFeedback {
  status: 'approved' | 'revision_required';
  issues: Array<{
    type: string;
    location: string;
    detail: string;
    suggestion: string;
  }>;
  maxIterations: number;
  currentIteration: number;
  overallComment: string;
}

// ──────────────────── Factory helpers ────────────────────

export function createSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: randomUUID().replace(/-/g, ''),
    name: '',
    description: '',
    status: TaskStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    assignedTo: null,
    dependencies: [],
    result: null,
    error: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    acceptanceCriteria: [],
    requiredSkills: [],
    inputSpec: {},
    outputSpec: {},
    ...overrides,
  };
}

export function createTaskPlan(overrides: Partial<TaskPlan> = {}): TaskPlan {
  return {
    id: randomUUID().replace(/-/g, ''),
    title: '',
    description: '',
    subtasks: [],
    status: TaskStatus.PLANNING,
    createdAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}
