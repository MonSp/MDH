import React from 'react'
import { DEFAULT_ROLE_PROFILES } from '../../modules/agentTypes'
import RoleAvatar from '../RoleAvatar'
import type { TeamAgent } from './types'
import { WORKSTATIONS, MEETING_TABLE } from './constants'
import { getAgentPosition, isMeetingView, isTransitioning } from './utils'

interface OfficeSceneProps {
  agents: TeamAgent[]
  viewState: string
  onStartMeeting: () => void
}

export default function OfficeScene({ agents, viewState, onStartMeeting }: OfficeSceneProps) {
  const isMeeting = isMeetingView(viewState)
  const transitioning = isTransitioning(viewState)

  return (
    <div style={styles.officeScene}>
      <div style={styles.officeFloor}>
        <div style={styles.floorPattern} />
      </div>

      <div style={styles.officeTitle}>
        <span style={styles.officeTitleText}>🏢 智能办公室</span>
        {viewState === 'office' && (
          <span style={styles.officeTitleHint}>点击下方按钮召集会议</span>
        )}
      </div>

      {WORKSTATIONS.map(ws => {
        const agent = agents.find(a => a.workstationId === ws.id)
        return (
          <div
            key={ws.id}
            style={{
              ...styles.workstation,
              left: `${ws.x}%`,
              top: `${ws.y}%`,
              borderColor: agent ? DEFAULT_ROLE_PROFILES[agent.role].themeColor + '60' : 'rgba(255,255,255,0.15)',
            }}
          >
            <div style={styles.wsIcon}>💻</div>
            <div style={styles.wsLabel}>{ws.id.toUpperCase()}</div>
            {agent && agent.status !== 'meeting' && (
              <div style={styles.wsAgentName}>{agent.name.split('-')[0]}</div>
            )}
          </div>
        )
      })}

      <div
        style={{
          ...styles.meetingTable,
          ...(isMeeting ? styles.meetingTableActive : {}),
        }}
      >
        <div style={styles.tableInner}>
          <span style={styles.tableIcon}>🤝</span>
          <span style={styles.tableLabel}>会议桌</span>
        </div>
      </div>

      {agents.map(agent => {
        const pos = getAgentPosition(agent, agents, viewState)
        const profile = DEFAULT_ROLE_PROFILES[agent.role]
        return (
          <div
            key={agent.id}
            style={{
              ...styles.agentEntity,
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transition: transitioning ? 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' : 'left 2s ease, top 2s ease',
            }}
          >
            <div
              style={{
                ...styles.agentAvatar,
                borderColor: profile.themeColor,
                boxShadow: agent.status === 'working'
                  ? `0 0 12px ${profile.themeColor}80`
                  : agent.status === 'meeting'
                  ? `0 0 10px ${profile.themeColor}60`
                  : 'none',
              }}
            >
              <RoleAvatar
                role={agent.role}
                size={isMeeting ? 36 : 44}
                status={agent.status === 'working' ? 'busy' : agent.status === 'meeting' ? 'waiting' : 'idle'}
              />
            </div>
            {!isMeeting && (
              <div style={styles.agentLabel}>{agent.name.split('-')[0]}</div>
            )}
            {agent.status === 'working' && (
              <div style={styles.workingIndicator}>⚡</div>
            )}
          </div>
        )
      })}

      {viewState === 'office' && (
        <div style={styles.officeControls}>
          <button style={styles.startMeetingBtn} onClick={onStartMeeting}>
            🤝 召集会议
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  officeScene: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at center, rgba(77, 159, 255, 0.05) 0%, transparent 70%)',
  },
  officeFloor: {
    position: 'absolute',
    inset: 0,
    opacity: 0.08,
  },
  floorPattern: {
    width: '100%',
    height: '100%',
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
    `,
    backgroundSize: '30px 30px',
  },
  officeTitle: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    zIndex: 2,
  },
  officeTitleText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#a0a0b0',
  },
  officeTitleHint: {
    fontSize: '11px',
    color: '#4a5575',
  },
  workstation: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    width: '60px',
    height: '50px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    border: '2px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    zIndex: 1,
  },
  wsIcon: {
    fontSize: '18px',
  },
  wsLabel: {
    fontSize: '9px',
    color: '#6b7280',
    fontWeight: 600,
  },
  wsAgentName: {
    fontSize: '9px',
    color: '#a0a0b0',
    whiteSpace: 'nowrap',
  },
  meetingTable: {
    position: 'absolute',
    left: `${MEETING_TABLE.x}%`,
    top: `${MEETING_TABLE.y}%`,
    transform: 'translate(-50%, -50%)',
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)',
    border: '2px solid rgba(139, 92, 246, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    transition: 'all 0.5s ease',
  },
  meetingTableActive: {
    width: '100px',
    height: '100px',
    boxShadow: '0 0 30px rgba(139, 92, 246, 0.3)',
  },
  tableInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  tableIcon: {
    fontSize: '20px',
  },
  tableLabel: {
    fontSize: '10px',
    color: '#a78bfa',
    fontWeight: 600,
  },
  agentEntity: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    zIndex: 3,
  },
  agentAvatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.6)',
    transition: 'all 0.3s ease',
  },
  agentLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    background: 'rgba(0, 0, 0, 0.5)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  workingIndicator: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    fontSize: '14px',
    animation: 'pulse 2s ease-in-out infinite',
  },
  officeControls: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 4,
  },
  startMeetingBtn: {
    padding: '12px 28px',
    background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(139, 92, 246, 0.5)',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
}
