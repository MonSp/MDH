import type { SubTask, TaskDependency } from './taskTypes'

export interface DependencyAnalysisResult {
  dependencies: TaskDependency[]
  criticalPath: string[]
  parallelGroups: string[][]
  cycles: string[][]
  warnings: string[]
  metadata: {
    totalDependencies: number
    maxDependencyDepth: number
    parallelizationScore: number
    analysisTime: number
  }
}

export interface DependencyRule {
  id: string
  name: string
  description: string
  condition: (task: SubTask, allTasks: SubTask[]) => boolean
  createDependency: (task: SubTask, matchedTasks: SubTask[]) => TaskDependency[]
}

export interface DependencyPattern {
  id: string
  name: string
  description: string
  detect: (tasks: SubTask[]) => TaskDependency[]
}

export class DependencyAnalyzer {
  private rules: DependencyRule[]
  private patterns: DependencyPattern[]

  constructor() {
    this.rules = this.getDefaultRules()
    this.patterns = this.getDefaultPatterns()
  }

  async analyzeDependencies(tasks: SubTask[]): Promise<DependencyAnalysisResult> {
    const startTime = Date.now()
    const warnings: string[] = []

    const existingDependencies = this.extractExistingDependencies(tasks)

    const ruleBasedDependencies = this.applyRules(tasks)

    const patternBasedDependencies = this.detectPatterns(tasks)

    const allDependencies = this.mergeDependencies([
      ...existingDependencies,
      ...ruleBasedDependencies,
      ...patternBasedDependencies,
    ])

    const cycles = this.detectCycles(allDependencies, tasks)
    if (cycles.length > 0) {
      warnings.push(`检测到 ${cycles.length} 个循环依赖`)
    }

    const cleanDependencies = this.removeCycles(allDependencies, cycles)

    const criticalPath = this.calculateCriticalPath(cleanDependencies, tasks)

    const parallelGroups = this.calculateParallelGroups(cleanDependencies, tasks)

    const maxDepth = this.calculateMaxDependencyDepth(cleanDependencies, tasks)

    const parallelizationScore = this.calculateParallelizationScore(
      parallelGroups.length,
      tasks.length
    )

    return {
      dependencies: cleanDependencies,
      criticalPath,
      parallelGroups,
      cycles,
      warnings,
      metadata: {
        totalDependencies: cleanDependencies.length,
        maxDependencyDepth: maxDepth,
        parallelizationScore,
        analysisTime: Date.now() - startTime,
      },
    }
  }

  private extractExistingDependencies(tasks: SubTask[]): TaskDependency[] {
    const dependencies: TaskDependency[] = []

    tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(fromTaskId => {
          const fromTask = tasks.find(t => t.id === fromTaskId)
          if (fromTask) {
            dependencies.push({
              fromTaskId,
              toTaskId: task.id,
              type: 'blocks',
            })
          }
        })
      }
    })

    return dependencies
  }

  private applyRules(tasks: SubTask[]): TaskDependency[] {
    const dependencies: TaskDependency[] = []

    tasks.forEach(task => {
      this.rules.forEach(rule => {
        if (rule.condition(task, tasks)) {
          const matchedTasks = this.findMatchingTasks(task, tasks, rule)
          const newDeps = rule.createDependency(task, matchedTasks)
          dependencies.push(...newDeps)
        }
      })
    })

    return dependencies
  }

  private findMatchingTasks(
    currentTask: SubTask,
    allTasks: SubTask[],
    rule: DependencyRule
  ): SubTask[] {
    return allTasks.filter(t => t.id !== currentTask.id)
  }

  private detectPatterns(tasks: SubTask[]): TaskDependency[] {
    const dependencies: TaskDependency[] = []

    this.patterns.forEach(pattern => {
      const patternDeps = pattern.detect(tasks)
      dependencies.push(...patternDeps)
    })

    return dependencies
  }

  private mergeDependencies(dependencies: TaskDependency[]): TaskDependency[] {
    const merged = new Map<string, TaskDependency>()

    dependencies.forEach(dep => {
      const key = `${dep.fromTaskId}->${dep.toTaskId}`
      if (!merged.has(key)) {
        merged.set(key, dep)
      } else {
        const existing = merged.get(key)!
        if (this.getDependencyPriority(dep.type) > this.getDependencyPriority(existing.type)) {
          merged.set(key, dep)
        }
      }
    })

    return Array.from(merged.values())
  }

  private getDependencyPriority(type: string): number {
    const priorities: Record<string, number> = {
      blocks: 3,
      requires_output: 2,
      soft: 1,
    }
    return priorities[type] ?? 0
  }

  private detectCycles(dependencies: TaskDependency[], tasks: SubTask[]): string[][] {
    const cycles: string[][] = []
    const adjacencyList = this.buildAdjacencyList(dependencies)
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const path: string[] = []

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId)
      recursionStack.add(nodeId)
      path.push(nodeId)

      const neighbors = adjacencyList.get(nodeId) ?? []
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true
          }
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor)
          const cycle = path.slice(cycleStart)
          cycle.push(neighbor)
          cycles.push(cycle)
          return true
        }
      }

      path.pop()
      recursionStack.delete(nodeId)
      return false
    }

    tasks.forEach(task => {
      if (!visited.has(task.id)) {
        dfs(task.id)
      }
    })

    return cycles
  }

  private buildAdjacencyList(dependencies: TaskDependency[]): Map<string, string[]> {
    const adjacencyList = new Map<string, string[]>()

    dependencies.forEach(dep => {
      if (!adjacencyList.has(dep.fromTaskId)) {
        adjacencyList.set(dep.fromTaskId, [])
      }
      adjacencyList.get(dep.fromTaskId)!.push(dep.toTaskId)
    })

    return adjacencyList
  }

  private removeCycles(dependencies: TaskDependency[], cycles: string[][]): TaskDependency[] {
    if (cycles.length === 0) {
      return dependencies
    }

    const edgesToRemove = new Set<string>()

    cycles.forEach(cycle => {
      for (let i = 0; i < cycle.length - 1; i++) {
        const from = cycle[i]
        const to = cycle[i + 1]
        edgesToRemove.add(`${from}->${to}`)
      }
    })

    return dependencies.filter(dep => {
      const key = `${dep.fromTaskId}->${dep.toTaskId}`
      return !edgesToRemove.has(key)
    })
  }

  private calculateCriticalPath(dependencies: TaskDependency[], tasks: SubTask[]): string[] {
    const adjacencyList = this.buildAdjacencyList(dependencies)
    const reverseAdjacencyList = this.buildReverseAdjacencyList(dependencies)

    const earliestStart = new Map<string, number>()
    const earliestFinish = new Map<string, number>()
    const latestStart = new Map<string, number>()
    const latestFinish = new Map<string, number>()
    const taskDuration = new Map<string, number>()

    tasks.forEach(task => {
      taskDuration.set(task.id, task.estimatedDuration ?? 60000)
    })

    const topologicalOrder = this.getTopologicalOrder(dependencies, tasks)

    topologicalOrder.forEach(taskId => {
      const predecessors = reverseAdjacencyList.get(taskId) ?? []
      if (predecessors.length === 0) {
        earliestStart.set(taskId, 0)
      } else {
        const maxFinish = Math.max(
          ...predecessors.map(predId => earliestFinish.get(predId) ?? 0)
        )
        earliestStart.set(taskId, maxFinish)
      }
      earliestFinish.set(taskId, (earliestStart.get(taskId) ?? 0) + (taskDuration.get(taskId) ?? 0))
    })

    const projectDuration = Math.max(...Array.from(earliestFinish.values()))

    const reversedOrder = [...topologicalOrder].reverse()
    reversedOrder.forEach(taskId => {
      const successors = adjacencyList.get(taskId) ?? []
      if (successors.length === 0) {
        latestFinish.set(taskId, projectDuration)
      } else {
        const minStart = Math.min(
          ...successors.map(succId => latestStart.get(succId) ?? projectDuration)
        )
        latestFinish.set(taskId, minStart)
      }
      latestStart.set(taskId, (latestFinish.get(taskId) ?? 0) - (taskDuration.get(taskId) ?? 0))
    })

    const criticalPath: string[] = []
    topologicalOrder.forEach(taskId => {
      const slack = (latestStart.get(taskId) ?? 0) - (earliestStart.get(taskId) ?? 0)
      if (Math.abs(slack) < 0.001) {
        criticalPath.push(taskId)
      }
    })

    return criticalPath
  }

  private buildReverseAdjacencyList(dependencies: TaskDependency[]): Map<string, string[]> {
    const reverseList = new Map<string, string[]>()

    dependencies.forEach(dep => {
      if (!reverseList.has(dep.toTaskId)) {
        reverseList.set(dep.toTaskId, [])
      }
      reverseList.get(dep.toTaskId)!.push(dep.fromTaskId)
    })

    return reverseList
  }

  private getTopologicalOrder(dependencies: TaskDependency[], tasks: SubTask[]): string[] {
    const inDegree = new Map<string, number>()
    const adjacencyList = this.buildAdjacencyList(dependencies)

    tasks.forEach(task => {
      inDegree.set(task.id, 0)
    })

    dependencies.forEach(dep => {
      inDegree.set(dep.toTaskId, (inDegree.get(dep.toTaskId) ?? 0) + 1)
    })

    const queue: string[] = []
    inDegree.forEach((degree, taskId) => {
      if (degree === 0) {
        queue.push(taskId)
      }
    })

    const order: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      order.push(current)

      const successors = adjacencyList.get(current) ?? []
      successors.forEach(successor => {
        const newDegree = (inDegree.get(successor) ?? 1) - 1
        inDegree.set(successor, newDegree)
        if (newDegree === 0) {
          queue.push(successor)
        }
      })
    }

    return order
  }

  private calculateParallelGroups(
    dependencies: TaskDependency[],
    tasks: SubTask[]
  ): string[][] {
    const adjacencyList = this.buildAdjacencyList(dependencies)
    const reverseAdjacencyList = this.buildReverseAdjacencyList(dependencies)

    const levels = new Map<string, number>()
    const visited = new Set<string>()

    const calculateLevel = (taskId: string): number => {
      if (levels.has(taskId)) {
        return levels.get(taskId)!
      }

      const predecessors = reverseAdjacencyList.get(taskId) ?? []
      if (predecessors.length === 0) {
        levels.set(taskId, 0)
        return 0
      }

      const maxPredLevel = Math.max(
        ...predecessors.map(predId => calculateLevel(predId))
      )
      const level = maxPredLevel + 1
      levels.set(taskId, level)
      return level
    }

    tasks.forEach(task => {
      if (!visited.has(task.id)) {
        calculateLevel(task.id)
        visited.add(task.id)
      }
    })

    const groups = new Map<number, string[]>()
    levels.forEach((level, taskId) => {
      if (!groups.has(level)) {
        groups.set(level, [])
      }
      groups.get(level)!.push(taskId)
    })

    return Array.from(groups.values())
  }

  private calculateMaxDependencyDepth(dependencies: TaskDependency[], tasks: SubTask[]): number {
    const reverseAdjacencyList = this.buildReverseAdjacencyList(dependencies)

    const depths = new Map<string, number>()

    const calculateDepth = (taskId: string): number => {
      if (depths.has(taskId)) {
        return depths.get(taskId)!
      }

      const predecessors = reverseAdjacencyList.get(taskId) ?? []
      if (predecessors.length === 0) {
        depths.set(taskId, 0)
        return 0
      }

      const maxPredDepth = Math.max(
        ...predecessors.map(predId => calculateDepth(predId))
      )
      const depth = maxPredDepth + 1
      depths.set(taskId, depth)
      return depth
    }

    let maxDepth = 0
    tasks.forEach(task => {
      const depth = calculateDepth(task.id)
      if (depth > maxDepth) {
        maxDepth = depth
      }
    })

    return maxDepth
  }

  private calculateParallelizationScore(parallelGroupCount: number, taskCount: number): number {
    if (taskCount === 0) return 0
    if (taskCount === 1) return 1

    const maxParallelism = Math.min(parallelGroupCount, taskCount)
    return maxParallelism / taskCount
  }

  private getDefaultRules(): DependencyRule[] {
    return [
      {
        id: 'capability-dependency',
        name: '能力依赖规则',
        description: '当一个任务的输出是另一个任务的输入时创建依赖',
        condition: (task, allTasks) => {
          return task.requiredCapabilities.length > 0
        },
        createDependency: (task, matchedTasks) => {
          const dependencies: TaskDependency[] = []

          matchedTasks.forEach(matchedTask => {
            const hasCommonCapability = task.requiredCapabilities.some(cap =>
              matchedTask.requiredCapabilities.includes(cap)
            )

            if (hasCommonCapability && task.priority === 'high' && matchedTask.priority !== 'high') {
              dependencies.push({
                fromTaskId: task.id,
                toTaskId: matchedTask.id,
                type: 'soft',
              })
            }
          })

          return dependencies
        },
      },
      {
        id: 'phase-dependency',
        name: '阶段依赖规则',
        description: '基于任务阶段创建依赖关系',
        condition: (task, allTasks) => {
          return task.metadata?.phase !== undefined
        },
        createDependency: (task, matchedTasks) => {
          const dependencies: TaskDependency[] = []
          const taskPhase = task.metadata?.phase as string

          const phaseOrder = ['analysis', 'design', 'implementation', 'verification', 'documentation']
          const currentPhaseIndex = phaseOrder.indexOf(taskPhase)

          if (currentPhaseIndex > 0) {
            const previousPhase = phaseOrder[currentPhaseIndex - 1]
            
            matchedTasks.forEach(matchedTask => {
              if (matchedTask.metadata?.phase === previousPhase) {
                dependencies.push({
                  fromTaskId: matchedTask.id,
                  toTaskId: task.id,
                  type: 'blocks',
                })
              }
            })
          }

          return dependencies
        },
      },
    ]
  }

  private getDefaultPatterns(): DependencyPattern[] {
    return [
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
              dependencies.push({
                fromTaskId: current.id,
                toTaskId: next.id,
                type: 'blocks',
              })
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
              const hasExistingDep = targetTask.dependencies?.includes(sourceTask.id)
              if (!hasExistingDep) {
                dependencies.push({
                  fromTaskId: sourceTask.id,
                  toTaskId: targetTask.id,
                  type: 'soft',
                })
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
              const hasExistingDep = verTask.dependencies?.includes(implTask.id)
              if (!hasExistingDep) {
                dependencies.push({
                  fromTaskId: implTask.id,
                  toTaskId: verTask.id,
                  type: 'blocks',
                })
              }
            })
          })

          return dependencies
        },
      },
    ]
  }

  addRule(rule: DependencyRule): void {
    this.rules.push(rule)
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId)
  }

  addPattern(pattern: DependencyPattern): void {
    this.patterns.push(pattern)
  }

  removePattern(patternId: string): void {
    this.patterns = this.patterns.filter(p => p.id !== patternId)
  }

  getRules(): DependencyRule[] {
    return [...this.rules]
  }

  getPatterns(): DependencyPattern[] {
    return [...this.patterns]
  }
}