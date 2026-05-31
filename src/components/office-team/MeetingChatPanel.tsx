import React, { useRef, useEffect } from 'react'
import { AgentRole } from '../../modules/agentTypes'
import RoleAvatar from '../RoleAvatar'
import type { TeamAgent, ChatMessage } from './types'
import { ROLE_EMOJI } from './constants'
import { formatTime } from './utils'

interface MeetingChatPanelProps {
  agents: TeamAgent[]
  messages: ChatMessage[]
  onEndMeeting: () => void
}

export default function MeetingChatPanel({ agents, messages, onEndMeeting }: MeetingChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const getAgentById = (id?: string) => agents.find(a => a.id === id)

  return (
    <div style={styles.chatPanel}>
      <div style={styles.chatHeader}>
        <h3 style={styles.chatTitle}>💬 会议讨论</h3>
        <div style={styles.chatActions}>
          <span style={styles.chatCount}>{messages.length} 条</span>
          <button style={styles.endMeetingBtn} onClick={onEndMeeting}>
            结束会议
          </button>
        </div>
      </div>

      <div style={styles.chatMessages}>
        {messages.map((msg, index) => {
          const agent = getAgentById(msg.agentId)
          const isBoss = msg.role === 'boss'

          return (
            <div
              key={index}
              style={{
                ...styles.chatMessage,
                justifyContent: isBoss ? 'flex-end' : 'flex-start',
              }}
            >
              {!isBoss && msg.agentId && (
                <div style={styles.msgAvatar}>
                  <RoleAvatar
                    role={agent?.role || AgentRole.Planner}
                    size={28}
                  />
                </div>
              )}

              <div style={{
                ...styles.msgBubble,
                background: isBoss
                  ? 'linear-gradient(135deg, #4d9fff 0%, #3b82f6 100%)'
                  : 'rgba(255, 255, 255, 0.08)',
                borderBottomRightRadius: isBoss ? '4px' : '14px',
                borderBottomLeftRadius: !isBoss ? '4px' : '14px',
              }}>
                <div style={styles.msgHeader}>
                  <span style={styles.msgSender}>
                    {isBoss
                      ? '👔 老板'
                      : `${ROLE_EMOJI[agent?.role || AgentRole.Planner]} ${agent?.name?.split('-')[0] || 'Agent'}`
                    }
                  </span>
                  <span style={styles.msgTime}>{formatTime(msg.timestamp)}</span>
                </div>
                <div style={styles.msgContent}>{msg.content}</div>
              </div>

              {isBoss && (
                <div style={styles.msgAvatarEmoji}>👔</div>
              )}
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  chatPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
  },
  chatTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  chatActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  chatCount: {
    fontSize: '11px',
    color: '#6b7280',
  },
  endMeetingBtn: {
    padding: '5px 12px',
    background: 'linear-gradient(135deg, #ef4444, #f87171)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  chatMessages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  chatMessage: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  },
  msgAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  msgAvatarEmoji: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    flexShrink: 0,
    background: 'rgba(255, 255, 255, 0.1)',
  },
  msgBubble: {
    maxWidth: '75%',
    padding: '8px 12px',
    borderRadius: '14px',
  },
  msgHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '3px',
  },
  msgSender: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  msgTime: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  msgContent: {
    fontSize: '13px',
    color: '#e2e8f0',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
}
