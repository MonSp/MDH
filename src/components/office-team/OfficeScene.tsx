import React, { useMemo } from 'react'
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

/* 浮动代码粒子 */
const CODE_PARTICLES = [
  '{ }', '</>', 'fn()', '&&', '=>', '[]', '/**/', '#!', '0x', '::',
  'if', '==', '!=', '++', '||', '<<', '>>', '===', '!==', '...',
]

function FloatingParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      text: CODE_PARTICLES[i % CODE_PARTICLES.length],
      left: `${5 + (i * 5.3) % 90}%`,
      top: `${8 + (i * 7.1) % 80}%`,
      delay: `${(i * 0.7) % 6}s`,
      dur: `${6 + (i % 4) * 2}s`,
      opacity: 0.06 + (i % 3) * 0.03,
      size: 8 + (i % 3) * 2,
    }))
  , [])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {particles.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            fontSize: p.size,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: '#8b5cf6',
            opacity: p.opacity,
            animation: `float-particle ${p.dur} ease-in-out ${p.delay} infinite`,
            userSelect: 'none',
          }}
        >
          {p.text}
        </span>
      ))}
      <style>{`
        @keyframes float-particle {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: var(--p-opacity, 0.08); }
          25% { transform: translateY(-12px) rotate(3deg); opacity: calc(var(--p-opacity, 0.08) * 1.5); }
          50% { transform: translateY(-6px) rotate(-2deg); opacity: var(--p-opacity, 0.08); }
          75% { transform: translateY(-18px) rotate(1deg); opacity: calc(var(--p-opacity, 0.08) * 0.7); }
        }
      `}</style>
    </div>
  )
}

/* 工作站 SVG 背景 */
function WorkstationBg({ color }: { color: string }) {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.15 }}>
      <rect x="4" y="4" width="calc(100% - 8)" height="calc(100% - 8)" rx="8" fill="none" stroke={color} strokeWidth="1" strokeDasharray="4 2" />
      <rect x="8" y="8" width="6" height="6" rx="1" fill={color} opacity="0.4" />
    </svg>
  )
}

export default function OfficeScene({ agents, viewState, onStartMeeting }: OfficeSceneProps) {
  const isMeeting = isMeetingView(viewState)
  const transitioning = isTransitioning(viewState)

  return (
    <div style={styles.officeScene}>
      {/* 背景网格 */}
      <div style={styles.gridFloor} />

      {/* 网格上的霓虹线 */}
      <div style={styles.neonGlow} />

      {/* 浮动代码粒子 */}
      <FloatingParticles />

      {/* 标题 */}
      <div style={styles.officeTitle}>
        <span style={styles.officeTitleText}>
          <span style={styles.titleIcon}>⚡</span>
          Tech Lab
        </span>
        {viewState === 'office' && (
          <span style={styles.officeTitleHint}>点击下方按钮召集团队</span>
        )}
      </div>

      {/* 工作站 */}
      {WORKSTATIONS.map(ws => {
        const agent = agents.find(a => a.workstationId === ws.id)
        const profile = agent ? DEFAULT_ROLE_PROFILES[agent.role] : null
        return (
          <div
            key={ws.id}
            style={{
              ...styles.workstation,
              left: `${ws.x}%`,
              top: `${ws.y}%`,
              borderColor: profile ? profile.themeColor + '50' : 'rgba(255,255,255,0.08)',
              boxShadow: profile
                ? `0 0 20px ${profile.themeColor}15, inset 0 0 15px ${profile.themeColor}08`
                : 'none',
            }}
          >
            {/* 屏幕发光效果 */}
            <div style={{
              ...styles.screenGlow,
              background: profile
                ? `radial-gradient(ellipse at center, ${profile.themeColor}20 0%, transparent 70%)`
                : 'none',
            }} />
            <div style={styles.wsIcon}>
              {profile ? profile.emoji : '💻'}
            </div>
            <div style={{
              ...styles.wsLabel,
              color: profile ? profile.themeColor : '#4a5575',
            }}>{ws.id.replace('ws-', '#')}</div>
            {agent && agent.status !== 'meeting' && (
              <div style={styles.wsAgentName}>{agent.name.split('-')[0]}</div>
            )}
            {/* 呼吸灯 */}
            {agent && agent.status === 'idle' && (
              <div style={{
                position: 'absolute', bottom: 4, right: 4,
                width: 4, height: 4, borderRadius: '50%',
                background: '#30d158',
                animation: 'breathe 3s ease-in-out infinite',
              }} />
            )}
          </div>
        )
      })}

      {/* 会议桌 - 全息投影风格 */}
      <div
        style={{
          ...styles.meetingTable,
          ...(isMeeting ? styles.meetingTableActive : {}),
        }}
      >
        <div style={styles.tableHoloRing}>
          <svg width="100%" height="100%" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="url(#holoGrad)" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6">
              <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="10s" repeatCount="indefinite" />
            </circle>
            <circle cx="50" cy="50" r="35" fill="none" stroke="url(#holoGrad)" strokeWidth="1" strokeDasharray="3 6" opacity="0.3">
              <animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="15s" repeatCount="indefinite" />
            </circle>
            <defs>
              <linearGradient id="holoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#bf5af2" />
                <stop offset="50%" stopColor="#0a84ff" />
                <stop offset="100%" stopColor="#30d158" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div style={styles.tableInner}>
          <span style={styles.tableIcon}>🤝</span>
          <span style={styles.tableLabel}>会议桌</span>
        </div>
      </div>

      {/* 智能体 */}
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
            {/* 角色光环 */}
            <div style={{
              position: 'absolute', inset: -8, borderRadius: '50%',
              background: `radial-gradient(circle, ${profile.themeColor}10 0%, transparent 70%)`,
              animation: agent.status === 'working' ? 'agent-glow-pulse 2s ease-in-out infinite' : 'none',
            }} />
            <div
              style={{
                ...styles.agentAvatar,
                borderColor: profile.themeColor,
                boxShadow: agent.status === 'working'
                  ? `0 0 16px ${profile.themeColor}80, 0 0 32px ${profile.themeColor}30`
                  : agent.status === 'meeting'
                  ? `0 0 12px ${profile.themeColor}60`
                  : `0 0 6px ${profile.themeColor}20`,
              }}
            >
              <RoleAvatar
                role={agent.role}
                size={isMeeting ? 36 : 48}
                status={agent.status === 'working' ? 'busy' : agent.status === 'meeting' ? 'waiting' : 'idle'}
              />
            </div>
            {!isMeeting && (
              <div style={{
                ...styles.agentLabel,
                borderColor: profile.themeColor + '40',
                background: `${profile.themeColor}15`,
              }}>
                <span style={{ color: profile.themeColor, fontWeight: 700 }}>{agent.name.split('-')[0]}</span>
              </div>
            )}
            {agent.status === 'working' && (
              <div style={styles.workingIndicator}>⚡</div>
            )}
          </div>
        )
      })}

      {/* 召集会议按钮 */}
      {viewState === 'office' && (
        <div style={styles.officeControls}>
          <button style={styles.startMeetingBtn} onClick={onStartMeeting}>
            <span style={styles.btnIcon}>🚀</span>
            <span>召集团队</span>
          </button>
        </div>
      )}

      <style>{`
        @keyframes breathe { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
        @keyframes agent-glow-pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  officeScene: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, #08080f 0%, #0d0d1a 50%, #0a0a14 100%)',
    overflow: 'hidden',
  },
  gridFloor: {
    position: 'absolute',
    inset: 0,
    opacity: 0.04,
    backgroundImage: `
      linear-gradient(rgba(139, 92, 246, 0.6) 1px, transparent 1px),
      linear-gradient(90deg, rgba(139, 92, 246, 0.6) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
  },
  neonGlow: {
    position: 'absolute',
    inset: 0,
    background: `
      radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139, 92, 246, 0.04) 0%, transparent 100%),
      radial-gradient(ellipse 40% 30% at 30% 70%, rgba(10, 132, 255, 0.03) 0%, transparent 100%),
      radial-gradient(ellipse 30% 40% at 70% 30%, rgba(48, 209, 88, 0.02) 0%, transparent 100%)
    `,
    pointerEvents: 'none',
  },
  officeTitle: {
    position: 'absolute',
    top: '14px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    zIndex: 2,
  },
  officeTitleText: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#e2e8f0',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  titleIcon: {
    fontSize: '16px',
    animation: 'breathe 3s ease-in-out infinite',
  },
  officeTitleHint: {
    fontSize: '11px',
    color: '#4a5575',
    letterSpacing: '1px',
  },
  workstation: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    width: '64px',
    height: '56px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    border: '1.5px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    zIndex: 1,
    backdropFilter: 'blur(4px)',
    transition: 'all 0.3s ease',
    overflow: 'hidden',
  },
  screenGlow: {
    position: 'absolute',
    inset: 0,
    borderRadius: '12px',
    pointerEvents: 'none',
  },
  wsIcon: {
    fontSize: '18px',
    zIndex: 1,
  },
  wsLabel: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    zIndex: 1,
  },
  wsAgentName: {
    fontSize: '8px',
    color: '#6b7280',
    whiteSpace: 'nowrap',
    zIndex: 1,
  },
  meetingTable: {
    position: 'absolute',
    left: `${MEETING_TABLE.x}%`,
    top: `${MEETING_TABLE.y}%`,
    transform: 'translate(-50%, -50%)',
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, rgba(10, 132, 255, 0.04) 100%)',
    border: '1.5px solid rgba(139, 92, 246, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    transition: 'all 0.5s ease',
  },
  meetingTableActive: {
    width: '110px',
    height: '110px',
    boxShadow: '0 0 40px rgba(139, 92, 246, 0.2), 0 0 80px rgba(10, 132, 255, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  tableHoloRing: {
    position: 'absolute',
    inset: '-10%',
    pointerEvents: 'none',
  },
  tableInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    zIndex: 1,
  },
  tableIcon: {
    fontSize: '22px',
  },
  tableLabel: {
    fontSize: '10px',
    color: '#a78bfa',
    fontWeight: 600,
    letterSpacing: '1px',
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
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    border: '2.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(10, 10, 20, 0.8)',
    transition: 'all 0.3s ease',
    backdropFilter: 'blur(8px)',
  },
  agentLabel: {
    fontSize: '10px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1px solid',
    backdropFilter: 'blur(4px)',
  },
  workingIndicator: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    fontSize: '14px',
    animation: 'breathe 1.5s ease-in-out infinite',
  },
  officeControls: {
    position: 'absolute',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 4,
  },
  startMeetingBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 28px',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #0a84ff 100%)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '14px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 24px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2)',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    letterSpacing: '1px',
  },
  btnIcon: {
    fontSize: '16px',
  },
}
