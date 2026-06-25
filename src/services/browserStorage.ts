/**
 * 浏览器本地存储服务
 * 使用 IndexedDB 存储项目、任务等数据
 */

const DB_NAME = 'tech-tower-db'
const DB_VERSION = 1

const STORES = {
  projects: 'projects',
  tasks: 'tasks',
  settings: 'settings',
}

class BrowserStorage {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORES.projects)) {
          db.createObjectStore(STORES.projects, { keyPath: 'project_id' })
        }
        if (!db.objectStoreNames.contains(STORES.tasks)) {
          const taskStore = db.createObjectStore(STORES.tasks, { keyPath: 'task_id' })
          taskStore.createIndex('project_id', 'project_id', { unique: false })
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' })
        }
      }
    })
  }

  private getDB(): IDBDatabase {
    if (!this.db) throw new Error('Database not initialized')
    return this.db
  }

  // ───────── 项目操作 ─────────

  async getProjects(): Promise<any[]> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.projects, 'readonly')
      const store = tx.objectStore(STORES.projects)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getProject(projectId: string): Promise<any | null> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.projects, 'readonly')
      const store = tx.objectStore(STORES.projects)
      const request = store.get(projectId)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async saveProject(project: any): Promise<void> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.projects, 'readwrite')
      const store = tx.objectStore(STORES.projects)
      const request = store.put(project)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.projects, STORES.tasks], 'readwrite')
      const projectStore = tx.objectStore(STORES.projects)
      const taskStore = tx.objectStore(STORES.tasks)

      projectStore.delete(projectId)

      // 同时删除该项目下的所有任务
      const index = taskStore.index('project_id')
      const request = index.openCursor(IDBKeyRange.only(projectId))
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  // ───────── 任务操作 ─────────

  async getTasksByProject(projectId: string): Promise<any[]> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.tasks, 'readonly')
      const store = tx.objectStore(STORES.tasks)
      const index = store.index('project_id')
      const request = index.getAll(projectId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async saveTask(task: any): Promise<void> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.tasks, 'readwrite')
      const store = tx.objectStore(STORES.tasks)
      const request = store.put(task)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteTask(taskId: string): Promise<void> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.tasks, 'readwrite')
      const store = tx.objectStore(STORES.tasks)
      const request = store.delete(taskId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async addSubtask(taskId: string, subtask: any): Promise<void> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.tasks, 'readwrite')
      const store = tx.objectStore(STORES.tasks)
      const request = store.get(taskId)
      request.onsuccess = () => {
        const task = request.result
        if (task) {
          if (!task.subtasks) task.subtasks = []
          task.subtasks.push(subtask)
          store.put(task)
        }
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  async updateSubtaskStatus(taskId: string, subtaskId: string, status: string): Promise<void> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.tasks, 'readwrite')
      const store = tx.objectStore(STORES.tasks)
      const request = store.get(taskId)
      request.onsuccess = () => {
        const task = request.result
        if (task && task.subtasks) {
          const subtask = task.subtasks.find((s: any) => s.subtask_id === subtaskId)
          if (subtask) {
            subtask.status = status
            if (status === 'completed') subtask.completed_at = Date.now() / 1000
            store.put(task)
          }
        }
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  // ───────── 设置操作 ─────────

  async getSetting(key: string): Promise<any> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.settings, 'readonly')
      const store = tx.objectStore(STORES.settings)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result?.value)
      request.onerror = () => reject(request.error)
    })
  }

  async setSetting(key: string, value: any): Promise<void> {
    const db = this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.settings, 'readwrite')
      const store = tx.objectStore(STORES.settings)
      const request = store.put({ key, value })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // ───────── 导入导出 ─────────

  async exportAll(): Promise<string> {
    const projects = await this.getProjects()
    const db = this.getDB()
    const tasks = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORES.tasks, 'readonly')
      const store = tx.objectStore(STORES.tasks)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    return JSON.stringify({ projects, tasks, exportedAt: new Date().toISOString() }, null, 2)
  }

  async importAll(data: string): Promise<void> {
    const parsed = JSON.parse(data)
    if (parsed.projects) {
      for (const project of parsed.projects) {
        await this.saveProject(project)
      }
    }
    if (parsed.tasks) {
      for (const task of parsed.tasks) {
        await this.saveTask(task)
      }
    }
  }
}

export const browserStorage = new BrowserStorage()
