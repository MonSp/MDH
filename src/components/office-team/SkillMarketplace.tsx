import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { SharedRule, SkillFork, MarketplaceStats, SkillDetail, CommunitySkill } from './skillMarketplace.types'
import { s } from './SkillMarketplace.styles'

type Tab = 'skills' | 'experience' | 'forks' | 'export' | 'community' | 'leaderboard'

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
  const [leaderboard, setLeaderboard] = useState<any[]>([])

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

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketplace/experience/leaderboard?limit=20')
      const data = await res.json()
      if (data.success) setLeaderboard(data.leaderboard || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'skills') fetchSkills()
    else if (tab === 'experience') fetchSharedRules()
    else if (tab === 'forks') fetchForks()
    else if (tab === 'community') searchCommunity()
    else if (tab === 'leaderboard') fetchLeaderboard()
    fetchStats()
    setPage(0)
  }, [tab, fetchSkills, fetchSharedRules, fetchForks, fetchStats, searchCommunity, fetchLeaderboard])

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
    const cats = new Set(skills.map(sk => sk.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [skills])

  const filteredSkills = useMemo(() => {
    let result = skills
    if (filter) {
      const q = filter.toLowerCase()
      result = result.filter(sk =>
        sk.name.toLowerCase().includes(q) ||
        (sk.description || '').toLowerCase().includes(q)
      )
    }
    if (categoryFilter) {
      result = result.filter(sk => sk.category === categoryFilter)
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
    { key: 'leaderboard', label: '排行榜' },
    { key: 'forks', label: `我的 Fork (${forks.length})` },
    { key: 'export', label: '导入导出' },
    { key: 'community', label: '社区' },
  ]

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>技能市场</span>
        {stats && <span style={s.stats}>{stats.total_rules} 条共享经验 · {stats.total_usage} 次复用{(stats as any).pending_count > 0 && <span style={{ color: '#f59e0b' }}> · {(stats as any).pending_count} 待审核</span>}</span>}
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
          filteredRules.map(r => {
            const statusCfg: Record<string, { label: string; color: string; bg: string }> = {
              approved: { label: '已批准', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
              pending: { label: '待审核', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
            }
            const sc = statusCfg[r.status || 'approved'] || { label: r.status || '', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' }
            return (
              <div key={r.rule_id} style={s.item}>
                <div style={s.itemHeader}>
                  <span style={s.skillName}>{highlight(r.trigger_condition.slice(0, 60), filter)}</span>
                  <span style={s.badge}>{r.rule_type}</span>
                  {sc.label && <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>{sc.label}</span>}
                </div>
                <div style={s.desc}>{highlight(r.action.slice(0, 120), filter)}</div>
                <div style={s.itemFooter}>
                  <span style={s.meta}>
                    来源: {r.source_project || '未知'} · 复用: {r.usage_count}
                    {(r.effectiveness_score ?? 0) > 0 && <span style={{ marginLeft: 6, color: (r.effectiveness_score ?? 0) >= 0.7 ? '#10b981' : '#f59e0b' }}>★{((r.effectiveness_score ?? 0) * 100).toFixed(0)}%</span>}
                  </span>
                  <button style={s.btn} onClick={() => forkRule(r.rule_id)}>Fork</button>
                </div>
              </div>
            )
          })
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

        {tab === 'leaderboard' && (
          <div style={s.tabContent}>
            <div style={s.desc}>
              跨团队技能排行榜 — 按 fork 后实际效果 × 使用次数排序
            </div>
            {leaderboard.length === 0 ? (
              <div style={s.empty}>暂无排行榜数据</div>
            ) : (
              leaderboard.map((r: any, i: number) => (
                <div key={r.rule_id} style={s.item}>
                  <div style={s.itemHeader}>
                    <span style={s.skillName}>
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`} {r.trigger_condition?.slice(0, 50)}
                    </span>
                    <span style={{
                      ...s.version,
                      color: r.fork_effectiveness >= 0.7 ? '#10b981' : r.fork_effectiveness >= 0.4 ? '#f59e0b' : '#6b7280',
                    }}>
                      ★ {(r.fork_effectiveness * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={s.desc}>{r.action?.slice(0, 100)}</div>
                  <div style={s.itemFooter}>
                    <span style={s.meta}>
                      来源: {r.source_team || '未知'} · 复用: {r.usage_count} 次 · 效果: {r.fork_total_count} 次验证
                    </span>
                    <span style={s.categoryBadge}>{r.rule_type}</span>
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
