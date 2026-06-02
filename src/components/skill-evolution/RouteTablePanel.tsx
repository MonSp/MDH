import React, { useState, useEffect } from 'react'
import { getRouteTable } from '../../modules/dynamicRouter'
import type { RouteEntry } from '../../modules/agentTypes'

export function RouteTablePanel() {
  const [routes, setRoutes] = useState<RouteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadRoutes = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRouteTable()
      setRoutes(data)
    } catch (e: any) {
      setError(e.message || '加载路由表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoutes()
  }, [])

  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`

  const getRateColor = (rate: number) => {
    if (rate >= 0.8) return '#10b981'
    if (rate >= 0.5) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🧭 动态路由表</h3>
        <button
          onClick={loadRoutes}
          disabled={loading}
          style={{
            padding: '4px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          刷新
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 8, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>加载中...</div>
      ) : routes.length === 0 ? (
        <div style={{ color: '#9ca3af', padding: 20, textAlign: 'center' }}>路由表为空</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {routes.map((route) => {
            const isExpanded = expandedId === route.dept_id
            return (
              <div
                key={route.dept_id}
                style={{
                  padding: 10,
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(isExpanded ? null : route.dept_id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{route.dept_name}</span>
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      fontSize: 11,
                      background: '#f3f4f6',
                      color: '#374151',
                    }}>
                      {route.dept_id}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: getRateColor(route.success_rate),
                    }}>
                      {formatRate(route.success_rate)}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      ({route.successful_tasks}/{route.total_tasks})
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  {route.capability_desc || '-'}
                </div>

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {route.capability_keywords.slice(0, 6).map((kw) => (
                    <span
                      key={kw}
                      style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 11,
                        background: '#dbeafe',
                        color: '#1d4ed8',
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                  {route.capability_keywords.length > 6 && (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      +{route.capability_keywords.length - 6}
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                    {route.tools.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>工具列表</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {route.tools.map((tool) => (
                            <span
                              key={tool}
                              style={{
                                padding: '1px 6px',
                                borderRadius: 3,
                                fontSize: 11,
                                background: '#fef3c7',
                                color: '#92400e',
                              }}
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      优先级: {route.priority} | 最近活跃: {route.last_active || '无'}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
