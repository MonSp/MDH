import React, { useState, useEffect, useCallback } from 'react'

interface Skill {
  name: string
  description?: string
  type?: string
  version?: string
  installed?: boolean
}

export default function SkillMarketplace() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/skills/list')
      const data = await res.json()
      setSkills(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch skills:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const filtered = skills.filter(s =>
    !filter || s.name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>技能市场</span>
        <button style={styles.refreshBtn} onClick={fetchSkills}>刷新</button>
      </div>

      <input
        style={styles.search}
        placeholder="搜索技能..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {loading ? (
        <div style={styles.empty}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>暂无可用技能</div>
      ) : (
        <div style={styles.list}>
          {filtered.map(skill => (
            <div key={skill.name} style={styles.item}>
              <div style={styles.itemHeader}>
                <span style={styles.skillName}>{skill.name}</span>
                {skill.version && <span style={styles.version}>v{skill.version}</span>}
              </div>
              {skill.description && (
                <div style={styles.description}>{skill.description}</div>
              )}
              <div style={styles.itemFooter}>
                <span style={styles.type}>{skill.type || 'skill'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
    background: 'rgba(15,23,42,0.6)', borderRadius: '8px',
    border: '1px solid rgba(139,92,246,0.2)', maxHeight: '400px',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
  refreshBtn: {
    padding: '4px 10px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px',
    color: '#a78bfa', fontSize: '11px', cursor: 'pointer',
  },
  search: {
    padding: '6px 10px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '12px', outline: 'none',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'auto', maxHeight: '300px' },
  item: {
    padding: '10px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
  },
  itemHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  skillName: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0' },
  version: { fontSize: '10px', color: '#a78bfa', background: 'rgba(139,92,246,0.15)', padding: '1px 6px', borderRadius: '3px' },
  description: { fontSize: '11px', color: '#94a3b8', lineHeight: 1.4, marginBottom: '6px' },
  itemFooter: { display: 'flex', gap: '8px' },
  type: { fontSize: '10px', color: '#6b7280' },
  empty: { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, padding: '20px' },
}
