import { apiFetch } from '../utils/apiClient'
import type { ExperienceRule } from './agentTypes'

const API_BASE = '/api/experience/rules'

/** 获取所有经验规则 */
export async function getAllRules(): Promise<ExperienceRule[]> {
  const data = await apiFetch<{ success: boolean; data: ExperienceRule[]; error?: string }>(API_BASE)
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 获取待审核的经验规则 */
export async function getPendingRules(): Promise<ExperienceRule[]> {
  const data = await apiFetch<{ success: boolean; data: ExperienceRule[]; error?: string }>(`${API_BASE}/pending`)
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 审批通过经验规则 */
export async function approveRule(ruleId: string, comment?: string): Promise<boolean> {
  const data = await apiFetch<{ success: boolean; data: boolean; error?: string }>(`${API_BASE}/${ruleId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 驳回经验规则 */
export async function rejectRule(ruleId: string, reason: string): Promise<boolean> {
  const data = await apiFetch<{ success: boolean; data: boolean; error?: string }>(`${API_BASE}/${ruleId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 修改经验规则 */
export async function modifyRule(ruleId: string, updates: Partial<ExperienceRule>): Promise<boolean> {
  const data = await apiFetch<{ success: boolean; data: boolean; error?: string }>(`${API_BASE}/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!data.success) throw new Error(data.error)
  return data.data
}
