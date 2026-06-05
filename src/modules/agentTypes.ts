export enum AgentRole {
  CEO = 'ceo',
  Planner = 'planner',
  Executor = 'executor',
  Monitor = 'monitor',
  Reviewer = 'reviewer',
  Coordinator = 'coordinator',
}

export enum AgentCapability {
  TaskDecomposition = 'task_decomposition',
  CodeGeneration = 'code_generation',
  CodeReview = 'code_review',
  Testing = 'testing',
  BrowserAutomation = 'browser_automation',
  FileOperation = 'file_operation',
  WebSearch = 'web_search',
  DataAnalysis = 'data_analysis',
  Documentation = 'documentation',
  Monitoring = 'monitoring',
}

export interface AgentModelConfig {
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface AgentConfig {
  id: string
  name: string
  role: AgentRole
  capabilities: AgentCapability[]
  model: AgentModelConfig
  maxConcurrentTasks: number
  timeout: number
  retryPolicy: {
    maxRetries: number
    backoffMs: number
  }
  metadata: Record<string, unknown>
  roleProfile?: AgentRoleProfile
}

export interface AgentInstance {
  id: string
  configId: string
  status: AgentInstanceStatus
  currentTaskId: string | null
  startedAt: number
  lastActiveAt: number
  completedTaskCount: number
  failedTaskCount: number
  skillId?: string | null
  skillPath?: string | null
}

export enum AgentInstanceStatus {
  Idle = 'idle',
  Busy = 'busy',
  Waiting = 'waiting',
  Error = 'error',
  Offline = 'offline',
}

export interface AgentRegistry {
  configs: Map<string, AgentConfig>
  instances: Map<string, AgentInstance>
}

export function createAgentConfig(
  name: string,
  role: AgentRole,
  capabilities: AgentCapability[],
  model: AgentModelConfig,
  options?: Partial<Omit<AgentConfig, 'id' | 'name' | 'role' | 'capabilities' | 'model'>>,
): AgentConfig {
  return {
    id: crypto.randomUUID(),
    name,
    role,
    capabilities,
    model,
    maxConcurrentTasks: options?.maxConcurrentTasks ?? 1,
    timeout: options?.timeout ?? 300_000,
    retryPolicy: options?.retryPolicy ?? { maxRetries: 3, backoffMs: 1000 },
    metadata: options?.metadata ?? {},
    roleProfile: options?.roleProfile ?? DEFAULT_ROLE_PROFILES[role],
  }
}

export function createAgentInstance(
  configId: string,
  options?: { skillId?: string; skillPath?: string },
): AgentInstance {
  return {
    id: crypto.randomUUID(),
    configId,
    status: AgentInstanceStatus.Idle,
    currentTaskId: null,
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
    completedTaskCount: 0,
    failedTaskCount: 0,
    skillId: options?.skillId ?? null,
    skillPath: options?.skillPath ?? null,
  }
}

export interface AgentRoleProfile {
  avatar: string
  themeColor: string
  gradientColors: [string, string]
  personality: string
  motto: string
  description: string
  specializations: string[]
  emoji: string
}

export const DEFAULT_ROLE_PROFILES: Record<AgentRole, AgentRoleProfile> = {
  [AgentRole.CEO]: {
    avatar: 'ceo',
    themeColor: '#e11d48',
    gradientColors: ['#e11d48', '#f43f5e'],
    personality: '技术视野广阔、决策果断',
    motto: '技术引领，使命必达',
    description: '作为CTO技术总监，分析用户技术需求语义，智能调度开发团队，将任务精准分配给最合适的工程师',
    specializations: ['技术架构', '需求分析', '任务委派', '技术决策'],
    emoji: '👔',
  },
  [AgentRole.Planner]: {
    avatar: 'planner',
    themeColor: '#8b5cf6',
    gradientColors: ['#8b5cf6', '#a78bfa'],
    personality: '系统思维、架构清晰',
    motto: '好的架构是成功的一半',
    description: '负责系统架构设计，将复杂技术需求分解为可执行的开发子任务，定义验收标准和技能标签',
    specializations: ['系统设计', '架构设计', '任务分解', '技术选型'],
    emoji: '🧠',
  },
  [AgentRole.Executor]: {
    avatar: 'executor',
    themeColor: '#f59e0b',
    gradientColors: ['#f59e0b', '#fbbf24'],
    personality: '代码至上、高效交付',
    motto: 'Talk is cheap, show me the code',
    description: '专注于代码实现，精通前后端开发技术，快速高效地完成功能开发和问题修复',
    specializations: ['前端开发', '后端开发', '代码实现', 'Bug修复'],
    emoji: '⚡',
  },
  [AgentRole.Monitor]: {
    avatar: 'monitor',
    themeColor: '#10b981',
    gradientColors: ['#10b981', '#34d399'],
    personality: '运维自动化、持续优化',
    motto: '自动化一切，监控一切',
    description: '负责DevOps运维，管理CI/CD流水线、容器化部署、性能监控和系统调优',
    specializations: ['CI/CD', '容器化部署', '性能监控', '日志分析'],
    emoji: '👁',
  },
  [AgentRole.Reviewer]: {
    avatar: 'reviewer',
    themeColor: '#3b82f6',
    gradientColors: ['#3b82f6', '#60a5fa'],
    personality: '质量第一、严格把关',
    motto: 'Bug止于代码审查',
    description: '负责QA质量保障，进行代码审查、测试用例编写、缺陷分析和质量验收',
    specializations: ['代码审查', '测试编写', '缺陷分析', '质量验收'],
    emoji: '🔍',
  },
  [AgentRole.Coordinator]: {
    avatar: 'coordinator',
    themeColor: '#ec4899',
    gradientColors: ['#ec4899', '#f472b6'],
    personality: '敏捷高效、风险管控',
    motto: '迭代交付，持续改进',
    description: '负责项目管理，协调开发进度、管理任务依赖和风险、跟踪迭代状态',
    specializations: ['进度管理', '风险管控', '依赖协调', '迭代跟踪'],
    emoji: '🎯',
  },
}

export const DEFAULT_AGENT_CONFIGS: Record<AgentRole, Partial<AgentConfig>> = {
  [AgentRole.CEO]: {
    capabilities: [AgentCapability.TaskDecomposition, AgentCapability.DataAnalysis],
    maxConcurrentTasks: 1,
    timeout: 600_000,
  },
  [AgentRole.Planner]: {
    capabilities: [AgentCapability.TaskDecomposition, AgentCapability.DataAnalysis],
    maxConcurrentTasks: 1,
    timeout: 600_000,
  },
  [AgentRole.Executor]: {
    capabilities: [
      AgentCapability.BrowserAutomation,
      AgentCapability.FileOperation,
      AgentCapability.CodeGeneration,
    ],
    maxConcurrentTasks: 3,
    timeout: 300_000,
  },
  [AgentRole.Monitor]: {
    capabilities: [AgentCapability.Monitoring, AgentCapability.DataAnalysis],
    maxConcurrentTasks: 5,
    timeout: 0,
  },
  [AgentRole.Reviewer]: {
    capabilities: [AgentCapability.CodeReview, AgentCapability.Testing],
    maxConcurrentTasks: 2,
    timeout: 300_000,
  },
  [AgentRole.Coordinator]: {
    capabilities: [AgentCapability.TaskDecomposition, AgentCapability.Monitoring],
    maxConcurrentTasks: 1,
    timeout: 0,
  },
}

// ====== 技能进化系统类型 ======

export interface SkillPackage {
  skill_id: string
  name: string
  version: string
  description: string
  base_path: string
  manifest: Record<string, any>
  created_at: string
  required_env: string[]
  dependencies: string[]
}

export interface Project {
  project_id: string
  name: string
  status: 'created' | 'instantiating' | 'running' | 'archiving' | 'archived' | 'failed'
  brief: Record<string, any>
  created_at: string
  skill_packages: Array<{ skill_id: string; name: string }>
  employees: EmployeeInstance[]
}

export interface EmployeeInstance {
  employee_id: string
  agent_id: string
  skill_id: string
  base_skill_path: string
  incremental_path: string
  status: 'idle' | 'working' | 'done' | 'terminated'
  task_history: Array<Record<string, any>>
}

export interface ExperienceRule {
  rule_id: string
  trigger_condition: string
  action: string
  note: string
  source_task_id: string
  source_task_type: string
  rule_type: 'success_pattern' | 'failure_avoidance' | 'correction_tip'
  status: 'pending_review' | 'approved' | 'rejected'
  keywords: string[]
  created_at: string
}

export interface RouteEntry {
  dept_id: string
  dept_name: string
  capability_desc: string
  capability_keywords: string[]
  tools: string[]
  success_rate: number
  total_tasks: number
  successful_tasks: number
  last_active: string
  priority: number
}

export interface ProjectStatus {
  project_id: string
  name: string
  status: string
  employee_count: number
  task_stats: { total: number; completed: number; failed: number }
  iteration_stats: { total_iterations: number; avg_iterations_per_task: number }
  skill_increment_stats: { total_rules: number; approved_rules: number }
}

export interface PackageResult {
  package_path: string
  readme_content: string
  desensitize_report: Array<{
    file_path: string
    line_number: number
    issue_type: string
    original_content: string
    redacted_content: string
  }>
  diff_summary: {
    new_files: string[]
    modified_files: string[]
    new_rules: string[]
  }
  skill_name: string
  base_version: string
  output_version: string
}

// ====== 结构化反馈系统类型（V4） ======

export interface FeedbackIssue {
  type: 'logic_error' | 'missing_feature' | 'performance' | 'style_issue' | string
  location: string
  detail: string
  suggestion: string
}

export interface StructuredFeedback {
  status: 'approved' | 'revision_required'
  issues: FeedbackIssue[]
  max_iterations: number
  current_iteration: number
  overall_comment: string
}

export interface IterationStatus {
  task_id: string
  current_iteration: number
  max_iterations: number
  status: 'approved' | 'revision_required' | 'max_iterations_reached'
  corrections: Array<{
    issue_type: string
    location: string
    detail: string
    suggestion: string
    applied: boolean
  }>
}

// ====== 动态路由系统类型（V4） ======

export interface RoutingDecision {
  selected_dept: string
  confidence: number
  reason: string
  candidate_depts: Array<{
    dept_id: string
    dept_name: string
    score: number
    matched_keywords: string[]
  }>
  matched_keywords: string[]
}

// ====== 工作流系统类型（V5） ======

export enum WorkflowNodeStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

export enum WorkflowExecutionStatus {
  Created = 'created',
  Running = 'running',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface WorkflowNode {
  node_id: string
  task_description: string
  dept_id: string
  input_spec: Record<string, any>
  output_spec: Record<string, any>
  status: WorkflowNodeStatus
  result: Record<string, any> | null
}

export interface WorkflowEdge {
  source_node_id: string
  target_node_id: string
  condition: string | null
}

export interface WorkflowDefinition {
  workflow_id: string
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  execution_strategy: 'sequential' | 'parallel' | 'mixed'
}

export interface WorkflowExecution {
  execution_id: string
  workflow_id: string
  status: WorkflowExecutionStatus
  started_at: string
  completed_at: string | null
  node_states: Record<string, WorkflowNodeStatus>
  results: Record<string, any>
}

export interface WorkflowVisualization {
  execution: WorkflowExecution
  definition: WorkflowDefinition
}
