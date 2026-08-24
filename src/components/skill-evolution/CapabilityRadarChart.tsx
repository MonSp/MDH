import React, { useState, useEffect } from 'react'
import { apiGet } from '../../services/apiFetch'

interface DomainEntry {
  domain: string
  confidence: number
  level: 'high' | 'medium' | 'low' | 'unknown'
}

interface ConfidenceMap {
  overall_confidence: number
  domains: DomainEntry[]
}

const LEVEL_COLORS: Record<string, string> = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#ef4444',
  unknown: '#6b7280',
}

const LEVEL_LABELS: Record<string, string> = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
  unknown: '未知',
}

export default function CapabilityRadarChart() {
  const [data, setData] = useState<ConfidenceMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiGet<ConfidenceMap>('/api/capability/confidence-map')
      .then(d => setData(d))
      .catch((e: Error) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={st.center}>加载中...</div>
  if (error) return <div style={{ ...st.center, color: '#ef4444' }}>{error}</div>
  if (!data || !data.domains || data.domains.length === 0) return <div style={st.center}>无数据</div>

  const domains = data.domains
  const n = domains.length
  const cx = 200, cy = 200, maxR = 150
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Calculate polygon points for radar
  const getPoint = (index: number, value: number) => {
    const angle = (2 * Math.PI * index) / n - Math.PI / 2
    return {
      x: cx + maxR * value * Math.cos(angle),
      y: cy + maxR * value * Math.sin(angle),
    }
  }

  const ringPaths = rings.map(r => {
    const pts = Array.from({ length: n }, (_, i) => getPoint(i, r))
    return pts.map(p => `${p.x},${p.y}`).join(' ')
  })

  const dataPath = domains.map((d, i) => {
    const p = getPoint(i, d.confidence)
    return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`
  }).join(' ') + 'Z'

  const levelCounts = { high: 0, medium: 0, low: 0, unknown: 0 }
  domains.forEach(d => { levelCounts[d.level] = (levelCounts[d.level] || 0) + 1 })

  return (
    <div style={st.container}>
      <div style={st.header}>
        <span style={st.title}>能力雷达图</span>
        <span style={st.subtitle}>{n} 个领域</span>
      </div>

      <div style={st.body}>
        <div style={st.chartWrapper}>
          <svg width={400} height={400} viewBox="0 0 400 400" style={st.svg}>
            {/* Grid rings */}
            {ringPaths.map((pts, i) => (
              <polygon key={i} points={pts} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            ))}

            {/* Axis lines */}
            {domains.map((_, i) => {
              const p = getPoint(i, 1)
              return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            })}

            {/* Data polygon */}
            <polygon points={domains.map((d, i) => {
              const p = getPoint(i, d.confidence)
              return `${p.x},${p.y}`
            }).join(' ')} fill="rgba(139,92,246,0.2)" stroke="#8b5cf6" strokeWidth={2} />

            {/* Data points */}
            {domains.map((d, i) => {
              const p = getPoint(i, d.confidence)
              return <circle key={i} cx={p.x} cy={p.y} r={4} fill={LEVEL_COLORS[d.level] || '#6b7280'} stroke="#fff" strokeWidth={1} />
            })}

            {/* Domain labels */}
            {domains.map((d, i) => {
              const p = getPoint(i, 1.15)
              return (
                <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: 11, fill: LEVEL_COLORS[d.level] || '#9ca3af', fontFamily: "'Noto Sans SC', sans-serif" }}>
                  {d.domain}
                </text>
              )
            })}

            {/* Center text */}
            <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 22, fontWeight: 700, fill: '#a78bfa' }}>
              {(data.overall_confidence * 100).toFixed(0)}%
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 10, fill: '#6b7280' }}>
              总体置信度
            </text>

            {/* Ring labels */}
            {rings.map((r, i) => (
              <text key={i} x={cx + 4} y={cy - maxR * r + 4} style={{ fontSize: 8, fill: '#4b5563' }}>
                {(r * 100).toFixed(0)}
              </text>
            ))}
          </svg>
        </div>

        <div style={st.legend}>
          <div style={st.legendTitle}>置信度等级</div>
          {(['high', 'medium', 'low', 'unknown'] as const).map(level => (
            <div key={level} style={st.legendItem}>
              <div style={{ ...st.legendDot, background: LEVEL_COLORS[level] }} />
              <span style={st.legendLabel}>{LEVEL_LABELS[level]}</span>
              <span style={st.legendCount}>{levelCounts[level]} 个</span>
            </div>
          ))}

          <div style={{ ...st.legendTitle, marginTop: 16 }}>领域详情</div>
          {domains.map(d => (
            <div key={d.domain} style={st.domainRow}>
              <div style={{ ...st.domainDot, background: LEVEL_COLORS[d.level] }} />
              <span style={st.domainName}>{d.domain}</span>
              <span style={st.domainConf}>{(d.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif", color: '#e2e8f0', overflow: 'auto' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' },
  header: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' },
  title: { fontSize: 16, fontWeight: 700, color: '#a78bfa' },
  subtitle: { fontSize: 11, color: '#6b7280', marginLeft: 10 },
  body: { display: 'flex', padding: 16, gap: 20, flexWrap: 'wrap' as const },
  chartWrapper: { flex: '1 1 360px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 360 },
  svg: { maxWidth: '100%', height: 'auto' },
  legend: { flex: '0 0 200px', display: 'flex', flexDirection: 'column' as const },
  legendTitle: { fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  legendDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  legendLabel: { fontSize: 12, color: '#d1d5db', flex: 1 },
  legendCount: { fontSize: 11, color: '#6b7280' },
  domainRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  domainDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  domainName: { fontSize: 11, color: '#d1d5db', flex: 1 },
  domainConf: { fontSize: 11, fontWeight: 600, color: '#e2e8f0' },
}
