import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../services/fileSystemStorage', () => ({
  isFileSystemSupported: vi.fn(() => true),
  selectDirectory: vi.fn(),
  getDirectoryName: vi.fn(),
  getProjects: vi.fn(),
  saveProject: vi.fn(),
  deleteProject: vi.fn(),
  renameProject: vi.fn(),
  addTask: vi.fn(),
  deleteTask: vi.fn(),
  addSubtask: vi.fn(),
  updateSubtaskStatus: vi.fn(),
  getCategories: vi.fn(),
  exportAll: vi.fn(),
  importAll: vi.fn(),
  hasSavedHandle: vi.fn(),
  requestSavedPermission: vi.fn(),
  tryRestoreDirectory: vi.fn(),
  tryGetProjects: vi.fn(),
}))

import { useLocalStorage } from '../hooks/useLocalStorage'
import * as fs from '../services/fileSystemStorage'

const mockFs = vi.mocked(fs)

describe('useLocalStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFs.tryRestoreDirectory.mockResolvedValue(false)
    mockFs.hasSavedHandle.mockResolvedValue(false)
    mockFs.getDirectoryName.mockResolvedValue('TestDir')
    mockFs.getProjects.mockResolvedValue([])
    mockFs.tryGetProjects.mockResolvedValue([])
    mockFs.selectDirectory.mockResolvedValue(true)
    mockFs.requestSavedPermission.mockResolvedValue(true)
    mockFs.saveProject.mockResolvedValue(undefined)
    mockFs.deleteProject.mockResolvedValue(undefined)
    mockFs.renameProject.mockResolvedValue(undefined)
    mockFs.addTask.mockResolvedValue(undefined)
    mockFs.deleteTask.mockResolvedValue(undefined)
    mockFs.addSubtask.mockResolvedValue(undefined)
    mockFs.updateSubtaskStatus.mockResolvedValue(undefined)
    mockFs.exportAll.mockResolvedValue('{}')
    mockFs.importAll.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function setupHook() {
    const { result } = renderHook(() => useLocalStorage())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    return result
  }

  describe('initialization', () => {
    it('should initialize as ready when not supported', async () => {
      mockFs.isFileSystemSupported.mockReturnValue(false)
      const { result } = renderHook(() => useLocalStorage())
      await act(async () => { await vi.runAllTimersAsync() })

      expect(result.current.isReady).toBe(true)
      expect(result.current.isSupported).toBe(false)
    })

    it('should restore directory when saved', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{ project_id: 'p1', name: 'Test', status: 'planning', category: '其他', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] }])

      const result = await setupHook()

      expect(result.current.isReady).toBe(true)
      expect(result.current.dirName).toBe('TestDir')
      expect(result.current.projects).toHaveLength(1)
    })

    it('should set needPermission when has saved handle but not restored', async () => {
      mockFs.hasSavedHandle.mockResolvedValue(true)
      const result = await setupHook()

      expect(result.current.needPermission).toBe(true)
    })

    it('should handle init error gracefully', async () => {
      mockFs.tryRestoreDirectory.mockRejectedValue(new Error('fail'))
      const result = await setupHook()

      expect(result.current.isReady).toBe(true)
    })
  })

  describe('grantAccess', () => {
    it('should grant access successfully', async () => {
      mockFs.hasSavedHandle.mockResolvedValue(true)
      const result = await setupHook()

      await act(async () => {
        const success = await result.current.grantAccess()
        expect(success).toBe(true)
      })

      expect(result.current.needPermission).toBe(false)
      expect(result.current.dirName).toBe('TestDir')
    })

    it('should return false on failure', async () => {
      mockFs.requestSavedPermission.mockResolvedValue(false)
      const result = await setupHook()

      await act(async () => {
        const success = await result.current.grantAccess()
        expect(success).toBe(false)
      })
    })

    it('should handle grant error', async () => {
      mockFs.requestSavedPermission.mockRejectedValue(new Error('denied'))
      const result = await setupHook()

      await act(async () => {
        const success = await result.current.grantAccess()
        expect(success).toBe(false)
      })
    })
  })

  describe('initStorage', () => {
    it('should select directory and load projects', async () => {
      mockFs.getProjects.mockResolvedValue([{ project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] }])
      const result = await setupHook()

      await act(async () => {
        const success = await result.current.initStorage()
        expect(success).toBe(true)
      })

      expect(result.current.dirName).toBe('TestDir')
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.needPermission).toBe(false)
    })

    it('should return false when selection fails', async () => {
      mockFs.selectDirectory.mockResolvedValue(false)
      const result = await setupHook()

      await act(async () => {
        const success = await result.current.initStorage()
        expect(success).toBe(false)
      })
    })

    it('should handle init error', async () => {
      mockFs.selectDirectory.mockRejectedValue(new Error('fail'))
      const result = await setupHook()

      await act(async () => {
        const success = await result.current.initStorage()
        expect(success).toBe(false)
      })
    })
  })

  describe('refreshProjects', () => {
    it('should refresh project list', async () => {
      const result = await setupHook()
      mockFs.getProjects.mockResolvedValue([{ project_id: 'p1', name: 'New', status: 'planning', category: '其他', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] }])

      await act(async () => {
        await result.current.refreshProjects()
      })

      expect(result.current.projects).toHaveLength(1)
    })
  })

  describe('createProject', () => {
    it('should create project and add to state', async () => {
      const result = await setupHook()

      await act(async () => {
        const project = await result.current.createProject('My Project', '开发')
        expect(project.name).toBe('My Project')
        expect(project.category).toBe('开发')
      })

      expect(result.current.projects).toHaveLength(1)
      expect(mockFs.saveProject).toHaveBeenCalled()
    })

    it('should default category to 其他', async () => {
      const result = await setupHook()

      await act(async () => {
        const project = await result.current.createProject('Test')
        expect(project.category).toBe('其他')
      })
    })
  })

  describe('deleteProject', () => {
    it('should delete project from state', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{ project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] }])
      const result = await setupHook()

      await act(async () => {
        await result.current.deleteProject('p1')
      })

      expect(result.current.projects).toHaveLength(0)
      expect(mockFs.deleteProject).toHaveBeenCalledWith('p1')
    })
  })

  describe('renameProject', () => {
    it('should rename project in state', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{ project_id: 'p1', name: 'Old', status: 'planning', category: '其他', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] }])
      const result = await setupHook()

      await act(async () => {
        await result.current.renameProject('p1', 'New Name')
      })

      expect(result.current.projects[0].name).toBe('New Name')
    })
  })

  describe('addTask', () => {
    it('should add task to project', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{ project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] }])
      const result = await setupHook()

      await act(async () => {
        const task = await result.current.addTask('p1', 'New task')
        expect(task?.description).toBe('New task')
      })

      expect(result.current.projects[0].tasks).toHaveLength(1)
    })
  })

  describe('deleteTask', () => {
    it('should delete task from project', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{ task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '', subtasks: [] }],
        skill_packages: [], employees: [], execution_logs: [],
      }])
      const result = await setupHook()

      await act(async () => {
        await result.current.deleteTask('p1', 't1')
      })

      expect(result.current.projects[0].tasks).toHaveLength(0)
    })
  })

  describe('addSubtask', () => {
    it('should add subtask to task', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{ task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '', subtasks: [] }],
        skill_packages: [], employees: [], execution_logs: [],
      }])
      const result = await setupHook()

      await act(async () => {
        await result.current.addSubtask('p1', 't1', 'Sub task', 'a1')
      })

      expect(result.current.projects[0].tasks[0].subtasks).toHaveLength(1)
      expect(result.current.projects[0].tasks[0].subtasks[0].agent_id).toBe('a1')
    })
  })

  describe('updateSubtaskStatus', () => {
    it('should update subtask status', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{
          task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '',
          subtasks: [{ subtask_id: 's1', description: 'S1', status: 'pending', agent_id: '', created_at: 0, completed_at: 0 }],
        }],
        skill_packages: [], employees: [], execution_logs: [],
      }])
      const result = await setupHook()

      await act(async () => {
        await result.current.updateSubtaskStatus('p1', 't1', 's1', 'completed')
      })

      expect(result.current.projects[0].tasks[0].subtasks[0].status).toBe('completed')
      expect(result.current.projects[0].tasks[0].subtasks[0].completed_at).toBeGreaterThan(0)
    })

    it('should not set completed_at for non-completed status', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([{
        project_id: 'p1', name: 'P1', status: 'planning', category: '其他', created_at: '',
        tasks: [{
          task_id: 't1', project_id: 'p1', description: 'T1', status: 'pending', created_at: 0, completed_at: 0, meeting_id: '',
          subtasks: [{ subtask_id: 's1', description: 'S1', status: 'pending', agent_id: '', created_at: 0, completed_at: 0 }],
        }],
        skill_packages: [], employees: [], execution_logs: [],
      }])
      const result = await setupHook()

      await act(async () => {
        await result.current.updateSubtaskStatus('p1', 't1', 's1', 'in_progress')
      })

      expect(result.current.projects[0].tasks[0].subtasks[0].status).toBe('in_progress')
      expect(result.current.projects[0].tasks[0].subtasks[0].completed_at).toBe(0)
    })
  })

  describe('getCategories', () => {
    it('should group projects by category', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([
        { project_id: 'p1', name: 'P1', status: 'planning', category: '开发', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] },
        { project_id: 'p2', name: 'P2', status: 'planning', category: '开发', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] },
        { project_id: 'p3', name: 'P3', status: 'planning', category: '测试', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] },
      ])
      const result = await setupHook()

      const categories = result.current.getCategories()
      expect(Object.keys(categories)).toHaveLength(2)
      expect(categories['开发']).toHaveLength(2)
      expect(categories['测试']).toHaveLength(1)
    })

    it('should use 未分类 for projects without category', async () => {
      mockFs.tryRestoreDirectory.mockResolvedValue(true)
      mockFs.tryGetProjects.mockResolvedValue([
        { project_id: 'p1', name: 'P1', status: 'planning', category: '', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] },
      ])
      const result = await setupHook()

      const categories = result.current.getCategories()
      expect(categories['未分类']).toHaveLength(1)
    })
  })

  describe('exportData / importData', () => {
    it('should export data', async () => {
      mockFs.exportAll.mockResolvedValue('{"data": true}')
      const result = await setupHook()

      await act(async () => {
        const data = await result.current.exportData()
        expect(data).toBe('{"data": true}')
      })
    })

    it('should import data and refresh', async () => {
      mockFs.getProjects.mockResolvedValue([{ project_id: 'p1', name: 'Imported', status: 'planning', category: '其他', created_at: '', tasks: [], skill_packages: [], employees: [], execution_logs: [] }])
      const result = await setupHook()

      await act(async () => {
        await result.current.importData('{"data": true}')
      })

      expect(mockFs.importAll).toHaveBeenCalledWith('{"data": true}')
      expect(result.current.projects).toHaveLength(1)
    })
  })
})
