/**
 * CapabilityBoundaryWarning — 能力边界提示
 *
 * 当任务落在低置信领域时，在会议中显示 ⚠️ 警告。
 */

import React, { useState, useEffect } from 'react'
import { apiGet } from '../../services/apiFetch'

interface BoundaryResult {
  is_unknown: boolean
  matched_domains: string[]
  best_confidence: number
  recommendation: string
}

export default function CapabilityBoundaryWarning({ taskDescription }: { taskDescription: string }) {
  const [result, setResult] = useState<BoundaryResult | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!taskDescription || taskDescription.length < 10) return

    const check = async () => {
      try {
        // 从任务描述中提取关键词
        const words = taskDescription.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || []
        const keywords = [...new Set(words.map(w => w.toLowerCase()))].slice(0, 5).join(',')
        if (!keywords) return

        const data = await apiGet<BoundaryResult>(`/api/capability/detect?keywords=${encodeURIComponent(keywords)}`)
        if (data?.is_unknown) {
          setResult(data)
          setDismissed(false)
        }
      } catch { /* silent */ }
    }

    check()
  }, [taskDescription])

  if (!result || dismissed) return null

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>⚠️</span>
        <span style={styles.title}>能力边界提示</span>
        <button style={styles.dismiss} onClick={() => setDismissed(true)}>✕</button>
      </div>
      <div style={styles.body}>
        <div style={styles.confidence}>
          置信度: <span style={{ color: result.best_confidence < 0.2 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
            {(result.best_confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div style={styles.domains}>
          关联领域: {result.matched_domains.length > 0 ? result.matched_domains.join(', ') : '无匹配'}
        </div>
        <div style={styles.recommendation}>{result.recommendation}</div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: '8px 16px',
    borderRadius: 8,
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid rgba(245, 158, 11, 0.15)',
  },
  icon: { fontSize: 14 },
  title: { fontSize: 12, fontWeight: 600, color: '#fbbf24', flex: 1 },
  dismiss: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 },
  body: { padding: '8px 12px', fontSize: 11, color: '#d1d5db', lineHeight: 1.5 },
  confidence: { marginBottom: 4 },
  domains: { marginBottom: 4, color: '#9ca3af' },
  recommendation: { color: '#fbbf24', fontWeight: 500 },
}
