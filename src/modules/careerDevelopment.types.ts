/** Agent 职业发展类型定义 */

export interface SkillProgress {
  skill_id: string
  xp: number
  level: number      // 0=未解锁, 1=初级, 2=中级, 3=高级
  task_count: number
  success_count: number
  avg_review_score: number
  last_used_at: string
}

export interface AgentProfile {
  agent_id: string
  name: string
  created_at: number
  career_stage: string    // "junior" / "mid" / "senior" / "lead" or role name
  department: string      // e.g. "dept-software"
  total_xp: number
  skill_progress: Record<string, SkillProgress>
}

export interface SkillDefinition {
  description: string
  category: string        // engineering / design / content / data / management
  prerequisites: { skill: string; min_level: number }[]
  xp_thresholds: [number, number, number]   // [初级, 中级, 高级]
}

export interface GrantXPResult {
  xp_gained: number
  new_level: number
  leveled_up: boolean
  skill_id: string
  promoted_to?: { stage: string; title: string; department: string }
}

export interface PromotionStatus {
  can_promote_to: string | null
  current_stage: string
}

export interface CareerPathStage {
  stage: string
  title: string
  requirements?: {
    min_mid_skills?: number
    min_senior_skills?: number
    required_skills?: Record<string, number>
  }
}

export interface DepartmentCareerPath {
  department: string
  name: string
  stages: CareerPathStage[]
}

export interface CareerPathResponse {
  department: string
  path: DepartmentCareerPath | null
  current_stage: string
}
