import React, { useState, useEffect } from 'react'
import { getPendingRules, approveRule, rejectRule } from '../../modules/experienceExtractor'
import type { ExperienceRule } from '../../modules/agentTypes'

interface SkillEvolutionPanelProps {
  projectId?: string
  onClose?: () => void
}

const ruleTypeLabels: Record<string, { label: string; icon: string; color: string }> = {
  success_pattern: { label: '成功模式', icon: '✅', color: '#10b981' },
  failure_avoidance: { label: '避坑指南', icon: '⚠️', color: '#f59e0b' },
  correction_tip: { label: '纠正提示', icon: '🔧', color: '#8b5cf6' },
}

export default function SkillEvolutionPanel({ projectId, onClose }: SkillEvolutionPanelProps) {
  const [rules, setRules] = useState<ExperienceRule[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [approvedCount, setApprovedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    setLoading(true)
    try {
      const data = await getPendingRules()
      setRules(data)
    } catch {
      setRules([])
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (ruleId: string) => {
    setActingId(ruleId)
    try {
      await approveRule(ruleId)
      setRules(prev => prev.filter(r => r.rule_id !== ruleId))
      setApprovedCount(c => c + 1)
    } catch {
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async (ruleId: string) => {
    setActingId(ruleId)
    try {
      await rejectRule(ruleId, '不符合项目需求')
      setRules(prev => prev.filter(r => r.rule_id !== ruleId))
      setRejectedCount(c => c + 1)
    } catch {
    } finally {
      setActingId(null)
    }
  }

  const handleApproveAll = async () => {
    for (const rule of rules) {
      await approveRule(rule.rule_id)
    }
    setApprovedCount(c => c + rules.length)
    setRules([])
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.icon}>🧬</span>
          <div>
            <div style={styles.title}>技能进化</div>
            <div style={styles.subtitle}>
              从项目中提取经验规则，持续优化团队技能包
            </div>
          </div>
        </div>
        {onClose && (
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        )}
      </div>

      {/* 统计栏 */}
      <div style={styles.statsBar}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{rules.length}</span>
          <span style={styles.statLabel}>待审核</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statValue, color: '#10b981' }}>{approvedCount}</span>
          <span style={styles.statLabel}>已采纳</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statValue, color: '#ef4444' }}>{rejectedCount}</span>
          <span style={styles.statLabel}>已跳过</span>
        </div>
        {rules.length > 0 && (
          <button style={styles.approveAllBtn} onClick={handleApproveAll}>
            全部采纳
          </button>
        )}
      </div>

      {/* 规则列表 */}
      <div style={styles.ruleList}>
        {loading ? (
          <div style={styles.empty}>加载中...</div>
        ) : rules.length === 0 ? (
          <div style={styles.empty}>
            {approvedCount + rejectedCount > 0
              ? '所有规则已处理完毕'
              : '本次项目暂无待审核的经验规则'}
          </div>
        ) : (
          rules.map(rule => {
            const typeInfo = ruleTypeLabels[rule.rule_type] || ruleTypeLabels.success_pattern
            const isActing = actingId === rule.rule_id
            return (
              <div key={rule.rule_id} style={styles.ruleCard}>
                <div style={styles.ruleHeader}>
                  <span style={{
                    ...styles.ruleType,
                    background: typeInfo.color + '20',
                    color: typeInfo.color,
                    borderColor: typeInfo.color + '40',
                  }}>
                    {typeInfo.icon} {typeInfo.label}
                  </span>
                  <div style={styles.ruleKeywords}>
                    {rule.keywords?.slice(0, 3).map(kw => (
                      <span key={kw} style={styles.keyword}>{kw}</span>
                    ))}
                  </div>
                </div>
                <div style={styles.ruleCondition}>
                  <span style={styles.ruleLabel}>触发条件：</span>
                  {rule.trigger_condition}
                </div>
                <div style={styles.ruleAction}>
                  <span style={styles.ruleLabel}>建议操作：</span>
                  {rule.action}
                </div>
                {rule.note && (
                  <div style={styles.ruleNote}>{rule.note}</div>
                )}
                <div style={styles.ruleActions}>
                  <button
                    style={{
                      ...styles.actionBtn,
                      ...styles.approveBtn,
                      opacity: isActing ? 0.5 : 1,
                    }}
                    onClick={() => handleApprove(rule.rule_id)}
                    disabled={isActing}
                  >
                    ✓ 采纳
                  </button>
                  <button
                    style={{
                      ...styles.actionBtn,
                      ...styles.rejectBtn,
                      opacity: isActing ? 0.5 : 1,
                    }}
                    onClick={() => handleReject(rule.rule_id)}
                    disabled={isActing}
                  >
                    ✕ 跳过
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 底部操作 */}
      {approvedCount + rejectedCount > 0 && (
        <div style={styles.footer}>
          <div style={styles.footerText}>
            已处理 {approvedCount + rejectedCount} 条规则
            {approvedCount > 0 && `，${approvedCount} 条已加入技能包`}
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'rgba(0,0,0,0.2)',
    fontFamily: "'Noto Sans SC', sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 20,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(139, 92, 246, 0.2)',
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
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#9ca3af',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.1)',
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  approveAllBtn: {
    marginLeft: 'auto',
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid rgba(16, 185, 129, 0.4)',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  ruleList: {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 13,
  },
  ruleCard: {
    padding: 12,
    borderRadius: 8,
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  ruleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ruleType: {
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid',
  },
  ruleKeywords: {
    display: 'flex',
    gap: 4,
  },
  keyword: {
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    background: 'rgba(255,255,255,0.06)',
    color: '#9ca3af',
  },
  ruleCondition: {
    fontSize: 12,
    color: '#d1d5db',
    marginBottom: 4,
  },
  ruleAction: {
    fontSize: 12,
    color: '#e2e8f0',
    marginBottom: 4,
  },
  ruleLabel: {
    fontWeight: 600,
    color: '#9ca3af',
    fontSize: 11,
  },
  ruleNote: {
    fontSize: 11,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  ruleActions: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: 'none',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  approveBtn: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
  },
  rejectBtn: {
    background: 'rgba(255,255,255,0.06)',
    color: '#9ca3af',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  footer: {
    padding: '8px 16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)',
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
}
