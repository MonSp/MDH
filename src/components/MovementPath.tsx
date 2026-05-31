import React, { useMemo } from 'react'

interface PathPoint {
  x: number
  y: number
}

interface PathConfig {
  id: string
  points: PathPoint[]
  color: string
  animated?: boolean
  opacity?: number
}

interface MovementPathProps {
  paths: PathConfig[]
  width?: number
  height?: number
}

const animationName = 'movement-dash-flow'

function buildSmoothPath(points: PathPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${points[0].x} ${points[0].y}`

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]

    if (i === 1) {
      const next = points[Math.min(i + 1, points.length - 1)]
      const cp1x = prev.x + (curr.x - prev.x) / 3
      const cp1y = prev.y + (curr.y - prev.y) / 3
      const cp2x = curr.x - (next.x - prev.x) / 6
      const cp2y = curr.y - (next.y - prev.y) / 6
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`
    } else if (i === points.length - 1) {
      const pprev = points[i - 2]
      const cp1x = prev.x + (curr.x - pprev.x) / 6
      const cp1y = prev.y + (curr.y - pprev.y) / 6
      const cp2x = curr.x - (curr.x - prev.x) / 3
      const cp2y = curr.y - (curr.y - prev.y) / 3
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`
    } else {
      const pprev = points[i - 2]
      const next = points[Math.min(i + 1, points.length - 1)]
      const cp1x = prev.x + (curr.x - pprev.x) / 6
      const cp1y = prev.y + (curr.y - pprev.y) / 6
      const cp2x = curr.x - (next.x - prev.x) / 6
      const cp2y = curr.y - (next.y - prev.y) / 6
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`
    }
  }

  return d
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return `rgba(255, 255, 255, ${alpha})`
  const r = parseInt(result[1], 16)
  const g = parseInt(result[2], 16)
  const b = parseInt(result[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function MovementPath({
  paths,
  width = 800,
  height = 600,
}: MovementPathProps) {
  const keyframeId = useMemo(() => `kf-${Math.random().toString(36).slice(2, 8)}`, [])

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes ${animationName}-${keyframeId} {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -30; }
        }
      `}</style>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={styles.svg}
      >
        <defs>
          {paths.map(path => (
            <linearGradient
              key={`grad-${path.id}`}
              id={`grad-${path.id}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={path.color} stopOpacity={path.opacity ?? 1} />
              <stop offset="60%" stopColor={path.color} stopOpacity={(path.opacity ?? 1) * 0.5} />
              <stop offset="100%" stopColor={path.color} stopOpacity={0} />
            </linearGradient>
          ))}
          {paths.map(path => (
            <filter key={`glow-${path.id}`} id={`glow-${path.id}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {paths.map(path => {
          const d = buildSmoothPath(path.points)
          if (!d) return null

          return (
            <g key={path.id}>
              <path
                d={d}
                fill="none"
                stroke={hexToRgba(path.color, 0.15)}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={d}
                fill="none"
                stroke={`url(#grad-${path.id})`}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="12 8"
                filter={`url(#glow-${path.id})`}
                style={
                  path.animated !== false
                    ? {
                        animation: `${animationName}-${keyframeId} 2s linear infinite`,
                      }
                    : undefined
                }
              />
              {path.points.length > 0 && (
                <circle
                  cx={path.points[0].x}
                  cy={path.points[0].y}
                  r={5}
                  fill={path.color}
                  opacity={path.opacity ?? 1}
                  style={styles.startDot}
                />
              )}
              {path.points.length > 1 && (
                <circle
                  cx={path.points[path.points.length - 1].x}
                  cy={path.points[path.points.length - 1].y}
                  r={4}
                  fill="none"
                  stroke={path.color}
                  strokeWidth={2}
                  opacity={(path.opacity ?? 1) * 0.6}
                >
                  <animate
                    attributeName="r"
                    values="4;8;4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values={`${(path.opacity ?? 1) * 0.6};${(path.opacity ?? 1) * 0.1};${(path.opacity ?? 1) * 0.6}`}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 1,
  },
  svg: {
    overflow: 'visible',
  },
  startDot: {
    filter: 'drop-shadow(0 0 4px currentColor)',
  },
}
