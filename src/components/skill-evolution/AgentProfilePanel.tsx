import React, { useState, useEffect } from 'react'
import { getAgentProfile } from '../../modules/careerDevelopment'
import type { AgentProfile, SkillProgress } from '../../modules/careerDevelopment.types'

interface Props {
  agentId: string
}

const LEVEL_LABELS = ['未解锁', '初级', '中级', '高级']
const LEVEL_COLORS = ['#4b5563', '#3b82f6', '#f59e0b', '#10b981']

export default function AgentProfilePanel({ agentId }: Props) {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getAgentProfile(agentId)
        if (!cancelled) setProfile(data)
      } catch (e: any) {
        if (!cancelled) setError(e.message || '加载 Agent 档案失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [agentId])

  if (loading) {
    return (
      <div style={styles.center}>
        <span style={{ color: '#8b5cf6', fontSize: 13 }}>正在加载 Agent 档案…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...styles.center, color: '#ef4444' }}>
        <span>❌ {error}</span>
      </div>
    )
  }

  if (!profile) return null

  const skillEntries = Object.entries(profile.skill_progress)
    .sort((a, b) => b[1].xp - a[1].xp)

  return (
    <div style={styles.container}>
      {/* Agent header */}
      <div style={styles.header}>
        <div style={styles.avatar}>
          <span style={styles.avatarText}>
            {profile.name?.charAt(0)?.toUpperCase() || 'A'}
          </span>
        </div>
        <div style={styles.headerInfo}>
          <div style={styles.name}>{profile.name || profile.agent_id}</div>
          <div style={styles.meta}>
            <span style={styles.stageBadge}>{profile.career_stage}</span>
            <span style={styles.xpBadge}>⚡ {profile.total_xp} XP</span>
          </div>
        </div>
      </div>

      {/* Skill progress list */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>技能进度 ({skillEntries.length})</div>
        {skillEntries.length === 0 ? (
          <div style={styles.emptyHint}>暂无技能记录</div>
        ) : (
          <div style={styles.skillList}>
            {skillEntries.map(([id, sp]: [string, SkillProgress]) => (
              <div key={id} style={styles.skillRow}>
                <div style={styles.skillTop}>
                  <span style={styles.skillId}>{id}</span>
                  <span
                    style={{
                      ...styles.levelBadge,
                      color: LEVEL_COLORS[sp.level] || '#6b7280',
                      borderColor: LEVEL_COLORS[sp.level] || '#6b7280',
                    }}
                  >
                    {LEVEL_LABELS[sp.level] || `Lv.${sp.level}`}
                  </span>
                </div>
                <div style={styles.barOuter}>
                  <div
                    style={{
                      ...styles.barInner,
                      width: `${Math.min(100, (sp.xp / Math.max(sp.xp + 100, 1)) * 100)}%`,
                      background: LEVEL_COLORS[sp.level] || '#6b7280',
                    }}
                  />
                </div>
                <div style={styles.skillMeta}>
                  <span>XP: {sp.xp}</span>
                  <span>任务: {sp.success_count}/{sp.task_count}</span>
                  <span>评分: {sp.avg_review_score.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#e2e8f0',
    fontSize: 13,
    padding: 16,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
  },
  headerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  meta: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  stageBadge: {
    fontSize: 11,
    padding: '2px 10px',
    borderRadius: 10,
    background: 'rgba(139,92,246,0.15)',
    color: '#a78bfa',
    fontWeight: 600,
    textTransform: 'capitalize' as const,
  },
  xpBadge: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: 600,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#8b5cf6',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  emptyHint: {
    fontSize: 12,
    color: '#4b5563',
    fontStyle: 'italic',
    padding: '10px 0',
  },
  skillList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  skillRow: {
    padding: '10px 12px',
    borderRadius: 8,
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  skillTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillId: {
    fontSize: 12,
    fontWeight: 600,
    color: '#d1d5db',
    fontFamily: "'JetBrains Mono', monospace",
  },
  levelBadge: {
    fontSize: 10,
    padding: '1px 8px',
    borderRadius: 8,
    border: '1px solid',
    fontWeight: 600,
  },
  barOuter: {
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barInner: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  skillMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 10,
    color: '#6b7280',
  },
}
