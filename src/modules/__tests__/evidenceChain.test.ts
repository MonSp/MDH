import { describe, it, expect, beforeEach } from 'vitest'
import { EvidenceChain } from '../evidenceChain'
import type { Evidence } from '../evidenceChain'

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    evidenceId: `ev-${Date.now()}-${Math.random()}`,
    traceId: 'trace-1',
    stage: 'planning',
    content: 'Evidence content',
    source: 'meeting-log',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('EvidenceChain', () => {
  let chain: EvidenceChain

  beforeEach(() => {
    chain = new EvidenceChain()
  })

  describe('addEvidence', () => {
    it('should add an evidence item', () => {
      const ev = makeEvidence({ evidenceId: 'ev-1' })
      chain.addEvidence(ev)
      expect(chain.hasEvidence('ev-1')).toBe(true)
    })

    it('should add multiple evidence items', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-2' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-3' }))
      expect(chain.getChain()).toHaveLength(3)
    })

    it('should store a copy, not a reference', () => {
      const ev = makeEvidence({ evidenceId: 'ev-1', content: 'original' })
      chain.addEvidence(ev)
      ev.content = 'mutated'
      const stored = chain.getChain()[0]
      expect(stored.content).toBe('original')
    })
  })

  describe('getChain', () => {
    it('should return all evidence when no traceId filter', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1', traceId: 't1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-2', traceId: 't2' }))
      expect(chain.getChain()).toHaveLength(2)
    })

    it('should filter by traceId', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1', traceId: 't1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-2', traceId: 't2' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-3', traceId: 't1' }))
      const filtered = chain.getChain('t1')
      expect(filtered).toHaveLength(2)
      expect(filtered.every(e => e.traceId === 't1')).toBe(true)
    })

    it('should return empty array for non-existent traceId', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1', traceId: 't1' }))
      expect(chain.getChain('nonexistent')).toHaveLength(0)
    })
  })

  describe('getStages', () => {
    it('should return unique stages', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1', stage: 'planning', traceId: 't1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-2', stage: 'execution', traceId: 't1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-3', stage: 'planning', traceId: 't1' }))
      const stages = chain.getStages()
      expect(stages).toHaveLength(2)
      expect(stages).toContain('planning')
      expect(stages).toContain('execution')
    })

    it('should filter stages by traceId', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1', stage: 'planning', traceId: 't1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-2', stage: 'review', traceId: 't2' }))
      const stages = chain.getStages('t1')
      expect(stages).toEqual(['planning'])
    })
  })

  describe('hasEvidence', () => {
    it('should return true for existing evidence', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1' }))
      expect(chain.hasEvidence('ev-1')).toBe(true)
    })

    it('should return false for non-existent evidence', () => {
      expect(chain.hasEvidence('ev-999')).toBe(false)
    })
  })

  describe('exportChain', () => {
    it('should export as valid JSON', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1', content: 'test' }))
      const exported = chain.exportChain()
      const parsed = JSON.parse(exported)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].evidenceId).toBe('ev-1')
    })

    it('should export filtered by traceId', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1', traceId: 't1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-2', traceId: 't2' }))
      const exported = chain.exportChain('t1')
      const parsed = JSON.parse(exported)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].traceId).toBe('t1')
    })

    it('should export empty array when chain is empty', () => {
      const exported = chain.exportChain()
      expect(JSON.parse(exported)).toEqual([])
    })
  })

  describe('clear', () => {
    it('should remove all evidence', () => {
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-1' }))
      chain.addEvidence(makeEvidence({ evidenceId: 'ev-2' }))
      chain.clear()
      expect(chain.getChain()).toHaveLength(0)
      expect(chain.hasEvidence('ev-1')).toBe(false)
    })
  })
})
