import React from 'react'

interface OfficeSceneProps {
  children?: React.ReactNode
  className?: string
}

interface WorkstationPosition {
  id: string
  x: number
  y: number
  label: string
}

const WORKSTATION_POSITIONS: WorkstationPosition[] = [
  { id: 'ws-1', x: 0, y: 0, label: '工位1' },
  { id: 'ws-2', x: 1, y: 0, label: '工位2' },
  { id: 'ws-3', x: 2, y: 0, label: '工位3' },
  { id: 'ws-4', x: 0, y: 2, label: '工位4' },
  { id: 'ws-5', x: 1, y: 2, label: '工位5' },
  { id: 'ws-6', x: 2, y: 2, label: '工位6' },
]

const MEETING_TABLE_POSITION = {
  id: 'meeting-table',
  x: 1,
  y: 1,
  label: '会议桌',
}

const themeColors = {
  primaryColor: '#4d9fff',
  secondaryColor: '#a78bfa',
  accentColor: '#3dd6c8',
  backgroundColor: '#0f192d',
  surfaceColor: 'rgba(15, 25, 45, 0.85)',
  borderColor: 'rgba(90, 140, 210, 0.12)',
  borderGlow: 'rgba(90, 140, 210, 0.22)',
  textPrimary: '#e2e8f0',
  textSecondary: '#8899b4',
  textMuted: '#4a5575',
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  },
  sceneWrapper: {
    width: '100%',
    maxWidth: '1200px',
    aspectRatio: '16 / 9',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: '20px',
    padding: '30px',
    background: themeColors.surfaceColor,
    borderRadius: '16px',
    border: `1px solid ${themeColors.borderColor}`,
    boxShadow: `0 0 40px rgba(77, 159, 255, 0.05), 0 0 80px rgba(167, 139, 250, 0.03)`,
    backdropFilter: 'blur(16px)',
    position: 'relative',
  },
  workstation: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, rgba(77, 159, 255, 0.1) 0%, rgba(167, 139, 250, 0.05) 100%)`,
    border: `1px solid ${themeColors.borderColor}`,
    borderRadius: '12px',
    padding: '16px',
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    overflow: 'hidden',
  },
  workstationHover: {
    borderColor: themeColors.borderGlow,
    boxShadow: `0 0 20px rgba(77, 159, 255, 0.15), 0 0 40px rgba(167, 139, 250, 0.1)`,
    transform: 'translateY(-2px)',
  },
  workstationLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: themeColors.textPrimary,
    marginBottom: '8px',
    letterSpacing: '0.5px',
  },
  workstationId: {
    fontSize: '11px',
    color: themeColors.textMuted,
    fontFamily: 'var(--font-mono, monospace)',
    opacity: 0.7,
  },
  workstationIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: `linear-gradient(135deg, ${themeColors.primaryColor}20 0%, ${themeColors.secondaryColor}10 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
    border: `1px solid ${themeColors.borderColor}`,
  },
  meetingTable: {
    gridColumn: '2 / 3',
    gridRow: '2 / 3',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(135deg, rgba(61, 214, 200, 0.15) 0%, rgba(77, 159, 255, 0.08) 100%)`,
    border: `2px solid ${themeColors.accentColor}30`,
    borderRadius: '16px',
    padding: '20px',
    position: 'relative',
    overflow: 'hidden',
  },
  meetingTableLabel: {
    fontSize: '18px',
    fontWeight: 700,
    color: themeColors.accentColor,
    marginBottom: '8px',
    letterSpacing: '1px',
  },
  meetingTableDescription: {
    fontSize: '12px',
    color: themeColors.textSecondary,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  meetingTableIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${themeColors.accentColor}20 0%, ${themeColors.primaryColor}10 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    border: `2px solid ${themeColors.accentColor}20`,
    boxShadow: `0 0 30px ${themeColors.accentColor}10`,
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    background: `
      linear-gradient(rgba(90, 140, 210, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(90, 140, 210, 0.03) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
    borderRadius: '16px',
  },
  coordinateDisplay: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    fontSize: '10px',
    color: themeColors.textMuted,
    fontFamily: 'var(--font-mono, monospace)',
    opacity: 0.6,
    background: 'rgba(0, 0, 0, 0.3)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  decorationCircle1: {
    position: 'absolute',
    top: '-50px',
    left: '-50px',
    width: '200px',
    height: '200px',
    borderRadius: '50%',
    background: `radial-gradient(circle, ${themeColors.primaryColor}08 0%, transparent 70%)`,
    pointerEvents: 'none',
  },
  decorationCircle2: {
    position: 'absolute',
    bottom: '-80px',
    right: '-80px',
    width: '300px',
    height: '300px',
    borderRadius: '50%',
    background: `radial-gradient(circle, ${themeColors.secondaryColor}05 0%, transparent 70%)`,
    pointerEvents: 'none',
  },
}

export default function OfficeScene({ children, className }: OfficeSceneProps) {
  const [hoveredWorkstation, setHoveredWorkstation] = React.useState<string | null>(null)

  const getWorkstationStyle = (id: string): React.CSSProperties => ({
    ...styles.workstation,
    ...(hoveredWorkstation === id ? styles.workstationHover : {}),
  })

  const getCoordinateLabel = (pos: WorkstationPosition): string => {
    return `(${pos.x}, ${pos.y})`
  }

  return (
    <div className={className} style={styles.container}>
      <div style={styles.decorationCircle1} />
      <div style={styles.decorationCircle2} />
      
      <div style={styles.sceneWrapper}>
        <div style={styles.gridOverlay} />
        
        {WORKSTATION_POSITIONS.map((pos) => (
          <div
            key={pos.id}
            style={{
              ...getWorkstationStyle(pos.id),
              gridColumn: `${pos.x + 1} / ${pos.x + 2}`,
              gridRow: `${pos.y + 1} / ${pos.y + 2}`,
            }}
            onMouseEnter={() => setHoveredWorkstation(pos.id)}
            onMouseLeave={() => setHoveredWorkstation(null)}
            data-workstation-id={pos.id}
            data-x={pos.x}
            data-y={pos.y}
          >
            <div style={styles.workstationIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="4" stroke={themeColors.primaryColor} strokeWidth="1.5" fill="none" />
                <rect x="6" y="6" width="12" height="12" rx="2" fill={themeColors.primaryColor} opacity="0.2" />
                <circle cx="12" cy="12" r="3" fill={themeColors.primaryColor} opacity="0.4" />
              </svg>
            </div>
            <div style={styles.workstationLabel}>{pos.label}</div>
            <div style={styles.workstationId}>{pos.id}</div>
            <div style={styles.coordinateDisplay}>{getCoordinateLabel(pos)}</div>
          </div>
        ))}
        
        <div
          style={styles.meetingTable}
          data-meeting-table="true"
          data-x={MEETING_TABLE_POSITION.x}
          data-y={MEETING_TABLE_POSITION.y}
        >
          <div style={styles.meetingTableIcon}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke={themeColors.accentColor} strokeWidth="2" fill="none" />
              <circle cx="16" cy="16" r="6" fill={themeColors.accentColor} opacity="0.3" />
              <circle cx="16" cy="16" r="2" fill={themeColors.accentColor} opacity="0.6" />
            </svg>
          </div>
          <div style={styles.meetingTableLabel}>{MEETING_TABLE_POSITION.label}</div>
          <div style={styles.meetingTableDescription}>
            协作讨论区域
            <br />
            <span style={{ fontSize: '10px', opacity: 0.7 }}>
              {getCoordinateLabel(MEETING_TABLE_POSITION)}
            </span>
          </div>
        </div>
      </div>
      
      {children}
    </div>
  )
}

export { WORKSTATION_POSITIONS, MEETING_TABLE_POSITION }
export type { WorkstationPosition, OfficeSceneProps }