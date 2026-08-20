export interface SharedRule {
  rule_id: string
  source_project: string
  trigger_condition: string
  action: string
  keywords: string[]
  rule_type: string
  usage_count: number
}

export interface SkillFork {
  fork_id: string
  source_skill: string
  project_id: string
  source_version: string
  local_changes: boolean
}

export interface MarketplaceStats {
  total_rules: number
  total_usage: number
  rule_types: Record<string, number>
}

export interface SkillDetail {
  name: string
  description: string
  version: string
  category: string
  required_tools: string[]
}

export interface CommunitySkill {
  name: string
  version: string
  description: string
  category: string
  keywords: string[]
  repository: string
}
