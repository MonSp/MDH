/**
 * DependencyAnalyzer 默认规则和模式
 */

import type { SubTask, TaskDependency } from './taskTypes'
import type { DependencyRule, DependencyPattern } from './dependencyAnalyzer'

export const DEFAULT_RULES: DependencyRule[] = [
  {
    id: 'capability-dependency',
    name: '能力依赖规则',
    description: '当一个任务的输出是另一个任务的输入时创建依赖',
    condition: (task) => task.requiredCapabilities.length > 0,
    createDependency: (task, matchedTasks) => {
      const dependencies: TaskDependency[] = []
      matchedTasks.forEach(matchedTask => {
        const hasCommonCapability = task.requiredCapabilities.some(cap =>
          matchedTask.requiredCapabilities.includes(cap)
        )
        if (hasCommonCapability && task.priority === 'high' && matchedTask.priority !== 'high') {
          dependencies.push({ fromTaskId: task.id, toTaskId: matchedTask.id, type: 'soft' })
        }
      })
      return dependencies
    },
  },
  {
    id: 'phase-dependency',
    name: '阶段依赖规则',
    description: '基于任务阶段创建依赖关系',
    condition: (task) => task.metadata?.phase !== undefined,
    createDependency: (task, matchedTasks) => {
      const dependencies: TaskDependency[] = []
      const taskPhase = task.metadata?.phase as string
      const phaseOrder = ['analysis', 'design', 'implementation', 'verification', 'documentation']
      const currentPhaseIndex = phaseOrder.indexOf(taskPhase)
      if (currentPhaseIndex > 0) {
        const previousPhase = phaseOrder[currentPhaseIndex - 1]
        matchedTasks.forEach(matchedTask => {
          if (matchedTask.metadata?.phase === previousPhase) {
            dependencies.push({ fromTaskId: matchedTask.id, toTaskId: task.id, type: 'blocks' })
          }
        })
      }
      return dependencies
    },
  },
]

export const DEFAULT_PATTERNS: DependencyPattern[] = [
  {
    id: 'sequential-pattern',
    name: '顺序执行模式',
    description: '检测需要顺序执行的任务序列',
    detect: (tasks) => {
      const dependencies: TaskDependency[] = []
      const sortedTasks = [...tasks].sort((a, b) => {
        const aOrder = (a.metadata?.order as number) ?? 0
        const bOrder = (b.metadata?.order as number) ?? 0
        return aOrder - bOrder
      })
      for (let i = 0; i < sortedTasks.length - 1; i++) {
        const current = sortedTasks[i]
        const next = sortedTasks[i + 1]
        if (current.metadata?.order !== undefined && next.metadata?.order !== undefined) {
          dependencies.push({ fromTaskId: current.id, toTaskId: next.id, type: 'blocks' })
        }
      }
      return dependencies
    },
  },
  {
    id: 'fan-out-pattern',
    name: '扇出模式',
    description: '检测一个任务需要分发给多个并行任务的情况',
    detect: (tasks) => {
      const dependencies: TaskDependency[] = []
      const highPriorityTasks = tasks.filter(t => t.priority === 'high')
      const otherTasks = tasks.filter(t => t.priority !== 'high')
      if (highPriorityTasks.length === 1 && otherTasks.length > 1) {
        const sourceTask = highPriorityTasks[0]
        otherTasks.forEach(targetTask => {
          if (!targetTask.dependencies?.includes(sourceTask.id)) {
            dependencies.push({ fromTaskId: sourceTask.id, toTaskId: targetTask.id, type: 'soft' })
          }
        })
      }
      return dependencies
    },
  },
  {
    id: 'fan-in-pattern',
    name: '扇入模式',
    description: '检测多个任务汇聚到一个任务的情况',
    detect: (tasks) => {
      const dependencies: TaskDependency[] = []
      const verificationTasks = tasks.filter(t =>
        t.metadata?.phase === 'verification' ||
        t.title?.toLowerCase().includes('验证') ||
        t.title?.toLowerCase().includes('测试')
      )
      verificationTasks.forEach(verTask => {
        const implementationTasks = tasks.filter(t =>
          t.id !== verTask.id &&
          (t.metadata?.phase === 'implementation' ||
           t.title?.toLowerCase().includes('实现') ||
           t.title?.toLowerCase().includes('开发'))
        )
        implementationTasks.forEach(implTask => {
          if (!verTask.dependencies?.includes(implTask.id)) {
            dependencies.push({ fromTaskId: implTask.id, toTaskId: verTask.id, type: 'blocks' })
          }
        })
      })
      return dependencies
    },
  },
]
