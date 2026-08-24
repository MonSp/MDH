/**
 * EvolutionToast — 进化状态实时通知
 *
 * 显示规则进化/降级/晋升事件的 toast 通知。
 * 轮询 /api/experience/rules/demotion-log 和 /api/agents/{id}/profile。
 */

import React, { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiDelete } from '../../services/apiFetch'

interface EvolutionEvent {
  type: 'demotion' | 'evolution' | 'promotion' | 'levelup'
  message: string
  timestamp: string
}

export default function EvolutionToast({ agentId }: { agentId?: string }) {
  const [events, setEvents] = useState<EvolutionEvent[]>([])
  const [dismissed, setDismissed] = useState(0)
  const [lastCheck, setLastCheck] = useState<string>('')

  const checkForEvents = useCallback(async () => {
    try {
      // 检查降级日志
      const demotionData = await apiGet<{ entries?: Array<{ demoted_at: string; trigger_condition?: string; rule_id?: string; effectiveness_score: number }> }>("/api/experience/rules/demotion-log")
      if (demotionData.entries && demotionData.entries.length > 0) {
        const latest = demotionData.entries[0]
        if (latest.demoted_at !== lastCheck) {
          setLastCheck(latest.demoted_at)
          setEvents(prev => [...prev, {
            type: 'demotion',
            message: `规则降级: ${latest.trigger_condition?.slice(0, 40) || latest.rule_id?.slice(0, 8)} (${(latest.effectiveness_score * 100).toFixed(0)}%)`,
            timestamp: latest.demoted_at,
          }].slice(-5))
        }
      }

      // 检查晋升
      if (agentId) {
        const profileData = await apiGet<{ career_stage?: string }>(`/api/agents/${agentId}/profile`)
        if (profileData?.career_stage) {
          // 晋升检查
          const promoData = await apiGet<{ can_promote_to?: string }>(`/api/agents/${agentId}/promotion`)
          if (promoData?.can_promote_to) {
            setEvents(prev => {
              const exists = prev.some(e => e.type === 'promotion' && e.message.includes(promoData.can_promote_to!))
              if (exists) return prev
              return [...prev, {
                type: 'promotion',
                message: `可晋升为: ${promoData.can_promote_to}`,
                timestamp: new Date().toISOString(),
              }].slice(-5)
            })
          }
        }
      }
    } catch { /* silent */ }
  }, [agentId, lastCheck])

  useEffect(() => {
    checkForEvents()
    const interval = setInterval(checkForEvents, 30000) // 每 30 秒检查
    return () => clearInterval(interval)
  }, [checkForEvents])

  const visibleEvents = events.slice(dismissed)
  if (visibleEvents.length === 0) return null

  const typeColors: Record<string, { bg: string; color: string; icon: string }> = {
    demotion: { bg: 'rgba(239,68,68,0.15)', color: '#fca5a5', icon: '⚠️' },
    evolution: { bg: 'rgba(139,92,246,0.15)', color: '#c4b5fd', icon: '🧬' },
    promotion: { bg: 'rgba(16,185,129,0.15)', color: '#6ee7b7', icon: '🎖️' },
    levelup: { bg: 'rgba(59,130,246,0.15)', color: '#93c5fd', icon: '⬆️' },
  }

  return (
    <div style={styles.container}>
      {visibleEvents.map((event, i) => {
        const cfg = typeColors[event.type] || typeColors.demotion
        return (
          <div key={i} style={{ ...styles.toast, background: cfg.bg, borderColor: cfg.color + '40' }}>
            <span style={{ ...styles.icon, color: cfg.color }}>{cfg.icon}</span>
            <span style={{ ...styles.message, color: cfg.color }}>{event.message}</span>
            <button style={styles.dismiss} onClick={() => setDismissed(prev => prev + 1)}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 60,
    right: 16,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxWidth: 320,
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid',
    backdropFilter: 'blur(8px)',
    animation: 'fadeIn 0.3s ease',
  },
  icon: { fontSize: 14, flexShrink: 0 },
  message: { fontSize: 12, flex: 1, lineHeight: 1.4 },
  dismiss: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 2px',
    flexShrink: 0,
  },
}
