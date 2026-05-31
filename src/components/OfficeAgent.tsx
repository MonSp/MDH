import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { AgentRole } from '../modules/agentTypes'
import { DEFAULT_ROLE_PROFILES } from '../modules/agentTypes'
import RoleAvatar from './RoleAvatar'

interface OfficeAgentProps {
  id: string
  name: string
  role: AgentRole
  status: 'idle' | 'moving' | 'working' | 'meeting'
  currentPosition: { x: number; y: number }
  targetPosition?: { x: number; y: number }
  onMoveComplete?: (id: string) => void
  showPath?: boolean
  speed?: number
}

const styles: Record<string, React.CSSProperties> = {
  agentContainer: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 10,
    transition: 'transform 0.1s ease-out',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: '8px',
  },
  nameTag: {
    padding: '4px 8px',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(8px)',
    fontSize: '12px',
    fontWeight: 600,
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    border: '1px solid rgba(90, 140, 210, 0.2)',
    textAlign: 'center',
    minWidth: '60px',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: '-4px',
    right: '-4px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '2px solid rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8px',
    fontWeight: 'bold',
    color: 'white',
  },
  pathOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 5,
  },
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
}

export default function OfficeAgent({
  id,
  name,
  role,
  status,
  currentPosition,
  targetPosition,
  onMoveComplete,
  showPath = true,
  speed = 200,
}: OfficeAgentProps) {
  const [position, setPosition] = useState(currentPosition)
  const [pathPoints, setPathPoints] = useState<{ x: number; y: number }[]>([])
  const animationRef = useRef<number>()
  const startTimeRef = useRef<number>()
  const startPosRef = useRef(currentPosition)
  const targetPosRef = useRef(targetPosition)
  const isMovingRef = useRef(false)

  const themeColor = DEFAULT_ROLE_PROFILES[role].themeColor

  const statusColors: Record<string, string> = {
    idle: '#10b981',
    moving: '#3b82f6',
    working: '#f59e0b',
    meeting: '#ec4899',
  }

  const statusIcons: Record<string, string> = {
    idle: '💤',
    moving: '🚶',
    working: '⚡',
    meeting: '👥',
  }

  const animateMove = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const distance = getDistance(startPosRef.current, targetPosRef.current!)
      const duration = (distance / speed) * 1000
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeInOutCubic(progress)

      const newX = startPosRef.current.x + (targetPosRef.current!.x - startPosRef.current.x) * easedProgress
      const newY = startPosRef.current.y + (targetPosRef.current!.y - startPosRef.current.y) * easedProgress

      setPosition({ x: newX, y: newY })

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animateMove)
      } else {
        isMovingRef.current = false
        onMoveComplete?.(id)
      }
    },
    [id, onMoveComplete, speed]
  )

  useEffect(() => {
    if (targetPosition && status === 'moving') {
      targetPosRef.current = targetPosition
      startPosRef.current = position
      startTimeRef.current = undefined
      isMovingRef.current = true

      if (showPath) {
        setPathPoints((prev) => [...prev, position])
      }

      animationRef.current = requestAnimationFrame(animateMove)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [targetPosition, status, animateMove, position, showPath])

  useEffect(() => {
    if (status !== 'moving') {
      startPosRef.current = position
    }
  }, [status, position])

  const renderPath = () => {
    if (!showPath || pathPoints.length < 2) return null

    const pathData = pathPoints
      .map((point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`
        return `L ${point.x} ${point.y}`
      })
      .join(' ')

    return (
      <svg style={styles.pathOverlay} viewBox="0 0 100% 100%">
        <defs>
          <linearGradient id={`pathGradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={themeColor} stopOpacity="0" />
            <stop offset="50%" stopColor={themeColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={themeColor} stopOpacity="0.2" />
          </linearGradient>
          <filter id={`pathGlow-${id}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={pathData}
          fill="none"
          stroke={`url(#pathGradient-${id})`}
          strokeWidth="3"
          strokeDasharray="8 4"
          strokeLinecap="round"
          filter={`url(#pathGlow-${id})`}
          style={{
            opacity: 0.8,
            animation: 'pathFade 2s ease-out forwards',
          }}
        />
        {pathPoints.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={themeColor}
            opacity={index === pathPoints.length - 1 ? 0.8 : 0.3}
          />
        ))}
      </svg>
    )
  }

  return (
    <>
      <div
        style={{
          ...styles.agentContainer,
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
        data-agent-id={id}
        data-role={role}
        data-status={status}
      >
        <div style={styles.avatarWrapper}>
          <RoleAvatar role={role} size={48} status={status === 'idle' ? 'idle' : status === 'working' ? 'busy' : 'waiting'} />
          <div
            style={{
              ...styles.statusIndicator,
              background: statusColors[status],
              boxShadow: `0 0 8px ${statusColors[status]}`,
              animation: status === 'moving' ? 'pulse 1s ease-in-out infinite' : 'none',
            }}
          >
            {statusIcons[status]}
          </div>
        </div>
        <div
          style={{
            ...styles.nameTag,
            borderColor: `${themeColor}40`,
            boxShadow: `0 0 12px ${themeColor}20`,
          }}
        >
          {name}
        </div>
      </div>

      {renderPath()}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
        @keyframes pathFade {
          0% { opacity: 0.8; stroke-dashoffset: 0; }
          100% { opacity: 0.2; stroke-dashoffset: 100; }
        }
      `}</style>
    </>
  )
}