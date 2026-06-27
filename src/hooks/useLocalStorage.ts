import { useState, useEffect, useCallback } from 'react'
import {
  isFileSystemSupported,
  selectDirectory,
  getDirectoryName,
  getProjects,
  saveProject,
  deleteProject as fsDeleteProject,
  renameProject as fsRenameProject,
  addTask as fsAddTask,
  deleteTask as fsDeleteTask,
  addSubtask as fsAddSubtask,
  updateSubtaskStatus as fsUpdateSubtaskStatus,
  getCategories as fsGetCategories,
  exportAll,
  importAll,
  hasSavedHandle,
  requestSavedPermission,
  tryRestoreDirectory,
  tryGetProjects,
  type ProjectData,
  type TaskData,
  type SubTaskData,
} from '../services/fileSystemStorage'

export type { ProjectData as Project, TaskData as ProjectTask, SubTaskData as SubTask }

export function useLocalStorage() {
  const [isReady, setIsReady] = useState(false)
  const [isSupported] = useState(isFileSystemSupported())
  const [dirName, setDirName] = useState<string | null>(null)
  const [needPermission, setNeedPermission] = useState(false)
  const [projects, setProjects] = useState<ProjectData[]>([])

  // 初始化：静默恢复已保存的目录
  useEffect(() => {
    if (!isSupported) {
      console.log('[Storage] File System API 不支持')
      setIsReady(true)
      return
    }

    console.log('[Storage] 初始化，尝试恢复已保存目录...')
    
    // 静默尝试恢复目录（不弹窗）
    tryRestoreDirectory().then(async (restored) => {
      console.log('[Storage] 目录恢复结果:', restored)
      if (restored) {
        const name = await getDirectoryName()
        console.log('[Storage] 目录名:', name)
        setDirName(name)
        const stored = await tryGetProjects()
        console.log('[Storage] 加载项目数:', stored.length)
        setProjects(stored)
      } else {
        // 检查是否有已保存的句柄（可能需要授权）
        const hasSaved = await hasSavedHandle()
        console.log('[Storage] 有已保存句柄:', hasSaved)
        if (hasSaved) {
          setNeedPermission(true)
        }
      }
      setIsReady(true)
    }).catch((e) => {
      console.error('[Storage] 初始化失败:', e)
      setIsReady(true)
    })
  }, [isSupported])

  // 授权访问已保存的目录
  const grantAccess = useCallback(async (): Promise<boolean> => {
    try {
      const success = await requestSavedPermission()
      console.log('[Storage] 授权结果:', success)
      if (success) {
        setNeedPermission(false)
        const name = await getDirectoryName()
        console.log('[Storage] 目录名:', name)
        setDirName(name)
        const stored = await getProjects()
        console.log('[Storage] 加载项目数:', stored.length)
        setProjects(stored)
      }
      return success
    } catch (e) {
      console.error('[Storage] 授权失败:', e)
      return false
    }
  }, [])

  // 选择存储目录
  const initStorage = useCallback(async (): Promise<boolean> => {
    try {
      const success = await selectDirectory()
      console.log('[Storage] 选择目录结果:', success)
      if (success) {
        setNeedPermission(false)
        const name = await getDirectoryName()
        console.log('[Storage] 目录名:', name)
        setDirName(name)
        const stored = await getProjects()
        console.log('[Storage] 加载项目数:', stored.length)
        setProjects(stored)
      }
      return success
    } catch (e) {
      console.error('[Storage] 选择目录失败:', e)
      return false
    }
  }, [])

  // 刷新项目列表
  const refreshProjects = useCallback(async () => {
    const stored = await getProjects()
    setProjects(stored)
  }, [])

  // 创建项目
  const createProject = useCallback(async (name: string, category: string = '其他'): Promise<ProjectData> => {
    const project: ProjectData = {
      project_id: `proj-${Date.now()}`,
      name,
      status: 'planning',
      category,
      created_at: new Date().toISOString(),
      tasks: [],
      skill_packages: [],
      employees: [],
      execution_logs: [],
    }
    await saveProject(project)
    setProjects(prev => [...prev, project])
    return project
  }, [])

  // 删除项目
  const deleteProjectFn = useCallback(async (projectId: string) => {
    await fsDeleteProject(projectId)
    setProjects(prev => prev.filter(p => p.project_id !== projectId))
  }, [])

  // 重命名项目
  const renameProjectFn = useCallback(async (projectId: string, newName: string) => {
    await fsRenameProject(projectId, newName)
    setProjects(prev => prev.map(p => p.project_id === projectId ? { ...p, name: newName } : p))
  }, [])

  // 添加任务
  const addTaskFn = useCallback(async (projectId: string, description: string): Promise<TaskData | null> => {
    const task: TaskData = {
      task_id: `task-${Date.now()}`,
      project_id: projectId,
      description,
      status: 'pending',
      created_at: Date.now() / 1000,
      completed_at: 0,
      meeting_id: '',
      subtasks: [],
    }
    await fsAddTask(projectId, task)
    setProjects(prev => prev.map(p => {
      if (p.project_id === projectId) {
        return { ...p, tasks: [...(p.tasks || []), task] }
      }
      return p
    }))
    return task
  }, [])

  // 删除任务
  const deleteTaskFn = useCallback(async (projectId: string, taskId: string) => {
    await fsDeleteTask(projectId, taskId)
    setProjects(prev => prev.map(p => {
      if (p.project_id === projectId) {
        return { ...p, tasks: p.tasks?.filter(t => t.task_id !== taskId) || [] }
      }
      return p
    }))
  }, [])

  // 添加子任务
  const addSubtaskFn = useCallback(async (projectId: string, taskId: string, description: string, agentId: string = '') => {
    const subtask: SubTaskData = {
      subtask_id: `sub-${Date.now()}`,
      description,
      status: 'pending',
      agent_id: agentId,
      created_at: Date.now() / 1000,
      completed_at: 0,
    }
    await fsAddSubtask(projectId, taskId, subtask)
    setProjects(prev => prev.map(p => {
      if (p.project_id === projectId) {
        return {
          ...p,
          tasks: p.tasks?.map(t => {
            if (t.task_id === taskId) {
              return { ...t, subtasks: [...(t.subtasks || []), subtask] }
            }
            return t
          }) || []
        }
      }
      return p
    }))
  }, [])

  // 更新子任务状态
  const updateSubtaskStatusFn = useCallback(async (projectId: string, taskId: string, subtaskId: string, status: string) => {
    await fsUpdateSubtaskStatus(projectId, taskId, subtaskId, status)
    setProjects(prev => prev.map(p => {
      if (p.project_id === projectId) {
        return {
          ...p,
          tasks: p.tasks?.map(t => {
            if (t.task_id === taskId) {
              return {
                ...t,
                subtasks: t.subtasks?.map(s => {
                  if (s.subtask_id === subtaskId) {
                    return { ...s, status, completed_at: status === 'completed' ? Date.now() / 1000 : s.completed_at }
                  }
                  return s
                }) || []
              }
            }
            return t
          }) || []
        }
      }
      return p
    }))
  }, [])

  // 获取分类
  const getCategoriesFn = useCallback((): Record<string, ProjectData[]> => {
    const categories: Record<string, ProjectData[]> = {}
    for (const project of projects) {
      const cat = project.category || '未分类'
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(project)
    }
    return categories
  }, [projects])

  // 导出
  const exportData = useCallback(async (): Promise<string> => {
    return exportAll()
  }, [])

  // 导入
  const importData = useCallback(async (data: string) => {
    await importAll(data)
    await refreshProjects()
  }, [refreshProjects])

  return {
    isReady,
    isSupported,
    dirName,
    needPermission,
    projects,
    initStorage,
    grantAccess,
    refreshProjects,
    createProject,
    deleteProject: deleteProjectFn,
    renameProject: renameProjectFn,
    addTask: addTaskFn,
    deleteTask: deleteTaskFn,
    addSubtask: addSubtaskFn,
    updateSubtaskStatus: updateSubtaskStatusFn,
    getCategories: getCategoriesFn,
    exportData,
    importData,
  }
}
