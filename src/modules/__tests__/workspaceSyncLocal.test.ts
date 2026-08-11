import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { WorkspaceSyncLocal, type FileStateLocal } from '../workspaceSyncLocal'

function makeFileState(overrides: Partial<FileStateLocal> = {}): FileStateLocal {
  return {
    path: '/src/index.ts',
    hash: 'abc123',
    size: 1024,
    modifiedAt: Date.now(),
    ownerAgentId: 'agent-1',
    ...overrides,
  }
}

describe('WorkspaceSyncLocal', () => {
  let ws: WorkspaceSyncLocal

  beforeEach(() => {
    vi.useFakeTimers()
    ws = new WorkspaceSyncLocal('ws-1', '/workspace', 5_000)
  })

  afterEach(() => {
    ws.stop()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should initialize with correct workspace state', () => {
      const state = ws.getState()
      expect(state.workspaceId).toBe('ws-1')
      expect(state.rootPath).toBe('/workspace')
      expect(state.files.size).toBe(0)
      expect(state.lockedFiles.size).toBe(0)
    })
  })

  describe('lockFile / unlockFile', () => {
    it('should lock a file for an agent', () => {
      expect(ws.lockFile('/src/index.ts', 'agent-1')).toBe(true)
      const state = ws.getState()
      expect(state.lockedFiles.get('/src/index.ts')).toBe('agent-1')
    })

    it('should allow same agent to re-lock', () => {
      ws.lockFile('/src/index.ts', 'agent-1')
      expect(ws.lockFile('/src/index.ts', 'agent-1')).toBe(true)
    })

    it('should reject lock from different agent', () => {
      ws.lockFile('/src/index.ts', 'agent-1')
      expect(ws.lockFile('/src/index.ts', 'agent-2')).toBe(false)
    })

    it('should unlock a file', () => {
      ws.lockFile('/src/index.ts', 'agent-1')
      expect(ws.unlockFile('/src/index.ts')).toBe(true)
      expect(ws.getState().lockedFiles.size).toBe(0)
    })

    it('should return false when unlocking non-locked file', () => {
      expect(ws.unlockFile('/nonexistent.ts')).toBe(false)
    })
  })

  describe('updateFileState / removeFileState', () => {
    it('should add a file state', () => {
      const file = makeFileState()
      ws.updateFileState(file)

      const state = ws.getState()
      expect(state.files.size).toBe(1)
      expect(state.files.get('/src/index.ts')).toEqual(file)
    })

    it('should update existing file state', () => {
      ws.updateFileState(makeFileState({ size: 100 }))
      ws.updateFileState(makeFileState({ size: 200 }))

      const state = ws.getState()
      expect(state.files.size).toBe(1)
      expect(state.files.get('/src/index.ts')!.size).toBe(200)
    })

    it('should remove a file state', () => {
      ws.updateFileState(makeFileState())
      expect(ws.removeFileState('/src/index.ts')).toBe(true)
      expect(ws.getState().files.size).toBe(0)
    })

    it('should return false when removing non-existent file', () => {
      expect(ws.removeFileState('/nonexistent.ts')).toBe(false)
    })
  })

  describe('resolveConflict', () => {
    it('should resolve with local strategy', () => {
      const local = makeFileState({ hash: 'local-hash', size: 100 })
      const remote = makeFileState({ hash: 'remote-hash', size: 200, path: '/src/index.ts' })

      const result = ws.resolveConflict('/src/index.ts', 'local', local, remote)
      expect(result).not.toBeNull()
      expect(result!.hash).toBe('local-hash')
      expect(result!.size).toBe(100)
    })

    it('should resolve with remote strategy', () => {
      const local = makeFileState({ hash: 'local-hash', size: 100 })
      const remote = makeFileState({ hash: 'remote-hash', size: 200 })

      const result = ws.resolveConflict('/src/index.ts', 'remote', local, remote)
      expect(result).not.toBeNull()
      expect(result!.hash).toBe('remote-hash')
      expect(result!.size).toBe(200)

      // Should also update the state
      const state = ws.getState()
      expect(state.files.get('/src/index.ts')!.hash).toBe('remote-hash')
    })

    it('should resolve with merge strategy', () => {
      const local = makeFileState({
        hash: 'local-hash',
        size: 100,
        modifiedAt: 1000,
        ownerAgentId: 'agent-1',
      })
      const remote = makeFileState({
        hash: 'remote-hash',
        size: 200,
        modifiedAt: 2000,
      })

      const result = ws.resolveConflict('/src/index.ts', 'merge', local, remote)
      expect(result).not.toBeNull()
      expect(result!.size).toBe(200) // max
      expect(result!.modifiedAt).toBe(2000) // max
      expect(result!.ownerAgentId).toBe('agent-1') // local's owner
      // Hash should be a new merged hash, different from both
      expect(result!.hash).not.toBe('local-hash')
      expect(result!.hash).not.toBe('remote-hash')
    })

    it('should return null for non-existent file without explicit local state', () => {
      const result = ws.resolveConflict('/nonexistent.ts', 'local')
      expect(result).toBeNull()
    })

    it('should use stored file state when local state not provided', () => {
      const file = makeFileState()
      ws.updateFileState(file)

      const result = ws.resolveConflict('/src/index.ts', 'local')
      expect(result).not.toBeNull()
      expect(result!.hash).toBe(file.hash)
    })
  })

  describe('start / stop', () => {
    it('should start syncing periodically', () => {
      const state1 = ws.getState()
      const initialSync = state1.lastSync

      ws.start()
      vi.advanceTimersByTime(5_000)

      const state2 = ws.getState()
      expect(state2.lastSync).toBeGreaterThanOrEqual(initialSync)
    })

    it('should not start twice', () => {
      const spy = vi.spyOn(globalThis, 'setInterval')
      ws.start()
      ws.start()
      expect(spy).toHaveBeenCalledTimes(1)
      ws.stop()
    })

    it('should stop syncing', () => {
      ws.start()
      ws.stop()

      // Advancing time should not cause issues
      vi.advanceTimersByTime(30_000)
      expect(true).toBe(true) // no crash
    })
  })

  describe('getState', () => {
    it('should return a copy of the state', () => {
      const state1 = ws.getState()
      const state2 = ws.getState()

      // Maps should be independent copies
      state1.files.set('test', makeFileState({ path: 'test' }))
      expect(ws.getState().files.size).toBe(0)
    })
  })

  describe('setConflictCallback', () => {
    it('should accept a conflict callback', () => {
      const cb = vi.fn()
      ws.setConflictCallback(cb)
      // No assertion needed; just verify it doesn't throw
      expect(true).toBe(true)
    })
  })

  describe('computeFileHash (static)', () => {
    it('should compute consistent hash', () => {
      const hash1 = WorkspaceSyncLocal.computeFileHash('hello world')
      const hash2 = WorkspaceSyncLocal.computeFileHash('hello world')
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(32) // MD5 hex
    })

    it('should produce different hashes for different content', () => {
      const hash1 = WorkspaceSyncLocal.computeFileHash('file A')
      const hash2 = WorkspaceSyncLocal.computeFileHash('file B')
      expect(hash1).not.toBe(hash2)
    })
  })
})
