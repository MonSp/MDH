import { describe, it, expect, vi } from 'vitest'
import { handleProposal, handleVote, handleVoteResult } from './voting'
import type { VotingSetters } from './voting'

function makeSetters(): VotingSetters {
  return {
    setChatMessages: vi.fn(fn => fn([])),
    setActiveProposal: vi.fn(),
    setVotes: vi.fn(fn => fn(new Map())),
    setVoteResults: vi.fn(),
  }
}

describe('voting handlers', () => {
  describe('handleProposal', () => {
    it('sets active proposal and adds chat message', () => {
      const setters = makeSetters()
      handleProposal({
        proposal: { id: 'p1', proposerId: 'agent-1', content: '方案A', createdAt: '2026-01-01' },
      }, setters)

      expect(setters.setActiveProposal).toHaveBeenCalledWith({
        id: 'p1', proposerId: 'agent-1', content: '方案A', createdAt: '2026-01-01',
      })
      expect(setters.setVotes).toHaveBeenCalled()
      expect(setters.setVoteResults).toHaveBeenCalledWith(null)
      expect(setters.setChatMessages).toHaveBeenCalled()
    })

    it('ignores msg without proposal', () => {
      const setters = makeSetters()
      handleProposal({}, setters)
      expect(setters.setActiveProposal).not.toHaveBeenCalled()
    })
  })

  describe('handleVote', () => {
    it('records vote and adds chat message', () => {
      const setters = makeSetters()
      handleVote({
        vote: { voterId: 'agent-2', approve: true, reason: '同意' },
      }, setters)

      expect(setters.setVotes).toHaveBeenCalled()
      const setVotesFn = (setters.setVotes as any).mock.calls[0][0]
      const result = setVotesFn(new Map())
      expect(result.get('agent-2')).toEqual({ voterId: 'agent-2', approve: true, reason: '同意' })
    })

    it('ignores msg without vote', () => {
      const setters = makeSetters()
      handleVote({}, setters)
      expect(setters.setVotes).not.toHaveBeenCalled()
    })
  })

  describe('handleVoteResult', () => {
    it('sets vote results and clears proposal', () => {
      const setters = makeSetters()
      handleVoteResult({
        result: { proposalId: 'p1', totalVotes: 3, approveCount: 2, opposeCount: 1, accepted: true },
      }, setters)

      expect(setters.setVoteResults).toHaveBeenCalledWith({
        proposalId: 'p1', totalVotes: 3, approveCount: 2, opposeCount: 1, accepted: true,
      })
      expect(setters.setActiveProposal).toHaveBeenCalledWith(null)
    })

    it('ignores msg without result', () => {
      const setters = makeSetters()
      handleVoteResult({}, setters)
      expect(setters.setVoteResults).not.toHaveBeenCalled()
    })
  })
})
