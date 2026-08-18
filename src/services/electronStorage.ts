/**
 * Electron 项目存储适配层
 *
 * 在 Electron 环境下，项目数据通过 IPC 存储到主进程的 userData/projects.json，
 * 替代浏览器端的 File System Access API。
 */

import { isElectron, getMdH } from '../constants'

export { isElectron }

export async function listProjects(): Promise<any[]> {
  const mdh = getMdH()
  if (!mdh) return []
  const result = await mdh.invoke('mdh:projectList')
  return result?.success ? (result.data || []) : []
}

export async function saveProject(project: any): Promise<boolean> {
  const mdh = getMdH()
  if (!mdh) return false
  const result = await mdh.invoke('mdh:projectSave', { project })
  return !!result?.success
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const mdh = getMdH()
  if (!mdh) return false
  const result = await mdh.invoke('mdh:projectDelete', { projectId })
  return !!result?.success
}

export async function getProject(projectId: string): Promise<any | null> {
  const mdh = getMdH()
  if (!mdh) return null
  const result = await mdh.invoke('mdh:projectGet', { projectId })
  return result?.success ? result.data : null
}
