import React, { useState, useEffect, useMemo } from 'react'
import { apiGet, apiPost } from '../../services/apiFetch'

export type Template = {
  template_id: string
  title: string
  description: string
  category: string
  difficulty: string
  task_prompt: string
  recommended_roles: string[]
  recommended_skills: string[]
  expected_output: string
  icon: string
  tags: string[]
  usage_count: number
  is_preset: boolean
}

interface TaskTemplatePanelProps {
  onSelect: (template: Template) => void
  compact?: boolean
}

const CATEGORIES = [
  { key: '', label: '全部' },
  { key: 'development', label: '开发' },
  { key: 'testing', label: '测试' },
  { key: 'documentation', label: '文档' },
  { key: 'devops', label: 'DevOps' },
  { key: 'design', label: '设计' },
]

const DIFFICULTY_MAP: Record<string, { label: string; color: string; bg: string }> = {
  '简单': { label: '简单', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  '中等': { label: '中等', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  '高级': { label: '高级', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  'easy': { label: '简单', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  'medium': { label: '中等', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  'hard': { label: '高级', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
}

export default function TaskTemplatePanel({ onSelect, compact = false }: TaskTemplatePanelProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiGet<Template[]>('/api/templates')
      .then(data => {
        if (!cancelled) {
          setTemplates(data || [])
          setError(null)
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let list = templates
    if (activeCategory) {
      list = list.filter(t => t.category === activeCategory)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      )
    }
    return list
  }, [templates, activeCategory, search])

  const handleUse = async (template: Template) => {
    try {
      await apiPost(`/api/templates/${template.template_id}/use`)
    } catch { /* non-critical */ }
    onSelect(template)
  }

  return (
    <div style={styles.container}>
      {/* Search */}
      <div style={styles.searchRow}>
        <input
          style={styles.searchInput}
          placeholder="搜索模板..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category filter */}
      <div style={styles.categoryRow}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            style={{
              ...styles.categoryBtn,
              ...(activeCategory === cat.key ? styles.categoryBtnActive : {}),
            }}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.grid}>
        {loading && <div style={styles.statusMsg}>加载中...</div>}
        {error && <div style={{ ...styles.statusMsg, color: '#ef4444' }}>{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div style={styles.statusMsg}>暂无模板</div>
        )}
        {filtered.map(template => {
          const isExpanded = expandedId === template.template_id
          const diff = DIFFICULTY_MAP[template.difficulty] || DIFFICULTY_MAP['medium']
          return (
            <div
              key={template.template_id}
              style={styles.card}
              onClick={() => setExpandedId(isExpanded ? null : template.template_id)}
            >
              <div style={styles.cardHeader}>
                <span style={styles.cardIcon}>{template.icon || '📋'}</span>
                <div style={styles.cardTitleArea}>
                  <div style={styles.cardTitle}>{template.title}</div>
                  <div style={styles.cardMeta}>
                    <span style={{ ...styles.diffBadge, color: diff.color, background: diff.bg }}>
                      {diff.label}
                    </span>
                    <span style={styles.usageCount}>
                      🔥 {template.usage_count}
                    </span>
                  </div>
                </div>
              </div>
              <div style={styles.cardDesc}>{template.description}</div>

              {isExpanded && (
                <div style={styles.expandedArea}>
                  {template.recommended_roles.length > 0 && (
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>推荐角色</span>
                      <div style={styles.tagList}>
                        {template.recommended_roles.map(r => (
                          <span key={r} style={styles.tag}>{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.recommended_skills.length > 0 && (
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>推荐技能</span>
                      <div style={styles.tagList}>
                        {template.recommended_skills.map(s => (
                          <span key={s} style={styles.tag}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.expected_output && (
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>预期产出</span>
                      <span style={styles.detailValue}>{template.expected_output}</span>
                    </div>
                  )}
                  <button
                    style={styles.useBtn}
                    onClick={e => {
                      e.stopPropagation()
                      handleUse(template)
                    }}
                  >
                    使用此模板
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 8,
    maxHeight: 400,
    overflow: 'hidden',
  },
  searchRow: {
    display: 'flex',
    gap: 6,
  },
  searchInput: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
  },
  categoryRow: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  categoryBtn: {
    padding: '3px 10px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: '#9ca3af',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  categoryBtnActive: {
    background: 'rgba(139, 92, 246, 0.25)',
    borderColor: 'rgba(139, 92, 246, 0.5)',
    color: '#a78bfa',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    overflowY: 'auto',
    flex: 1,
  },
  statusMsg: {
    textAlign: 'center',
    padding: 20,
    color: '#6b7280',
    fontSize: 12,
  },
  card: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    fontSize: 20,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    background: 'rgba(139, 92, 246, 0.12)',
    flexShrink: 0,
  },
  cardTitleArea: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  diffBadge: {
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
  },
  usageCount: {
    fontSize: 10,
    color: '#6b7280',
  },
  cardDesc: {
    marginTop: 6,
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  expandedArea: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  detailRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 12,
    color: '#d1d5db',
    lineHeight: 1.4,
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    background: 'rgba(59, 130, 246, 0.12)',
    color: '#60a5fa',
    border: '1px solid rgba(59, 130, 246, 0.2)',
  },
  useBtn: {
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
}
