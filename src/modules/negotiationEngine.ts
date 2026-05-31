export type Stance = 'support' | 'oppose' | 'modify' | 'neutral'
export type ConsensusStrategy = 'simple_majority' | 'weighted_vote' | 'argument_based'

export interface ArgumentRef {
  messageId: string
  summary: string
}

export interface Argument {
  id: string
  agentId: string
  stance: Stance
  confidence: number
  argumentRefs: ArgumentRef[]
  content: string
  timestamp: number
}

export interface Proposal {
  id: string
  proposerId: string
  content: string
  arguments: Argument[]
  createdAt: number
}

export interface Vote {
  proposalId: string
  voterId: string
  approve: boolean
  weight: number
  reason: string
  timestamp: number
}

export interface VoteResult {
  proposalId: string
  strategy: ConsensusStrategy
  totalVotes: number
  approveCount: number
  opposeCount: number
  weightedApprove: number
  weightedOppose: number
  accepted: boolean
  timestamp: number
}

export interface DecisionNode {
  id: string
  proposalId: string
  decision: string
  supporters: string[]
  opposers: string[]
  arguments: Argument[]
  voteResult: VoteResult | null
  timestamp: number
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export class NegotiationEngine {
  private proposals: Map<string, Proposal>
  private votes: Map<string, Vote[]>
  private decisionGraph: DecisionNode[]
  private agentWeights: Map<string, number>
  private readonly defaultStrategy: ConsensusStrategy

  constructor(strategy?: ConsensusStrategy) {
    this.proposals = new Map()
    this.votes = new Map()
    this.decisionGraph = []
    this.agentWeights = new Map()
    this.defaultStrategy = strategy ?? 'simple_majority'
  }

  createProposal(proposerId: string, content: string): Proposal {
    const proposal: Proposal = {
      id: generateId(),
      proposerId,
      content,
      arguments: [],
      createdAt: Date.now(),
    }
    this.proposals.set(proposal.id, proposal)
    this.votes.set(proposal.id, [])
    return proposal
  }

  addArgument(
    proposalId: string,
    agentId: string,
    stance: Stance,
    confidence: number,
    content: string,
    argumentRefs?: ArgumentRef[]
  ): Argument | null {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) return null

    const arg: Argument = {
      id: generateId(),
      agentId,
      stance,
      confidence: Math.max(0, Math.min(1, confidence)),
      argumentRefs: argumentRefs ?? [],
      content,
      timestamp: Date.now(),
    }
    proposal.arguments.push(arg)
    return arg
  }

  castVote(
    proposalId: string,
    voterId: string,
    approve: boolean,
    weight?: number,
    reason?: string
  ): Vote | null {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) return null

    const agentWeight = weight ?? this.agentWeights.get(voterId) ?? 1.0
    const vote: Vote = {
      proposalId,
      voterId,
      approve,
      weight: agentWeight,
      reason: reason ?? '',
      timestamp: Date.now(),
    }
    const proposalVotes = this.votes.get(proposalId) ?? []
    proposalVotes.push(vote)
    this.votes.set(proposalId, proposalVotes)
    return vote
  }

  evaluateConsensus(proposalId: string, strategy?: ConsensusStrategy): VoteResult {
    const proposal = this.proposals.get(proposalId)
    const proposalVotes = this.votes.get(proposalId) ?? []
    const effectiveStrategy = strategy ?? this.defaultStrategy

    let approveCount = 0
    let opposeCount = 0
    let weightedApprove = 0
    let weightedOppose = 0

    if (effectiveStrategy === 'argument_based' && proposal) {
      const agentConfidence = new Map<string, { support: number[]; oppose: number[] }>()

      for (const arg of proposal.arguments) {
        if (!agentConfidence.has(arg.agentId)) {
          agentConfidence.set(arg.agentId, { support: [], oppose: [] })
        }
        const entry = agentConfidence.get(arg.agentId)!
        if (arg.stance === 'support') {
          entry.support.push(arg.confidence)
        } else if (arg.stance === 'oppose') {
          entry.oppose.push(arg.confidence)
        }
      }

      for (const vote of proposalVotes) {
        if (vote.approve) {
          approveCount++
          const conf = agentConfidence.get(vote.voterId)
          const avgConf = conf && conf.support.length > 0
            ? conf.support.reduce((a, b) => a + b, 0) / conf.support.length
            : 0.5
          weightedApprove += vote.weight * avgConf
        } else {
          opposeCount++
          const conf = agentConfidence.get(vote.voterId)
          const avgConf = conf && conf.oppose.length > 0
            ? conf.oppose.reduce((a, b) => a + b, 0) / conf.oppose.length
            : 0.5
          weightedOppose += vote.weight * avgConf
        }
      }
    } else {
      for (const vote of proposalVotes) {
        if (vote.approve) {
          approveCount++
          weightedApprove += vote.weight
        } else {
          opposeCount++
          weightedOppose += vote.weight
        }
      }
    }

    let accepted = false
    if (effectiveStrategy === 'simple_majority') {
      accepted = approveCount > opposeCount
    } else {
      accepted = weightedApprove > weightedOppose
    }

    const result: VoteResult = {
      proposalId,
      strategy: effectiveStrategy,
      totalVotes: proposalVotes.length,
      approveCount,
      opposeCount,
      weightedApprove,
      weightedOppose,
      accepted,
      timestamp: Date.now(),
    }

    const supporters = proposalVotes.filter(v => v.approve).map(v => v.voterId)
    const opposers = proposalVotes.filter(v => !v.approve).map(v => v.voterId)

    const node: DecisionNode = {
      id: generateId(),
      proposalId,
      decision: accepted ? 'accepted' : 'rejected',
      supporters,
      opposers,
      arguments: proposal?.arguments ?? [],
      voteResult: result,
      timestamp: Date.now(),
    }
    this.decisionGraph.push(node)

    return result
  }

  getDecisionGraph(): DecisionNode[] {
    return [...this.decisionGraph]
  }

  getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId)
  }

  getVotesForProposal(proposalId: string): Vote[] {
    return [...(this.votes.get(proposalId) ?? [])]
  }

  setAgentWeight(agentId: string, weight: number): void {
    this.agentWeights.set(agentId, weight)
  }

  getAgentWeight(agentId: string): number {
    return this.agentWeights.get(agentId) ?? 1.0
  }

  reset(): void {
    this.proposals.clear()
    this.votes.clear()
    this.decisionGraph = []
    this.agentWeights.clear()
  }
}
