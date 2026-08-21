import React, { useState, useEffect } from 'react'
import { getSkillTree, listDepartments } from '../../modules/careerDevelopment'
import type { SkillDefinition, DepartmentCareerPath } from '../../modules/careerDevelopment.types'

const CATEGORY_COLORS: Record<string, string> = {
  engineering: '#3b82f6',
  design: '#ec4899',
  content: '#f59e0b',
  data: '#10b981',
  management: '#8b5cf6',
}

const CATEGORY_LABELS: Record<string, string> = {
  engineering: '工程',
  design: '设计',
  content: '内容',
  data: '数据',
  management: '管理',
}

const CATEGORIES = ['engineering', 'design', 'content', 'data', 'management'] as const

export function SkillTreeView() {
  const [tree, setTree] = useState<Record<string, SkillDefinition> | null>(null)
  const [departments, setDepartments] = useState<DepartmentCareerPath[]>([])
  const [deptFilter, setDeptFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [data, depts] = await Promise.all([getSkillTree(), listDepartments()])
        if (!cancelled) { setTree(data); setDepartments(depts) }
      } catch (e: any) {
        if (!cancelled) setError(e.message || '加载技能树失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // 部门关联技能：从 career_path stages 的 required_skills 中收集
  const deptSkillSet = React.useMemo(() => {
    if (!deptFilter) return null
    const dept = departments.find(d => d.department === deptFilter)
    if (!dept) return null
    const skills = new Set<string>()
    for (const stage of dept.stages) {
      if (stage.requirements?.required_skills) {
        for (const skillId of Object.keys(stage.requirements.required_skills)) {
          skills.add(skillId)
        }
      }
    }
    return skills
  }, [deptFilter, departments])

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <span style={{ color: '#8b5cf6', fontSize: 13 }}>正在加载技能树…</span>
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

  if (!tree || Object.keys(tree).length === 0) {
    return (
      <div style={styles.center}>
        <span style={{ color: '#6b7280', fontSize: 13 }}>暂无技能树数据</span>
      </div>
    )
  }

  // Group skills by category (with optional department filter)
  const filteredEntries = Object.entries(tree).filter(([id, def]) => {
    if (deptSkillSet && !deptSkillSet.has(id)) return false
    if (categoryFilter && def.category !== categoryFilter) return false
    return true
  })
  const grouped: Record<string, Array<{ id: string; def: SkillDefinition }>> = {}
  for (const cat of CATEGORIES) grouped[cat] = []
  for (const [id, def] of filteredEntries) {
    const cat = CATEGORIES.includes(def.category as any) ? def.category : 'engineering'
    grouped[cat].push({ id, def })
  }

  // Build reverse dependency map: skill -> list of skills that depend on it
  const dependents: Record<string, Array<{ skill: string; min_level: number }>> = {}
  for (const [id, def] of Object.entries(tree)) {
    for (const prereq of def.prerequisites) {
      if (!dependents[prereq.skill]) dependents[prereq.skill] = []
      dependents[prereq.skill].push({ skill: id, min_level: prereq.min_level })
    }
  }

  const selectedDef = selectedSkill ? tree[selectedSkill] : null
  const selectedDeps = selectedSkill ? dependents[selectedSkill] || [] : []

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>🌳 技能依赖树</span>
        <div style={styles.filterRow}>
          <select style={styles.filterSelect} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">全部部门</option>
            {departments.map(d => (
              <option key={d.department} value={d.department}>{d.name}</option>
            ))}
          </select>
          <select style={styles.filterSelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">全部类别</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
            ))}
          </select>
          <span style={styles.subtitle}>
            {filteredEntries.length}/{Object.keys(tree).length} 项技能
          </span>
        </div>
      </div>

      <div style={styles.main}>
        {/* Skill grid grouped by category */}
        <div style={styles.grid}>
          {CATEGORIES.map(cat => {
            const skills = grouped[cat]
            if (skills.length === 0) return null
            const color = CATEGORY_COLORS[cat]
            return (
              <div key={cat} style={styles.categorySection}>
                <div style={{ ...styles.categoryHeader, borderBottomColor: color }}>
                  <span style={{ ...styles.categoryDot, background: color }} />
                  <span style={{ ...styles.categoryLabel, color }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <span style={styles.categoryCount}>{skills.length}</span>
                </div>
                <div style={styles.skillGrid}>
                  {skills.map(({ id, def }) => {
                    const isSelected = selectedSkill === id
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedSkill(isSelected ? null : id)}
                        style={{
                          ...styles.skillNode,
                          borderColor: isSelected ? color : 'rgba(255,255,255,0.08)',
                          boxShadow: isSelected
                            ? `0 0 12px ${color}33, inset 0 0 8px ${color}11`
                            : 'none',
                          background: isSelected
                            ? `${color}11`
                            : 'rgba(0,0,0,0.25)',
                        }}
                      >
                        {/* Category color bar */}
                        <div style={{ ...styles.colorBar, background: color }} />
                        <div style={styles.nodeBody}>
                          <span style={styles.skillName}>{id}</span>
                          {def.prerequisites.length > 0 && (
                            <div style={styles.prereqTags}>
                              {def.prerequisites.map(p => (
                                <span key={p.skill} style={styles.prereqTag}>
                                  ← {p.skill}
                                </span>
                              ))}
                            </div>
                          )}
                          {def.description && (
                            <span style={styles.nodeDesc}>{def.description}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail panel for selected skill */}
        {selectedSkill && selectedDef && (
          <div style={styles.detailPanel}>
            <div style={styles.detailHeader}>
              <span
                style={{
                  ...styles.detailTitle,
                  color: CATEGORY_COLORS[selectedDef.category] || '#a78bfa',
                }}
              >
                {selectedSkill}
              </span>
              <span style={styles.detailBadge}>
                {CATEGORY_LABELS[selectedDef.category] || selectedDef.category}
              </span>
            </div>

            {selectedDef.description && (
              <p style={styles.detailDesc}>{selectedDef.description}</p>
            )}

            {/* XP Thresholds */}
            <div style={styles.section}>
              <div style={styles.sectionLabel}>XP 升级阈值</div>
              <div style={styles.thresholdRow}>
                {(['初级', '中级', '高级'] as const).map((label, i) => (
                  <span key={label} style={styles.thresholdBadge}>
                    {label}: {selectedDef.xp_thresholds[i]}
                  </span>
                ))}
              </div>
            </div>

            {/* Prerequisites */}
            <div style={styles.section}>
              <div style={styles.sectionLabel}>前置技能 ({selectedDef.prerequisites.length})</div>
              {selectedDef.prerequisites.length === 0 ? (
                <span style={styles.emptyHint}>无前置要求 — 基础技能</span>
              ) : (
                <div style={styles.depList}>
                  {selectedDef.prerequisites.map(p => (
                    <div key={p.skill} style={styles.depItem}>
                      <span style={styles.depArrow}>←</span>
                      <span style={styles.depName}>{p.skill}</span>
                      <span style={styles.depLevel}>Lv.{p.min_level}+</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dependents (skills that require this one) */}
            <div style={styles.section}>
              <div style={styles.sectionLabel}>被依赖 ({selectedDeps.length} 项技能需要此技能)</div>
              {selectedDeps.length === 0 ? (
                <span style={styles.emptyHint}>无下游依赖 — 终端技能</span>
              ) : (
                <div style={styles.depList}>
                  {selectedDeps.map(d => (
                    <div key={d.skill} style={styles.depItem}>
                      <span style={{ ...styles.depArrow, color: '#10b981' }}>→</span>
                      <span style={styles.depName}>{d.skill}</span>
                      <span style={styles.depLevel}>需要 Lv.{d.min_level}+</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedSkill(null)}
              style={styles.closeBtn}
            >
              关闭详情
            </button>
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
    height: '100%',
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#e2e8f0',
    fontSize: 13,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 10,
  },
  spinner: {
    width: 18,
    height: 18,
    border: '2px solid rgba(139,92,246,0.3)',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)',
    flexWrap: 'wrap' as const,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#a78bfa',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  filterSelect: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(0,0,0,0.3)',
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: 'inherit',
    minWidth: 100,
  },
  subtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  grid: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  categorySection: {},
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
    marginBottom: 10,
    borderBottom: '2px solid',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
  categoryCount: {
    fontSize: 10,
    color: '#6b7280',
    background: 'rgba(255,255,255,0.06)',
    padding: '1px 6px',
    borderRadius: 8,
    marginLeft: 'auto',
  },
  skillGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 8,
  },
  skillNode: {
    display: 'flex',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    color: 'inherit',
    fontSize: 'inherit',
    transition: 'all 0.15s ease',
    position: 'relative' as const,
  },
  colorBar: {
    width: 4,
    flexShrink: 0,
  },
  nodeBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '8px 10px',
    flex: 1,
    minWidth: 0,
  },
  skillName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#e2e8f0',
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  prereqTags: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 3,
    marginTop: 2,
  },
  prereqTag: {
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 3,
    background: 'rgba(139,92,246,0.12)',
    color: '#a78bfa',
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'nowrap' as const,
  },
  nodeDesc: {
    fontSize: 10,
    color: '#6b7280',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  detailPanel: {
    width: 320,
    flexShrink: 0,
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.2)',
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  detailBadge: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 10,
    background: 'rgba(139,92,246,0.15)',
    color: '#a78bfa',
    fontWeight: 600,
  },
  detailDesc: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 1.6,
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#8b5cf6',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  thresholdRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  thresholdBadge: {
    fontSize: 10,
    padding: '3px 8px',
    borderRadius: 4,
    background: 'rgba(16,185,129,0.1)',
    color: '#10b981',
    border: '1px solid rgba(16,185,129,0.2)',
    fontFamily: "'JetBrains Mono', monospace",
  },
  emptyHint: {
    fontSize: 11,
    color: '#4b5563',
    fontStyle: 'italic',
  },
  depList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  depItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.15)',
  },
  depArrow: {
    fontSize: 12,
    color: '#a78bfa',
    fontWeight: 700,
    flexShrink: 0,
  },
  depName: {
    fontSize: 11,
    color: '#d1d5db',
    fontFamily: "'JetBrains Mono', monospace",
  },
  depLevel: {
    fontSize: 9,
    color: '#6b7280',
    marginLeft: 'auto',
    padding: '1px 5px',
    borderRadius: 3,
    background: 'rgba(255,255,255,0.05)',
  },
  closeBtn: {
    marginTop: 4,
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#9ca3af',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
  },
}
