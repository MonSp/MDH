import React, { useState } from 'react'

interface VoteEntry {
  voterId: string
  approve: boolean
  reason: string
}

interface VoteResults {
  proposalId: string
  totalVotes: number
  approveCount: number
  opposeCount: number
  accepted: boolean
}

interface ActiveProposal {
  id: string
  proposerId: string
  content: string
  createdAt: number
}

interface VotingPanelProps {
  activeProposal: ActiveProposal | null
  votes: Map<string, VoteEntry>
  voteResults: VoteResults | null
  onCreateProposal: (content: string) => void
  onCastVote: (proposalId: string, approve: boolean, reason?: string) => void
  onEvaluateConsensus: (proposalId: string) => void
}

export default function VotingPanel({
  activeProposal,
  votes,
  voteResults,
  onCreateProposal,
  onCastVote,
  onEvaluateConsensus,
}: VotingPanelProps) {
  const [newProposal, setNewProposal] = useState('')
  const [voteReason, setVoteReason] = useState('')

  const handleCreateProposal = () => {
    if (!newProposal.trim()) return
    onCreateProposal(newProposal.trim())
    setNewProposal('')
  }

  const handleVote = (approve: boolean) => {
    if (!activeProposal) return
    onCastVote(activeProposal.id, approve, voteReason || undefined)
    setVoteReason('')
  }

  const votesList = Array.from(votes.entries())

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>投票决策</span>
      </div>

      {/* 创建提案 */}
      {!activeProposal && !voteResults && (
        <div style={styles.section}>
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              placeholder="输入提案内容..."
              value={newProposal}
              onChange={e => setNewProposal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateProposal()}
            />
            <button style={styles.createBtn} onClick={handleCreateProposal}>
              提交
            </button>
          </div>
        </div>
      )}

      {/* 活跃提案 */}
      {activeProposal && (
        <div style={styles.section}>
          <div style={styles.proposalCard}>
            <div style={styles.proposalHeader}>
              <span style={styles.proposalLabel}>提案</span>
              <span style={styles.proposer}>{activeProposal.proposerId}</span>
            </div>
            <div style={styles.proposalContent}>{activeProposal.content}</div>

            {/* 投票按钮 */}
            <div style={styles.voteSection}>
              <input
                style={styles.reasonInput}
                placeholder="投票理由（可选）"
                value={voteReason}
                onChange={e => setVoteReason(e.target.value)}
              />
              <div style={styles.voteButtons}>
                <button style={styles.approveBtn} onClick={() => handleVote(true)}>
                  赞成
                </button>
                <button style={styles.rejectBtn} onClick={() => handleVote(false)}>
                  反对
                </button>
                <button style={styles.evaluateBtn} onClick={() => onEvaluateConsensus(activeProposal.id)}>
                  评估共识
                </button>
              </div>
            </div>
          </div>

          {/* 投票记录 */}
          {votesList.length > 0 && (
            <div style={styles.votesList}>
              <div style={styles.votesTitle}>投票记录 ({votesList.length})</div>
              {votesList.map(([voterId, vote]) => (
                <div key={voterId} style={styles.voteItem}>
                  <span style={styles.voterName}>{voterId}</span>
                  <span style={vote.approve ? styles.approveTag : styles.rejectTag}>
                    {vote.approve ? '赞成' : '反对'}
                  </span>
                  {vote.reason && <span style={styles.voteReason}>{vote.reason}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 投票结果 */}
      {voteResults && (
        <div style={styles.section}>
          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <span style={voteResults.accepted ? styles.acceptedBadge : styles.rejectedBadge}>
                {voteResults.accepted ? '已通过' : '未通过'}
              </span>
            </div>
            <div style={styles.resultStats}>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>总票数</span>
                <span style={styles.statValue}>{voteResults.totalVotes}</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>赞成</span>
                <span style={{ ...styles.statValue, color: '#22c55e' }}>{voteResults.approveCount}</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>反对</span>
                <span style={{ ...styles.statValue, color: '#ef4444' }}>{voteResults.opposeCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '8px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
  },
  createBtn: {
    padding: '8px 16px',
    background: 'rgba(139, 92, 246, 0.3)',
    border: '1px solid rgba(139, 92, 246, 0.5)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
    cursor: 'pointer',
  },
  proposalCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  proposalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  proposalLabel: {
    fontSize: '11px',
    color: '#a78bfa',
    background: 'rgba(139, 92, 246, 0.15)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 600,
  },
  proposer: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  proposalContent: {
    fontSize: '13px',
    color: '#e2e8f0',
    lineHeight: 1.5,
    marginBottom: '12px',
  },
  voteSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  reasonInput: {
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '12px',
    outline: 'none',
  },
  voteButtons: {
    display: 'flex',
    gap: '8px',
  },
  approveBtn: {
    flex: 1,
    padding: '8px',
    background: 'rgba(34, 197, 94, 0.2)',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    borderRadius: '6px',
    color: '#22c55e',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  rejectBtn: {
    flex: 1,
    padding: '8px',
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '6px',
    color: '#ef4444',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  evaluateBtn: {
    flex: 1,
    padding: '8px',
    background: 'rgba(59, 130, 246, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    borderRadius: '6px',
    color: '#3b82f6',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  votesList: {
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '6px',
    padding: '8px',
  },
  votesTitle: {
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '6px',
    fontWeight: 600,
  },
  voteItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
    fontSize: '12px',
  },
  voterName: {
    color: '#e2e8f0',
    fontWeight: 500,
    minWidth: '80px',
  },
  approveTag: {
    color: '#22c55e',
    fontSize: '11px',
    fontWeight: 600,
  },
  rejectTag: {
    color: '#ef4444',
    fontSize: '11px',
    fontWeight: 600,
  },
  voteReason: {
    color: '#94a3b8',
    fontSize: '11px',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  resultCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  resultHeader: {
    marginBottom: '12px',
  },
  acceptedBadge: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#22c55e',
    background: 'rgba(34, 197, 94, 0.15)',
    padding: '4px 12px',
    borderRadius: '6px',
  },
  rejectedBadge: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#ef4444',
    background: 'rgba(239, 68, 68, 0.15)',
    padding: '4px 12px',
    borderRadius: '6px',
  },
  resultStats: {
    display: 'flex',
    gap: '16px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
}
