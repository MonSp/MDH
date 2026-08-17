import React, { useState, useEffect, useCallback } from 'react'

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

type Tab = 'skills' | 'experience' | 'forks' | 'export'

export default function SkillMarketplace() {
  const [tab, setTab] = useState<Tab>('skills')
  const [skills, setSkills] = useState<{ name: string; description: string; version: string }[]>([])
  const [sharedRules, setSharedRules] = useState<SharedRule[]>([])
  const [forks, setForks] = useState<SkillFork[]>([])
  const [stats, setStats] = useState<MarketplaceStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [searchKw, setSearchKw] = useState('')
  const [message, setMessage] = useState('')

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
      if (searchKw) params.set('keywords', searchKw)
      const res = await fetch(`/api/marketplace/experience/search?${params}`)
      const data = await res.json()
      setSharedRules(data.rules || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [searchKw])

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

  useEffect(() => {
    if (tab === 'skills') fetchSkills()
    else if (tab === 'experience') fetchSharedRules()
    else if (tab === 'forks') fetchForks()
    fetchStats()
  }, [tab, fetchSkills, fetchSharedRules, fetchForks, fetchStats])

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

  // ── 过滤 ──

  const filteredSkills = skills.filter(s =>
    !filter || s.name.toLowerCase().includes(filter.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(filter.toLowerCase())
  )

  const filteredRules = sharedRules.filter(r =>
    !filter || r.trigger_condition.toLowerCase().includes(filter.toLowerCase()) ||
    r.action.toLowerCase().includes(filter.toLowerCase())
  )

  // ── 渲染 ──

  const tabs: { key: Tab; label: string }[] = [
    { key: 'skills', label: '技能包' },
    { key: 'experience', label: '共享经验' },
    { key: 'forks', label: '我的 Fork' },
    { key: 'export', label: '导入导出' },
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
            onClick={() => { setTab(t.key); setFilter('') }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜索栏 */}
      {tab !== 'export' && (
        <div style={s.searchRow}>
          <input style={s.search} placeholder="搜索..." value={filter}
            onChange={e => setFilter(e.target.value)} />
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

        tab === 'skills' && (filteredSkills.length === 0 ?
          <div style={s.empty}>暂无可用技能</div> :
          filteredSkills.map(sk => (
            <div key={sk.name} style={s.item}>
              <div style={s.itemHeader}>
                <span style={s.skillName}>{sk.name}</span>
                {sk.version && <span style={s.version}>v{sk.version}</span>}
              </div>
              {sk.description && <div style={s.desc}>{sk.description}</div>}
              <div style={s.itemFooter}>
                <button style={s.btn} onClick={() => forkSkill(sk.name)}>Fork</button>
              </div>
            </div>
          ))
        )}

        {tab === 'experience' && (filteredRules.length === 0 ?
          <div style={s.empty}>暂无共享经验</div> :
          filteredRules.map(r => (
            <div key={r.rule_id} style={s.item}>
              <div style={s.itemHeader}>
                <span style={s.skillName}>{r.trigger_condition.slice(0, 60)}</span>
                <span style={s.badge}>{r.rule_type}</span>
              </div>
              <div style={s.desc}>{r.action.slice(0, 120)}</div>
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
  tabs: { display: 'flex', gap: '4px' },
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
  list: { display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'auto', maxHeight: '350px' },
  item: {
    padding: '10px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
  },
  itemHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  skillName: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0' },
  version: { fontSize: '10px', color: '#a78bfa', background: 'rgba(139,92,246,0.15)', padding: '1px 6px', borderRadius: '3px' },
  badge: { fontSize: '10px', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '1px 6px', borderRadius: '3px' },
  desc: { fontSize: '11px', color: '#94a3b8', lineHeight: 1.4, marginBottom: '6px' },
  meta: { fontSize: '10px', color: '#6b7280' },
  itemFooter: { display: 'flex', gap: '8px', alignItems: 'center' },
  btn: {
    padding: '4px 10px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px',
    color: '#a78bfa', fontSize: '11px', cursor: 'pointer',
  },
  empty: { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, padding: '20px' },
  msg: { fontSize: '11px', color: '#34d399', padding: '4px 8px', background: 'rgba(52,211,153,0.1)', borderRadius: '4px' },
  exportPanel: { display: 'flex', flexDirection: 'column', gap: '8px' },
  exportRow: { display: 'flex', gap: '6px', alignItems: 'center' },
  select: {
    padding: '6px 10px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '12px', flex: 1,
  },
}
