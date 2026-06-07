import type { SkillPackage } from './agentTypes'
import { apiClient, ApiResponse } from './apiClient'

/** 获取所有已注册技能列表 */
export async function listSkills(): Promise<ApiResponse<SkillPackage[]>> {
  return apiClient.get<SkillPackage[]>('/skills')
}

/** 注册新技能 */
export async function registerSkill(skillDir: string): Promise<ApiResponse<SkillPackage>> {
  return apiClient.post<SkillPackage>('/skills', { skill_dir: skillDir })
}

/** 克隆技能到目标目录 */
export async function cloneSkill(skillId: string, targetDir: string): Promise<ApiResponse<{ cloned_path: string }>> {
  return apiClient.post<{ cloned_path: string }>(`/skills/${skillId}/clone`, { target_dir: targetDir })
}

/** 获取技能版本历史 */
export async function getSkillVersions(skillId: string): Promise<ApiResponse<Array<{ version: string; created_at: string; changelog: string }>>> {
  return apiClient.get<Array<{ version: string; created_at: string; changelog: string }>>(`/skills/${skillId}/versions`)
}

/** 获取单个技能详情 */
export async function getSkill(skillId: string): Promise<ApiResponse<SkillPackage>> {
  return apiClient.get<SkillPackage>(`/skills/${skillId}`)
}
