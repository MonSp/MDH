import type { Project, ProjectStatus } from './agentTypes'

const API_BASE = '/api/projects'

/** 获取所有项目列表 */
export async function listProjects(): Promise<Project[]> {
  const res = await fetch(API_BASE)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 创建新项目 */
export async function createProject(name: string, brief: Record<string, any>): Promise<Project> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, brief }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 获取项目详情 */
export async function getProject(projectId: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/${projectId}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 获取项目运行状态 */
export async function getProjectStatus(projectId: string): Promise<ProjectStatus> {
  const res = await fetch(`${API_BASE}/${projectId}/status`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 实例化项目（根据 DAG 启动员工） */
export async function instantiateProject(projectId: string, dag: Record<string, any>): Promise<any> {
  const res = await fetch(`${API_BASE}/${projectId}/instantiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dag }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 归档项目 */
export async function archiveProject(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/${projectId}/archive`, {
    method: 'POST',
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}
