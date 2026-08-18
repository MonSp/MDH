import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ParallelDiscussionManagerLocal,
  type DiscussionResultLocal,
  type AgentCallFn,
} from '../parallelDiscussionManager'

const agents = [
  { agentId: 'a1', agentName: 'Alice', role: 'executor' },
  { agentId: 'a2', agentName: 'Bob', role: 'reviewer' },
  { agentId: 'a3', agentName: 'Carol', role: 'planner' },
]

function makeAgentCall(responses: Record<string, string>): AgentCallFn {
  return async (agentId: string, _prompt: string) => {
    return responses[agentId] ?? '[STANCE: neutral]\n[CONFIDENCE: 50]\nNo opinion.'
  }
}

describe('ParallelDiscussionManagerLocal', () => {
  let mgr: ParallelDiscussionManagerLocal

  beforeEach(() => {
    mgr = new ParallelDiscussionManagerLocal(5, 10_000)
  })

  describe('runDiscussion', () => {
    it('should run a single round and return results', async () => {
      const agentCall = makeAgentCall({
        a1: '[STANCE: support]\n[CONFIDENCE: 80]\nI agree with the approach.',
        a2: '[STANCE: support]\n[CONFIDENCE: 90]\nLooks good to me.',
        a3: '[STANCE: support]\n[CONFIDENCE: 85]\nAgreed.',
      })

      const results = await mgr.runDiscussion('Should we use React?', agents, agentCall, 3)

      expect(results).toHaveLength(3)
      expect(results.every(r => r.stance === 'support')).toBe(true)
      expect(results.every(r => r.round === 1)).toBe(true)
    })

    it('should stop early on convergence (all same stance)', async () => {
      const agentCall = makeAgentCall({
        a1: '[STANCE: support]\n[CONFIDENCE: 90]\nYes.',
        a2: '[STANCE: support]\n[CONFIDENCE: 95]\nYes.',
        a3: '[STANCE: support]\n[CONFIDENCE: 92]\nYes.',
      })

      const results = await mgr.runDiscussion('Topic', agents, agentCall, 5)
      // All agree on round 1, so should only have 1 round
      expect(results.every(r => r.round === 1)).toBe(true)
    })

    it('should run multiple rounds when no convergence', async () => {
      let callCount = 0
      const agentCall: AgentCallFn = async (agentId, _prompt) => {
        callCount++
        if (agentId === 'a1') return '[STANCE: support]\n[CONFIDENCE: 70]\nI agree.'
        if (agentId === 'a2') return '[STANCE: oppose]\n[CONFIDENCE: 70]\nI disagree.'
        return '[STANCE: neutral]\n[CONFIDENCE: 50]\nUndecided.'
      }

      const results = await mgr.runDiscussion('Controversial topic', agents, agentCall, 3)

      // Should run 3 rounds (no convergence)
      const rounds = new Set(results.map(r => r.round))
      expect(rounds.size).toBe(3)
      expect(callCount).toBe(9) // 3 agents * 3 rounds
    })

    it('should parse STANCE and CONFIDENCE tags', async () => {
      const agentCall = makeAgentCall({
        a1: '[STANCE: suggest]\n[CONFIDENCE: 75]\nMaybe try a different approach.',
      })

      const results = await mgr.runDiscussion('Topic', [agents[0]], agentCall, 1)
      expect(results[0].stance).toBe('suggest')
      expect(results[0].confidence).toBe(75)
      expect(results[0].content).not.toContain('[STANCE:')
      expect(results[0].content).not.toContain('[CONFIDENCE:')
    })

    it('should use defaults for missing tags', async () => {
      const agentCall: AgentCallFn = async () => {
        return 'Just a plain response without any tags.'
      }

      const results = await mgr.runDiscussion('Topic', [agents[0]], agentCall, 1)
      expect(results[0].stance).toBe('neutral')
      expect(results[0].confidence).toBe(50)
    })

    it('should clamp confidence to 0-100', async () => {
      const agentCall = makeAgentCall({
        a1: '[STANCE: support]\n[CONFIDENCE: 150]\nOverconfident.',
      })

      const results = await mgr.runDiscussion('Topic', [agents[0]], agentCall, 1)
      expect(results[0].confidence).toBe(100)
    })

    it('should call onMessage callback for each result', async () => {
      const onMessage = vi.fn()
      const agentCall = makeAgentCall({
        a1: '[STANCE: support]\n[CONFIDENCE: 80]\nYes.',
        a2: '[STANCE: support]\n[CONFIDENCE: 90]\nYes.',
      })

      await mgr.runDiscussion(
        'Topic',
        [agents[0], agents[1]],
        agentCall,
        1,
        onMessage
      )

      expect(onMessage).toHaveBeenCalledTimes(2)
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'a1', stance: 'support' })
      )
    })

    it('should handle agent timeout gracefully', async () => {
      const agentCall: AgentCallFn = async (agentId) => {
        if (agentId === 'a1') {
          return new Promise(resolve =>
            setTimeout(() => resolve('[STANCE: support]\n[CONFIDENCE: 80]\nDone.'), 20_000)
          )
        }
        return '[STANCE: support]\n[CONFIDENCE: 80]\nQuick.'
      }

      const fastMgr = new ParallelDiscussionManagerLocal(5, 100) // 100ms timeout
      const results = await fastMgr.runDiscussion('Topic', [agents[0], agents[1]], agentCall, 1)

      const timeoutResult = results.find(r => r.agentId === 'a1')
      expect(timeoutResult!.content).toBe('[timeout or error]')
      expect(timeoutResult!.confidence).toBe(0)
    })

    it('should respect maxConcurrent by batching', async () => {
      const callOrder: string[] = []
      const agentCall: AgentCallFn = async (agentId) => {
        callOrder.push(agentId)
        return `[STANCE: support]\n[CONFIDENCE: 80]\nAgent ${agentId}`
      }

      const batchMgr = new ParallelDiscussionManagerLocal(2, 10_000) // max 2 concurrent
      const manyAgents = [
        { agentId: 'a1', agentName: 'A1', role: 'dev' },
        { agentId: 'a2', agentName: 'A2', role: 'dev' },
        { agentId: 'a3', agentName: 'A3', role: 'dev' },
        { agentId: 'a4', agentName: 'A4', role: 'dev' },
      ]

      const results = await batchMgr.runDiscussion('Topic', manyAgents, agentCall, 1)
      expect(results).toHaveLength(4)
      expect(callOrder).toHaveLength(4)
    })

    it('should measure duration for each result', async () => {
      const agentCall: AgentCallFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return '[STANCE: support]\n[CONFIDENCE: 80]\nTook some time.'
      }

      const results = await mgr.runDiscussion('Topic', [agents[0]], agentCall, 1)
      expect(results[0].duration).toBeGreaterThanOrEqual(0)
    })

    it('should include previous results in prompt for round > 1', async () => {
      const prompts: string[] = []
      const agentCall: AgentCallFn = async (_agentId, prompt) => {
        prompts.push(prompt)
        return '[STANCE: oppose]\n[CONFIDENCE: 60]\nChanged my mind.'
      }

      await mgr.runDiscussion('Topic', [agents[0]], agentCall, 2)
      expect(prompts).toHaveLength(2)
      expect(prompts[1]).toContain('Previous responses')
    })
  })

  describe('summarizeDiscussion', () => {
    it('should summarize results with round grouping', () => {
      const results: DiscussionResultLocal[] = [
        { agentId: 'a1', agentName: 'Alice', role: 'executor', content: 'Approve the design', stance: 'support', confidence: 85, round: 1, duration: 100 },
        { agentId: 'a2', agentName: 'Bob', role: 'reviewer', content: 'Need more testing', stance: 'oppose', confidence: 70, round: 1, duration: 120 },
        { agentId: 'a1', agentName: 'Alice', role: 'executor', content: 'Added tests', stance: 'support', confidence: 90, round: 2, duration: 80 },
      ]

      const summary = mgr.summarizeDiscussion(results)
      expect(summary).toContain('3 responses across 2 round(s)')
      expect(summary).toContain('Round 1')
      expect(summary).toContain('Round 2')
      expect(summary).toContain('support: 2')
      expect(summary).toContain('oppose: 1')
      expect(summary).toContain('STANCE: support')
      expect(summary).toContain('STANCE: oppose')
    })

    it('should handle empty results', () => {
      const summary = mgr.summarizeDiscussion([])
      expect(summary).toBe('No discussion results.')
    })
  })
})
