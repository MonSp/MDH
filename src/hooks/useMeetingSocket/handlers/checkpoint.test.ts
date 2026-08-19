import { describe, it, expect, vi } from 'vitest'
import {
  handleCheckpointSaved, handleCheckpointRestored, handleCheckpointsList,
  handleCheckpointDeleted, handleMeetingSnapshotSaved, handleMeetingSnapshotRestored,
  handleAuditLog, handleAuditLogList,
} from './checkpoint'
import type { CheckpointSetters } from './checkpoint'

function makeSetters(): CheckpointSetters {
  return {
    setChatMessages: vi.fn(fn => fn([])),
    setCheckpoints: vi.fn(arg => typeof arg === 'function' ? arg([]) : arg),
    setRestoredState: vi.fn(),
  }
}

describe('checkpoint handlers', () => {
  describe('handleCheckpointSaved', () => {
    it('adds checkpoint and chat message', () => {
      const setters = makeSetters()
      handleCheckpointSaved({
        checkpoint: { id: 'cp-1', taskId: 't1', stepIndex: 2, createdAt: '2026-01-01' },
      }, setters)

      expect(setters.setCheckpoints).toHaveBeenCalled()
      const fn = (setters.setCheckpoints as any).mock.calls[0][0]
      expect(fn([])).toEqual([{ id: 'cp-1', taskId: 't1', stepIndex: 2, createdAt: '2026-01-01' }])
    })

    it('ignores msg without checkpoint', () => {
      const setters = makeSetters()
      handleCheckpointSaved({}, setters)
      expect(setters.setCheckpoints).not.toHaveBeenCalled()
    })
  })

  describe('handleCheckpointRestored', () => {
    it('sets restored state', () => {
      const setters = makeSetters()
      handleCheckpointRestored({ checkpointId: 'cp-1', taskId: 't1', stepIndex: 2, state: {} }, setters)
      expect(setters.setRestoredState).toHaveBeenCalledWith({
        checkpointId: 'cp-1', taskId: 't1', stepIndex: 2, state: {},
      })
    })
  })

  describe('handleCheckpointsList', () => {
    it('replaces checkpoints list', () => {
      const setters = makeSetters()
      handleCheckpointsList({
        checkpoints: [
          { id: 'cp-1', taskId: 't1', stepIndex: 1, createdAt: '2026-01-01' },
          { id: 'cp-2', taskId: 't1', stepIndex: 2, createdAt: '2026-01-02' },
        ],
      }, setters)

      const result = (setters.setCheckpoints as any).mock.calls[0][0]
      // handleCheckpointsList passes array directly (not a function)
      expect(Array.isArray(result) ? result.length : result([]).length).toBe(2)
    })
  })

  describe('handleCheckpointDeleted', () => {
    it('removes checkpoint by id on success', () => {
      const setters = makeSetters()
      const existing = [
        { id: 'cp-1', taskId: 't1', stepIndex: 1 },
        { id: 'cp-2', taskId: 't1', stepIndex: 2 },
      ]
      handleCheckpointDeleted({ success: true, checkpointId: 'cp-1' }, setters)
      const fn = (setters.setCheckpoints as any).mock.calls[0][0]
      expect(fn(existing)).toEqual([{ id: 'cp-2', taskId: 't1', stepIndex: 2 }])
    })

    it('does nothing on failure', () => {
      const setters = makeSetters()
      handleCheckpointDeleted({ success: false, checkpointId: 'cp-1' }, setters)
      expect(setters.setCheckpoints).not.toHaveBeenCalled()
    })
  })

  describe('handleMeetingSnapshotSaved', () => {
    it('adds chat message', () => {
      const setters = makeSetters()
      handleMeetingSnapshotSaved({ meetingId: 'm1' }, setters)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handleMeetingSnapshotRestored', () => {
    it('adds chat message with counts', () => {
      const setters = makeSetters()
      handleMeetingSnapshotRestored({ tasksRestored: 3, messagesRestored: 10 }, setters)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })
  })

  describe('handleAuditLog', () => {
    it('adds audit entry to checkpoints', () => {
      const setters = makeSetters()
      handleAuditLog({
        entry: { id: 'a1', agentId: 'agent-1', operation: 'bash', target: '/tmp', riskLevel: 'low', allowed: true, reason: 'ok', timestamp: '2026-01-01' },
      }, setters)

      const fn = (setters.setCheckpoints as any).mock.calls[0][0]
      expect(fn([])).toEqual([{
        id: 'a1', agentId: 'agent-1', operation: 'bash', target: '/tmp',
        riskLevel: 'low', allowed: true, reason: 'ok', timestamp: '2026-01-01',
      }])
    })
  })

  describe('handleAuditLogList', () => {
    it('replaces audit entries', () => {
      const setters = makeSetters()
      handleAuditLogList({
        entries: [{ id: 'a1' }, { id: 'a2' }],
      }, setters)

      const result = (setters.setCheckpoints as any).mock.calls[0][0]
      expect(Array.isArray(result) ? result.length : result([]).length).toBe(2)
    })
  })
})
