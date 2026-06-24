import React, { useState, useEffect } from 'react'
import { listSkills, getSkillVersions, cloneSkill } from '../../modules/skillRegistry'
import type { SkillPackage } from '../../modules/agentTypes'

interface Props {
  onSkillSelect?: (skill: SkillPackage) => void
}

export function SkillRegistryPanel({ onSkillSelect }: Props) {
  const [skills, setSkills] = useState<SkillPackage[]>([])
  const [selectedSkill, setSelectedSkill] = useState<SkillPackage | null>(null)
  const [versions, setVersions] = useState<Array<{ version: string; created_at: string; changelog: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cloneTarget, setCloneTarget] = useState('')
  const [cloning, setCloning] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadSkills = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listSkills()
      setSkills(res.data || [])
    } catch (e: any) {
      setError(e.message || '加载技能列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSkills() }, [])

  const handleSelectSkill = async (skill: SkillPackage) => {
    setSelectedSkill(skill)
    onSkillSelect?.(skill)
    try {
      const res = await getSkillVersions(skill.skill_id)
      setVersions(res.data || [])
    } catch {
      setVersions([])
    }
  }

  const handleClone = async () => {
    if (!selectedSkill || !cloneTarget.trim()) return
    setCloning(true)
    try {
      await cloneSkill(selectedSkill.skill_id, cloneTarget.trim())
      setCloneTarget('')
      await loadSkills()
    } catch (e: any) {
      setError(e.message || '克隆失败')
    } finally {
      setCloning(false)
    }
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
          <span style={styles.headerIcon}>📦</span>
          <div>
            <div style={styles.title}>技能包管理</div>
            <div style={styles.subtitle}>已注册的标准化技能包，可克隆到项目中使用</div>
          </div>
        </div>
        <button style={styles.refreshBtn} onClick={loadSkills} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{skills.length}</div>
          <div style={styles.statLabel}>技能包总数</div>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Skill list */}
      <div style={styles.skillList}>
        {loading ? (
          <div style={styles.empty}>加载中...</div>
        ) : skills.length === 0 ? (
          <div style={styles.empty}>暂无技能包</div>
        ) : (
          skills.map(skill => {
            const isExpanded = expandedId === skill.skill_id
            const isSelected = selectedSkill?.skill_id === skill.skill_id

            return (
              <div key={skill.skill_id} style={styles.card}>
                {/* Card header */}
                <div
                  style={styles.cardClickable}
                  onClick={() => {
                    setExpandedId(isExpanded ? null : skill.skill_id)
                    handleSelectSkill(skill)
                  }}
                >
                  <div style={styles.cardTop}>
                    <div style={styles.cardName}>
                      <span style={styles.skillIcon}>📦</span>
                      {skill.name}
                    </div>
                    <span style={styles.versionTag}>v{skill.version}</span>
                  </div>

                  {skill.description && (
                    <div style={styles.cardDesc}>{skill.description}</div>
                  )}

                  <div style={styles.cardMeta}>
                    <span>{formatDate(skill.created_at)}</span>
                    {skill.dependencies.length > 0 && (
                      <span> · 依赖: {skill.dependencies.length} 个</span>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={styles.cardExpanded}>
                    {/* Basic info */}
                    <div style={styles.detailSection}>
                      <div style={styles.detailLabel}>基本信息</div>
                      <div style={styles.detailGrid}>
                        <div style={styles.detailItem}>
                          <span style={styles.detailKey}>ID</span>
                          <span style={styles.detailValue}>{skill.skill_id}</span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailKey}>版本</span>
                          <span style={styles.detailValue}>v{skill.version}</span>
                        </div>
                        <div style={styles.detailItem}>
                          <span style={styles.detailKey}>路径</span>
                          <span style={{ ...styles.detailValue, fontFamily: 'monospace', fontSize: 11 }}>{skill.base_path}</span>
                        </div>
                      </div>
                    </div>

                    {/* Dependencies */}
                    {skill.dependencies.length > 0 && (
                      <div style={styles.detailSection}>
                        <div style={styles.detailLabel}>依赖项</div>
                        <div style={styles.tagList}>
                          {skill.dependencies.map(dep => (
                            <span key={dep} style={styles.depTag}>{dep}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Environment */}
                    {skill.required_env.length > 0 && (
                      <div style={styles.detailSection}>
                        <div style={styles.detailLabel}>环境变量</div>
                        <div style={styles.tagList}>
                          {skill.required_env.map(env => (
                            <span key={env} style={styles.envTag}>{env}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Version history */}
                    {versions.length > 0 && (
                      <div style={styles.detailSection}>
                        <div style={styles.detailLabel}>版本历史</div>
                        <div style={styles.versionList}>
                          {versions.map((v, i) => (
                            <div key={i} style={styles.versionItem}>
                              <div style={styles.versionHeader}>
                                <span style={styles.versionNum}>v{v.version}</span>
                                <span style={styles.versionDate}>{formatDate(v.created_at)}</span>
                              </div>
                              {v.changelog && (
                                <div style={styles.versionLog}>{v.changelog}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Clone action */}
                    <div style={styles.cloneSection}>
                      <div style={styles.detailLabel}>克隆到项目</div>
                      <div style={styles.cloneRow}>
                        <input
                          type="text"
                          value={cloneTarget}
                          onChange={e => setCloneTarget(e.target.value)}
                          placeholder="输入目标目录路径"
                          style={styles.cloneInput}
                        />
                        <button
                          onClick={handleClone}
                          disabled={cloning || !cloneTarget.trim()}
                          style={{
                            ...styles.cloneBtn,
                            opacity: cloning || !cloneTarget.trim() ? 0.5 : 1,
                          }}
                        >
                          {cloning ? '克隆中...' : '克隆'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
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
    background: 'rgba(59,130,246,0.2)', borderRadius: 8,
  },
  title: { fontSize: 14, fontWeight: 700, color: '#e2e8f0' },
  subtitle: { fontSize: 11, color: '#6b7280' },
  refreshBtn: {
    padding: '4px 12px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
    color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  statsRow: {
    display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.1)',
  },
  statCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 },
  statNum: { fontSize: 18, fontWeight: 700, color: '#3b82f6' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  error: { padding: '8px 16px', color: '#ef4444', fontSize: 12, background: 'rgba(239,68,68,0.1)' },
  skillList: {
    flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
  },
  empty: { padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 },
  card: {
    borderRadius: 10, background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  cardClickable: { padding: '12px 14px', cursor: 'pointer' },
  cardTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  cardName: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 14, fontWeight: 600, color: '#e2e8f0',
  },
  skillIcon: { fontSize: 16 },
  versionTag: {
    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
    background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)',
  },
  cardDesc: {
    fontSize: 12, color: '#9ca3af', lineHeight: 1.5, marginBottom: 6,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardMeta: { fontSize: 11, color: '#4b5563' },
  cardExpanded: {
    padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.1)',
  },
  detailSection: { marginBottom: 12 },
  detailLabel: {
    fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' as const,
    letterSpacing: 0.5, marginBottom: 6,
  },
  detailGrid: { display: 'flex', flexDirection: 'column', gap: 4 },
  detailItem: { display: 'flex', gap: 8, fontSize: 12 },
  detailKey: { color: '#6b7280', minWidth: 50 },
  detailValue: { color: '#d1d5db' },
  tagList: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  depTag: {
    padding: '2px 8px', borderRadius: 4, fontSize: 10,
    background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)',
  },
  envTag: {
    padding: '2px 8px', borderRadius: 4, fontSize: 10,
    background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)',
  },
  versionList: { display: 'flex', flexDirection: 'column', gap: 6 },
  versionItem: {
    padding: '8px 10px', borderLeft: '3px solid #3b82f6',
    background: 'rgba(0,0,0,0.15)', borderRadius: '0 6px 6px 0',
  },
  versionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  versionNum: { fontSize: 12, fontWeight: 600, color: '#60a5fa' },
  versionDate: { fontSize: 10, color: '#6b7280' },
  versionLog: { fontSize: 11, color: '#9ca3af', lineHeight: 1.4 },
  cloneSection: {
    paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  cloneRow: { display: 'flex', gap: 8, alignItems: 'center' },
  cloneInput: {
    flex: 1, padding: '6px 10px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.2)',
    color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace', outline: 'none',
  },
  cloneBtn: {
    padding: '6px 14px', borderRadius: 6,
    border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.15)',
    color: '#10b981', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
}
