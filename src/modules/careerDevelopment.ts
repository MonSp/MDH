import { apiFetch } from '../utils/apiClient'
import type { AgentProfile, SkillDefinition, GrantXPResult, PromotionStatus } from './careerDevelopment.types'

const API_BASE = '/api/agents'

/** 获取 Agent 职业档案 */
export async function getAgentProfile(agentId: string): Promise<AgentProfile> {
  const data = await apiFetch<{ success: boolean; data: AgentProfile; error?: string }>(
    `${API_BASE}/${agentId}/profile`,
  )
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 获取技能树定义 */
export async function getSkillTree(): Promise<Record<string, SkillDefinition>> {
  const data = await apiFetch<{ success: boolean; data: Record<string, SkillDefinition>; error?: string }>(
    '/api/skills/tree',
  )
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 授予 XP 经验值 */
export async function grantXP(
  agentId: string,
  params: {
    skill_id: string
    task_success: boolean
    review_score: number
    task_complexity: number
  },
): Promise<GrantXPResult> {
  const data = await apiFetch<{ success: boolean; data: GrantXPResult; error?: string }>(
    `${API_BASE}/${agentId}/grant-xp`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
  )
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 检查晋升资格 */
export async function checkPromotion(agentId: string): Promise<PromotionStatus> {
  const data = await apiFetch<{ success: boolean; data: PromotionStatus; error?: string }>(
    `${API_BASE}/${agentId}/promotion`,
  )
  if (!data.success) throw new Error(data.error)
  return data.data
}
