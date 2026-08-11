import { describe, it, expect, beforeEach } from 'vitest'
import { GateManager } from '../gateManager'
import { SpecTreeNodeType } from '../specTreeValidator'

function makeValidTree() {
  return {
    nodes: [
      { id: 'root', type: SpecTreeNodeType.ROOT, title: 'Root', parentId: undefined, children: ['f1', 'f2'] },
      { id: 'f1', type: SpecTreeNodeType.FEATURE, title: 'Feature 1', parentId: 'root' },
      { id: 'f2', type: SpecTreeNodeType.FEATURE, title: 'Feature 2', parentId: 'root' },
      { id: 'r1', type: SpecTreeNodeType.REQUIREMENT, title: 'Req 1', parentId: 'f1' },
      { id: 'r2', type: SpecTreeNodeType.REQUIREMENT, title: 'Req 2', parentId: 'f2' },
    ],
  }
}

describe('GateManager', () => {
  let manager: GateManager

  beforeEach(() => {
    manager = new GateManager()
  })

  describe('built-in ears gate', () => {
    it('should pass for valid EARS sentences', () => {
      const result = manager.runGate('ears', [
        'WHEN the user submits, the system SHALL save the data',
        'IF the connection fails, the system SHALL retry',
      ])
      expect(result.passed).toBe(true)
      expect(result.gateName).toBe('ears')
    })

    it('should fail for invalid EARS sentences', () => {
      const result = manager.runGate('ears', [
        'WHEN the user submits, the system SHALL save',
        'bad sentence without trigger or response',
      ])
      expect(result.passed).toBe(false)
    })
  })

  describe('built-in specTree gate', () => {
    it('should pass for valid tree', () => {
      const result = manager.runGate('specTree', makeValidTree())
      expect(result.passed).toBe(true)
    })

    it('should fail for invalid tree', () => {
      const result = manager.runGate('specTree', { nodes: [] })
      expect(result.passed).toBe(false)
    })
  })

  describe('registerGate', () => {
    it('should register and run a custom gate', () => {
      manager.registerGate('custom', (input: unknown) => {
        const val = input as number
        return { passed: val > 10, details: { value: val } }
      })
      const result = manager.runGate('custom', 15)
      expect(result.passed).toBe(true)
    })

    it('should allow overriding a built-in gate', () => {
      manager.registerGate('ears', () => ({ passed: true, details: { overridden: true } }))
      const result = manager.runGate('ears', ['anything'])
      expect(result.passed).toBe(true)
    })
  })

  describe('runGate with unknown gate', () => {
    it('should fail with error for non-existent gate', () => {
      const result = manager.runGate('nonexistent', null)
      expect(result.passed).toBe(false)
      expect((result.details as any).error).toContain('not found')
    })
  })

  describe('getLedger', () => {
    it('should record all gate runs', () => {
      manager.runGate('ears', ['WHEN x, the system SHALL y'])
      manager.runGate('specTree', makeValidTree())
      const ledger = manager.getLedger()
      expect(ledger).toHaveLength(2)
      expect(ledger[0].gateName).toBe('ears')
      expect(ledger[1].gateName).toBe('specTree')
    })

    it('should return empty ledger initially', () => {
      expect(manager.getLedger()).toHaveLength(0)
    })

    it('should include timestamp', () => {
      const before = Date.now()
      manager.runGate('ears', ['WHEN x, the system SHALL y'])
      const ledger = manager.getLedger()
      expect(ledger[0].timestamp).toBeGreaterThanOrEqual(before)
    })
  })

  describe('getSummary', () => {
    it('should compute pass/fail totals', () => {
      manager.runGate('ears', ['WHEN x, the system SHALL y'])
      manager.runGate('ears', ['bad sentence'])
      manager.runGate('specTree', makeValidTree())

      const summary = manager.getSummary()
      expect(summary.total).toBe(3)
      expect(summary.passed).toBe(2)
      expect(summary.failed).toBe(1)
    })

    it('should break down by gate name', () => {
      manager.runGate('ears', ['WHEN x, the system SHALL y'])
      manager.runGate('ears', ['bad sentence'])
      manager.runGate('specTree', makeValidTree())

      const summary = manager.getSummary()
      expect(summary.byGate['ears']).toEqual({ passed: 1, failed: 1 })
      expect(summary.byGate['specTree']).toEqual({ passed: 1, failed: 0 })
    })

    it('should return zeros when empty', () => {
      const summary = manager.getSummary()
      expect(summary.total).toBe(0)
      expect(summary.passed).toBe(0)
      expect(summary.failed).toBe(0)
      expect(summary.byGate).toEqual({})
    })
  })
})
