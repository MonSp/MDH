/**
 * 文件系统存储服务
 * 使用 File System Access API 将数据存储为本地文件
 *
 * Electron 环境下自动切换到 IPC 存储（主进程 userData/projects.json）
 */

import * as electronStorage from './electronStorage'

const DATA_DIR_NAME = 'tech-tower-data'

interface FileSystemStorage {
  dirHandle: FileSystemDirectoryHandle | null
}

const state: FileSystemStorage = {
  dirHandle: null,
}

// 检查浏览器是否支持 File System Access API
export function isFileSystemSupported(): boolean {
  return 'showDirectoryPicker' in window
}

// 请求用户选择目录
async function requestDirectory(): Promise<FileSystemDirectoryHandle> {
  if (state.dirHandle) return state.dirHandle

  // 尝试从 IndexedDB 恢复目录句柄
  const savedHandle = await getSavedDirHandle()
  if (savedHandle) {
    try {
      // queryPermission 不需要用户手势，可以自动检查
      const permission = await savedHandle.queryPermission({ mode: 'readwrite' })
      if (permission === 'granted') {
        // 恢复子目录
        const subDir = await savedHandle.getDirectoryHandle(DATA_DIR_NAME, { create: true })
        state.dirHandle = subDir
        return subDir
      }
      // permission === 'prompt' 时需要用户点击才能授权
      // 抛出特殊错误让 UI 层处理
      if (permission === 'prompt') {
        throw new Error('NEED_PERMISSION')
      }
    } catch (e: any) {
      if (e.message === 'NEED_PERMISSION') throw e
      // 句柄失效，需要重新选择
    }
  }

  // 弹出目录选择器
  const dirHandle = await window.showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'documents',
  })

  // 保存父目录句柄（权限更持久）
  state.dirHandle = null
  await saveDirHandle(dirHandle)

  // 创建子目录
  const subDir = await dirHandle.getDirectoryHandle(DATA_DIR_NAME, { create: true })
  state.dirHandle = subDir

  return subDir
}

// 使用已保存的句柄请求权限（需要用户手势）
export async function requestSavedPermission(): Promise<boolean> {
  const savedHandle = await getSavedDirHandle()
  if (!savedHandle) return false

  try {
    const permission = await savedHandle.requestPermission({ mode: 'readwrite' })
    if (permission === 'granted') {
      const subDir = await savedHandle.getDirectoryHandle(DATA_DIR_NAME, { create: true })
      state.dirHandle = subDir
      return true
    }
  } catch {
    // 句柄失效
  }
  return false
}

// 检查是否有已保存的目录句柄
export async function hasSavedHandle(): Promise<boolean> {
  const savedHandle = await getSavedDirHandle()
  return savedHandle !== null
}

// 保存目录句柄到 IndexedDB
async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('handles', 'readwrite')
  const store = tx.objectStore('handles')
  store.put(handle, 'rootDir')
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// 从 IndexedDB 恢复目录句柄
async function getSavedDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction('handles', 'readonly')
    const store = tx.objectStore('handles')
    const request = store.get('rootDir')
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

// 打开 IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tech-tower-fs', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('handles')
    }
  })
}

// 读取 JSON 文件（需要目录句柄，可能触发选择器）
async function readJsonFile<T>(fileName: string): Promise<T | null> {
  const dir = await requestDirectory()
  try {
    const fileHandle = await dir.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    const text = await file.text()
    return JSON.parse(text)
  } catch {
    return null
  }
}

// 读取 JSON 文件（不触发目录选择器）
async function readJsonFileSafe<T>(fileName: string): Promise<T | null> {
  if (!state.dirHandle) return null
  try {
    const fileHandle = await state.dirHandle.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    const text = await file.text()
    return JSON.parse(text)
  } catch {
    return null
  }
}

// 尝试静默恢复已保存的目录（不弹窗）
export async function tryRestoreDirectory(): Promise<boolean> {
  const savedHandle = await getSavedDirHandle()
  if (!savedHandle) return false

  try {
    const permission = await savedHandle.queryPermission({ mode: 'readwrite' })
    if (permission === 'granted') {
      const subDir = await savedHandle.getDirectoryHandle(DATA_DIR_NAME, { create: true })
      state.dirHandle = subDir
      return true
    }
  } catch {
    // 句柄失效
  }
  return false
}

// 静默加载项目（不触发目录选择器）
export async function tryGetProjects(): Promise<ProjectData[]> {
  return await readJsonFileSafe<ProjectData[]>('projects.json') || []
}

// 写入 JSON 文件
async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  const dir = await requestDirectory()
  const fileHandle = await dir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

// 删除文件
async function deleteFile(fileName: string): Promise<void> {
  const dir = await requestDirectory()
  try {
    await dir.removeEntry(fileName)
  } catch {
    // 文件不存在
  }
}

// 列出所有文件
async function listFiles(): Promise<string[]> {
  const dir = await requestDirectory()
  const names: string[] = []
  for await (const name of dir.keys()) {
    names.push(name)
  }
  return names
}

/* ───────── 导出 API ───────── */

export interface ProjectData {
  project_id: string
  name: string
  status: string
  category: string
  created_at: string
  tasks: TaskData[]
  skill_packages: Array<{ skill_id: string; name: string }>
  employees: Array<Record<string, unknown>>
  execution_logs: Array<Record<string, unknown>>
}

export interface TaskData {
  task_id: string
  project_id: string
  description: string
  status: string
  created_at: number
  completed_at: number
  meeting_id: string
  subtasks: SubTaskData[]
}

export interface SubTaskData {
  subtask_id: string
  description: string
  status: string
  agent_id: string
  created_at: number
  completed_at: number
}

// 获取所有项目
export async function getProjects(): Promise<ProjectData[]> {
  if (electronStorage.isElectron()) {
    const projects = await electronStorage.listProjects()
    return projects as ProjectData[]
  }
  const projects = await readJsonFile<ProjectData[]>('projects.json')
  return projects || []
}

// 保存所有项目
export async function saveProjects(projects: ProjectData[]): Promise<void> {
  if (electronStorage.isElectron()) {
    // Electron 下按 project_id upsert（新增/更新，不处理删除）
    for (const project of projects) {
      await electronStorage.saveProject(project)
    }
    return
  }
  await writeJsonFile('projects.json', projects)
}

// 获取单个项目
export async function getProject(projectId: string): Promise<ProjectData | null> {
  if (electronStorage.isElectron()) {
    return await electronStorage.getProject(projectId) as ProjectData | null
  }
  const projects = await getProjects()
  return projects.find(p => p.project_id === projectId) || null
}

// 保存单个项目（更新或新增）
export async function saveProject(project: ProjectData): Promise<void> {
  if (electronStorage.isElectron()) {
    await electronStorage.saveProject(project)
    return
  }
  const projects = await getProjects()
  const idx = projects.findIndex(p => p.project_id === project.project_id)
  if (idx >= 0) {
    projects[idx] = project
  } else {
    projects.push(project)
  }
  await saveProjects(projects)
}

// 删除项目
export async function deleteProject(projectId: string): Promise<void> {
  if (electronStorage.isElectron()) {
    await electronStorage.deleteProject(projectId)
    return
  }
  const projects = await getProjects()
  const filtered = projects.filter(p => p.project_id !== projectId)
  await saveProjects(filtered)
}

// 重命名项目
export async function renameProject(projectId: string, newName: string): Promise<void> {
  if (electronStorage.isElectron()) {
    const project = await electronStorage.getProject(projectId)
    if (project) {
      project.name = newName
      await electronStorage.saveProject(project)
    }
    return
  }
  const projects = await getProjects()
  const project = projects.find(p => p.project_id === projectId)
  if (project) {
    project.name = newName
    await saveProjects(projects)
  }
}

// 添加任务到项目
export async function addTask(projectId: string, task: TaskData): Promise<void> {
  if (electronStorage.isElectron()) {
    const project = await electronStorage.getProject(projectId)
    if (project) {
      if (!project.tasks) project.tasks = []
      project.tasks.push(task)
      await electronStorage.saveProject(project)
    }
    return
  }
  const projects = await getProjects()
  const project = projects.find(p => p.project_id === projectId)
  if (project) {
    if (!project.tasks) project.tasks = []
    project.tasks.push(task)
    await saveProjects(projects)
  }
}

// 删除任务
export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  if (electronStorage.isElectron()) {
    const project = await electronStorage.getProject(projectId)
    if (project && project.tasks) {
      project.tasks = project.tasks.filter((t: TaskData) => t.task_id !== taskId)
      await electronStorage.saveProject(project)
    }
    return
  }
  const projects = await getProjects()
  const project = projects.find(p => p.project_id === projectId)
  if (project && project.tasks) {
    project.tasks = project.tasks.filter(t => t.task_id !== taskId)
    await saveProjects(projects)
  }
}

// 添加子任务
export async function addSubtask(projectId: string, taskId: string, subtask: SubTaskData): Promise<void> {
  if (electronStorage.isElectron()) {
    const project = await electronStorage.getProject(projectId)
    if (project) {
      const task = project.tasks?.find((t: TaskData) => t.task_id === taskId)
      if (task) {
        if (!task.subtasks) task.subtasks = []
        task.subtasks.push(subtask)
        await electronStorage.saveProject(project)
      }
    }
    return
  }
  const projects = await getProjects()
  const project = projects.find(p => p.project_id === projectId)
  if (project) {
    const task = project.tasks?.find(t => t.task_id === taskId)
    if (task) {
      if (!task.subtasks) task.subtasks = []
      task.subtasks.push(subtask)
      await saveProjects(projects)
    }
  }
}

// 更新子任务状态
export async function updateSubtaskStatus(projectId: string, taskId: string, subtaskId: string, status: string): Promise<void> {
  if (electronStorage.isElectron()) {
    const project = await electronStorage.getProject(projectId)
    if (project) {
      const task = project.tasks?.find((t: TaskData) => t.task_id === taskId)
      if (task) {
        const subtask = task.subtasks?.find((s: SubTaskData) => s.subtask_id === subtaskId)
        if (subtask) {
          subtask.status = status
          if (status === 'completed') subtask.completed_at = Date.now() / 1000
          await electronStorage.saveProject(project)
        }
      }
    }
    return
  }
  const projects = await getProjects()
  const project = projects.find(p => p.project_id === projectId)
  if (project) {
    const task = project.tasks?.find(t => t.task_id === taskId)
    if (task) {
      const subtask = task.subtasks?.find(s => s.subtask_id === subtaskId)
      if (subtask) {
        subtask.status = status
        if (status === 'completed') subtask.completed_at = Date.now() / 1000
        await saveProjects(projects)
      }
    }
  }
}

// 获取分类统计
export async function getCategories(): Promise<Record<string, ProjectData[]>> {
  if (electronStorage.isElectron()) {
    const projects = await electronStorage.listProjects()
    const categories: Record<string, ProjectData[]> = {}
    for (const project of projects as ProjectData[]) {
      const cat = project.category || '未分类'
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(project)
    }
    return categories
  }
  const projects = await getProjects()
  const categories: Record<string, ProjectData[]> = {}
  for (const project of projects) {
    const cat = project.category || '未分类'
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(project)
  }
  return categories
}

// 导出所有数据
export async function exportAll(): Promise<string> {
  if (electronStorage.isElectron()) {
    const projects = await electronStorage.listProjects()
    return JSON.stringify({ projects, exportedAt: new Date().toISOString() }, null, 2)
  }
  const projects = await getProjects()
  return JSON.stringify({ projects, exportedAt: new Date().toISOString() }, null, 2)
}

// 导入数据
export async function importAll(data: string): Promise<void> {
  const parsed = JSON.parse(data)
  if (parsed.projects) {
    if (electronStorage.isElectron()) {
      for (const project of parsed.projects) {
        await electronStorage.saveProject(project)
      }
      return
    }
    await saveProjects(parsed.projects)
  }
}

// 选择存储目录
// 请求用户选择目录（直接弹出选择器，不检查已保存句柄）
async function requestNewDirectory(): Promise<FileSystemDirectoryHandle> {
  // 弹出目录选择器
  const dirHandle = await window.showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'documents',
  })

  // 保存父目录句柄
  await saveDirHandle(dirHandle)

  // 创建子目录
  const subDir = await dirHandle.getDirectoryHandle(DATA_DIR_NAME, { create: true })
  state.dirHandle = subDir

  return subDir
}

// 选择新目录
export async function selectDirectory(): Promise<boolean> {
  try {
    await requestNewDirectory()
    return true
  } catch (e) {
    console.error('选择目录失败:', e)
    return false
  }
}

// 获取当前存储目录名称
export async function getDirectoryName(): Promise<string | null> {
  const handle = state.dirHandle
  if (handle) return handle.name
  const saved = await getSavedDirHandle()
  return saved?.name || null
}
