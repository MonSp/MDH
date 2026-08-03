import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getProjects,
  saveProject,
  deleteProject,
  renameProject,
  addTask,
  deleteTask,
  addSubtask,
  updateSubtaskStatus,
  getCategories,
  exportAll,
  importAll,
  type ProjectData,
  type TaskData,
} from '../fileSystemStorage'

// Mock Electron 环境
function mockElectron(projects: any[] = []) {
  let store = JSON.parse(JSON.stringify(projects))

  ;(window as any).mdh = {
    isElectron: true,
    invoke: vi.fn(async (channel: string, data?: any) => {
      switch (channel) {
        case 'mdh:projectList':
          return { success: true, data: store, error: null }
        case 'mdh:projectSave': {
          const project = data.project
          const idx = store.findIndex((p: any) => p?.project_id === project.project_id)
          if (idx >= 0) store[idx] = project
          else store.push(project)
          return { success: true, data: null, error: null }
        }
        case 'mdh:projectDelete': {
          store = store.filter((p: any) => p?.project_id !== data.projectId)
          return { success: true, data: null, error: null }
        }
        case 'mdh:projectGet': {
          const project = store.find((p: any) => p?.project_id === data.projectId) || null
          return { success: true, data: project, error: null }
        }
        default:
          return { success: false, data: null, error: `unknown channel: ${channel}` }
      }
    }),
  }
}

function mockProject(id: string, name: string): ProjectData {
  return {
    project_id: id,
    name,
    status: 'planning',
    category: '其他',
    created_at: new Date().toISOString(),
    tasks: [],
    skill_packages: [],
    employees: [],
    execution_logs: [],
  }
}

describe('fileSystemStorage (Electron mode)', () => {
  beforeEach(() => {
    mockElectron()
  })

  afterEach(() => {
    delete (window as any).mdh
    vi.restoreAllMocks()
  })

  it('getProjects 返回空数组当无历史项目', async () => {
    const projects = await getProjects()
    expect(projects).toEqual([])
  })

  it('saveProject 新增项目后 getProjects 能读到', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    const projects = await getProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].project_id).toBe('proj-1')
    expect(projects[0].name).toBe('项目A')
  })

  it('saveProject 更新已有项目（同 id 覆盖）', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    const updated = mockProject('proj-1', '项目A-改')
    await saveProject(updated)
    const projects = await getProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('项目A-改')
  })

  it('deleteProject 删除项目', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    await saveProject(mockProject('proj-2', '项目B'))
    await deleteProject('proj-1')
    const projects = await getProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].project_id).toBe('proj-2')
  })

  it('renameProject 修改项目名称', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    await renameProject('proj-1', '新名字')
    const projects = await getProjects()
    expect(projects[0].name).toBe('新名字')
  })

  it('addTask 添加任务到项目', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    const task: TaskData = {
      task_id: 'task-1',
      project_id: 'proj-1',
      description: '写代码',
      status: 'pending',
      created_at: Date.now() / 1000,
      completed_at: 0,
      meeting_id: '',
      subtasks: [],
    }
    await addTask('proj-1', task)
    const projects = await getProjects()
    expect(projects[0].tasks).toHaveLength(1)
    expect(projects[0].tasks[0].description).toBe('写代码')
  })

  it('deleteTask 删除任务', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    const task: TaskData = {
      task_id: 'task-1',
      project_id: 'proj-1',
      description: '写代码',
      status: 'pending',
      created_at: Date.now() / 1000,
      completed_at: 0,
      meeting_id: '',
      subtasks: [],
    }
    await addTask('proj-1', task)
    await deleteTask('proj-1', 'task-1')
    const projects = await getProjects()
    expect(projects[0].tasks).toHaveLength(0)
  })

  it('addSubtask + updateSubtaskStatus 操作子任务', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    const task: TaskData = {
      task_id: 'task-1',
      project_id: 'proj-1',
      description: '写代码',
      status: 'pending',
      created_at: Date.now() / 1000,
      completed_at: 0,
      meeting_id: '',
      subtasks: [],
    }
    await addTask('proj-1', task)
    await addSubtask('proj-1', 'task-1', {
      subtask_id: 'sub-1',
      description: '写测试',
      status: 'pending',
      agent_id: 'agent-x',
      created_at: Date.now() / 1000,
      completed_at: 0,
    })
    await updateSubtaskStatus('proj-1', 'task-1', 'sub-1', 'completed')
    const projects = await getProjects()
    expect(projects[0].tasks[0].subtasks).toHaveLength(1)
    expect(projects[0].tasks[0].subtasks[0].status).toBe('completed')
    expect(projects[0].tasks[0].subtasks[0].completed_at).toBeGreaterThan(0)
  })

  it('getCategories 按 category 分组', async () => {
    const p1 = mockProject('proj-1', '项目A')
    p1.category = '软件开发'
    const p2 = mockProject('proj-2', '项目B')
    p2.category = '软件开发'
    const p3 = mockProject('proj-3', '项目C')
    p3.category = '数据分析'
    await saveProject(p1)
    await saveProject(p2)
    await saveProject(p3)
    const categories = await getCategories()
    expect(categories['软件开发']).toHaveLength(2)
    expect(categories['数据分析']).toHaveLength(1)
  })

  it('exportAll 导出所有项目为 JSON', async () => {
    await saveProject(mockProject('proj-1', '项目A'))
    const data = await exportAll()
    const parsed = JSON.parse(data)
    expect(parsed.projects).toHaveLength(1)
    expect(parsed.exportedAt).toBeTruthy()
  })

  it('importAll 导入项目数据', async () => {
    const data = JSON.stringify({
      projects: [mockProject('imp-1', '导入项目')],
      exportedAt: new Date().toISOString(),
    })
    await importAll(data)
    const projects = await getProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('导入项目')
  })
})
