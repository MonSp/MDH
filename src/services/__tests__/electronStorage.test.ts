import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isElectron, listProjects, saveProject, deleteProject, getProject } from '../electronStorage'

describe('electronStorage adapter', () => {
  beforeEach(() => {
    delete (window as any).mdh
  })

  afterEach(() => {
    delete (window as any).mdh
    vi.restoreAllMocks()
  })

  it('isElectron 返回 true 当 mdh.isElectron 为 true', () => {
    ;(window as any).mdh = { isElectron: true }
    expect(isElectron()).toBe(true)
  })

  it('isElectron 返回 false 当无 mdh', () => {
    expect(isElectron()).toBe(false)
  })

  it('listProjects 调用 mdh:projectList 并返回 data', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: [{ project_id: 'p1' }], error: null }))
    ;(window as any).mdh = { isElectron: true, invoke }
    const projects = await listProjects()
    expect(invoke).toHaveBeenCalledWith('mdh:projectList')
    expect(projects).toEqual([{ project_id: 'p1' }])
  })

  it('saveProject 调用 mdh:projectSave 并传 project 参数', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: null, error: null }))
    ;(window as any).mdh = { isElectron: true, invoke }
    const project = { project_id: 'p1', name: '项目' }
    const ok = await saveProject(project)
    expect(invoke).toHaveBeenCalledWith('mdh:projectSave', { project })
    expect(ok).toBe(true)
  })

  it('deleteProject 调用 mdh:projectDelete 并传 projectId', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: null, error: null }))
    ;(window as any).mdh = { isElectron: true, invoke }
    const ok = await deleteProject('p1')
    expect(invoke).toHaveBeenCalledWith('mdh:projectDelete', { projectId: 'p1' })
    expect(ok).toBe(true)
  })

  it('getProject 调用 mdh:projectGet 并返回项目', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: { project_id: 'p1' }, error: null }))
    ;(window as any).mdh = { isElectron: true, invoke }
    const project = await getProject('p1')
    expect(invoke).toHaveBeenCalledWith('mdh:projectGet', { projectId: 'p1' })
    expect(project).toEqual({ project_id: 'p1' })
  })

  it('invoke 失败时返回空数组/null', async () => {
    const invoke = vi.fn(async () => ({ success: false, data: null, error: 'boom' }))
    ;(window as any).mdh = { isElectron: true, invoke }
    expect(await listProjects()).toEqual([])
    expect(await getProject('x')).toBeNull()
  })
})
