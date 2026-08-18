import { createHash } from 'crypto'

export interface FileStateLocal {
  path: string
  hash: string
  size: number
  modifiedAt: number
  ownerAgentId: string | null
}

export interface WorkspaceStateLocal {
  workspaceId: string
  rootPath: string
  files: Map<string, FileStateLocal>
  lockedFiles: Map<string, string> // path → agentId
  lastSync: number
}

export type ConflictStrategy = 'local' | 'remote' | 'merge'

export type ConflictCallback = (
  path: string,
  localState: FileStateLocal,
  remoteState: FileStateLocal
) => ConflictStrategy

export class WorkspaceSyncLocal {
  private workspaceId: string
  private rootPath: string
  private syncInterval: number
  private state: WorkspaceStateLocal
  private timer: ReturnType<typeof setInterval> | null = null
  private conflictCallback: ConflictCallback | null = null

  constructor(workspaceId: string, rootPath: string, syncInterval = 5_000) {
    this.workspaceId = workspaceId
    this.rootPath = rootPath
    this.syncInterval = syncInterval
    this.state = {
      workspaceId,
      rootPath,
      files: new Map(),
      lockedFiles: new Map(),
      lastSync: Date.now(),
    }
  }

  setConflictCallback(cb: ConflictCallback): void {
    this.conflictCallback = cb
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.sync(), this.syncInterval)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  lockFile(path: string, agentId: string): boolean {
    if (this.state.lockedFiles.has(path)) {
      return this.state.lockedFiles.get(path) === agentId
    }
    this.state.lockedFiles.set(path, agentId)
    return true
  }

  unlockFile(path: string): boolean {
    return this.state.lockedFiles.delete(path)
  }

  getState(): WorkspaceStateLocal {
    return {
      workspaceId: this.state.workspaceId,
      rootPath: this.state.rootPath,
      files: new Map(this.state.files),
      lockedFiles: new Map(this.state.lockedFiles),
      lastSync: this.state.lastSync,
    }
  }

  updateFileState(file: FileStateLocal): void {
    this.state.files.set(file.path, { ...file })
  }

  removeFileState(path: string): boolean {
    return this.state.files.delete(path)
  }

  resolveConflict(
    path: string,
    strategy: ConflictStrategy,
    localState?: FileStateLocal,
    remoteState?: FileStateLocal
  ): FileStateLocal | null {
    const local = localState ?? this.state.files.get(path)
    if (!local) return null

    if (strategy === 'local') {
      return { ...local }
    }

    if (strategy === 'remote' && remoteState) {
      this.state.files.set(path, { ...remoteState })
      return { ...remoteState }
    }

    if (strategy === 'merge' && remoteState) {
      const merged: FileStateLocal = {
        path,
        hash: this.computeHash(local.hash + remoteState.hash),
        size: Math.max(local.size, remoteState.size),
        modifiedAt: Math.max(local.modifiedAt, remoteState.modifiedAt),
        ownerAgentId: local.ownerAgentId,
      }
      this.state.files.set(path, merged)
      return merged
    }

    return { ...local }
  }

  static computeFileHash(content: string): string {
    return createHash('md5').update(content).digest('hex')
  }

  private sync(): void {
    this.state.lastSync = Date.now()
  }

  private computeHash(input: string): string {
    return createHash('md5').update(input).digest('hex')
  }
}
