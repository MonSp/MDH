import React, { useState, useEffect, useCallback } from 'react'
import { getAgentProfile, getSkillTree, checkPromotion } from '../../modules/careerDevelopment'
import type { AgentProfile, SkillDefinition, PromotionStatus } from '../../modules/careerDevelopment.types'

interface Props {
  agentId: string
}

const stageCfg: Record<string, { label: string; color: string; bg: string }> = {
  junior: { label: 'Junior', color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
  mid: { label: 'Mid', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  senior: { label: 'Senior', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  lead: { label: 'Lead', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
}

const categoryIcons: Record<string, string> = {
  engineering: '⚙️',
  design: '🎨',
  content: '✍️',
  data: '📊',
  management: '👔',
}

function LevelIndicator({ level }: { level: number }) {
  if (level === 0) return <span style={{ fontSize: 14 }}>🔒</span>
  return <span style={{ fontSize: 13, letterSpacing: 2 }}>{'⭐'.repeat(level)}</span>
}

export function AgentProfilePanel({ agentId }: Props) {
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [skillTree, setSkillTree] = useState<Record<string, SkillDefinition> | null>(null)
  const [promotion, setPromotion] = useState<PromotionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, tree, promo] = await Promise.all([
        getAgentProfile(agentId),
        getSkillTree(),
        checkPromotion(agentId),
      ])
      setProfile(p)
      setSkillTree(tree)
      setPromotion(promo)
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.center}>
          <div style={s.spinner} />
          <div style={s.loadingText}>加载 Agent 档案中...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={s.container}>
        <div style={s.center}>
          <div style={s.errorIcon}>⚠️</div>
          <div style={s.errorText}>{error}</div>
          <button style={s.retryBtn} onClick={loadData}>重试</button>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={s.container}>
        <div style={s.empty}>暂无档案数据</div>
      </div>
    )
  }

  const stage = stageCfg[profile.career_stage] || stageCfg.junior
  const skillEntries = Object.entries(profile.skill_progress)

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>🤖</span>
          <div>
            <div style={s.title}>{profile.name || profile.agent_id}</div>
            <div style={s.subtitle}>Agent 职业发展档案</div>
          </div>
        </div>
        <button style={s.refreshBtn} onClick={loadData}>刷新</button>
      </div>

      {/* Overview row */}
      <div style={s.overviewRow}>
        {/* Career stage badge */}
        <div style={s.overviewCard}>
          <div style={s.overviewLabel}>职业阶段</div>
          <span style={{ ...s.stageBadge, background: stage.bg, color: stage.color, borderColor: stage.color + '50' }}>
            {stage.label}
          </span>
        </div>

        {/* Total XP */}
        <div style={s.overviewCard}>
          <div style={s.overviewLabel}>总经验值</div>
          <div style={s.xpValue}>{profile.total_xp.toLocaleString()}</div>
          <div style={s.xpUnit}>XP</div>
        </div>

        {/* Skill count */}
        <div style={s.overviewCard}>
          <div style={s.overviewLabel}>技能数</div>
          <div style={s.xpValue}>{skillEntries.filter(([, sp]) => sp.level > 0).length}</div>
          <div style={s.xpUnit}>/ {skillEntries.length}</div>
        </div>
      </div>

      {/* Promotion section */}
      {promotion && promotion.can_promote_to && (
        <div style={s.promoSection}>
          <div style={s.promoHeader}>
            <span style={s.promoIcon}>🎯</span>
            <span style={s.promoTitle}>可晋升为: <strong style={s.promoTarget}>{promotion.can_promote_to}</strong></span>
          </div>
          <div style={s.promoHint}>
            当前阶段: {stageCfg[promotion.current_stage]?.label || promotion.current_stage} → {promotion.can_promote_to}
          </div>
        </div>
      )}

      {/* Skill grid */}
      <div style={s.skillSection}>
        <div style={s.sectionTitle}>技能网格</div>
        {skillEntries.length === 0 ? (
          <div style={s.empty}>暂无技能数据</div>
        ) : (
          <div style={s.skillGrid}>
            {skillEntries.map(([skillId, sp]) => {
              const def = skillTree?.[skillId]
              const nextThreshold = sp.level < 3 && def ? def.xp_thresholds[sp.level] : null
              const prevThreshold = sp.level > 0 && def ? def.xp_thresholds[sp.level - 1] : 0
              const progress = nextThreshold !== null && nextThreshold > 0
                ? Math.min(((sp.xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100, 100)
                : sp.level >= 3 ? 100 : 0
              const successRate = sp.task_count > 0 ? ((sp.success_count / sp.task_count) * 100).toFixed(0) : '--'
              const cat = def?.category || 'engineering'
              const catIcon = categoryIcons[cat] || '📦'
              const unlocked = sp.level > 0

              return (
                <div key={skillId} style={{ ...s.skillCard, opacity: unlocked ? 1 : 0.5 }}>
                  <div style={s.skillCardHeader}>
                    <span style={s.skillCatIcon}>{catIcon}</span>
                    <div style={s.skillNameCol}>
                      <div style={s.skillName}>{def?.description || skillId}</div>
                      <div style={s.skillId}>{skillId}</div>
                    </div>
                    <LevelIndicator level={sp.level} />
                  </div>

                  {/* XP progress bar */}
                  <div style={s.progressRow}>
                    <div style={s.progressBar}>
                      <div style={{
                        ...s.progressFill,
                        width: `${progress}%`,
                        background: sp.level >= 3
                          ? 'linear-gradient(90deg, #10b981, #34d399)'
                          : 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                      }} />
                    </div>
                    <span style={s.progressLabel}>
                      {sp.xp}{nextThreshold !== null ? ` / ${nextThreshold}` : ' (MAX)'}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div style={s.statsRow}>
                    <div style={s.statItem}>
                      <span style={s.statLabel}>成功率</span>
                      <span style={{
                        ...s.statVal,
                        color: successRate === '--' ? '#4b5563'
                          : Number(successRate) >= 70 ? '#10b981'
                          : Number(successRate) >= 40 ? '#f59e0b'
                          : '#ef4444',
                      }}>
                        {successRate === '--' ? '--' : `${successRate}%`}
                      </span>
                    </div>
                    <div style={s.statItem}>
                      <span style={s.statLabel}>评审均分</span>
                      <span style={{
                        ...s.statVal,
                        color: sp.avg_review_score >= 80 ? '#10b981'
                          : sp.avg_review_score >= 60 ? '#f59e0b'
                          : '#ef4444',
                      }}>
                        {sp.avg_review_score > 0 ? sp.avg_review_score.toFixed(1) : '--'}
                      </span>
                    </div>
                    <div style={s.statItem}>
                      <span style={s.statLabel}>任务数</span>
                      <span style={{ ...s.statVal, color: '#d1d5db' }}>{sp.task_count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'rgba(0,0,0,0.2)',
    fontFamily: "'Noto Sans SC', sans-serif",
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid rgba(139,92,246,0.2)',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  errorIcon: {
    fontSize: 28,
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
  },
  retryBtn: {
    padding: '5px 16px',
    borderRadius: 6,
    border: '1px solid rgba(139,92,246,0.4)',
    background: 'rgba(139,92,246,0.15)',
    color: '#c4b5fd',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  empty: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: 13,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    fontSize: 20,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(139,92,246,0.2)',
    borderRadius: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  subtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  refreshBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)',
    color: '#9ca3af',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  overviewRow: {
    display: 'flex',
    gap: 10,
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  overviewCard: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.06)',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  overviewLabel: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  stageBadge: {
    padding: '4px 14px',
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 700,
    border: '1px solid',
    letterSpacing: 0.5,
  },
  xpValue: {
    fontSize: 22,
    fontWeight: 800,
    color: '#e2e8f0',
    lineHeight: 1.1,
  },
  xpUnit: {
    fontSize: 10,
    color: '#6b7280',
  },
  promoSection: {
    margin: '10px 16px 0',
    padding: '10px 14px',
    borderRadius: 8,
    background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.08))',
    border: '1px solid rgba(251,191,36,0.25)',
    flexShrink: 0,
  },
  promoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  promoIcon: {
    fontSize: 16,
  },
  promoTitle: {
    fontSize: 13,
    color: '#fbbf24',
  },
  promoTarget: {
    color: '#fde68a',
    fontWeight: 700,
  },
  promoHint: {
    fontSize: 11,
    color: '#92400e',
    marginTop: 4,
    marginLeft: 24,
  },
  skillSection: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#8b5cf6',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 4,
  },
  skillGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 10,
  },
  skillCard: {
    padding: '12px 14px',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  skillCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  skillCatIcon: {
    fontSize: 18,
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(139,92,246,0.1)',
    borderRadius: 6,
    flexShrink: 0,
  },
  skillNameCol: {
    flex: 1,
    minWidth: 0,
  },
  skillName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  skillId: {
    fontSize: 10,
    color: '#4b5563',
    fontFamily: 'monospace',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: 10,
    color: '#9ca3af',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    minWidth: 70,
    textAlign: 'right' as const,
    fontFamily: 'monospace',
  },
  statsRow: {
    display: 'flex',
    gap: 12,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  statLabel: {
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  statVal: {
    fontSize: 13,
    fontWeight: 700,
  },
}
