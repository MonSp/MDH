/**
 * AgentStatusOverlay — 3D 场景中的 agent 状态叠加层
 *
 * 读取 useMeetingStore 中的 agent 状态，在 3D 场景上方渲染状态指示器。
 * 使用 @react-three/drei 的 Html 组件在 3D 空间中渲染 HTML。
 */
import React, { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useMeetingStore } from '../../hooks/useMeetingSocket/meetingStore'
import type { TeamAgent } from '../office-team/types'

/** 角色 → 楼层映射 */
const ROLE_FLOOR: Record<string, number> = {
  ceo: 10,
  coordinator: 9,
  planner: 8,
  executor: 5,
  reviewer: 6,
  monitor: 7,
}

/** 状态 → 颜色 */
const STATUS_COLORS: Record<string, string> = {
  idle: '#4a9eff',
  working: '#ff9500',
  meeting: '#4a9eff',
  speaking: '#34c759',
  done: '#34c759',
  wandering: '#8e8e93',
}

/** 状态 → 中文标签 */
const STATUS_LABELS: Record<string, string> = {
  idle: '空闲',
  working: '工作中',
  meeting: '会议中',
  speaking: '发言中',
  done: '已完成',
  wandering: '待命中',
}

function AgentBadge({ agent, x }: { agent: TeamAgent; x: number }) {
  const color = STATUS_COLORS[agent.status] || '#4a9eff'
  const label = STATUS_LABELS[agent.status] || agent.status
  const floor = ROLE_FLOOR[agent.role] || 5
  const y = -4 + floor * 0.8

  return (
    <group position={[x, y, 0.5]}>
      <Html center distanceFactor={15} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0,0,0,0.8)',
          border: `1px solid ${color}`,
          borderRadius: 6,
          padding: '4px 8px',
          minWidth: 80,
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#e0e8f0',
          boxShadow: `0 0 8px ${color}40`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 11, color }}>{agent.name}</div>
          <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>{label}</div>
          {agent.currentTool && (
            <div style={{ fontSize: 8, color: '#ff9500', marginTop: 1 }}>🔧 {agent.currentTool}</div>
          )}
          {agent.artifactCount && agent.artifactCount > 0 && (
            <div style={{ fontSize: 8, color: '#34c759', marginTop: 1 }}>📄 {agent.artifactCount} 文件</div>
          )}
        </div>
      </Html>
    </group>
  )
}

export default function AgentStatusOverlay() {
  const agents = useMeetingStore(s => s.agents)
  const isMeetingActive = useMeetingStore(s => s.isMeetingActive)

  const activeAgents = useMemo(() => {
    if (!isMeetingActive || !agents.length) return []
    return agents.filter(a => a.status !== 'idle')
  }, [agents, isMeetingActive])

  if (!activeAgents.length) return null

  return (
    <group>
      {activeAgents.map((agent, i) => (
        <AgentBadge
          key={agent.id}
          agent={agent}
          x={-2 + i * 1.5}
        />
      ))}
    </group>
  )
}
