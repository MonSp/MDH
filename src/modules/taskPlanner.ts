import type { TaskPlan, SubTask, TaskDependency, TaskStatus, TaskPriority } from './taskTypes'
import { TaskDecomposer, type DecompositionConfig } from './taskDecomposer'
import { DependencyAnalyzer, type DependencyAnalysisResult } from './dependencyAnalyzer'
import { TaskScheduler, type SchedulingConfig } from './taskScheduler'

export interface PlannerConfig {
  decomposition: DecompositionConfig
  scheduling: SchedulingConfig
  enableAutoPriority: boolean
  enableDependencyOptimization: boolean
  maxPlanningTime: number
}

export interface UserInputAnalysis {
  originalInput: string
  parsedIntent: string
  extractedEntities: Array<{
    type: string
    value: string
    confidence: number
  }>
  estimatedComplexity: 'low' | 'medium' | 'high'
  suggestedTaskType: string
  context: Record<string, unknown>
}

export interface PlanningResult {
  success: boolean
  plan: TaskPlan | null
  analysis: UserInputAnalysis
  warnings: string[]
  errors: string[]
  planningTime: number
}

export class TaskPlanner {
  private decomposer: TaskDecomposer
  private analyzer: DependencyAnalyzer
  private scheduler: TaskScheduler
  private config: PlannerConfig

  constructor(config?: Partial<PlannerConfig>) {
    this.config = {
      decomposition: {},
      scheduling: {},
      enableAutoPriority: true,
      enableDependencyOptimization: true,
      maxPlanningTime: 30000,
      ...config,
    }

    this.decomposer = new TaskDecomposer(this.config.decomposition)
    this.analyzer = new DependencyAnalyzer()
    this.scheduler = new TaskScheduler(this.config.scheduling)
  }

  async createPlanFromInput(userInput: string): Promise<PlanningResult> {
    const startTime = Date.now()
    const warnings: string[] = []
    const errors: string[] = []

    try {
      const analysis = await this.analyzeUserInput(userInput)
      
      if (analysis.estimatedComplexity === 'high') {
        warnings.push('任务复杂度较高，可能需要更长的规划时间')
      }

      const decompositionResult = await this.decomposer.decompose(
        analysis.parsedIntent,
        analysis.extractedEntities,
        analysis.estimatedComplexity
      )

      if (decompositionResult.subTasks.length === 0) {
        errors.push('无法将输入分解为可执行的子任务')
        return {
          success: false,
          plan: null,
          analysis,
          warnings,
          errors,
          planningTime: Date.now() - startTime,
        }
      }

      let dependencies: TaskDependency[] = []
      if (this.config.enableDependencyOptimization) {
        const dependencyResult = await this.analyzer.analyzeDependencies(
          decompositionResult.subTasks
        )
        dependencies = dependencyResult.dependencies
        warnings.push(...dependencyResult.warnings)
      }

      if (this.config.enableAutoPriority) {
        this.autoAssignPriorities(decompositionResult.subTasks, dependencies)
      }

      const scheduledTasks = this.scheduler.scheduleTasks(
        decompositionResult.subTasks,
        dependencies
      )

      const plan: TaskPlan = {
        id: crypto.randomUUID(),
        title: this.generatePlanTitle(analysis),
        description: this.generatePlanDescription(analysis),
        rootTaskId: scheduledTasks[0]?.id ?? '',
        subTasks: scheduledTasks,
        dependencies,
        status: 'pending' as TaskStatus,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        estimatedTotalDuration: this.calculateTotalDuration(scheduledTasks),
        metadata: {
          originalInput: userInput,
          analysis,
          planningTime: Date.now() - startTime,
        },
      }

      return {
        success: true,
        plan,
        analysis,
        warnings,
        errors,
        planningTime: Date.now() - startTime,
      }
    } catch (error) {
      errors.push(`规划过程中发生错误: ${error instanceof Error ? error.message : '未知错误'}`)
      return {
        success: false,
        plan: null,
        analysis: {
          originalInput: userInput,
          parsedIntent: userInput,
          extractedEntities: [],
          estimatedComplexity: 'medium',
          suggestedTaskType: 'generic',
          context: {},
        },
        warnings,
        errors,
        planningTime: Date.now() - startTime,
      }
    }
  }

  private async analyzeUserInput(input: string): Promise<UserInputAnalysis> {
    const normalizedInput = input.trim().toLowerCase()
    
    const intent = this.extractIntent(normalizedInput)
    const entities = this.extractEntities(normalizedInput)
    const complexity = this.estimateComplexity(normalizedInput, entities)
    const taskType = this.suggestTaskType(intent, entities)

    return {
      originalInput: input,
      parsedIntent: intent,
      extractedEntities: entities,
      estimatedComplexity: complexity,
      suggestedTaskType: taskType,
      context: {
        wordCount: input.split(/\s+/).length,
        hasQuestion: input.includes('?') || input.includes('？'),
        hasCodeKeywords: this.hasCodeKeywords(normalizedInput),
        hasFileKeywords: this.hasFileKeywords(normalizedInput),
      },
    }
  }

  private extractIntent(input: string): string {
    const intentPatterns: Array<{
      pattern: RegExp
      intent: string
    }> = [
      { pattern: /^(创建|新建|生成|写|编写)/, intent: 'create' },
      { pattern: /^(修改|更新|编辑|改|调整)/, intent: 'update' },
      { pattern: /^(删除|移除|去掉|清理)/, intent: 'delete' },
      { pattern: /^(查找|搜索|查询|找)/, intent: 'search' },
      { pattern: /^(分析|检查|审查|测试)/, intent: 'analyze' },
      { pattern: /^(部署|发布|上线)/, intent: 'deploy' },
      { pattern: /^(优化|改进|提升)/, intent: 'optimize' },
      { pattern: /^(修复|解决|处理|修复)/, intent: 'fix' },
      { pattern: /^(添加|增加|实现|开发)/, intent: 'implement' },
      { pattern: /^(配置|设置|设定)/, intent: 'configure' },
    ]

    for (const { pattern, intent } of intentPatterns) {
      if (pattern.test(input)) {
        return intent
      }
    }

    return 'generic'
  }

  private extractEntities(input: string): Array<{
    type: string
    value: string
    confidence: number
  }> {
    const entities: Array<{
      type: string
      value: string
      confidence: number
    }> = []

    const filePattern = /[\w\-\.]+\.(ts|js|tsx|jsx|py|java|cpp|c|h|css|html|json|yaml|yml|md)/gi
    const fileMatches = input.match(filePattern)
    if (fileMatches) {
      fileMatches.forEach(match => {
        entities.push({
          type: 'file',
          value: match,
          confidence: 0.9,
        })
      })
    }

    const componentPattern = /(?:组件|component|模块|module|页面|page|服务|service)[\s:：]*([a-zA-Z\u4e00-\u9fa5]+)/gi
    const componentMatches = input.matchAll(componentPattern)
    for (const match of componentMatches) {
      entities.push({
        type: 'component',
        value: match[1],
        confidence: 0.8,
      })
    }

    const techKeywords = [
      'react', 'vue', 'angular', 'typescript', 'javascript', 'python', 'java',
      'node', 'express', 'fastapi', 'django', 'spring', 'docker', 'kubernetes',
      'redis', 'mysql', 'postgresql', 'mongodb', 'graphql', 'rest', 'api',
    ]
    
    techKeywords.forEach(keyword => {
      if (input.includes(keyword)) {
        entities.push({
          type: 'technology',
          value: keyword,
          confidence: 0.7,
        })
      }
    })

    return entities
  }

  private estimateComplexity(
    input: string,
    entities: Array<{ type: string; value: string; confidence: number }>
  ): 'low' | 'medium' | 'high' {
    let score = 0

    score += Math.min(input.length / 100, 3)

    score += entities.length * 0.5

    const complexityKeywords = ['系统', '架构', '完整', '全面', '复杂', '多个', '集成', '优化']
    complexityKeywords.forEach(keyword => {
      if (input.includes(keyword)) {
        score += 1
      }
    })

    if (score < 3) return 'low'
    if (score < 6) return 'medium'
    return 'high'
  }

  private suggestTaskType(
    intent: string,
    entities: Array<{ type: string; value: string; confidence: number }>
  ): string {
    const hasFileEntities = entities.some(e => e.type === 'file')
    const hasComponentEntities = entities.some(e => e.type === 'component')
    const hasTechEntities = entities.some(e => e.type === 'technology')

    if (intent === 'create' && hasComponentEntities) {
      return 'component_creation'
    }
    if (intent === 'create' && hasFileEntities) {
      return 'file_creation'
    }
    if (intent === 'analyze' && hasTechEntities) {
      return 'technical_analysis'
    }
    if (intent === 'fix') {
      return 'bug_fix'
    }
    if (intent === 'optimize') {
      return 'performance_optimization'
    }
    if (intent === 'deploy') {
      return 'deployment'
    }
    if (intent === 'implement') {
      return 'feature_implementation'
    }

    return 'generic'
  }

  private hasCodeKeywords(input: string): boolean {
    const codeKeywords = ['代码', '函数', '方法', '类', '接口', '变量', '算法', '逻辑', 'code', 'function', 'method', 'class']
    return codeKeywords.some(keyword => input.includes(keyword))
  }

  private hasFileKeywords(input: string): boolean {
    const fileKeywords = ['文件', '目录', '路径', '配置', 'file', 'directory', 'path', 'config']
    return fileKeywords.some(keyword => input.includes(keyword))
  }

  private autoAssignPriorities(
    tasks: SubTask[],
    dependencies: TaskDependency[]
  ): void {
    const dependencyMap = new Map<string, string[]>()
    dependencies.forEach(dep => {
      if (!dependencyMap.has(dep.toTaskId)) {
        dependencyMap.set(dep.toTaskId, [])
      }
      dependencyMap.get(dep.toTaskId)!.push(dep.fromTaskId)
    })

    tasks.forEach(task => {
      const dependencyCount = dependencyMap.get(task.id)?.length ?? 0
      
      if (dependencyCount === 0) {
        task.priority = 'high' as TaskPriority
      } else if (dependencyCount >= 3) {
        task.priority = 'low' as TaskPriority
      } else {
        task.priority = 'medium' as TaskPriority
      }
    })
  }

  private generatePlanTitle(analysis: UserInputAnalysis): string {
    const intentMap: Record<string, string> = {
      create: '创建',
      update: '更新',
      delete: '删除',
      search: '搜索',
      analyze: '分析',
      deploy: '部署',
      optimize: '优化',
      fix: '修复',
      implement: '实现',
      configure: '配置',
      generic: '执行',
    }

    const intentLabel = intentMap[analysis.parsedIntent] || '执行'
    const mainEntity = analysis.extractedEntities.find(e => 
      e.type === 'component' || e.type === 'file'
    )

    if (mainEntity) {
      return `${intentLabel} ${mainEntity.value} 任务计划`
    }

    return `${intentLabel}任务计划 - ${new Date().toLocaleString('zh-CN')}`
  }

  private generatePlanDescription(analysis: UserInputAnalysis): string {
    const parts = [
      `原始输入: ${analysis.originalInput}`,
      `识别意图: ${analysis.parsedIntent}`,
      `复杂度: ${analysis.estimatedComplexity}`,
    ]

    if (analysis.extractedEntities.length > 0) {
      const entitySummary = analysis.extractedEntities
        .map(e => `${e.type}: ${e.value}`)
        .join(', ')
      parts.push(`识别实体: ${entitySummary}`)
    }

    return parts.join('\n')
  }

  private calculateTotalDuration(tasks: SubTask[]): number {
    return tasks.reduce((total, task) => {
      return total + (task.estimatedDuration ?? 60000)
    }, 0)
  }

  async replan(
    existingPlan: TaskPlan,
    changes: {
      completedTasks?: string[]
      failedTasks?: string[]
      newRequirements?: string
    }
  ): Promise<PlanningResult> {
    const startTime = Date.now()
    const warnings: string[] = []
    const errors: string[] = []

    try {
      const updatedTasks = existingPlan.subTasks.map(task => {
        if (changes.completedTasks?.includes(task.id)) {
          return { ...task, status: 'completed' as TaskStatus }
        }
        if (changes.failedTasks?.includes(task.id)) {
          return { ...task, status: 'failed' as TaskStatus }
        }
        return task
      })

      const remainingTasks = updatedTasks.filter(t => t.status !== 'completed')

      if (remainingTasks.length === 0) {
        return {
          success: true,
          plan: {
            ...existingPlan,
            subTasks: updatedTasks,
            status: 'completed' as TaskStatus,
            updatedAt: Date.now(),
          },
          analysis: {
            originalInput: existingPlan.description,
            parsedIntent: 'replan',
            extractedEntities: [],
            estimatedComplexity: 'low',
            suggestedTaskType: 'replan',
            context: {},
          },
          warnings: ['所有任务已完成'],
          errors,
          planningTime: Date.now() - startTime,
        }
      }

      const dependencyResult = await this.analyzer.analyzeDependencies(remainingTasks)
      
      const scheduledTasks = this.scheduler.scheduleTasks(
        remainingTasks,
        dependencyResult.dependencies
      )

      const updatedPlan: TaskPlan = {
        ...existingPlan,
        subTasks: scheduledTasks,
        dependencies: dependencyResult.dependencies,
        status: 'pending' as TaskStatus,
        updatedAt: Date.now(),
        estimatedTotalDuration: this.calculateTotalDuration(scheduledTasks),
        metadata: {
          ...existingPlan.metadata,
          replannedAt: Date.now(),
          replanReason: changes,
        },
      }

      return {
        success: true,
        plan: updatedPlan,
        analysis: {
          originalInput: existingPlan.description,
          parsedIntent: 'replan',
          extractedEntities: [],
          estimatedComplexity: 'medium',
          suggestedTaskType: 'replan',
          context: { changes },
        },
        warnings: [...warnings, ...dependencyResult.warnings],
        errors,
        planningTime: Date.now() - startTime,
      }
    } catch (error) {
      errors.push(`重新规划失败: ${error instanceof Error ? error.message : '未知错误'}`)
      return {
        success: false,
        plan: null,
        analysis: {
          originalInput: existingPlan.description,
          parsedIntent: 'replan',
          extractedEntities: [],
          estimatedComplexity: 'medium',
          suggestedTaskType: 'replan',
          context: {},
        },
        warnings,
        errors,
        planningTime: Date.now() - startTime,
      }
    }
  }

  updateConfig(newConfig: Partial<PlannerConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    if (newConfig.decomposition) {
      this.decomposer = new TaskDecomposer(newConfig.decomposition)
    }
    if (newConfig.scheduling) {
      this.scheduler = new TaskScheduler(newConfig.scheduling)
    }
  }

  getConfig(): PlannerConfig {
    return { ...this.config }
  }
}