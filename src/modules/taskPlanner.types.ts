import type { TaskPlan } from './taskTypes'
import type { DecompositionConfig } from './taskDecomposer'
import type { SchedulingConfig } from './taskScheduler'

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
