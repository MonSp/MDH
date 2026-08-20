/**
 * 投票相关消息处理器
 */

import type { ChatMessage } from '../../components/office-team/types'

export interface VoteMessage {
  proposal?: { id: string; proposerId: string; content: string; createdAt: string }
  vote?: { voterId: string; approve: boolean; reason?: string }
  result?: { proposalId: string; totalVotes: number; approveCount: number; opposeCount: number; accepted: boolean }
}

export interface VotingSetters {
  setChatMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void
  setActiveProposal: (p: { id: string; proposerId: string; content: string; createdAt: string } | null) => void
  setVotes: (fn: (prev: Map<string, { voterId: string; approve: boolean; reason?: string }>) => Map<string, { voterId: string; approve: boolean; reason?: string }>) => void
  setVoteResults: (r: { proposalId: string; totalVotes: number; approveCount: number; opposeCount: number; accepted: boolean } | null) => void
}

export function handleProposal(msg: VoteMessage, setters: VotingSetters) {
  const proposal = msg.proposal
  if (proposal) {
    setters.setActiveProposal({
      id: proposal.id,
      proposerId: proposal.proposerId,
      content: proposal.content,
      createdAt: proposal.createdAt,
    })
    setters.setVotes(() => new Map())
    setters.setVoteResults(null)
    setters.setChatMessages(prev => [...prev, {
      role: 'agent' as const,
      agentId: proposal.proposerId,
      content: `[提案] ${proposal.content}`,
      timestamp: Date.now(),
      _msgSubtype: 'proposal',
    }])
  }
}

export function handleVote(msg: VoteMessage, setters: VotingSetters) {
  const vote = msg.vote
  if (vote) {
    setters.setVotes(prev => {
      const next = new Map(prev)
      next.set(vote.voterId, {
        voterId: vote.voterId,
        approve: vote.approve,
        reason: vote.reason,
      })
      return next
    })
    setters.setChatMessages(prev => [...prev, {
      role: 'agent' as const,
      agentId: vote.voterId,
      content: `[投票] ${vote.approve ? '赞成' : '反对'}${vote.reason ? ': ' + vote.reason : ''}`,
      timestamp: Date.now(),
      _msgSubtype: 'vote',
    }])
  }
}

export function handleVoteResult(msg: VoteMessage, setters: VotingSetters) {
  const result = msg.result
  if (result) {
    setters.setVoteResults({
      proposalId: result.proposalId,
      totalVotes: result.totalVotes,
      approveCount: result.approveCount,
      opposeCount: result.opposeCount,
      accepted: result.accepted,
    })
    setters.setActiveProposal(null)
    setters.setVotes(() => new Map())
    setters.setChatMessages(prev => [...prev, {
      role: 'boss' as const,
      content: `投票结果: ${result.accepted ? '通过' : '未通过'} (${result.approveCount}赞成 / ${result.opposeCount}反对，共${result.totalVotes}票)`,
      timestamp: Date.now(),
      _msgSubtype: 'vote_result',
    }])
  }
}
