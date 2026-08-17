import { apiFetch } from '../utils/apiClient'
import type { RouteEntry } from './agentTypes'

const API_BASE = '/api/router'

/** 获取路由表 */
export async function getRouteTable(): Promise<RouteEntry[]> {
  const data = await apiFetch<{ success: boolean; data: RouteEntry[]; error?: string }>(`${API_BASE}/table`)
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 添加/更新路由条目 */
export async function addRouteEntry(entry: Partial<RouteEntry> & { dept_id: string; dept_name: string }): Promise<RouteEntry> {
  const data = await apiFetch<{ success: boolean; data: RouteEntry; error?: string }>(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 删除路由条目 */
export async function removeRouteEntry(deptId: string): Promise<boolean> {
  const data = await apiFetch<{ success: boolean; data: boolean; error?: string }>(`${API_BASE}/table/${deptId}`, {
    method: 'DELETE',
  })
  if (!data.success) throw new Error(data.error)
  return data.data
}
