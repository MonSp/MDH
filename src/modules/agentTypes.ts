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
    personality: '高瞻远瞩、运筹帷幄',
    motto: '统揽全局，智领团队',
    description: '作为会议组织者，分析用户需求语义，智能调度团队成员，自动分配任务',
    specializations: ['语义分析', '任务委派', '会议协调', '决策统筹'],
    emoji: '👔',
  },
  [AgentRole.Planner]: {
    avatar: 'planner',
    themeColor: '#8b5cf6',
    gradientColors: ['#8b5cf6', '#a78bfa'],
    personality: '深思熟虑、高瞻远瞩',
    motto: '运筹帷幄之中，决胜千里之外',
    description: '负责分析复杂任务，制定详细计划，将宏大目标分解为可执行的步骤',
    specializations: ['战略规划', '任务分解', '资源调配', '风险评估'],
    emoji: '🧠',
  },
  [AgentRole.Executor]: {
    avatar: 'executor',
    themeColor: '#f59e0b',
    gradientColors: ['#f59e0b', '#fbbf24'],
    personality: '雷厉风行、精益求精',
    motto: '行动是成功的阶梯',
    description: '专注于任务执行，快速高效地完成分配的工作，确保代码质量和性能',
    specializations: ['代码开发', '自动化测试', '性能优化', '问题排查'],
    emoji: '⚡',
  },
  [AgentRole.Monitor]: {
    avatar: 'monitor',
    themeColor: '#10b981',
    gradientColors: ['#10b981', '#34d399'],
    personality: '细致入微、警觉敏锐',
    motto: '防患于未然，监控保平安',
    description: '持续监控系统状态和任务进度，及时发现并预警潜在问题',
    specializations: ['状态监控', '异常检测', '性能分析', '日志审计'],
    emoji: '👁',
  },
  [AgentRole.Reviewer]: {
    avatar: 'reviewer',
    themeColor: '#3b82f6',
    gradientColors: ['#3b82f6', '#60a5fa'],
    personality: '严谨认真、追求卓越',
    motto: '细节决定成败，质量铸就未来',
    description: '负责代码审查和质量把关，确保交付物符合标准和最佳实践',
    specializations: ['代码审查', '质量检测', '标准验证', '最佳实践'],
    emoji: '🔍',
  },
  [AgentRole.Coordinator]: {
    avatar: 'coordinator',
    themeColor: '#ec4899',
    gradientColors: ['#ec4899', '#f472b6'],
    personality: '协调有方、沟通高效',
    motto: '团结协作，共创辉煌',
    description: '协调各Agent之间的合作，确保信息流畅传递，任务高效完成',
    specializations: ['任务协调', '资源调度', '冲突解决', '进度同步'],
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
