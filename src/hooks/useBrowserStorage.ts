import { useState, useEffect, useCallback } from 'react'
import { browserStorage } from '../services/browserStorage'
import type { SubTask, ProjectTask } from '../components/office-team/types'

export interface Project {
  project_id: string
  name: string
  status: string
  category: string
  created_at: string
  tasks: ProjectTask[]
}

export type { SubTask, ProjectTask }

export function useBrowserStorage() {
  const [isReady, setIsReady] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])

  // 初始化存储
  useEffect(() => {
    browserStorage.init().then(async () => {
      const stored = await browserStorage.getProjects()
      setProjects(stored)
      setIsReady(true)
    }).catch(err => {
      console.error('浏览器存储初始化失败:', err)
      setIsReady(true)
    })
  }, [])

  // 保存项目
  const saveProject = useCallback(async (project: Project) => {
    await browserStorage.saveProject(project)
    setProjects(prev => {
      const idx = prev.findIndex(p => p.project_id === project.project_id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = project
        return next
      }
      return [...prev, project]
    })
  }, [])

  // 删除项目
  const deleteProject = useCallback(async (projectId: string) => {
    await browserStorage.deleteProject(projectId)
    setProjects(prev => prev.filter(p => p.project_id !== projectId))
  }, [])

  // 创建项目
  const createProject = useCallback(async (name: string, category: string = '其他'): Promise<Project> => {
    const project: Project = {
      project_id: `proj-${Date.now()}`,
      name,
      status: 'planning',
      category,
      created_at: new Date().toISOString(),
      tasks: [],
    }
    await saveProject(project)
    return project
  }, [saveProject])

  // 重命名项目
  const renameProject = useCallback(async (projectId: string, newName: string) => {
    const project = await browserStorage.getProject(projectId)
    if (project) {
      project.name = newName
      await browserStorage.saveProject(project)
      setProjects(prev => prev.map(p => p.project_id === projectId ? { ...p, name: newName } : p))
    }
  }, [])

  // 添加任务
  const addTask = useCallback(async (projectId: string, description: string): Promise<ProjectTask | null> => {
    const project = await browserStorage.getProject(projectId)
    if (!project) return null

    const task: ProjectTask = {
      task_id: `task-${Date.now()}`,
      project_id: projectId,
      description,
      status: 'pending',
      created_at: Date.now() / 1000,
      completed_at: 0,
      meeting_id: '',
      subtasks: [],
    }

    if (!project.tasks) project.tasks = []
    project.tasks.push(task)
    await browserStorage.saveProject(project)
    setProjects(prev => prev.map(p => p.project_id === projectId ? { ...p, tasks: [...(p.tasks || []), task] } : p))
    return task
  }, [])

  // 添加子任务
  const addSubtask = useCallback(async (taskId: string, description: string, agentId: string = ''): Promise<void> => {
    // 找到包含此任务的项目
    for (const project of projects) {
      const task = project.tasks?.find(t => t.task_id === taskId)
      if (task) {
        const subtask: SubTask = {
          subtask_id: `sub-${Date.now()}`,
          description,
          status: 'pending',
          agent_id: agentId,
          created_at: Date.now() / 1000,
          completed_at: 0,
        }
        await browserStorage.addSubtask(taskId, subtask)
        setProjects(prev => prev.map(p => {
          if (p.project_id === project.project_id) {
            return {
              ...p,
              tasks: p.tasks?.map(t => t.task_id === taskId ? { ...t, subtasks: [...(t.subtasks || []), subtask] } : t)
            }
          }
          return p
        }))
        return
      }
    }
  }, [projects])

  // 更新子任务状态
  const updateSubtaskStatus = useCallback(async (taskId: string, subtaskId: string, status: string): Promise<void> => {
    await browserStorage.updateSubtaskStatus(taskId, subtaskId, status)
    setProjects(prev => prev.map(p => ({
      ...p,
      tasks: p.tasks?.map(t => t.task_id === taskId ? {
        ...t,
        subtasks: t.subtasks?.map(s => s.subtask_id === subtaskId ? { ...s, status, completed_at: status === 'completed' ? Date.now() / 1000 : s.completed_at } : s)
      } : t)
    })))
  }, [])

  // 删除任务
  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    await browserStorage.deleteTask(taskId)
    setProjects(prev => prev.map(p => ({
      ...p,
      tasks: p.tasks?.filter(t => t.task_id !== taskId)
    })))
  }, [])

  // 获取项目分类统计
  const getCategories = useCallback((): Record<string, Project[]> => {
    const categories: Record<string, Project[]> = {}
    for (const project of projects) {
      const cat = project.category || '未分类'
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(project)
    }
    return categories
  }, [projects])

  // 导出数据
  const exportData = useCallback(async (): Promise<string> => {
    return browserStorage.exportAll()
  }, [])

  // 导入数据
  const importData = useCallback(async (data: string): Promise<void> => {
    await browserStorage.importAll(data)
    const stored = await browserStorage.getProjects()
    setProjects(stored)
  }, [])

  return {
    isReady,
    projects,
    saveProject,
    deleteProject,
    createProject,
    renameProject,
    addTask,
    addSubtask,
    updateSubtaskStatus,
    deleteTask,
    getCategories,
    exportData,
    importData,
  }
}
