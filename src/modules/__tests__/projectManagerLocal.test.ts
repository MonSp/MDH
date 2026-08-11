import { describe, it, expect, beforeEach } from 'vitest'
import { ProjectManagerLocal } from '../projectManagerLocal'

describe('ProjectManagerLocal', () => {
  let pm: ProjectManagerLocal

  beforeEach(() => {
    pm = new ProjectManagerLocal()
  })

  describe('createProject', () => {
    it('should create a project with required fields', () => {
      const project = pm.createProject('Test Project', 'A test project')

      expect(project.projectId).toMatch(/^proj-/)
      expect(project.name).toBe('Test Project')
      expect(project.description).toBe('A test project')
      expect(project.status).toBe('active')
      expect(project.category).toBe('general')
      expect(project.createdAt).toBeTruthy()
      expect(project.tasks).toEqual([])
    })

    it('should create a project with custom category', () => {
      const project = pm.createProject('API Work', 'Backend tasks', 'backend')
      expect(project.category).toBe('backend')
    })

    it('should generate unique ids', () => {
      const p1 = pm.createProject('A', 'desc')
      const p2 = pm.createProject('B', 'desc')
      expect(p1.projectId).not.toBe(p2.projectId)
    })
  })

  describe('getProject', () => {
    it('should return project by id', () => {
      const created = pm.createProject('Test', 'desc')
      const fetched = pm.getProject(created.projectId)

      expect(fetched).not.toBeNull()
      expect(fetched!.name).toBe('Test')
      expect(fetched!.projectId).toBe(created.projectId)
    })

    it('should return null for non-existent project', () => {
      expect(pm.getProject('nonexistent')).toBeNull()
    })

    it('should return a copy, not a reference', () => {
      const created = pm.createProject('Test', 'desc')
      const fetched1 = pm.getProject(created.projectId)!
      const fetched2 = pm.getProject(created.projectId)!

      expect(fetched1).toEqual(fetched2)
      expect(fetched1).not.toBe(fetched2)
      expect(fetched1.tasks).not.toBe(fetched2.tasks)
    })
  })

  describe('listProjects', () => {
    it('should list all projects', () => {
      pm.createProject('A', 'desc')
      pm.createProject('B', 'desc')
      pm.createProject('C', 'desc')

      const all = pm.listProjects()
      expect(all).toHaveLength(3)
    })

    it('should filter by status', () => {
      const p1 = pm.createProject('A', 'desc')
      pm.createProject('B', 'desc')
      pm.archiveProject(p1.projectId)

      const active = pm.listProjects('active')
      const archived = pm.listProjects('archived')

      expect(active).toHaveLength(1)
      expect(archived).toHaveLength(1)
    })

    it('should exclude deleted projects when filtering by active', () => {
      const p1 = pm.createProject('A', 'desc')
      pm.createProject('B', 'desc')
      pm.deleteProject(p1.projectId)

      const active = pm.listProjects('active')
      expect(active).toHaveLength(1)
    })

    it('should list deleted projects when filtering by deleted', () => {
      const p1 = pm.createProject('A', 'desc')
      pm.deleteProject(p1.projectId)

      const deleted = pm.listProjects('deleted')
      expect(deleted).toHaveLength(1)
    })

    it('should return empty array when no projects', () => {
      expect(pm.listProjects()).toEqual([])
    })
  })

  describe('deleteProject', () => {
    it('should soft-delete a project', () => {
      const project = pm.createProject('Test', 'desc')
      const result = pm.deleteProject(project.projectId)

      expect(result).toBe(true)
      const fetched = pm.getProject(project.projectId)
      expect(fetched!.status).toBe('deleted')
    })

    it('should return false for non-existent project', () => {
      expect(pm.deleteProject('nonexistent')).toBe(false)
    })

    it('should return true even if already deleted', () => {
      const project = pm.createProject('Test', 'desc')
      pm.deleteProject(project.projectId)
      // Second delete on already-deleted project
      const result = pm.deleteProject(project.projectId)
      expect(result).toBe(true)
    })
  })

  describe('addTask', () => {
    it('should add a task to a project', () => {
      const project = pm.createProject('Test', 'desc')
      const task = pm.addTask(project.projectId, 'Build UI', 'Create the frontend')

      expect(task).not.toBeNull()
      expect(task!.taskId).toMatch(/^task-/)
      expect(task!.title).toBe('Build UI')
      expect(task!.description).toBe('Create the frontend')
      expect(task!.status).toBe('pending')
      expect(task!.assignee).toBeNull()
    })

    it('should add task with assignee', () => {
      const project = pm.createProject('Test', 'desc')
      const task = pm.addTask(project.projectId, 'Build UI', 'Frontend', 'alice')

      expect(task!.assignee).toBe('alice')
    })

    it('should return null for non-existent project', () => {
      expect(pm.addTask('nonexistent', 'Task', 'desc')).toBeNull()
    })

    it('should return null for archived project', () => {
      const project = pm.createProject('Test', 'desc')
      pm.archiveProject(project.projectId)

      expect(pm.addTask(project.projectId, 'Task', 'desc')).toBeNull()
    })

    it('should return null for deleted project', () => {
      const project = pm.createProject('Test', 'desc')
      pm.deleteProject(project.projectId)

      expect(pm.addTask(project.projectId, 'Task', 'desc')).toBeNull()
    })

    it('should add multiple tasks', () => {
      const project = pm.createProject('Test', 'desc')
      pm.addTask(project.projectId, 'Task 1', 'desc')
      pm.addTask(project.projectId, 'Task 2', 'desc')
      pm.addTask(project.projectId, 'Task 3', 'desc')

      const tasks = pm.getProjectTasks(project.projectId)
      expect(tasks).toHaveLength(3)
    })
  })

  describe('updateTaskStatus', () => {
    it('should update task status', () => {
      const project = pm.createProject('Test', 'desc')
      const task = pm.addTask(project.projectId, 'Task', 'desc')!

      const result = pm.updateTaskStatus(project.projectId, task.taskId, 'in_progress')
      expect(result).toBe(true)

      const tasks = pm.getProjectTasks(project.projectId)
      expect(tasks[0].status).toBe('in_progress')
    })

    it('should return false for non-existent project', () => {
      expect(pm.updateTaskStatus('nonexistent', 'task-1', 'completed')).toBe(false)
    })

    it('should return false for non-existent task', () => {
      const project = pm.createProject('Test', 'desc')
      expect(pm.updateTaskStatus(project.projectId, 'nonexistent', 'completed')).toBe(false)
    })

    it('should support all status transitions', () => {
      const project = pm.createProject('Test', 'desc')
      const task = pm.addTask(project.projectId, 'Task', 'desc')!

      const statuses = ['in_progress', 'completed', 'failed', 'cancelled'] as const
      for (const status of statuses) {
        expect(pm.updateTaskStatus(project.projectId, task.taskId, status)).toBe(true)
      }
    })
  })

  describe('getProjectTasks', () => {
    it('should return all tasks for a project', () => {
      const project = pm.createProject('Test', 'desc')
      pm.addTask(project.projectId, 'Task 1', 'desc')
      pm.addTask(project.projectId, 'Task 2', 'desc')

      const tasks = pm.getProjectTasks(project.projectId)
      expect(tasks).toHaveLength(2)
    })

    it('should filter tasks by status', () => {
      const project = pm.createProject('Test', 'desc')
      const t1 = pm.addTask(project.projectId, 'Task 1', 'desc')!
      pm.addTask(project.projectId, 'Task 2', 'desc')
      pm.updateTaskStatus(project.projectId, t1.taskId, 'completed')

      const completed = pm.getProjectTasks(project.projectId, 'completed')
      const pending = pm.getProjectTasks(project.projectId, 'pending')

      expect(completed).toHaveLength(1)
      expect(completed[0].taskId).toBe(t1.taskId)
      expect(pending).toHaveLength(1)
    })

    it('should return empty array for non-existent project', () => {
      expect(pm.getProjectTasks('nonexistent')).toEqual([])
    })

    it('should return empty array when no matching tasks', () => {
      const project = pm.createProject('Test', 'desc')
      pm.addTask(project.projectId, 'Task', 'desc')

      expect(pm.getProjectTasks(project.projectId, 'completed')).toEqual([])
    })

    it('should return copies, not references', () => {
      const project = pm.createProject('Test', 'desc')
      pm.addTask(project.projectId, 'Task', 'desc')

      const tasks1 = pm.getProjectTasks(project.projectId)
      const tasks2 = pm.getProjectTasks(project.projectId)

      expect(tasks1).toEqual(tasks2)
      expect(tasks1).not.toBe(tasks2)
    })
  })

  describe('archiveProject', () => {
    it('should archive an active project', () => {
      const project = pm.createProject('Test', 'desc')
      const result = pm.archiveProject(project.projectId)

      expect(result).toBe(true)
      const fetched = pm.getProject(project.projectId)
      expect(fetched!.status).toBe('archived')
    })

    it('should return false for non-existent project', () => {
      expect(pm.archiveProject('nonexistent')).toBe(false)
    })

    it('should return false for already archived project', () => {
      const project = pm.createProject('Test', 'desc')
      pm.archiveProject(project.projectId)
      expect(pm.archiveProject(project.projectId)).toBe(false)
    })

    it('should return false for deleted project', () => {
      const project = pm.createProject('Test', 'desc')
      pm.deleteProject(project.projectId)
      expect(pm.archiveProject(project.projectId)).toBe(false)
    })
  })

  describe('singleton', () => {
    it('should export a singleton', async () => {
      const { projectManagerLocal } = await import('../projectManagerLocal')
      expect(projectManagerLocal).toBeInstanceOf(ProjectManagerLocal)
    })
  })
})
