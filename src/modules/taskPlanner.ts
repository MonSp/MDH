import type { TaskPlan, SubTask, TaskDependency, TaskStatus, TaskPriority } from './taskTypes'
import { TaskDecomposer } from './taskDecomposer'
import { DependencyAnalyzer } from './dependencyAnalyzer'
import { TaskScheduler } from './taskScheduler'
import type { PlannerConfig, UserInputAnalysis, PlanningResult } from './taskPlanner.types'
import { extractIntent, extractEntities, estimateComplexity, suggestTaskType, hasCodeKeywords, hasFileKeywords } from './taskPlanner.utils'

export type { PlannerConfig, UserInputAnalysis, PlanningResult }

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
    
    const intent = extractIntent(normalizedInput)
    const entities = extractEntities(normalizedInput)
    const complexity = estimateComplexity(normalizedInput, entities)
    const taskType = suggestTaskType(intent, entities)

    return {
      originalInput: input,
      parsedIntent: intent,
      extractedEntities: entities,
      estimatedComplexity: complexity,
      suggestedTaskType: taskType,
      context: {
        wordCount: input.split(/\s+/).length,
        hasQuestion: input.includes('?') || input.includes('？'),
        hasCodeKeywords: hasCodeKeywords(normalizedInput),
        hasFileKeywords: hasFileKeywords(normalizedInput),
      },
    }
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
