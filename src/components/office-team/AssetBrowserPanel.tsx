import React, { useEffect, useState } from 'react'

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

// 后端统一 _ok(data)/_fail(error) 包装：{ success, data, error }
// _fail 不传播 500（HTTP 200 + success:false + data:null）——apiGet 直接抛错，调用方进 catch 显示 error
const apiGet = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const body = (await res.json()) as { success?: boolean; data?: T; error?: string | null }
  if (body.success === false) throw new Error(body.error || 'API error')
  return body.data as T
}

export default function AssetBrowserPanel() {
  const [teamId, setTeamId] = useState('team-x')
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // 团队切换：重置 per-team 检索结果与上次错误，避免旧上下文数据残留
    setSearch(null)
    setError('')
    apiGet<AssetItem[]>(`/api/assets?team_id=${encodeURIComponent(teamId)}`)
      .then((data) => setAssets(data))
      .catch((e) => setError(String(e)))
  }, [teamId])

  const doSearch = async () => {
    try {
      const r = await apiGet<SearchResult>(
        `/api/assets/search?q=${encodeURIComponent(query)}&team_id=${encodeURIComponent(teamId)}&task_type=minutes&keywords=纪要`
      )
      setSearch(r)
    } catch (e) {
      setError(String(e))
    }
  }

  const artifacts = assets.filter((a) => a.type === 'artifact')
  const templates = assets.filter((a) => a.type === 'template')

  return (
    <div data-testid="asset-browser" style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>资产复用</span>
        <span style={styles.subtitle}>产出物 / 模板 / 技能规则</span>
      </div>

      <div style={styles.toolbar}>
        <label style={styles.teamLabel}>
          团队
          <input
            style={styles.teamInput}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          />
        </label>
        <input
          style={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="检索资产"
        />
        <button style={styles.searchBtn} onClick={doSearch}>检索</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {assets.length === 0 && !search && <div style={styles.empty}>暂无资产</div>}

      <h4 style={styles.sectionTitle}>产出物</h4>
      <ul style={styles.list}>
        {artifacts.map((a) => (
          <li key={a.asset_id || a.assetId} style={styles.item}>
            <span style={styles.itemTitle}>{a.title}</span>
            {a.content ? <span style={styles.itemContent}>{a.content}</span> : null}
            {a.judge_score != null && <span style={styles.score}>（评测 {a.judge_score}）</span>}
          </li>
        ))}
        {artifacts.length === 0 && <li style={styles.itemMuted}>暂无产出物</li>}
      </ul>

      <h4 style={styles.sectionTitle}>模板</h4>
      <ul style={styles.list}>
        {templates.map((a) => (
          <li key={a.asset_id || a.assetId} style={styles.item}>
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
            {a.judge_score != null && <span style={styles.score}>（评测 {a.judge_score}）</span>}
          </li>
        ))}
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
  itemContent: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  score: {
    fontSize: '11px',
    color: '#fbbf24',
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
