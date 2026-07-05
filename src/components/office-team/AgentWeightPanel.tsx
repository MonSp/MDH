import React, { useState } from 'react'

interface AgentWeightPanelProps {
  agents: Array<{ id: string; name: string; role: string }>
  onAdjustWeight: (agentId: string, weight: number) => void
}

export default function AgentWeightPanel({ agents, onAdjustWeight }: AgentWeightPanelProps) {
  const [weights, setWeights] = useState<Record<string, number>>({})

  const getWeight = (id: string) => weights[id] ?? 1.0

  const handleChange = (id: string, value: number) => {
    setWeights(prev => ({ ...prev, [id]: value }))
    onAdjustWeight(id, value)
  }

  const roleEmoji: Record<string, string> = {
    ceo: '👔', planner: '📐', executor: '⚡', monitor: '📡', reviewer: '🔍', coordinator: '📋',
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>智能体权重</span>
        <span style={styles.hint}>投票权重倍率</span>
      </div>
      {agents.map(agent => (
        <div key={agent.id} style={styles.row}>
          <span style={styles.roleEmoji}>{roleEmoji[agent.role] || '🤖'}</span>
          <span style={styles.name}>{agent.name}</span>
          <input
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={getWeight(agent.id)}
            onChange={e => handleChange(agent.id, Number(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.weightValue}>{getWeight(agent.id).toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px',
    background: 'rgba(15,23,42,0.6)', borderRadius: '8px',
    border: '1px solid rgba(139,92,246,0.2)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
  hint: { fontSize: '10px', color: '#6b7280' },
  row: {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0',
  },
  roleEmoji: { fontSize: '14px', width: '20px', textAlign: 'center' as const },
  name: { fontSize: '12px', color: '#e2e8f0', width: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  slider: { flex: 1, accentColor: '#a78bfa', height: '4px' },
  weightValue: { fontSize: '12px', color: '#a78bfa', fontWeight: 600, width: '30px', textAlign: 'right' as const },
}
