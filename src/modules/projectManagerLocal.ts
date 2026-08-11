/**
 * 本地项目管理器
 *
 * 纯前端内存实现的项目管理器，支持项目 CRUD、任务管理、归档。
 */

export interface ProjectTask {
  taskId: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  assignee: string | null
  createdAt: string
}

export interface Project {
  projectId: string
  name: string
  description: string
  status: 'active' | 'archived' | 'deleted'
  category: string
  createdAt: string
  tasks: ProjectTask[]
}

export class ProjectManagerLocal {
  private projects: Map<string, Project> = new Map()

  /**
   * 创建新项目。
   */
  createProject(
    name: string,
    description: string,
    category = 'general',
  ): Project {
    const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const project: Project = {
      projectId,
      name,
      description,
      status: 'active',
      category,
      createdAt: new Date().toISOString(),
      tasks: [],
    }
    this.projects.set(projectId, project)
    return { ...project, tasks: [] }
  }

  /**
   * 获取项目详情。
   */
  getProject(projectId: string): Project | null {
    const project = this.projects.get(projectId)
    return project ? { ...project, tasks: [...project.tasks] } : null
  }

  /**
   * 列出所有项目。
   * 可选 status 过滤。
   */
  listProjects(status?: Project['status']): Project[] {
    const result: Project[] = []
    for (const project of this.projects.values()) {
      if (!status || project.status === status) {
        result.push({ ...project, tasks: [...project.tasks] })
      }
    }
    return result
  }

  /**
   * 删除项目（软删除，标记为 deleted）。
   */
  deleteProject(projectId: string): boolean {
    const project = this.projects.get(projectId)
    if (!project) return false
    project.status = 'deleted'
    return true
  }

  /**
   * 添加任务到项目。
   */
  addTask(
    projectId: string,
    title: string,
    description: string,
    assignee?: string,
  ): ProjectTask | null {
    const project = this.projects.get(projectId)
    if (!project || project.status !== 'active') return null

    const task: ProjectTask = {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      status: 'pending',
      assignee: assignee ?? null,
      createdAt: new Date().toISOString(),
    }
    project.tasks.push(task)
    return { ...task }
  }

  /**
   * 更新任务状态。
   */
  updateTaskStatus(
    projectId: string,
    taskId: string,
    status: ProjectTask['status'],
  ): boolean {
    const project = this.projects.get(projectId)
    if (!project) return false

    const task = project.tasks.find(t => t.taskId === taskId)
    if (!task) return false

    task.status = status
    return true
  }

  /**
   * 获取项目的所有任务。
   * 可选 status 过滤。
   */
  getProjectTasks(
    projectId: string,
    status?: ProjectTask['status'],
  ): ProjectTask[] {
    const project = this.projects.get(projectId)
    if (!project) return []

    if (!status) return [...project.tasks]
    return project.tasks.filter(t => t.status === status).map(t => ({ ...t }))
  }

  /**
   * 归档项目。
   */
  archiveProject(projectId: string): boolean {
    const project = this.projects.get(projectId)
    if (!project || project.status !== 'active') return false
    project.status = 'archived'
    return true
  }
}

/** 全局单例 */
export const projectManagerLocal = new ProjectManagerLocal()
