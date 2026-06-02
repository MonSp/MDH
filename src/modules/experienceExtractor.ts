import type { ExperienceRule } from './agentTypes'

const API_BASE = '/api/experience'

/** 获取所有经验规则 */
export async function getAllRules(): Promise<ExperienceRule[]> {
  const res = await fetch(API_BASE)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 获取待审核的经验规则 */
export async function getPendingRules(): Promise<ExperienceRule[]> {
  const res = await fetch(`${API_BASE}/pending`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 审批通过经验规则 */
export async function approveRule(ruleId: string, comment?: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/${ruleId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 驳回经验规则 */
export async function rejectRule(ruleId: string, reason: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/${ruleId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 修改经验规则 */
export async function modifyRule(ruleId: string, updates: Partial<ExperienceRule>): Promise<boolean> {
  const res = await fetch(`${API_BASE}/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}
