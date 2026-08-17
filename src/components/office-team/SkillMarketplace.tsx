import React, { useState, useEffect, useCallback, useMemo } from 'react'

interface SharedRule {
  rule_id: string
  source_project: string
  trigger_condition: string
  action: string
  keywords: string[]
  rule_type: string
  usage_count: number
}

interface SkillFork {
  fork_id: string
  source_skill: string
  project_id: string
  source_version: string
  local_changes: boolean
}

interface MarketplaceStats {
  total_rules: number
  total_usage: number
  rule_types: Record<string, number>
}

interface SkillDetail {
  name: string
  description: string
  version: string
  category: string
  required_tools: string[]
}

interface CommunitySkill {
  name: string
  version: string
  description: string
  category: string
  keywords: string[]
  repository: string
}

type Tab = 'skills' | 'experience' | 'forks' | 'export' | 'community'

const PAGE_SIZE = 10

export default function SkillMarketplace() {
  const [tab, setTab] = useState<Tab>('skills')
  const [skills, setSkills] = useState<SkillDetail[]>([])
  const [sharedRules, setSharedRules] = useState<SharedRule[]>([])
  const [forks, setForks] = useState<SkillFork[]>([])
  const [stats, setStats] = useState<MarketplaceStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [message, setMessage] = useState('')
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [communitySkills, setCommunitySkills] = useState<CommunitySkill[]>([])
  const [communitySearch, setCommunitySearch] = useState('')

  // ── 数据加载 ──

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/skills/list')
      const data = await res.json()
      setSkills(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchSharedRules = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter) params.set('keywords', filter)
      const res = await fetch(`/api/marketplace/experience/search?${params}`)
      const data = await res.json()
      setSharedRules(data.rules || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter])

  const fetchForks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketplace/skills/forks?project_id=current')
      const data = await res.json()
      setForks(data.forks || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/marketplace/stats')
      const data = await res.json()
      setStats(data.stats || null)
    } catch { /* ignore */ }
  }, [])

  const searchCommunity = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (communitySearch) params.set('q', communitySearch)
      const res = await fetch(`/api/community/search?${params}`)
      const data = await res.json()
      setCommunitySkills(data.skills || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [communitySearch])

  const installFromCommunity = async (skillName: string) => {
    try {
      const res = await fetch('/api/community/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_name: skillName }),
      })
      const data = await res.json()
      setMessage(data.success ? `已安装: ${skillName}` : `安装失败: ${data.error}`)
    } catch { setMessage('安装失败') }
  }

  useEffect(() => {
    if (tab === 'skills') fetchSkills()
    else if (tab === 'experience') fetchSharedRules()
    else if (tab === 'forks') fetchForks()
    else if (tab === 'community') searchCommunity()
    fetchStats()
    setPage(0)
  }, [tab, fetchSkills, fetchSharedRules, fetchForks, fetchStats, searchCommunity])

  // ── 操作 ──

  const forkSkill = async (skillName: string) => {
    try {
      const res = await fetch('/api/marketplace/skills/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_name: skillName, project_id: 'current' }),
      })
      const data = await res.json()
      setMessage(data.success ? `已 Fork: ${skillName}` : `Fork 失败: ${data.error}`)
    } catch { setMessage('Fork 失败') }
  }

  const forkRule = async (ruleId: string) => {
    try {
      const res = await fetch('/api/marketplace/experience/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_id: ruleId, target_project: 'current' }),
      })
      const data = await res.json()
      setMessage(data.success ? '已 Fork 经验规则' : `Fork 失败: ${data.error}`)
    } catch { setMessage('Fork 失败') }
  }

  const publishRule = async () => {
    const trigger = prompt('触发条件:')
    const action = prompt('建议动作:')
    if (!trigger || !action) return
    try {
      const res = await fetch('/api/marketplace/experience/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule: { trigger_condition: trigger, action, keywords: trigger.split(/\s+/).slice(0, 5) },
          source_project: 'current',
        }),
      })
      const data = await res.json()
      setMessage(data.success ? '已发布到共享池' : '发布失败')
      fetchSharedRules()
    } catch { setMessage('发布失败') }
  }

  const pullUpdate = async (skillName: string) => {
    try {
      const res = await fetch('/api/marketplace/skills/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_name: skillName, project_id: 'current' }),
      })
      const data = await res.json()
      setMessage(data.updated ? `已更新: ${skillName}` : '已是最新版本')
      fetchForks()
    } catch { setMessage('更新失败') }
  }

  // ── 过滤与分页 ──

  const categories = useMemo(() => {
    const cats = new Set(skills.map(s => s.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [skills])

  const filteredSkills = useMemo(() => {
    let result = skills
    if (filter) {
      const q = filter.toLowerCase()
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      )
    }
    if (categoryFilter) {
      result = result.filter(s => s.category === categoryFilter)
    }
    return result
  }, [skills, filter, categoryFilter])

  const filteredRules = useMemo(() => {
    if (!filter) return sharedRules
    const q = filter.toLowerCase()
    return sharedRules.filter(r =>
      r.trigger_condition.toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q)
    )
  }, [sharedRules, filter])

  const pagedSkills = useMemo(() => {
    const start = page * PAGE_SIZE
    return filteredSkills.slice(start, start + PAGE_SIZE)
  }, [filteredSkills, page])

  const totalPages = Math.ceil(filteredSkills.length / PAGE_SIZE)

  // ── 高亮匹配文本 ──

  const highlight = (text: string, query: string) => {
    if (!query || !text) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={s.highlight}>{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  // ── 渲染 ──

  const tabs: { key: Tab; label: string }[] = [
    { key: 'skills', label: `技能包 (${filteredSkills.length})` },
    { key: 'experience', label: `共享经验 (${filteredRules.length})` },
    { key: 'forks', label: `我的 Fork (${forks.length})` },
    { key: 'export', label: '导入导出' },
    { key: 'community', label: '社区' },
  ]

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>技能市场</span>
        {stats && <span style={s.stats}>{stats.total_rules} 条共享经验 · {stats.total_usage} 次复用</span>}
      </div>

      {/* Tab 栏 */}
      <div style={s.tabs}>
        {tabs.map(t => (
          <button key={t.key} style={tab === t.key ? s.tabActive : s.tab}
            onClick={() => { setTab(t.key); setFilter(''); setCategoryFilter(''); setExpandedSkill(null) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜索 + 筛选栏 */}
      {tab !== 'export' && (
        <div style={s.searchRow}>
          <input style={s.search} placeholder="搜索..." value={filter}
            onChange={e => { setFilter(e.target.value); setPage(0) }} />
          {tab === 'skills' && categories.length > 0 && (
            <select style={s.categorySelect} value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setPage(0) }}>
              <option value="">全部类别</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {tab === 'experience' && (
            <button style={s.btn} onClick={publishRule}>发布经验</button>
          )}
        </div>
      )}

      {/* 消息提示 */}
      {message && <div style={s.msg}>{message}</div>}

      {/* 内容区 */}
      <div style={s.list}>
        {loading ? <div style={s.empty}>加载中...</div> :

        tab === 'skills' && (pagedSkills.length === 0 ?
          <div style={s.empty}>{filter || categoryFilter ? '无匹配结果' : '暂无可用技能'}</div> :
          <>
            {pagedSkills.map(sk => (
              <div key={sk.name} style={s.item}>
                <div style={s.itemHeader}>
                  <span style={s.skillName} onClick={() => setExpandedSkill(expandedSkill === sk.name ? null : sk.name)}>
                    {highlight(sk.name, filter)}
                  </span>
                  <div style={s.itemBadges}>
                    {sk.version && <span style={s.version}>v{sk.version}</span>}
                    {sk.category && <span style={s.categoryBadge}>{sk.category}</span>}
                  </div>
                </div>
                {sk.description && <div style={s.desc}>{highlight(sk.description, filter)}</div>}

                {/* 展开详情 */}
                {expandedSkill === sk.name && (
                  <div style={s.detail}>
                    {sk.required_tools && sk.required_tools.length > 0 && (
                      <div style={s.detailRow}>
                        <span style={s.detailLabel}>工具:</span>
                        <span style={s.detailValue}>{sk.required_tools.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={s.itemFooter}>
                  <button style={s.btn} onClick={() => forkSkill(sk.name)}>Fork</button>
                  <button style={s.btnSecondary} onClick={() => setExpandedSkill(expandedSkill === sk.name ? null : sk.name)}>
                    {expandedSkill === sk.name ? '收起' : '详情'}
                  </button>
                </div>
              </div>
            ))}
            {/* 分页 */}
            {totalPages > 1 && (
              <div style={s.pagination}>
                <button style={s.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一页</button>
                <span style={s.pageInfo}>{page + 1} / {totalPages}</span>
                <button style={s.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>下一页</button>
              </div>
            )}
          </>
        )}

        {tab === 'experience' && (filteredRules.length === 0 ?
          <div style={s.empty}>{filter ? '无匹配结果' : '暂无共享经验'}</div> :
          filteredRules.map(r => (
            <div key={r.rule_id} style={s.item}>
              <div style={s.itemHeader}>
                <span style={s.skillName}>{highlight(r.trigger_condition.slice(0, 60), filter)}</span>
                <span style={s.badge}>{r.rule_type}</span>
              </div>
              <div style={s.desc}>{highlight(r.action.slice(0, 120), filter)}</div>
              <div style={s.itemFooter}>
                <span style={s.meta}>来源: {r.source_project || '未知'} · 复用: {r.usage_count}</span>
                <button style={s.btn} onClick={() => forkRule(r.rule_id)}>Fork</button>
              </div>
            </div>
          ))
        )}

        {tab === 'forks' && (forks.length === 0 ?
          <div style={s.empty}>暂无 Fork</div> :
          forks.map(f => (
            <div key={f.fork_id} style={s.item}>
              <div style={s.itemHeader}>
                <span style={s.skillName}>{f.source_skill}</span>
                {f.local_changes && <span style={s.badge}>已修改</span>}
              </div>
              <div style={s.desc}>版本: {f.source_version}</div>
              <div style={s.itemFooter}>
                <button style={s.btn} onClick={() => pullUpdate(f.source_skill)}>拉取更新</button>
              </div>
            </div>
          ))
        )}

        {tab === 'export' && (
          <div style={s.exportPanel}>
            <div style={s.desc}>导出技能包为 zip 文件，可导入到其他 MDH 实例。</div>
            <div style={s.exportRow}>
              <select style={s.select} id="export-skill">
                {skills.map(sk => <option key={sk.name} value={sk.name}>{sk.name}</option>)}
              </select>
              <button style={s.btn} onClick={async () => {
                const sel = document.getElementById('export-skill') as HTMLSelectElement
                if (!sel?.value) return
                try {
                  const res = await fetch('/api/marketplace/export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skill_name: sel.value, include_experience: true }),
                  })
                  const data = await res.json()
                  setMessage(data.success ? `已导出: ${data.path}` : '导出失败')
                } catch { setMessage('导出失败') }
              }}>导出</button>
            </div>
            <div style={s.desc}>导入 zip 文件（开发中）</div>
          </div>
        )}

        {tab === 'community' && (
          <div style={s.communityPanel}>
            <div style={s.communitySearchRow}>
              <input style={s.search} placeholder="搜索社区技能..." value={communitySearch}
                onChange={e => setCommunitySearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchCommunity()} />
              <button style={s.btn} onClick={searchCommunity}>搜索</button>
            </div>
            <div style={s.desc}>
              社区技能来自 GitHub 注册表（mdh-community/skill-registry）
            </div>
            {communitySkills.length === 0 ? (
              <div style={s.empty}>{communitySearch ? '无匹配结果' : '输入关键词搜索社区技能'}</div>
            ) : (
              communitySkills.map(sk => (
                <div key={sk.name} style={s.item}>
                  <div style={s.itemHeader}>
                    <span style={s.skillName}>🌐 {sk.name}</span>
                    <div style={s.itemBadges}>
                      {sk.version && <span style={s.version}>v{sk.version}</span>}
                      {sk.category && <span style={s.categoryBadge}>{sk.category}</span>}
                    </div>
                  </div>
                  {sk.description && <div style={s.desc}>{sk.description}</div>}
                  <div style={s.itemFooter}>
                    <button style={s.btn} onClick={() => installFromCommunity(sk.name)}>安装</button>
                    {sk.repository && (
                      <a href={sk.repository} target="_blank" rel="noopener noreferrer"
                        style={s.link}>查看源</a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
    background: 'rgba(15,23,42,0.6)', borderRadius: '8px',
    border: '1px solid rgba(139,92,246,0.2)', maxHeight: '500px',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
  stats: { fontSize: '10px', color: '#94a3b8' },
  tabs: { display: 'flex', gap: '4px', flexWrap: 'wrap' as const },
  tab: {
    padding: '4px 10px', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#94a3b8', fontSize: '11px', cursor: 'pointer',
  },
  tabActive: {
    padding: '4px 10px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px',
    color: '#a78bfa', fontSize: '11px', cursor: 'pointer',
  },
  searchRow: { display: 'flex', gap: '6px' },
  search: {
    flex: 1, padding: '6px 10px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '12px', outline: 'none',
  },
  categorySelect: {
    padding: '6px 8px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '11px', minWidth: '80px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'auto', maxHeight: '350px' },
  item: {
    padding: '10px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
  },
  itemHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  itemBadges: { display: 'flex', gap: '4px', alignItems: 'center' },
  skillName: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0', cursor: 'pointer' },
  version: { fontSize: '10px', color: '#a78bfa', background: 'rgba(139,92,246,0.15)', padding: '1px 6px', borderRadius: '3px' },
  categoryBadge: { fontSize: '10px', color: '#60a5fa', background: 'rgba(96,165,250,0.15)', padding: '1px 6px', borderRadius: '3px' },
  badge: { fontSize: '10px', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '1px 6px', borderRadius: '3px' },
  desc: { fontSize: '11px', color: '#94a3b8', lineHeight: 1.4, marginBottom: '6px' },
  meta: { fontSize: '10px', color: '#6b7280' },
  detail: {
    padding: '8px', marginBottom: '6px', borderRadius: '4px',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
  },
  detailRow: { display: 'flex', gap: '8px', marginBottom: '4px' },
  detailLabel: { fontSize: '11px', color: '#94a3b8', fontWeight: 600, minWidth: '40px' },
  detailValue: { fontSize: '11px', color: '#e2e8f0' },
  itemFooter: { display: 'flex', gap: '8px', alignItems: 'center' },
  btn: {
    padding: '4px 10px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px',
    color: '#a78bfa', fontSize: '11px', cursor: 'pointer',
  },
  btnSecondary: {
    padding: '4px 10px', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#94a3b8', fontSize: '11px', cursor: 'pointer',
  },
  empty: { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, padding: '20px' },
  msg: { fontSize: '11px', color: '#34d399', padding: '4px 8px', background: 'rgba(52,211,153,0.1)', borderRadius: '4px' },
  highlight: { background: 'rgba(251,191,36,0.3)', color: '#fbbf24', padding: '0 2px', borderRadius: '2px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '8px 0' },
  pageBtn: {
    padding: '4px 10px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px',
    color: '#a78bfa', fontSize: '11px', cursor: 'pointer',
  },
  pageInfo: { fontSize: '11px', color: '#94a3b8' },
  exportPanel: { display: 'flex', flexDirection: 'column', gap: '8px' },
  exportRow: { display: 'flex', gap: '6px', alignItems: 'center' },
  select: {
    padding: '6px 10px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '12px', flex: 1,
  },
  communityPanel: { display: 'flex', flexDirection: 'column', gap: '8px' },
  communitySearchRow: { display: 'flex', gap: '6px' },
  link: {
    fontSize: '11px', color: '#60a5fa', textDecoration: 'none',
  },
}
