import React, { useState, useRef, useEffect, useCallback } from 'react'

interface CeoMessage {
  role: 'user' | 'ceo' | 'system'
  content: string
  timestamp: number
}

interface CeoChatPanelProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onEnterProject: (projectId: string, meetingId: string) => void
  onClose: () => void
}

export default function CeoChatPanel({ wsRef, onEnterProject, onClose }: CeoChatPanelProps) {
  const [messages, setMessages] = useState<CeoMessage[]>([{
    role: 'ceo',
    content: '你好，我是公司CEO。请告诉我你需要完成什么任务，我会分析需求并组建合适的团队。',
    timestamp: Date.now(),
  }])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [projectReady, setProjectReady] = useState<{ projectId: string; meetingId: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listenerCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      listenerCleanupRef.current?.()
    }
  }, [])

  const addMsg = useCallback((role: CeoMessage['role'], content: string) => {
    setMessages(prev => [...prev, { role, content, timestamp: Date.now() }])
  }, [])

  const sendToBackend = useCallback((content: string) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    setIsProcessing(true)
    addMsg('user', content)

    let currentProjectId = ''
    let currentMeetingId = ''
    let meetingStarted = false

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)
        const t = msg.type

        // 会议启动后，只处理关键状态消息，不显示会议内部细节
        if (meetingStarted) {
          if (t === 'task_result') {
            setIsProcessing(false)
            if (currentProjectId && currentMeetingId) {
              setProjectReady({ projectId: currentProjectId, meetingId: currentMeetingId })
              addMsg('ceo', 'task_done:enter_project')
            } else {
              addMsg('ceo', '任务已完成。')
            }
            cleanup()
          } else if (t === 'meeting_error') {
            setIsProcessing(false)
            addMsg('system', `❌ ${msg.message}`)
            cleanup()
          }
          return
        }

        // 会议启动前，正常显示CEO消息
        if (t === 'agent_message' && !msg.delta) {
          const agentId = msg.agentId || ''
          const text = msg.content || ''
          if (agentId === 'agent-ceo') {
            addMsg('ceo', text)
          }
        } else if (t === 'complexity_result') {
          const level = msg.level === 'simple' ? '简单任务' : '复杂任务'
          addMsg('system', `📊 任务分析：${level}（置信度 ${Math.round((msg.confidence || 0) * 100)}%）`)
        } else if (t === 'meeting_started') {
          meetingStarted = true
          currentMeetingId = msg.meeting_id || ''
          currentProjectId = msg.project_id || ''
          const agentCount = (msg.agents || []).length
          setProjectReady({ projectId: currentProjectId, meetingId: currentMeetingId })
          addMsg('ceo', `meeting_ready:${agentCount}`)
        } else if (t === 'meeting_error') {
          setIsProcessing(false)
          addMsg('system', `❌ ${msg.message}`)
          cleanup()
        }
      } catch {}
    }

    const cleanup = () => {
      ws.removeEventListener('message', handler)
      listenerCleanupRef.current = null
    }
    listenerCleanupRef.current = cleanup
    ws.addEventListener('message', handler)

    ws.send(JSON.stringify({
      type: 'unified_message',
      content,
      provider: localStorage.getItem('llm_provider') || undefined,
      model_name: localStorage.getItem('llm_model_name') || undefined,
      api_key: localStorage.getItem('deepseek_api_key') || undefined,
      base_url: localStorage.getItem('deepseek_base_url') || undefined,
    }))
  }, [wsRef, addMsg])

  const handleSend = useCallback(() => {
    if (!input.trim() || isProcessing) return
    const text = input.trim()
    setInput('')
    sendToBackend(text)
  }, [input, isProcessing, sendToBackend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleEnter = useCallback(() => {
    if (projectReady) {
      onEnterProject(projectReady.projectId, projectReady.meetingId)
    }
  }, [projectReady, onEnterProject])

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.avatar}>🧠</span>
          <div>
            <div style={styles.title}>CEO 智能助手</div>
            <div style={styles.subtitle}>分析需求 · 组建团队 · 分配任务</div>
          </div>
        </div>
        <button style={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      <div style={styles.messages}>
        {messages.map((msg, i) => {
          const isMeetingReady = msg.content.startsWith('meeting_ready:')
          const isTaskDone = msg.content === 'task_done:enter_project'
          const agentCount = isMeetingReady ? msg.content.split(':')[1] : ''
          return (
            <div key={i} style={{
              ...styles.msgRow,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              {msg.role !== 'user' && (
                <span style={styles.msgAvatar}>{msg.role === 'ceo' ? '🧠' : '📋'}</span>
              )}
              <div style={{
                ...styles.msgBubble,
                ...(msg.role === 'user' ? styles.userBubble : {}),
                ...(msg.role === 'system' ? styles.systemBubble : {}),
              }}>
                {isMeetingReady ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>项目已创建，{agentCount} 人团队已就绪，会议正在处理中。</div>
                    <button
                      style={styles.inlineEnterBtn}
                      onClick={handleEnter}
                    >
                      🚀 进入项目工作间查看会议 →
                    </button>
                  </div>
                ) : isTaskDone ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>任务处理完成。</div>
                    <button
                      style={styles.inlineEnterBtn}
                      onClick={handleEnter}
                    >
                      🚀 进入项目工作间查看详情 →
                    </button>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === 'user' && (
                <span style={styles.msgAvatar}>👤</span>
              )}
            </div>
          )
        })}
        {isProcessing && (
          <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
            <span style={styles.msgAvatar}>🧠</span>
            <div style={{ ...styles.msgBubble, ...styles.thinkingBubble }}>
              <span style={styles.thinkingDot}>●</span>
              <span style={{ ...styles.thinkingDot, animationDelay: '0.2s' }}>●</span>
              <span style={{ ...styles.thinkingDot, animationDelay: '0.4s' }}>●</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* 底部项目栏已移除，按钮在对话消息内 */}

      <div style={styles.inputArea}>
        <textarea
          style={styles.input}
          placeholder="描述你的任务..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isProcessing}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: isProcessing || !input.trim() ? 0.5 : 1,
          }}
          onClick={handleSend}
          disabled={isProcessing || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 380,
    height: 'calc(100% - 32px)',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(8, 8, 24, 0.95)',
    borderRadius: 16,
    border: '1px solid rgba(139, 92, 246, 0.3)',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(20px)',
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1))',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    fontSize: 28,
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  subtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#9ca3af',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  msgRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    background: 'rgba(255, 255, 255, 0.06)',
    flexShrink: 0,
  },
  msgBubble: {
    maxWidth: '80%',
    padding: '8px 12px',
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 1.5,
    color: '#e2e8f0',
    background: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4,
    wordBreak: 'break-word',
  },
  userBubble: {
    background: 'linear-gradient(135deg, #4d9fff, #3b82f6)',
    color: '#fff',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 4,
  },
  systemBubble: {
    background: 'rgba(139, 92, 246, 0.12)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    fontSize: 12,
    color: '#a78bfa',
  },
  thinkingBubble: {
    display: 'flex',
    gap: 4,
    padding: '10px 16px',
  },
  thinkingDot: {
    color: '#8b5cf6',
    fontSize: 10,
    animation: 'blink 1.4s infinite',
  },
  inlineEnterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(16, 185, 129, 0.5)',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)',
    transition: 'all 0.2s',
  },
  inputArea: {
    display: 'flex',
    gap: 8,
    padding: '10px 12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
  },
  sendBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-end',
  },
}
