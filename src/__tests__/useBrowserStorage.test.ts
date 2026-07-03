import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

describe('useBrowserStorage', () => {
  let mockStorage: any

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    mockStorage = {
      init: vi.fn().mockResolvedValue(undefined),
      getProjects: vi.fn().mockResolvedValue([]),
      saveProject: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn().mockResolvedValue(null),
      addSubtask: vi.fn().mockResolvedValue(undefined),
      updateSubtaskStatus: vi.fn().mockResolvedValue(undefined),
      deleteTask: vi.fn().mockResolvedValue(undefined),
      exportAll: vi.fn().mockResolvedValue('{}'),
      importAll: vi.fn().mockResolvedValue(undefined),
    }
    vi.doMock('../services/browserStorage', () => ({
      browserStorage: mockStorage,
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.doUnmock('../services/browserStorage')
  })

  async function setupHook(projects: any[] = []) {
    mockStorage.getProjects.mockResolvedValue(projects)
    const { useBrowserStorage } = await import('../hooks/useBrowserStorage')
    const { result } = renderHook(() => useBrowserStorage())
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    return result
  }

  describe('initialization', () => {
    it('should initialize and set isReady', async () => {
      const result = await setupHook()
      expect(result.current.isReady).toBe(true)
      expect(result.current.projects).toEqual([])
      expect(mockStorage.init).toHaveBeenCalled()
    })

    it('should load projects on init', async () => {
      const result = await setupHook([
        { project_id: 'p1', name: 'Project 1', status: 'active', category: 'dev', created_at: '', tasks: [] },
      ])
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.projects[0].name).toBe('Project 1')
    })

    it('should handle init error gracefully', async () => {
      mockStorage.init.mockRejectedValue(new Error('init failed'))
      const result = await setupHook()
      expect(result.current.isReady).toBe(true)
    })
  })

  describe('saveProject', () => {
    it('should save new project and add to state', async () => {
      const result = await setupHook()
      const project = { project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '', tasks: [] }

      await act(async () => {
        await result.current.saveProject(project)
      })

      expect(mockStorage.saveProject).toHaveBeenCalledWith(project)
      expect(result.current.projects).toHaveLength(1)
    })

    it('should update existing project in state', async () => {
      const result = await setupHook([
        { project_id: 'p1', name: 'Old', status: 'planning', category: '其他', created_at: '', tasks: [] },
      ])

      await act(async () => {
        await result.current.saveProject({ project_id: 'p1', name: 'New', status: 'active', category: '其他', created_at: '', tasks: [] })
      })

      expect(result.current.projects[0].name).toBe('New')
    })
  })

  describe('deleteProject', () => {
    it('should delete project from state', async () => {
      const result = await setupHook([
        { project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '', tasks: [] },
      ])

      await act(async () => {
        await result.current.deleteProject('p1')
      })

      expect(mockStorage.deleteProject).toHaveBeenCalledWith('p1')
      expect(result.current.projects).toHaveLength(0)
    })
  })

  describe('createProject', () => {
    it('should create project with default category', async () => {
      const result = await setupHook()

      await act(async () => {
        const project = await result.current.createProject('My Project')
        expect(project.name).toBe('My Project')
        expect(project.category).toBe('其他')
        expect(project.status).toBe('planning')
      })

      expect(result.current.projects).toHaveLength(1)
    })

    it('should create project with custom category', async () => {
      const result = await setupHook()

      await act(async () => {
        const project = await result.current.createProject('P1', '开发')
        expect(project.category).toBe('开发')
      })
    })
  })

  describe('renameProject', () => {
    it('should rename project', async () => {
      const existing = { project_id: 'p1', name: 'Old', status: 'planning', category: '其他', created_at: '', tasks: [] }
      mockStorage.getProject.mockResolvedValue({ ...existing })
      const result = await setupHook([existing])

      await act(async () => {
        await result.current.renameProject('p1', 'New Name')
      })

      expect(result.current.projects[0].name).toBe('New Name')
    })

    it('should do nothing when project not found', async () => {
      mockStorage.getProject.mockResolvedValue(null)
      const result = await setupHook()

      await act(async () => {
        await result.current.renameProject('bad', 'Name')
      })

      expect(mockStorage.saveProject).not.toHaveBeenCalled()
    })
  })

  describe('addTask', () => {
    it('should add task to project', async () => {
      const existing = { project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '', tasks: [] }
      // Return fresh copy each time so mutations don't affect initial state
      mockStorage.getProject.mockResolvedValue({ ...existing, tasks: [] })
      const result = await setupHook([existing])

      await act(async () => {
        const task = await result.current.addTask('p1', 'New task')
        expect(task?.description).toBe('New task')
        expect(task?.status).toBe('pending')
      })

      expect(result.current.projects[0].tasks).toHaveLength(1)
    })

    it('should return null for non-existent project', async () => {
      mockStorage.getProject.mockResolvedValue(null)
      const result = await setupHook()

      await act(async () => {
        const task = await result.current.addTask('bad', 'task')
        expect(task).toBeNull()
      })
    })
  })

  describe('addSubtask', () => {
    it('should add subtask to task', async () => {
      const existing = {
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{ task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '', subtasks: [] }],
      }
      const result = await setupHook([existing])

      await act(async () => {
        await result.current.addSubtask('t1', 'Sub task', 'a1')
      })

      expect(result.current.projects[0].tasks[0].subtasks).toHaveLength(1)
      expect(result.current.projects[0].tasks[0].subtasks[0].agent_id).toBe('a1')
    })

    it('should do nothing when task not found', async () => {
      const result = await setupHook([{ project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '', tasks: [] }])

      await act(async () => {
        await result.current.addSubtask('bad', 'Sub', 'a1')
      })

      expect(mockStorage.addSubtask).not.toHaveBeenCalled()
    })
  })

  describe('updateSubtaskStatus', () => {
    it('should update subtask status', async () => {
      const existing = {
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{
          task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '',
          subtasks: [{ subtask_id: 's1', description: 'S1', status: 'pending', agent_id: '', created_at: 0, completed_at: 0 }],
        }],
      }
      const result = await setupHook([existing])

      await act(async () => {
        await result.current.updateSubtaskStatus('t1', 's1', 'completed')
      })

      expect(mockStorage.updateSubtaskStatus).toHaveBeenCalledWith('t1', 's1', 'completed')
      expect(result.current.projects[0].tasks[0].subtasks[0].status).toBe('completed')
    })

    it('should not set completed_at for non-completed status', async () => {
      const existing = {
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{
          task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '',
          subtasks: [{ subtask_id: 's1', description: 'S1', status: 'pending', agent_id: '', created_at: 0, completed_at: 0 }],
        }],
      }
      const result = await setupHook([existing])

      await act(async () => {
        await result.current.updateSubtaskStatus('t1', 's1', 'in_progress')
      })

      expect(result.current.projects[0].tasks[0].subtasks[0].completed_at).toBe(0)
    })
  })

  describe('deleteTask', () => {
    it('should delete task from project', async () => {
      const existing = {
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{ task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '', subtasks: [] }],
      }
      const result = await setupHook([existing])

      await act(async () => {
        await result.current.deleteTask('t1')
      })

      expect(mockStorage.deleteTask).toHaveBeenCalledWith('t1')
      expect(result.current.projects[0].tasks).toHaveLength(0)
    })
  })

  describe('getCategories', () => {
    it('should group projects by category', async () => {
      const result = await setupHook([
        { project_id: 'p1', name: 'P1', status: 'active', category: '开发', created_at: '', tasks: [] },
        { project_id: 'p2', name: 'P2', status: 'active', category: '开发', created_at: '', tasks: [] },
        { project_id: 'p3', name: 'P3', status: 'active', category: '测试', created_at: '', tasks: [] },
      ])

      const categories = result.current.getCategories()
      expect(Object.keys(categories)).toHaveLength(2)
      expect(categories['开发']).toHaveLength(2)
      expect(categories['测试']).toHaveLength(1)
    })

    it('should use 未分类 for empty category', async () => {
      const result = await setupHook([
        { project_id: 'p1', name: 'P1', status: 'active', category: '', created_at: '', tasks: [] },
      ])

      const categories = result.current.getCategories()
      expect(categories['未分类']).toHaveLength(1)
    })
  })

  describe('exportData / importData', () => {
    it('should export data', async () => {
      mockStorage.exportAll.mockResolvedValue('{"data": true}')
      const result = await setupHook()

      await act(async () => {
        const data = await result.current.exportData()
        expect(data).toBe('{"data": true}')
      })
    })

    it('should import data and refresh', async () => {
      const result = await setupHook()
      mockStorage.getProjects.mockResolvedValue([{ project_id: 'p1', name: 'Imported', status: 'planning', category: '其他', created_at: '', tasks: [] }])

      await act(async () => {
        await result.current.importData('{"data": true}')
      })

      expect(mockStorage.importAll).toHaveBeenCalledWith('{"data": true}')
      expect(result.current.projects).toHaveLength(1)
    })
  })
})
