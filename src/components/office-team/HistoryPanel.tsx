import React, { useState, useEffect, useCallback } from 'react'
import { apiGet } from '../../services/apiFetch'

interface HistorySession {
  session_id: string
  provider: string
  model_name: string
  message_count: number
  saved_at: string
}

interface HistoryMessage {
  type: string
  agentId?: string
  content?: string
  timestamp?: number
  [key: string]: any
}

export default function HistoryPanel() {
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<HistoryMessage[]>([])
  const [loading, setLoading] = useState(false)

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiGet<HistorySession[]>('/api/history/sessions')
      setSessions(data)
    } catch (e) {
      console.error('Failed to fetch history:', e)
    }
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const loadMessages = async (sessionId: string) => {
    setSelectedSession(sessionId)
    setLoading(true)
    try {
      const data = await apiGet<{ messages: HistoryMessage[] }>(`/api/history/sessions/${sessionId}/messages`)
      setMessages(data.messages || [])
    } catch (e) {
      console.error('Failed to fetch messages:', e)
      setMessages([])
    }
    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>会议历史</span>
        <button style={styles.refreshBtn} onClick={fetchSessions}>刷新</button>
      </div>

      <div style={styles.body}>
        {/* 会话列表 */}
        <div style={styles.sessionList}>
          {sessions.length === 0 ? (
            <div style={styles.empty}>暂无历史记录</div>
          ) : (
            sessions.map(s => (
              <div
                key={s.session_id}
                style={{
                  ...styles.sessionItem,
                  ...(selectedSession === s.session_id ? styles.sessionSelected : {}),
                }}
                onClick={() => loadMessages(s.session_id)}
              >
                <div style={styles.sessionId}>{s.session_id}</div>
                <div style={styles.sessionMeta}>
                  <span>{s.message_count} 条消息</span>
                  <span>{s.provider || 'deepseek'}</span>
                </div>
                {s.saved_at && (
                  <div style={styles.sessionTime}>{new Date(s.saved_at).toLocaleString()}</div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 消息列表 */}
        <div style={styles.messageList}>
          {!selectedSession ? (
            <div style={styles.empty}>选择一个会话查看消息</div>
          ) : loading ? (
            <div style={styles.empty}>加载中...</div>
          ) : messages.length === 0 ? (
            <div style={styles.empty}>无消息记录</div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} style={styles.messageItem}>
                <div style={styles.messageHeader}>
                  <span style={styles.messageAgent}>{msg.agentId || msg.type || 'unknown'}</span>
                  {msg.timestamp && (
                    <span style={styles.messageTime}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  )}
                </div>
                <div style={styles.messageContent}>
                  {msg.content || JSON.stringify(msg).slice(0, 200)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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
  body: { display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' },
  sessionList: {
    width: '140px', display: 'flex', flexDirection: 'column', gap: '4px',
    overflow: 'auto', flexShrink: 0,
  },
  sessionItem: {
    padding: '8px', borderRadius: '6px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
  },
  sessionSelected: {
    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)',
  },
  sessionId: { fontSize: '12px', fontWeight: 600, color: '#e2e8f0' },
  sessionMeta: { fontSize: '10px', color: '#94a3b8', display: 'flex', gap: '8px', marginTop: '2px' },
  sessionTime: { fontSize: '10px', color: '#6b7280', marginTop: '2px' },
  messageList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' },
  messageItem: {
    padding: '8px 10px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
  },
  messageHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  messageAgent: { fontSize: '11px', fontWeight: 600, color: '#a78bfa' },
  messageTime: { fontSize: '10px', color: '#6b7280' },
  messageContent: { fontSize: '12px', color: '#e2e8f0', lineHeight: 1.4, whiteSpace: 'pre-wrap' as const },
  empty: { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, padding: '20px' },
}
