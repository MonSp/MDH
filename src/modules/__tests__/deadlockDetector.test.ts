import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeadlockDetector } from '../deadlockDetector'

describe('DeadlockDetector', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should initialize with empty state', () => {
    const detector = new DeadlockDetector()
    expect(detector.detectCycles()).toHaveLength(0)
    expect(detector.getDeadlockHistory()).toHaveLength(0)
  })

  it('should add and remove wait edges', () => {
    const detector = new DeadlockDetector()

    detector.addWaitEdge('A', 'B', 'resource-1')
    detector.addWaitEdge('B', 'C', 'resource-2')

    // No cycle yet
    expect(detector.detectCycles()).toHaveLength(0)

    // Remove edge
    detector.removeWaitEdge('A', 'B')
    expect(detector.detectCycles()).toHaveLength(0)
  })

  it('should detect simple cycle (A->B->A)', () => {
    const detector = new DeadlockDetector()

    detector.addWaitEdge('A', 'B', 'resource-1')
    detector.addWaitEdge('B', 'A', 'resource-2')

    const cycles = detector.detectCycles()
    expect(cycles.length).toBeGreaterThanOrEqual(1)
    expect(cycles[0].agents).toContain('A')
    expect(cycles[0].agents).toContain('B')
  })

  it('should detect longer cycle (A->B->C->A)', () => {
    const detector = new DeadlockDetector()

    detector.addWaitEdge('A', 'B', 'r1')
    detector.addWaitEdge('B', 'C', 'r2')
    detector.addWaitEdge('C', 'A', 'r3')

    const cycles = detector.detectCycles()
    expect(cycles.length).toBeGreaterThanOrEqual(1)
    expect(cycles[0].agents).toContain('A')
    expect(cycles[0].agents).toContain('B')
    expect(cycles[0].agents).toContain('C')
  })

  it('should not detect cycle in linear chain', () => {
    const detector = new DeadlockDetector()

    detector.addWaitEdge('A', 'B', 'r1')
    detector.addWaitEdge('B', 'C', 'r2')

    expect(detector.detectCycles()).toHaveLength(0)
  })

  it('should remove all edges for waiter when no blocker specified', () => {
    const detector = new DeadlockDetector()

    detector.addWaitEdge('A', 'B', 'r1')
    detector.addWaitEdge('A', 'C', 'r2')
    detector.removeWaitEdge('A')

    // A has no edges, so no cycle
    detector.addWaitEdge('B', 'A', 'r3')
    expect(detector.detectCycles()).toHaveLength(0)
  })

  it('should get deadlock history', () => {
    const detector = new DeadlockDetector()
    expect(detector.getDeadlockHistory()).toEqual([])
  })

  it('should handle multiple wait edges for same waiter', () => {
    const detector = new DeadlockDetector()

    detector.addWaitEdge('A', 'B', 'r1')
    detector.addWaitEdge('A', 'C', 'r2')

    // A waits on both B and C, forming no cycle by itself
    expect(detector.detectCycles()).toHaveLength(0)

    // Add cycle through B
    detector.addWaitEdge('B', 'A', 'r3')
    const cycles = detector.detectCycles()
    expect(cycles.length).toBeGreaterThanOrEqual(1)
  })
})
