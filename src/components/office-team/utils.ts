import type { TeamAgent } from './types'
import { WORKSTATIONS, MEETING_TABLE } from './constants'

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'idle': return '#10b981'
    case 'working': return '#f59e0b'
    case 'meeting': return '#3b82f6'
    case 'wandering': return '#10b981'
    default: return '#6b7280'
  }
}

export const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export const getAgentPosition = (
  agent: TeamAgent,
  agents: TeamAgent[],
  viewState: string
): { x: number; y: number } => {
  if (viewState === 'meeting' || viewState === 'transitioning-to-meeting') {
    const index = agents.findIndex(a => a.id === agent.id)
    const angle = (index / agents.length) * Math.PI * 2
    const radius = 12
    return {
      x: MEETING_TABLE.x + Math.cos(angle) * radius,
      y: MEETING_TABLE.y + Math.sin(angle) * radius,
    }
  }

  const ws = WORKSTATIONS.find(w => w.id === agent.workstationId)
  if (!ws) return { x: 50, y: 50 }

  if (agent.status === 'wandering' && agent.wanderAngle !== undefined) {
    const radius = 6
    return {
      x: ws.x + Math.cos(agent.wanderAngle) * radius,
      y: ws.y + Math.sin(agent.wanderAngle) * radius * 0.5,
    }
  }

  return { x: ws.x, y: ws.y }
}

export const isOfficeView = (viewState: string): boolean =>
  viewState === 'office' || viewState === 'transitioning-to-office'

export const isMeetingView = (viewState: string): boolean =>
  viewState === 'meeting' || viewState === 'transitioning-to-meeting'

export const isTransitioning = (viewState: string): boolean =>
  viewState === 'transitioning-to-meeting' || viewState === 'transitioning-to-office'
