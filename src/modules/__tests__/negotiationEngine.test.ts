import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NegotiationEngine } from '../negotiationEngine'

describe('NegotiationEngine', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should create proposal', () => {
    const engine = new NegotiationEngine()
    const proposal = engine.createProposal('agent-1', 'Use TypeScript')

    expect(proposal.proposerId).toBe('agent-1')
    expect(proposal.content).toBe('Use TypeScript')
    expect(proposal.id).toBeDefined()
  })

  it('should add argument to proposal', () => {
    const engine = new NegotiationEngine()
    const proposal = engine.createProposal('agent-1', 'Use TypeScript')

    const arg = engine.addArgument(proposal.id, 'agent-2', 'support', 0.9, 'Type safety reduces bugs')

    expect(arg).not.toBeNull()
    expect(arg!.stance).toBe('support')
    expect(arg!.confidence).toBe(0.9)
    expect(proposal.arguments).toHaveLength(1)
  })

  it('should clamp confidence to 0-1', () => {
    const engine = new NegotiationEngine()
    const proposal = engine.createProposal('agent-1', 'Test')

    const arg1 = engine.addArgument(proposal.id, 'agent-2', 'support', 1.5, 'Over max')
    const arg2 = engine.addArgument(proposal.id, 'agent-3', 'support', -0.5, 'Under min')

    expect(arg1!.confidence).toBe(1)
    expect(arg2!.confidence).toBe(0)
  })

  it('should cast vote', () => {
    const engine = new NegotiationEngine()
    const proposal = engine.createProposal('agent-1', 'Use TypeScript')

    const vote = engine.castVote(proposal.id, 'agent-2', true, 1.0, 'Looks good')

    expect(vote).not.toBeNull()
    expect(vote!.approve).toBe(true)
    expect(vote!.weight).toBe(1.0)
  })

  it('should use agent weight when casting vote', () => {
    const engine = new NegotiationEngine()
    engine.setAgentWeight('senior', 2.0)
    const proposal = engine.createProposal('agent-1', 'Test')

    const vote = engine.castVote(proposal.id, 'senior', true)

    expect(vote!.weight).toBe(2.0)
  })

  it('should evaluate simple majority - accepted', () => {
    const engine = new NegotiationEngine('simple_majority')
    const proposal = engine.createProposal('agent-1', 'Use TypeScript')

    engine.castVote(proposal.id, 'agent-2', true)
    engine.castVote(proposal.id, 'agent-3', true)
    engine.castVote(proposal.id, 'agent-4', false)

    const result = engine.evaluateConsensus(proposal.id)

    expect(result.accepted).toBe(true)
    expect(result.approveCount).toBe(2)
    expect(result.opposeCount).toBe(1)
    expect(result.totalVotes).toBe(3)
  })

  it('should evaluate simple majority - rejected', () => {
    const engine = new NegotiationEngine('simple_majority')
    const proposal = engine.createProposal('agent-1', 'Use TypeScript')

    engine.castVote(proposal.id, 'agent-2', false)
    engine.castVote(proposal.id, 'agent-3', false)
    engine.castVote(proposal.id, 'agent-4', true)

    const result = engine.evaluateConsensus(proposal.id)

    expect(result.accepted).toBe(false)
  })

  it('should evaluate with no votes - pending', () => {
    const engine = new NegotiationEngine()
    const proposal = engine.createProposal('agent-1', 'Test')

    const result = engine.evaluateConsensus(proposal.id)

    expect(result.totalVotes).toBe(0)
    expect(result.accepted).toBe(false)
  })

  it('should build decision graph', () => {
    const engine = new NegotiationEngine()
    const proposal = engine.createProposal('agent-1', 'Test')

    engine.castVote(proposal.id, 'agent-2', true)
    engine.evaluateConsensus(proposal.id)

    const graph = engine.getDecisionGraph()
    expect(graph).toHaveLength(1)
    expect(graph[0].proposalId).toBe(proposal.id)
  })

  it('should reset state', () => {
    const engine = new NegotiationEngine()
    engine.createProposal('agent-1', 'Test')

    engine.reset()

    expect(engine.getDecisionGraph()).toHaveLength(0)
  })
})
