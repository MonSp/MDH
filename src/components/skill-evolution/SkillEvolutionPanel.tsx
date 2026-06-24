import React, { useState, useEffect, useMemo } from 'react'
import { getPendingRules, getAllRules, approveRule, rejectRule } from '../../modules/experienceExtractor'
import type { ExperienceRule } from '../../modules/agentTypes'

interface SkillEvolutionPanelProps {
  projectId?: string
  onClose?: () => void
}

type FilterTab = 'pending' | 'approved' | 'all'

const ruleTypeConfig: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  success_pattern: { label: '成功模式', icon: '✅', color: '#059669', bg: '#ecfdf5' },
  failure_avoidance: { label: '避坑指南', icon: '⚠️', color: '#d97706', bg: '#fffbeb' },
  correction_tip: { label: '纠正提示', icon: '🔧', color: '#7c3aed', bg: '#f5f3ff' },
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending_review: { label: '待审核', color: '#d97706', bg: '#fffbeb' },
  approved: { label: '已采纳', color: '#059669', bg: '#ecfdf5' },
  rejected: { label: '已跳过', color: '#dc2626', bg: '#fef2f2' },
}

const taskTypeLabels: Record<string, string> = {
  'software-dev': '💻 软件开发',
  'content-writing': '✍️ 内容写作',
  'ppt-design': '📊 PPT设计',
  'video-production': '🎬 视频制作',
  'data-analysis': '📈 数据分析',
  'general': '📋 通用',
}

export default function SkillEvolutionPanel({ projectId, onClose }: SkillEvolutionPanelProps) {
  const [allRules, setAllRules] = useState<ExperienceRule[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [approvedCount, setApprovedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    setLoading(true)
    try {
      const data = await getAllRules()
      setAllRules(data)
    } catch {
      setAllRules([])
    } finally {
      setLoading(false)
    }
  }

  const filteredRules = useMemo(() => {
    if (filter === 'pending') return allRules.filter(r => r.status === 'pending_review')
    if (filter === 'approved') return allRules.filter(r => r.status === 'approved')
    return allRules
  }, [allRules, filter])

  const pendingCount = allRules.filter(r => r.status === 'pending_review').length
  const totalApproved = allRules.filter(r => r.status === 'approved').length + approvedCount

  const handleApprove = async (ruleId: string) => {
    setActingId(ruleId)
    try {
      await approveRule(ruleId)
      setAllRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, status: 'approved' as const } : r))
      setApprovedCount(c => c + 1)
    } catch {} finally { setActingId(null) }
  }

  const handleReject = async (ruleId: string) => {
    setActingId(ruleId)
    try {
      await rejectRule(ruleId, '不符合项目需求')
      setAllRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, status: 'rejected' as const } : r))
      setRejectedCount(c => c + 1)
    } catch {} finally { setActingId(null) }
  }

  const handleApproveAll = async () => {
    const pending = allRules.filter(r => r.status === 'pending_review')
    for (const rule of pending) {
      await approveRule(rule.rule_id)
    }
    setAllRules(prev => prev.map(r => r.status === 'pending_review' ? { ...r, status: 'approved' as const } : r))
    setApprovedCount(c => c + pending.length)
  }

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>🧬</span>
          <div>
            <div style={styles.title}>技能进化</div>
            <div style={styles.subtitle}>从项目中提取经验，持续优化团队能力</div>
          </div>
        </div>
        {onClose && <button style={styles.closeBtn} onClick={onClose}>×</button>}
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#d97706' }}>{pendingCount}</div>
          <div style={styles.statLabel}>待审核</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#059669' }}>{totalApproved}</div>
          <div style={styles.statLabel}>已采纳</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#6b7280' }}>{allRules.filter(r => r.status === 'rejected').length}</div>
          <div style={styles.statLabel}>已跳过</div>
        </div>
        {pendingCount > 0 && (
          <button style={styles.approveAllBtn} onClick={handleApproveAll}>
            ✓ 全部采纳
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={styles.filterRow}>
        {([['pending', '待审核'], ['approved', '已采纳'], ['all', '全部']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as FilterTab)}
            style={{
              ...styles.filterBtn,
              ...(filter === key ? styles.filterBtnActive : {}),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Rule list */}
      <div style={styles.ruleList}>
        {loading ? (
          <div style={styles.empty}>加载中...</div>
        ) : filteredRules.length === 0 ? (
          <div style={styles.empty}>
            {filter === 'pending' ? '暂无待审核规则' : filter === 'approved' ? '暂无已采纳规则' : '暂无规则'}
          </div>
        ) : (
          filteredRules.map(rule => {
            const typeCfg = ruleTypeConfig[rule.rule_type] || ruleTypeConfig.success_pattern
            const statusCfg = statusConfig[rule.status] || statusConfig.pending_review
            const isExpanded = expandedId === rule.rule_id
            const isActing = actingId === rule.rule_id
            const taskLabel = taskTypeLabels[rule.source_task_type] || rule.source_task_type

            return (
              <div key={rule.rule_id} style={styles.card}>
                {/* Card header */}
                <div
                  style={styles.cardClickable}
                  onClick={() => setExpandedId(isExpanded ? null : rule.rule_id)}
                >
                  <div style={styles.cardTop}>
                    <div style={styles.cardTags}>
                      <span style={{ ...styles.typeTag, background: typeCfg.bg, color: typeCfg.color, borderColor: typeCfg.color + '30' }}>
                        {typeCfg.icon} {typeCfg.label}
                      </span>
                      <span style={{ ...styles.statusTag, background: statusCfg.bg, color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <span style={styles.cardDate}>{formatDate(rule.created_at)}</span>
                  </div>

                  {/* Action preview */}
                  <div style={styles.cardAction}>{rule.action}</div>

                  {/* Source line */}
                  <div style={styles.cardSource}>
                    <span>{taskLabel}</span>
                    {rule.note && <span style={styles.cardNote}> · {rule.note}</span>}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={styles.cardExpanded}>
                    {/* Methodology section */}
                    <div style={styles.methodSection}>
                      <div style={styles.methodLabel}>触发条件</div>
                      <div style={styles.methodValue}>{rule.trigger_condition}</div>
                    </div>
                    <div style={styles.methodSection}>
                      <div style={styles.methodLabel}>建议操作</div>
                      <div style={styles.methodValue}>{rule.action}</div>
                    </div>
                    {rule.note && (
                      <div style={styles.methodSection}>
                        <div style={styles.methodLabel}>补充说明</div>
                        <div style={styles.methodValue}>{rule.note}</div>
                      </div>
                    )}

                    {/* Keywords */}
                    {rule.keywords.length > 0 && (
                      <div style={styles.methodSection}>
                        <div style={styles.methodLabel}>关键词标签</div>
                        <div style={styles.keywordList}>
                          {rule.keywords.map(kw => (
                            <span key={kw} style={styles.keywordTag}>{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Source info */}
                    <div style={styles.methodSection}>
                      <div style={styles.methodLabel}>来源信息</div>
                      <div style={styles.sourceInfo}>
                        <div>项目: {rule.source_task_id.slice(0, 12)}...</div>
                        <div>类型: {taskLabel}</div>
                        <div>规则ID: {rule.rule_id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons for pending rules */}
                {rule.status === 'pending_review' && (
                  <div style={styles.cardActions}>
                    <button
                      style={{ ...styles.actionBtn, ...styles.approveBtn, opacity: isActing ? 0.5 : 1 }}
                      onClick={(e) => { e.stopPropagation(); handleApprove(rule.rule_id) }}
                      disabled={isActing}
                    >
                      ✓ 采纳
                    </button>
                    <button
                      style={{ ...styles.actionBtn, ...styles.skipBtn, opacity: isActing ? 0.5 : 1 }}
                      onClick={(e) => { e.stopPropagation(); handleReject(rule.rule_id) }}
                      disabled={isActing}
                    >
                      ✕ 跳过
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {(approvedCount > 0 || rejectedCount > 0) && (
        <div style={styles.footer}>
          本轮已处理 {approvedCount + rejectedCount} 条
          {approvedCount > 0 && `，${approvedCount} 条已加入技能库`}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif",
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerIcon: {
    fontSize: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(139,92,246,0.2)', borderRadius: 8,
  },
  title: { fontSize: 14, fontWeight: 700, color: '#e2e8f0' },
  subtitle: { fontSize: 11, color: '#6b7280' },
  closeBtn: {
    width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  statsRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)',
  },
  statCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 },
  statNum: { fontSize: 18, fontWeight: 700, color: '#e2e8f0' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  approveAllBtn: {
    marginLeft: 'auto', padding: '5px 14px', borderRadius: 6,
    border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.15)',
    color: '#10b981', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  filterRow: {
    display: 'flex', gap: 4, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' as const,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  filterBtn: {
    padding: '5px 14px', borderRadius: 14,
    borderWidth: '1px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap' as const, flexShrink: 0,
  },
  filterBtnActive: {
    background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.5)', color: '#c4b5fd',
  },
  ruleList: {
    flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
  },
  empty: { padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 },
  card: {
    borderRadius: 10, background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  cardClickable: { padding: '12px 14px', cursor: 'pointer' },
  cardTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  cardTags: { display: 'flex', gap: 6 },
  typeTag: {
    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, border: '1px solid',
  },
  statusTag: {
    padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500,
  },
  cardDate: { fontSize: 10, color: '#6b7280' },
  cardAction: {
    fontSize: 13, color: '#e2e8f0', lineHeight: 1.6, marginBottom: 6,
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardSource: { fontSize: 11, color: '#6b7280' },
  cardNote: { color: '#4b5563' },
  cardExpanded: {
    padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.1)',
  },
  methodSection: { marginBottom: 10 },
  methodLabel: {
    fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' as const,
    letterSpacing: 0.5, marginBottom: 4,
  },
  methodValue: { fontSize: 12, color: '#d1d5db', lineHeight: 1.5 },
  keywordList: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  keywordTag: {
    padding: '2px 8px', borderRadius: 4, fontSize: 10,
    background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)',
  },
  sourceInfo: {
    fontSize: 11, color: '#6b7280', fontFamily: 'monospace', lineHeight: 1.6,
  },
  cardActions: {
    display: 'flex', gap: 8, padding: '8px 14px',
    borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)',
  },
  actionBtn: {
    padding: '5px 16px', borderRadius: 6, border: 'none',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
  },
  approveBtn: {
    background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
  },
  skipBtn: {
    background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)',
  },
  footer: {
    padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)', fontSize: 12, color: '#6b7280', textAlign: 'center',
  },
}
