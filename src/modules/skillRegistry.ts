import type { SkillPackage } from './agentTypes'

const API_BASE = '/api/skills'

/** 获取所有已注册技能列表 */
export async function listSkills(): Promise<SkillPackage[]> {
  const res = await fetch(API_BASE)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 注册新技能 */
export async function registerSkill(skillDir: string): Promise<SkillPackage> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill_dir: skillDir }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 克隆技能到目标目录 */
export async function cloneSkill(skillId: string, targetDir: string): Promise<string> {
  const res = await fetch(`${API_BASE}/${skillId}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_dir: targetDir }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 获取技能版本历史 */
export async function getSkillVersions(skillId: string): Promise<Array<{ version: string; created_at: string; changelog: string }>> {
  const res = await fetch(`${API_BASE}/${skillId}/versions`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 获取单个技能详情 */
export async function getSkill(skillId: string): Promise<SkillPackage> {
  const res = await fetch(`${API_BASE}/${skillId}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}
