import type { RouteEntry } from './agentTypes'

const API_BASE = '/api/router'

/** 获取路由表 */
export async function getRouteTable(): Promise<RouteEntry[]> {
  const res = await fetch(`${API_BASE}/table`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 添加/更新路由条目 */
export async function addRouteEntry(entry: Partial<RouteEntry> & { dept_id: string; dept_name: string }): Promise<RouteEntry> {
  const res = await fetch(`${API_BASE}/table`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 删除路由条目 */
export async function removeRouteEntry(deptId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/table/${deptId}`, {
    method: 'DELETE',
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}
