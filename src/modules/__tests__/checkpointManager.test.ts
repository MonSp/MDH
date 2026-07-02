import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CheckpointManager } from '../checkpointManager'

describe('CheckpointManager', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should initialize with empty state', () => {
    const mgr = new CheckpointManager()
    expect(mgr.getCheckpointsForTask('t1')).toEqual([])
    expect(mgr.getLatestCheckpoint('t1')).toBeNull()
  })

  it('should save and retrieve checkpoint', () => {
    const mgr = new CheckpointManager()
    const cp = mgr.saveCheckpoint('t1', 0, { x: 1 })

    expect(cp.taskId).toBe('t1')
    expect(cp.stepIndex).toBe(0)
    expect(cp.stateSnapshot).toEqual({ x: 1 })

    const latest = mgr.getLatestCheckpoint('t1')
    expect(latest?.id).toBe(cp.id)
  })

  it('should get latest checkpoint by highest stepIndex', () => {
    const mgr = new CheckpointManager()
    mgr.saveCheckpoint('t1', 0, { step: 0 })
    mgr.saveCheckpoint('t1', 2, { step: 2 })
    mgr.saveCheckpoint('t1', 1, { step: 1 })

    const latest = mgr.getLatestCheckpoint('t1')
    expect(latest?.stepIndex).toBe(2)
  })

  it('should get checkpoints sorted by stepIndex', () => {
    const mgr = new CheckpointManager()
    mgr.saveCheckpoint('t1', 2, {})
    mgr.saveCheckpoint('t1', 0, {})
    mgr.saveCheckpoint('t1', 1, {})

    const cps = mgr.getCheckpointsForTask('t1')
    expect(cps.map(c => c.stepIndex)).toEqual([0, 1, 2])
  })

  it('should restore checkpoint (deep clone)', () => {
    const mgr = new CheckpointManager()
    const state = { nested: { value: 42 } }
    mgr.saveCheckpoint('t1', 0, state)

    const cp = mgr.getLatestCheckpoint('t1')!
    const restored = mgr.restoreCheckpoint(cp.id)

    expect(restored).toEqual(state)
    // Should be deep clone, not same reference
    expect(restored).not.toBe(state)
  })

  it('should respect maxCheckpointsPerTask', () => {
    const mgr = new CheckpointManager(3)

    for (let i = 0; i < 5; i++) {
      mgr.saveCheckpoint('t1', i, { step: i })
    }

    const cps = mgr.getCheckpointsForTask('t1')
    expect(cps).toHaveLength(3)
    expect(cps[0].stepIndex).toBe(2) // kept: 2, 3, 4
    expect(cps[2].stepIndex).toBe(4)
  })

  it('should delete checkpoint', () => {
    const mgr = new CheckpointManager()
    const cp = mgr.saveCheckpoint('t1', 0, {})

    expect(mgr.deleteCheckpoint(cp.id)).toBe(true)
    expect(mgr.getCheckpointsForTask('t1')).toHaveLength(0)
    expect(mgr.deleteCheckpoint('missing')).toBe(false)
  })

  it('should delete all checkpoints for task', () => {
    const mgr = new CheckpointManager()
    mgr.saveCheckpoint('t1', 0, {})
    mgr.saveCheckpoint('t1', 1, {})
    mgr.saveCheckpoint('t2', 0, {})

    const count = mgr.deleteCheckpointsForTask('t1')
    expect(count).toBe(2)
    expect(mgr.getCheckpointsForTask('t1')).toHaveLength(0)
    expect(mgr.getCheckpointsForTask('t2')).toHaveLength(1)
  })

  it('should clear all checkpoints', () => {
    const mgr = new CheckpointManager()
    mgr.saveCheckpoint('t1', 0, {})
    mgr.saveCheckpoint('t2', 0, {})

    mgr.clear()
    expect(mgr.getCheckpointsForTask('t1')).toHaveLength(0)
    expect(mgr.getCheckpointsForTask('t2')).toHaveLength(0)
  })
})
