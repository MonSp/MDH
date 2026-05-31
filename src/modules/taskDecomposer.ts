import type { SubTask, TaskDependency, TaskType, TaskPriority, TaskConstraint } from './taskTypes'
import { createSubTask } from './taskTypes'
import type { AgentCapability } from './agentTypes'

export interface DecompositionConfig {
  maxSubTasks?: number
  minSubTaskDuration?: number
  maxSubTaskDuration?: number
  enableParallelDecomposition?: boolean
  taskTemplates?: TaskTemplate[]
}

export interface TaskTemplate {
  id: string
  name: string
  description: string
  intentPattern: RegExp
  subTaskTemplates: SubTaskTemplate[]
  defaultDependencies: DependencyTemplate[]
}

export interface SubTaskTemplate {
  title: string
  description: string
  type: TaskType
  priority: TaskPriority
  requiredCapabilities: AgentCapability[]
  estimatedDuration: number
  isOptional?: boolean
}

export interface DependencyTemplate {
  fromIndex: number
  toIndex: number
  type: 'blocks' | 'requires_output' | 'soft'
}

export interface DecompositionResult {
  subTasks: SubTask[]
  metadata: {
    decompositionStrategy: string
    templateUsed: string | null
    originalComplexity: string
    taskCount: number
  }
}

export class TaskDecomposer {
  private config: DecompositionConfig
  private templates: TaskTemplate[]

  constructor(config: DecompositionConfig = {}) {
    this.config = {
      maxSubTasks: 20,
      minSubTaskDuration: 5000,
      maxSubTaskDuration: 600000,
      enableParallelDecomposition: true,
      ...config,
    }

    this.templates = this.config.taskTemplates ?? this.getDefaultTemplates()
  }

  async decompose(
    intent: string,
    entities: Array<{ type: string; value: string; confidence: number }>,
    complexity: 'low' | 'medium' | 'high'
  ): Promise<DecompositionResult> {
    const template = this.findMatchingTemplate(intent, entities)
    
    if (template) {
      return this.decomposeWithTemplate(template, entities, complexity)
    }

    return this.decomposeWithHeuristics(intent, entities, complexity)
  }

  private findMatchingTemplate(
    intent: string,
    entities: Array<{ type: string; value: string; confidence: number }>
  ): TaskTemplate | null {
    const entityTypes = entities.map(e => e.type)
    
    for (const template of this.templates) {
      if (template.intentPattern.test(intent)) {
        return template
      }
    }

    return null
  }

  private decomposeWithTemplate(
    template: TaskTemplate,
    entities: Array<{ type: string; value: string; confidence: number }>,
    complexity: 'low' | 'medium' | 'high'
  ): DecompositionResult {
    const subTasks: SubTask[] = []
    const mainEntity = entities.find(e => e.type === 'component' || e.type === 'file')
    const mainEntityValue = mainEntity?.value ?? '目标'

    template.subTaskTemplates.forEach((taskTemplate, index) => {
      const title = this.interpolateTemplate(taskTemplate.title, {
        entity: mainEntityValue,
        index: String(index + 1),
      })

      const description = this.interpolateTemplate(taskTemplate.description, {
        entity: mainEntityValue,
        intent: template.name,
      })

      const estimatedDuration = this.adjustDurationByComplexity(
        taskTemplate.estimatedDuration,
        complexity
      )

      const subTask = createSubTask(title, description, {
        type: taskTemplate.type,
        priority: taskTemplate.priority,
        requiredCapabilities: taskTemplate.requiredCapabilities,
        estimatedDuration,
        metadata: {
          templateId: template.id,
          templateIndex: index,
          isOptional: taskTemplate.isOptional ?? false,
        },
      })

      subTasks.push(subTask)
    })

    const dependencies = this.createDependenciesFromTemplate(
      template.defaultDependencies,
      subTasks
    )

    return {
      subTasks,
      metadata: {
        decompositionStrategy: 'template',
        templateUsed: template.id,
        originalComplexity: complexity,
        taskCount: subTasks.length,
      },
    }
  }

  private decomposeWithHeuristics(
    intent: string,
    entities: Array<{ type: string; value: string; confidence: number }>,
    complexity: 'low' | 'medium' | 'high'
  ): DecompositionResult {
    const subTasks: SubTask[] = []
    const mainEntity = entities.find(e => e.type === 'component' || e.type === 'file')
    const mainEntityValue = mainEntity?.value ?? '目标'

    const analysisTask = createSubTask(
      `分析 ${mainEntityValue} 需求`,
      `分析并理解 ${mainEntityValue} 的具体需求和约束条件`,
      {
        type: 'atomic' as TaskType,
        priority: 'high' as TaskPriority,
        requiredCapabilities: ['data_analysis' as AgentCapability],
        estimatedDuration: this.adjustDurationByComplexity(30000, complexity),
        metadata: { phase: 'analysis' },
      }
    )
    subTasks.push(analysisTask)

    const designTask = createSubTask(
      `设计 ${mainEntityValue} 方案`,
      `基于需求分析，设计实现方案和架构`,
      {
        type: 'atomic' as TaskType,
        priority: 'high' as TaskPriority,
        requiredCapabilities: ['data_analysis' as AgentCapability],
        estimatedDuration: this.adjustDurationByComplexity(60000, complexity),
        dependencies: [analysisTask.id],
        metadata: { phase: 'design' },
      }
    )
    subTasks.push(designTask)

    const implementationTasks = this.createImplementationTasks(
      mainEntityValue,
      intent,
      entities,
      complexity,
      designTask.id
    )
    subTasks.push(...implementationTasks)

    const verificationTask = createSubTask(
      `验证 ${mainEntityValue} 实现`,
      `测试和验证实现结果是否符合需求`,
      {
        type: 'atomic' as TaskType,
        priority: 'medium' as TaskPriority,
        requiredCapabilities: ['testing' as AgentCapability],
        estimatedDuration: this.adjustDurationByComplexity(45000, complexity),
        dependencies: implementationTasks.map(t => t.id),
        metadata: { phase: 'verification' },
      }
    )
    subTasks.push(verificationTask)

    const documentationTask = createSubTask(
      `编写 ${mainEntityValue} 文档`,
      `编写相关文档和说明`,
      {
        type: 'atomic' as TaskType,
        priority: 'low' as TaskPriority,
        requiredCapabilities: ['documentation' as AgentCapability],
        estimatedDuration: this.adjustDurationByComplexity(30000, complexity),
        dependencies: [verificationTask.id],
        metadata: { phase: 'documentation' },
      }
    )
    subTasks.push(documentationTask)

    const dependencies = this.inferDependencies(subTasks)

    return {
      subTasks,
      metadata: {
        decompositionStrategy: 'heuristic',
        templateUsed: null,
        originalComplexity: complexity,
        taskCount: subTasks.length,
      },
    }
  }

  private createImplementationTasks(
    entity: string,
    intent: string,
    entities: Array<{ type: string; value: string; confidence: number }>,
    complexity: 'low' | 'medium' | 'high',
    dependsOnId: string
  ): SubTask[] {
    const tasks: SubTask[] = []

    if (intent === 'create' || intent === 'implement') {
      tasks.push(
        createSubTask(
          `实现 ${entity} 核心功能`,
          `编写 ${entity} 的核心代码和逻辑`,
          {
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: this.adjustDurationByComplexity(120000, complexity),
            dependencies: [dependsOnId],
            metadata: { phase: 'implementation', subPhase: 'core' },
          }
        )
      )

      if (complexity !== 'low') {
        tasks.push(
          createSubTask(
            `实现 ${entity} 辅助功能`,
            `实现辅助功能和边界情况处理`,
            {
              type: 'atomic' as TaskType,
              priority: 'medium' as TaskPriority,
              requiredCapabilities: ['code_generation' as AgentCapability],
              estimatedDuration: this.adjustDurationByComplexity(90000, complexity),
              dependencies: [dependsOnId],
              metadata: { phase: 'implementation', subPhase: 'auxiliary' },
            }
          )
        )
      }
    } else if (intent === 'fix') {
      tasks.push(
        createSubTask(
          `诊断 ${entity} 问题`,
          `分析和定位问题的根本原因`,
          {
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_review' as AgentCapability, 'testing' as AgentCapability],
            estimatedDuration: this.adjustDurationByComplexity(60000, complexity),
            dependencies: [dependsOnId],
            metadata: { phase: 'diagnosis' },
          }
        )
      )

      tasks.push(
        createSubTask(
          `修复 ${entity} 问题`,
          `实施修复方案并验证`,
          {
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: this.adjustDurationByComplexity(90000, complexity),
            dependencies: [dependsOnId],
            metadata: { phase: 'fix' },
          }
        )
      )
    } else if (intent === 'optimize') {
      tasks.push(
        createSubTask(
          `分析 ${entity} 性能瓶颈`,
          `识别性能瓶颈和优化点`,
          {
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['data_analysis' as AgentCapability],
            estimatedDuration: this.adjustDurationByComplexity(60000, complexity),
            dependencies: [dependsOnId],
            metadata: { phase: 'analysis', subPhase: 'performance' },
          }
        )
      )

      tasks.push(
        createSubTask(
          `优化 ${entity} 性能`,
          `实施性能优化措施`,
          {
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: this.adjustDurationByComplexity(120000, complexity),
            dependencies: [dependsOnId],
            metadata: { phase: 'optimization' },
          }
        )
      )
    } else {
      tasks.push(
        createSubTask(
          `执行 ${entity} 操作`,
          `执行具体的 ${intent} 操作`,
          {
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: this.adjustDurationByComplexity(90000, complexity),
            dependencies: [dependsOnId],
            metadata: { phase: 'execution' },
          }
        )
      )
    }

    return tasks
  }

  private inferDependencies(tasks: SubTask[]): TaskDependency[] {
    const dependencies: TaskDependency[] = []

    tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(fromTaskId => {
          dependencies.push({
            fromTaskId,
            toTaskId: task.id,
            type: 'blocks',
          })
        })
      }
    })

    return dependencies
  }

  private createDependenciesFromTemplate(
    templates: DependencyTemplate[],
    tasks: SubTask[]
  ): TaskDependency[] {
    return templates
      .filter(t => t.fromIndex < tasks.length && t.toIndex < tasks.length)
      .map(template => ({
        fromTaskId: tasks[template.fromIndex].id,
        toTaskId: tasks[template.toIndex].id,
        type: template.type,
      }))
  }

  private interpolateTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    })
    return result
  }

  private adjustDurationByComplexity(
    baseDuration: number,
    complexity: 'low' | 'medium' | 'high'
  ): number {
    const multipliers = {
      low: 0.7,
      medium: 1.0,
      high: 1.5,
    }

    const adjusted = baseDuration * multipliers[complexity]
    return Math.max(
      this.config.minSubTaskDuration!,
      Math.min(this.config.maxSubTaskDuration!, adjusted)
    )
  }

  private getDefaultTemplates(): TaskTemplate[] {
    return [
      {
        id: 'component-creation',
        name: '组件创建',
        description: '创建新的UI组件',
        intentPattern: /^create$/,
        subTaskTemplates: [
          {
            title: '分析组件需求',
            description: '分析组件的功能需求和设计规范',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['data_analysis' as AgentCapability],
            estimatedDuration: 30000,
          },
          {
            title: '设计组件接口',
            description: '设计组件的Props接口和状态管理',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: 45000,
          },
          {
            title: '实现组件逻辑',
            description: '编写组件的核心逻辑和渲染',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: 120000,
          },
          {
            title: '添加组件样式',
            description: '实现组件的样式和主题支持',
            type: 'atomic' as TaskType,
            priority: 'medium' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: 60000,
          },
          {
            title: '编写组件测试',
            description: '编写单元测试和集成测试',
            type: 'atomic' as TaskType,
            priority: 'medium' as TaskPriority,
            requiredCapabilities: ['testing' as AgentCapability],
            estimatedDuration: 90000,
          },
        ],
        defaultDependencies: [
          { fromIndex: 0, toIndex: 1, type: 'blocks' },
          { fromIndex: 1, toIndex: 2, type: 'blocks' },
          { fromIndex: 2, toIndex: 3, type: 'blocks' },
          { fromIndex: 2, toIndex: 4, type: 'blocks' },
        ],
      },
      {
        id: 'bug-fix',
        name: '问题修复',
        description: '修复代码中的问题',
        intentPattern: /^fix$/,
        subTaskTemplates: [
          {
            title: '复现问题',
            description: '复现并确认问题',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['testing' as AgentCapability],
            estimatedDuration: 30000,
          },
          {
            title: '定位问题原因',
            description: '分析代码定位问题根本原因',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_review' as AgentCapability],
            estimatedDuration: 60000,
          },
          {
            title: '实施修复',
            description: '编写修复代码',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: 90000,
          },
          {
            title: '验证修复',
            description: '测试修复是否有效且无回归',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['testing' as AgentCapability],
            estimatedDuration: 45000,
          },
        ],
        defaultDependencies: [
          { fromIndex: 0, toIndex: 1, type: 'blocks' },
          { fromIndex: 1, toIndex: 2, type: 'blocks' },
          { fromIndex: 2, toIndex: 3, type: 'blocks' },
        ],
      },
      {
        id: 'feature-implementation',
        name: '功能实现',
        description: '实现新功能',
        intentPattern: /^implement$/,
        subTaskTemplates: [
          {
            title: '需求分析',
            description: '分析功能需求和验收标准',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['data_analysis' as AgentCapability],
            estimatedDuration: 45000,
          },
          {
            title: '技术设计',
            description: '设计技术方案和架构',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['data_analysis' as AgentCapability],
            estimatedDuration: 60000,
          },
          {
            title: '核心开发',
            description: '实现核心功能代码',
            type: 'atomic' as TaskType,
            priority: 'high' as TaskPriority,
            requiredCapabilities: ['code_generation' as AgentCapability],
            estimatedDuration: 180000,
          },
          {
            title: '集成测试',
            description: '进行集成测试和调试',
            type: 'atomic' as TaskType,
            priority: 'medium' as TaskPriority,
            requiredCapabilities: ['testing' as AgentCapability],
            estimatedDuration: 90000,
          },
          {
            title: '文档编写',
            description: '编写使用文档和API文档',
            type: 'atomic' as TaskType,
            priority: 'low' as TaskPriority,
            requiredCapabilities: ['documentation' as AgentCapability],
            estimatedDuration: 60000,
          },
        ],
        defaultDependencies: [
          { fromIndex: 0, toIndex: 1, type: 'blocks' },
          { fromIndex: 1, toIndex: 2, type: 'blocks' },
          { fromIndex: 2, toIndex: 3, type: 'blocks' },
          { fromIndex: 3, toIndex: 4, type: 'blocks' },
        ],
      },
    ]
  }

  addTemplate(template: TaskTemplate): void {
    this.templates.push(template)
  }

  removeTemplate(templateId: string): void {
    this.templates = this.templates.filter(t => t.id !== templateId)
  }

  getTemplates(): TaskTemplate[] {
    return [...this.templates]
  }

  updateConfig(newConfig: Partial<DecompositionConfig>): void {
    this.config = { ...this.config, ...newConfig }
    if (newConfig.taskTemplates) {
      this.templates = newConfig.taskTemplates
    }
  }
}