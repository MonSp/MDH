import React, { useEffect, useState, useCallback, useRef } from 'react'
import { fetchA2AAgents, unregisterA2AAgent, A2AAgent } from '../../modules/a2aClient'

/* ------------------------------------------------------------------ */
/*  状态颜色映射                                                      */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:   { label: '在线',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  unhealthy:{ label: '不健康', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  offline:  { label: '离线',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

/* ------------------------------------------------------------------ */
/*  组件                                                              */
/* ------------------------------------------------------------------ */

export default function A2AAgentPanel({ wsRef }: { wsRef?: React.MutableRefObject<WebSocket | null> } = {}) {
  const [agents, setAgents] = useState<A2AAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<string>('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchA2AAgents()
      setAgents(data)
      setLastRefresh(new Date().toLocaleTimeString('zh-CN'))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // 首次加载 + 30 秒轮询
  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load])

  // 监听 WebSocket A2A 实时更新（注册/注销事件触发即时刷新）
  useEffect(() => {
    if (!wsRef?.current) return
    const handler = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'a2a_agent_update') {
          load() // 收到节点状态变化时立即刷新
        }
      } catch {}
    }
    wsRef.current.addEventListener('message', handler)
    return () => { wsRef.current?.removeEventListener('message', handler) }
  }, [wsRef, load])

  const handleUnregister = async (agentId: string) => {
    if (!confirm(`确定注销节点 ${agentId}？`)) return
    try {
      await unregisterA2AAgent(agentId)
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div style={s.container} data-testid="a2a-agent-panel">
      {/* 头部 */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={s.title}>A2A 执行节点</span>
          <span style={s.count}>{agents.length} 个节点</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastRefresh && <span style={s.meta}>刷新于 {lastRefresh}</span>}
          <button style={s.refreshBtn} onClick={load} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 错误 */}
      {error && <div style={s.error}>{error}</div>}

      {/* 空状态 */}
      {!loading && agents.length === 0 && !error && (
        <div style={s.empty}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
          <div>暂无已注册的 A2A 执行节点</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            执行节点启动后会自动注册到本系统
          </div>
        </div>
      )}

      {/* 卡片网格 */}
      {agents.length > 0 && (
        <div style={s.grid}>
          {agents.map((agent) => {
            const st = STATUS_CONFIG[agent.status] || STATUS_CONFIG.offline
            const ratePercent = Math.round(agent.success_rate * 100)
            return (
              <div key={agent.agent_id} style={s.card}>
                {/* 卡片头部 */}
                <div style={s.cardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ ...s.statusDot, background: st.color }} />
                    <span style={s.agentName} title={agent.name}>{agent.name}</span>
                  </div>
                  <span style={{ ...s.statusBadge, color: st.color, background: st.bg }}>
                    {st.label}
                  </span>
                </div>

                {/* 描述 */}
                {agent.description && (
                  <div style={s.description} title={agent.description}>{agent.description}</div>
                )}

                {/* 技能标签 */}
                {agent.skills.length > 0 && (
                  <div style={s.skillRow}>
                    {agent.skills.map((sk) => (
                      <span key={sk.id} style={s.skillTag} title={sk.description || sk.name}>
                        {sk.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* 技能标签（tags 补充） */}
                {agent.skills.some(sk => sk.tags && sk.tags.length > 0) && (
                  <div style={{ ...s.skillRow, marginTop: 2 }}>
                    {Array.from(new Set(agent.skills.flatMap(sk => sk.tags || []))).map(tag => (
                      <span key={tag} style={s.tag}>{tag}</span>
                    ))}
                  </div>
                )}

                {/* 统计 */}
                <div style={s.statsRow}>
                  <div style={s.statItem}>
                    <span style={s.statValue}>{agent.task_count}</span>
                    <span style={s.statLabel}>任务数</span>
                  </div>
                  <div style={s.statItem}>
                    <span
                      style={{
                        ...s.statValue,
                        color: ratePercent >= 80 ? '#22c55e' : ratePercent >= 50 ? '#f59e0b' : '#ef4444',
                      }}
                    >
                      {ratePercent}%
                    </span>
                    <span style={s.statLabel}>成功率</span>
                  </div>
                </div>

                {/* 底部操作 */}
                <div style={s.cardFooter}>
                  <span style={s.agentId} title={agent.agent_id}>ID: {agent.agent_id}</span>
                  <button style={s.unregisterBtn} onClick={() => handleUnregister(agent.agent_id)}>
                    注销
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  样式                                                              */
/* ------------------------------------------------------------------ */

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    background: 'rgba(15,23,42,0.6)',
    borderRadius: 8,
    border: '1px solid rgba(59,130,246,0.2)',
    maxHeight: 520,
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  count: {
    fontSize: 11,
    color: '#94a3b8',
    background: 'rgba(100,210,255,0.08)',
    padding: '2px 8px',
    borderRadius: 10,
  },
  meta: {
    fontSize: 10,
    color: '#64748b',
  },
  refreshBtn: {
    padding: '4px 10px',
    background: 'rgba(59,130,246,0.2)',
    border: '1px solid rgba(59,130,246,0.4)',
    borderRadius: 4,
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#ef4444',
    fontSize: 12,
    padding: '6px 10px',
    background: 'rgba(239,68,68,0.08)',
    borderRadius: 4,
  },
  empty: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center' as const,
    padding: '32px 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 10,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  agentName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 10,
    flexShrink: 0,
  },
  description: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: '1.5',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  skillRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  skillTag: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'rgba(96,165,250,0.12)',
    color: '#60a5fa',
    cursor: 'default',
  },
  tag: {
    fontSize: 9,
    padding: '1px 6px',
    borderRadius: 3,
    background: 'rgba(139,92,246,0.1)',
    color: '#a78bfa',
  },
  statsRow: {
    display: 'flex',
    gap: 16,
    marginTop: 4,
    paddingTop: 8,
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#64d2ff',
  },
  statLabel: {
    fontSize: 10,
    color: '#94a3b8',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  agentId: {
    fontSize: 10,
    color: '#4b5563',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '70%',
  },
  unregisterBtn: {
    padding: '2px 8px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 3,
    color: '#ef4444',
    fontSize: 10,
    cursor: 'pointer',
    flexShrink: 0,
  },
}
