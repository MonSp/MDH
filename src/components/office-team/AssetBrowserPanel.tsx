import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../services/apiFetch'

interface AssetItem {
  asset_id?: string
  assetId?: string
  type: string
  title: string
  content?: string
  status?: string
  judge_score?: number | null
  approved_by?: string
  created_at?: string
}

interface SearchResult {
  artifacts: AssetItem[]
  templates: AssetItem[]
  rules: Array<{ rule_id: string; trigger_condition: string; action: string }>
}

// 演示团队（team-x 为后端 seed 的演示数据团队；team-y/team-a/team-b 为既有测试团队）
const DEMO_TEAMS = ['team-x', 'team-y', 'team-a', 'team-b']

export default function AssetBrowserPanel() {
  const [teamId, setTeamId] = useState('team-x')
  const [query, setQuery] = useState('')
  const [taskType, setTaskType] = useState('')
  const [keywords, setKeywords] = useState('')
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // 团队切换：先清空旧列表（fetch 失败也不残留），再重置 per-team 检索结果与上次错误
    setAssets([])
    setSearch(null)
    setError('')
    apiFetch<AssetItem[]>(`/api/assets?team_id=${encodeURIComponent(teamId)}`)
      .then((data) => setAssets(data))
      .catch((e) => setError(String(e)))
  }, [teamId])

  const doSearch = async () => {
    try {
      // 空 task_type/keywords 不发参——后端仅当两者均非空才检索 rules（空 → 空列表）
      const params = new URLSearchParams({ team_id: teamId, q: query })
      if (taskType) params.set('task_type', taskType)
      if (keywords) params.set('keywords', keywords)
      const r = await apiFetch<SearchResult>(`/api/assets/search?${params.toString()}`)
      setSearch(r)
    } catch (e) {
      // 失败时清空旧检索结果，避免上次的规则/资产残留
      setSearch(null)
      setError(String(e))
    }
  }

  const startEdit = (id: string, content: string) => {
    setEditingId(id)
    setEditContent(content || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const saveEdit = async () => {
    if (!editingId || !editContent.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/api/assets/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent, editor: 'user' }),
      })
      // 更新本地状态
      setAssets(prev => prev.map(a =>
        (a.asset_id || a.assetId) === editingId ? { ...a, content: editContent } : a
      ))
      setEditingId(null)
      setEditContent('')
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // search 命中时并入 search.artifacts/templates（补全挂载列表），再按类型过滤
  // /api/assets 与 /api/assets/search（空 q）读同一 store 索引——空检索会返回完整挂载列表，
  // 必须按 id 去重（保留先出现），否则每资产双渲染 + React duplicate keys。
  const seen = new Set<string>()
  const merged = [...assets, ...(search?.artifacts ?? []), ...(search?.templates ?? [])].filter(
    (a) => {
      const k = a.asset_id || a.assetId
      return k ? (seen.has(k) ? false : (seen.add(k), true)) : true
    },
  )
  const artifacts = merged.filter((a) => a.type === 'artifact')
  const templates = merged.filter((a) => a.type === 'template')

  return (
    <div data-testid="asset-browser" style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>资产复用</span>
        <span style={styles.subtitle}>产出物 / 模板 / 技能规则</span>
      </div>

      <div style={styles.toolbar}>
        <label style={styles.teamLabel}>
          团队
          <select
            style={styles.teamInput}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            {DEMO_TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <input
          style={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="检索资产"
        />
        <input
          style={styles.searchInput}
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          placeholder="任务类型"
        />
        <input
          style={styles.searchInput}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="关键词"
        />
        <button style={styles.searchBtn} onClick={doSearch}>检索</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {assets.length === 0 && !search && <div style={styles.empty}>暂无资产</div>}

      <h4 style={styles.sectionTitle}>产出物</h4>
      <ul style={styles.list}>
        {artifacts.map((a) => {
          const id = a.asset_id || a.assetId || ''
          const isEditing = editingId === id
          return (
            <li key={id} style={styles.item}>
              <span data-testid="asset-type-badge" style={styles.typeBadge}>
                {a.type === 'template' ? '模板' : '产出物'}
              </span>
              <span style={styles.itemTitle}>{a.title}</span>
              {a.approved_by ? <span style={styles.itemMeta}>审批人 {a.approved_by}</span> : null}
              {a.created_at ? <span style={styles.itemMeta}>{a.created_at}</span> : null}
              {isEditing ? (
                <div style={{ marginTop: 6, width: '100%' }}>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    style={{ width: '100%', minHeight: 60, padding: 6, fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(100,210,255,0.3)', borderRadius: 4, color: '#e2e8f0', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button onClick={saveEdit} disabled={saving} style={{ padding: '3px 10px', fontSize: 11, background: '#10b981', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}>{saving ? '保存中...' : '保存'}</button>
                    <button onClick={cancelEdit} style={{ padding: '3px 10px', fontSize: 11, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#94a3b8', cursor: 'pointer' }}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  {a.content ? <span style={styles.itemContent}>{a.content}</span> : null}
                  <button onClick={() => startEdit(id, a.content || '')} style={{ marginLeft: 8, padding: '2px 8px', fontSize: 10, background: 'rgba(100,210,255,0.1)', border: '1px solid rgba(100,210,255,0.25)', borderRadius: 4, color: '#64d2ff', cursor: 'pointer' }}>编辑</button>
                </>
              )}
              {a.judge_score != null && <span style={styles.score}>（评测 {a.judge_score}）</span>}
            </li>
          )
        })}
        {artifacts.length === 0 && <li style={styles.itemMuted}>暂无产出物</li>}
      </ul>

      <h4 style={styles.sectionTitle}>模板</h4>
      <ul style={styles.list}>
        {templates.map((a) => {
          const id = a.asset_id || a.assetId || ''
          const isEditing = editingId === id
          return (
            <li key={id} style={styles.item}>
              <span data-testid="asset-type-badge" style={styles.typeBadge}>
                {a.type === 'template' ? '模板' : '产出物'}
              </span>
              <span style={styles.itemTitle}>{a.title}</span>
              <span
                style={{
                  ...styles.statusBadge,
                  color: a.status === 'approved' ? '#22c55e' : '#fbbf24',
                  background:
                    a.status === 'approved'
                      ? 'rgba(34, 197, 94, 0.12)'
                      : 'rgba(251, 191, 36, 0.12)',
                }}
              >
                {a.status === 'approved' ? '✓ 已固化' : '待确认'}
              </span>
              {a.approved_by ? <span style={styles.itemMeta}>审批人 {a.approved_by}</span> : null}
              {a.created_at ? <span style={styles.itemMeta}>{a.created_at}</span> : null}
              {isEditing ? (
                <div style={{ marginTop: 6, width: '100%' }}>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    style={{ width: '100%', minHeight: 60, padding: 6, fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(100,210,255,0.3)', borderRadius: 4, color: '#e2e8f0', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button onClick={saveEdit} disabled={saving} style={{ padding: '3px 10px', fontSize: 11, background: '#10b981', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer' }}>{saving ? '保存中...' : '保存'}</button>
                    <button onClick={cancelEdit} style={{ padding: '3px 10px', fontSize: 11, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#94a3b8', cursor: 'pointer' }}>取消</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => startEdit(id, a.content || '')} style={{ marginLeft: 8, padding: '2px 8px', fontSize: 10, background: 'rgba(100,210,255,0.1)', border: '1px solid rgba(100,210,255,0.25)', borderRadius: 4, color: '#64d2ff', cursor: 'pointer' }}>编辑</button>
              )}
              {a.judge_score != null && <span style={styles.score}>（评测 {a.judge_score}）</span>}
            </li>
          )
        })}
        {templates.length === 0 && <li style={styles.itemMuted}>暂无模板</li>}
      </ul>

      {search && (
        <>
          <h4 style={styles.sectionTitle}>技能规则</h4>
          <ul style={styles.list}>
            {search.rules.map((r) => (
              <li key={r.rule_id} style={styles.item}>
                <span style={styles.rule}>{r.trigger_condition}</span>
                <span style={styles.ruleArrow}>→</span>
                <span style={styles.itemContent}>{r.action}</span>
              </li>
            ))}
            {search.rules.length === 0 && <li style={styles.itemMuted}>暂无匹配规则</li>}
          </ul>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px',
    color: '#e2e8f0',
    fontSize: '13px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
  },
  subtitle: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  teamLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#94a3b8',
  },
  teamInput: {
    width: '90px',
    padding: '6px 8px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '12px',
    outline: 'none',
  },
  searchInput: {
    flex: 1,
    minWidth: '120px',
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '12px',
    outline: 'none',
  },
  searchBtn: {
    padding: '6px 12px',
    background: 'rgba(59, 130, 246, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    borderRadius: '4px',
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#ef4444',
    fontSize: '12px',
    marginBottom: '8px',
  },
  empty: {
    color: '#94a3b8',
    fontSize: '12px',
    padding: '12px 0',
  },
  sectionTitle: {
    margin: '8px 0 4px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    flexWrap: 'wrap',
  },
  itemMuted: {
    color: '#64748b',
    fontSize: '12px',
    padding: '4px 0',
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: 600,
  },
  itemMeta: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  itemContent: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  score: {
    fontSize: '11px',
    color: '#fbbf24',
  },
  typeBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    color: '#60a5fa',
    background: 'rgba(96, 165, 250, 0.12)',
  },
  statusBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
  },
  rule: {
    fontSize: '12px',
    color: '#60a5fa',
  },
  ruleArrow: {
    fontSize: '11px',
    color: '#64748b',
  },
}
