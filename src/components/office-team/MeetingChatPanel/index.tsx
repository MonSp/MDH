/**
 * MeetingChatPanel — 会议聊天面板
 *
 * 拆分自 MeetingChatPanel.tsx，使用 helpers.ts 和 renderers.tsx 分离辅助逻辑和特殊渲染。
 */

import React, { useRef, useEffect, useState } from 'react'
import { AgentRole } from '../../../modules/agentTypes'
import RoleAvatar from '../../RoleAvatar'
import type { TeamAgent, ChatMessage } from '../types'
import { ROLE_EMOJI } from '../constants'
import { formatTime } from '../utils'
import { apiPost, apiGet } from '../../../services/apiFetch'
import { extractCodeBlock, parseFileWriteMessage, getFileIcon } from './helpers'
import {
  renderStructuredFeedback,
  renderRoutingDecision,
  renderExperience,
  renderIteration,
  renderAssignmentNotification,
  renderThinkingBlock,
} from './renderers'

interface MeetingChatPanelProps {
  agents: TeamAgent[]
  messages: ChatMessage[]
  onEndMeeting: () => void
  agendaPhase?: string
}

export default function MeetingChatPanel({ agents, messages, onEndMeeting, agendaPhase }: MeetingChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const scrollRaf = useRef<number>(0)
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.matchMedia('(max-width: 768px)').matches } catch { return false }
  })

  useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 768px)')
      const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } catch { /* test env */ }
  }, [])
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set())
  const [agentProfiles, setAgentProfiles] = useState<Record<string, { skills: Record<string, { level: number }>; department: string }>>({})
  const [feedbackInput, setFeedbackInput] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [capabilityWarnings, setCapabilityWarnings] = useState<Record<number, { domains: string[]; confidence: number }>>({})

  useEffect(() => {
    // 使用 requestAnimationFrame 防抖，避免快速消息流触发频繁布局抖动
    cancelAnimationFrame(scrollRaf.current)
    scrollRaf.current = requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(scrollRaf.current)
  }, [messages])

  const getAgentById = (id?: string) => agents.find(a => a.id === id)

  const toggleFileExpand = (fileKey: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(fileKey)) next.delete(fileKey)
      else next.add(fileKey)
      return next
    })
  }

  const handleInlineFeedback = async (msg: ChatMessage, rating: 'good' | 'poor', suggestion?: string) => {
    const feedbackKey = `${msg.agentId}-${msg.timestamp}`
    if (feedbackGiven.has(feedbackKey)) return
    try {
      await apiPost('/api/feedback/submit', {
          agent_id: msg.agentId || '',
          task_id: '',
          task_description: msg.content?.slice(0, 100) || '',
          rating: rating === 'good' ? 'good' : 'needs_improvement',
          specific_suggestions: suggestion ? [suggestion] : [],
          reviewer: 'human-inline',
        })
      setFeedbackGiven(prev => new Set(prev).add(feedbackKey))
      setFeedbackInput(null)
      setFeedbackText('')
      setToast(rating === 'good' ? '✓ 反馈已记录：良好' : '✓ 反馈已记录：需改进')
      setTimeout(() => setToast(null), 3000)
    } catch { /* silent */ }
  }

  // 判断消息是否值得反馈（agent 的建议/审查/方案，而非系统消息）
  const isActionableMessage = (msg: ChatMessage) => {
    if (!msg.agentId || msg.agentId === 'agent-ceo') return false
    const content = msg.content || ''
    // 排除系统通知
    if (content.includes('项目经理：') && !content.includes('审查')) return false
    if (content.includes('CEO：') || content.includes('已将任务分配')) return false
    if (content.includes('已注入') || content.includes('经验规则')) return false
    // 包含实质性内容的消息
    return content.length > 30
  }

  // 加载 agent 档案（缓存，不重复请求）
  useEffect(() => {
    const loadProfiles = async () => {
      const profiles: Record<string, { skills: Record<string, { level: number }>; department: string }> = {}
      for (const agent of agents) {
        if (agentProfiles[agent.id]) continue // 已缓存
        try {
          const profileData = await apiGet<{ skill_progress?: Record<string, { level: number }>; department?: string }>(`/api/agents/${agent.id}/profile`)
          if (profileData) {
            profiles[agent.id] = {
              skills: profileData.skill_progress || {},
              department: profileData.department || '',
            }
          }
        } catch { /* silent */ }
      }
      if (Object.keys(profiles).length > 0) {
        setAgentProfiles(prev => ({ ...prev, ...profiles }))
      }
    }
    if (agents.length > 0) loadProfiles()
  }, [agents])

  // 检测任务消息的能力边界
  useEffect(() => {
    const checkBoundaries = async () => {
      for (const msg of messages) {
        const idx = messages.indexOf(msg)
        if (capabilityWarnings[idx]) continue
        if (!msg.agentId || msg.agentId === 'agent-ceo') continue
        const content = msg.content || ''
        if (content.length < 20) continue
        // 只检查任务描述类消息
        if (!content.includes('任务') && !content.includes('实现') && !content.includes('设计') && !content.includes('开发')) continue
        try {
          const words = content.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || []
          const keywords = [...new Set(words.map(w => w.toLowerCase()))].slice(0, 5).join(',')
          if (!keywords) continue
          const capData = await apiGet<{ is_unknown?: boolean; matched_domains?: string[]; best_confidence?: number }>(`/api/capability/detect?keywords=${encodeURIComponent(keywords)}`)
          if (capData?.is_unknown) {
            setCapabilityWarnings(prev => ({
              ...prev,
              [idx]: { domains: capData.matched_domains || [], confidence: capData.best_confidence || 0 },
            }))
          }
        } catch { /* silent */ }
      }
    }
    if (messages.length > 0) checkBoundaries()
  }, [messages])

  const renderFileBlocks = (files: string[], charCount?: string, msgContent?: string) => {
    return (
      <div style={styles.fileWriteBlock}>
        <div style={styles.fileWriteHeader}>
          <span style={styles.fileWriteIcon}>📁</span>
          <span style={styles.fileWriteTitle}>写入文件</span>
          <span style={styles.fileWriteCount}>{files.length} 个文件{charCount ? ` · ${charCount} 字符` : ''}</span>
        </div>
        <div style={styles.fileGrid}>
          {files.map((f, i) => {
            const fileName = f.split('/').pop() || f
            const dir = f.split('/').slice(0, -1).join('/')
            const fileKey = `${f}-${i}`
            const isExpanded = expandedFiles.has(fileKey)
            const codeContent = msgContent ? extractCodeBlock(msgContent, f) : null
            return (
              <div key={i} style={{ ...styles.fileCard, ...(isExpanded ? styles.fileCardExpanded : {}) }}>
                <div style={styles.fileCardClickable} onClick={() => toggleFileExpand(fileKey)}>
                  <span style={styles.fileCardIcon}>{getFileIcon(f)}</span>
                  <div style={styles.fileCardInfo}>
                    <div style={styles.fileCardName}>{fileName}</div>
                    {dir && <div style={styles.fileCardDir}>{dir}</div>}
                  </div>
                  <span style={{ ...styles.fileCardExpandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                </div>
                <div style={{
                  ...styles.filePreviewContainer,
                  maxHeight: isExpanded ? '250px' : '0px',
                  opacity: isExpanded ? 1 : 0,
                }}>
                  {codeContent ? (
                    <pre style={styles.filePreview}>
                      {codeContent.length > 1500 ? codeContent.slice(0, 1500) + '\n... (截断)' : codeContent}
                    </pre>
                  ) : (
                    <div style={styles.filePreviewEmpty}>暂无内容预览</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const chatMessagesStyle: React.CSSProperties = isMobile
    ? { ...styles.chatMessages, padding: '10px 8px', gap: '8px' }
    : styles.chatMessages

  const chatHeaderStyle: React.CSSProperties = isMobile
    ? { ...styles.chatHeader, padding: '8px 10px', flexWrap: 'wrap', gap: '6px' }
    : styles.chatHeader

  const renderMessage = (msg: ChatMessage, index: number) => {
    const agent = getAgentById(msg.agentId)
    const isBoss = msg.role === 'boss'
    const isCeo = msg.agentId === 'agent-ceo' || msg.role === 'ceo'

    // 任务指派通知
    if (msg.content.includes('CEO分析') || msg.content.includes('已将任务分配给')) {
      return renderAssignmentNotification({ msg, index, styles })
    }

    const subtype = msg._msgSubtype
    const isFeedback = subtype === 'feedback' || !!msg._structuredFeedback
    const isRouting = subtype === 'routing' || !!msg._routingDecision
    const isExperience = subtype === 'experience'
    const isIteration = subtype === 'iteration' || !!msg._iterationStatus

    // 思维链消息
    if ((msg as any)._thinking) {
      return renderThinkingBlock({ msg, index, styles })
    }

    // 结构化反馈
    if (isFeedback && msg._structuredFeedback) {
      return renderStructuredFeedback({ msg, index, styles })
    }

    // 路由决策
    if (isRouting && msg._routingDecision) {
      return renderRoutingDecision({ msg, index, styles })
    }

    // 经验注入
    if (isExperience) {
      return renderExperience({ msg, index, styles })
    }

    // 迭代状态
    if (isIteration && msg._iterationStatus) {
      return renderIteration({ msg, index, styles })
    }

    // 默认消息渲染
    return (
      <div
        key={index}
        style={{
          ...styles.chatMessage,
          justifyContent: isBoss || isCeo ? 'flex-end' : 'flex-start',
        }}
      >
        {!isBoss && !isCeo && msg.agentId && (
          <div style={{ ...styles.msgAvatar, ...(isMobile ? { width: 22, height: 22 } : {}) }}>
            <RoleAvatar role={agent?.role || AgentRole.Planner} size={isMobile ? 22 : 28} />
            {agentProfiles[msg.agentId] && (() => {
              const skills = agentProfiles[msg.agentId].skills
              const entries = Object.entries(skills) as [string, { level: number }][]
              const best = entries.reduce((a, b) => (b[1]?.level || 0) > (a[1]?.level || 0) ? b : a, entries[0])
              return best && best[1]?.level > 0 ? (
                <span style={styles.skillBadge} title={`${best[0]} Lv.${best[1].level}`}>
                  Lv.{best[1].level}
                </span>
              ) : null
            })()}
          </div>
        )}
        <div style={{
          ...styles.msgBubble,
          maxWidth: isMobile ? '92%' : '75%',
          ...(isMobile ? { padding: '6px 10px' } : {}),
          background: isBoss
            ? 'linear-gradient(135deg, #4d9fff 0%, #3b82f6 100%)'
            : isCeo
            ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
            : 'rgba(255, 255, 255, 0.08)',
          borderBottomRightRadius: isBoss || isCeo ? '4px' : '14px',
          borderBottomLeftRadius: !isBoss && !isCeo ? '4px' : '14px',
        }}>
          <div style={styles.msgHeader}>
            <span style={styles.msgSender}>
              {isBoss ? '👔 老板' : isCeo ? '🧠 CEO分析' : `${ROLE_EMOJI[agent?.role || AgentRole.Planner]} ${agent?.name?.split('-')[0] || 'Agent'}`}
            </span>
            <span style={styles.msgTime}>{formatTime(msg.timestamp)}</span>
          </div>
          {(() => {
            const fileWrite = parseFileWriteMessage(msg.content)
            if (fileWrite) {
              return renderFileBlocks(fileWrite.files, fileWrite.charCount, msg.content)
            }
            return <div style={styles.msgContent}>{msg.content}{(msg as any)._streaming && <span style={styles.streamingCursor}>▍</span>}</div>
          })()}
          {(msg as any)._stance && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', fontSize: '10px' }}>
              <span style={{
                padding: '1px 5px',
                borderRadius: '6px',
                background: (msg as any)._stance === 'support' ? 'rgba(16, 185, 129, 0.2)' :
                            (msg as any)._stance === 'oppose' ? 'rgba(239, 68, 68, 0.2)' :
                            (msg as any)._stance === 'modify' ? 'rgba(245, 158, 11, 0.2)' :
                            'rgba(107, 114, 128, 0.2)',
                color: (msg as any)._stance === 'support' ? '#10b981' :
                       (msg as any)._stance === 'oppose' ? '#ef4444' :
                       (msg as any)._stance === 'modify' ? '#f59e0b' : '#6b7280',
              }}>
                {(msg as any)._stance === 'support' ? '👍 支持' :
                 (msg as any)._stance === 'oppose' ? '👎 反对' :
                 (msg as any)._stance === 'modify' ? '✏️ 修改' : '➖ 中立'}
              </span>
              {(msg as any)._confidence != null && (
                <span style={{ color: '#9ca3af' }}>置信度 {Math.round((msg as any)._confidence * 100)}%</span>
              )}
            </div>
          )}
          {capabilityWarnings[index] && (
            <div style={styles.capWarning}>
              <span style={styles.capWarningIcon}>⚠️</span>
              <span style={styles.capWarningText}>
                能力边界：此任务涉及低置信领域（{capabilityWarnings[index].domains.join(', ')}，置信度 {(capabilityWarnings[index].confidence * 100).toFixed(0)}%）
              </span>
            </div>
          )}
        </div>
        {!isBoss && !isCeo && msg.agentId && isActionableMessage(msg) && !feedbackGiven.has(`${msg.agentId}-${msg.timestamp}`) && feedbackInput !== index.toString() && (
          <div style={styles.inlineFeedback}>
            <button style={styles.feedbackBtn} onClick={() => handleInlineFeedback(msg, 'good')} title="这条建议有用">👍</button>
            <button style={styles.feedbackBtn} onClick={() => { setFeedbackInput(index.toString()); setFeedbackText('') }} title="这条建议需改进">👎</button>
          </div>
        )}
        {feedbackInput === index.toString() && (
          <div style={styles.feedbackForm}>
            <input
              style={styles.feedbackInput}
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="具体哪里需要改进？"
              onKeyDown={e => { if (e.key === 'Enter') handleInlineFeedback(msg, 'poor', feedbackText) }}
              autoFocus
            />
            <button style={styles.feedbackSubmit} onClick={() => handleInlineFeedback(msg, 'poor', feedbackText)}>提交</button>
            <button style={styles.feedbackCancel} onClick={() => setFeedbackInput(null)}>取消</button>
          </div>
        )}
        {!isBoss && !isCeo && msg.agentId && isActionableMessage(msg) && feedbackGiven.has(`${msg.agentId}-${msg.timestamp}`) && (
          <span style={styles.feedbackGiven}>✓ 已反馈</span>
        )}
        {(isBoss || isCeo) && (
          <div style={styles.msgAvatarEmoji}>{isBoss ? '👔' : '🧠'}</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...styles.chatPanel, ...(isMobile ? { minHeight: 0 } : {}) }}>
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={chatHeaderStyle}>
        <h3 style={{ ...styles.chatTitle, ...(isMobile ? { fontSize: '13px' } : {}) }}>💬 会议讨论</h3>
        {agendaPhase && (
          <span style={{
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            background: agendaPhase === 'emergency' ? 'rgba(239, 68, 68, 0.3)' :
                        agendaPhase === 'voting' ? 'rgba(245, 158, 11, 0.3)' :
                        agendaPhase === 'discussion' ? 'rgba(59, 130, 246, 0.3)' :
                        'rgba(255, 255, 255, 0.1)',
            color: agendaPhase === 'emergency' ? '#ef4444' :
                   agendaPhase === 'voting' ? '#f59e0b' :
                   agendaPhase === 'discussion' ? '#3b82f6' : '#9ca3af',
            border: `1px solid ${agendaPhase === 'emergency' ? 'rgba(239, 68, 68, 0.5)' :
                                  agendaPhase === 'voting' ? 'rgba(245, 158, 11, 0.5)' :
                                  agendaPhase === 'discussion' ? 'rgba(59, 130, 246, 0.5)' :
                                  'rgba(255, 255, 255, 0.1)'}`,
          }}>
            {agendaPhase === 'idle' && '⏸️ 待议'}
            {agendaPhase === 'open_topic' && '📝 开题'}
            {agendaPhase === 'discussion' && '💬 讨论中'}
            {agendaPhase === 'proposal' && '📋 提案'}
            {agendaPhase === 'voting' && '🗳️ 投票中'}
            {agendaPhase === 'accepted' && '✅ 已通过'}
            {agendaPhase === 'rejected' && '❌ 已否决'}
            {agendaPhase === 'emergency' && '🚨 紧急'}
            {agendaPhase === 'closed' && '🔒 已关闭'}
          </span>
        )}
        <div style={styles.chatActions}>
          <span style={styles.chatCount}>{messages.length} 条</span>
          <button style={styles.endMeetingBtn} onClick={onEndMeeting}>结束会议</button>
        </div>
      </div>
      <div style={chatMessagesStyle}>
        {messages.map((msg, index) => renderMessage(msg, index))}
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
  streamingCursor: {
    color: '#8b5cf6',
    animation: 'blink 1s infinite',
    marginLeft: '2px',
  },
  assignmentNotification: {
    maxWidth: '85%',
    padding: '12px 16px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    textAlign: 'center',
  },
  assignmentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginBottom: '8px',
  },
  assignmentIcon: {
    fontSize: '16px',
  },
  assignmentTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#a78bfa',
  },
  assignmentBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: '#e2e8f0',
  },
  assignmentAnalysis: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '4px',
    textAlign: 'left',
  },
  assignmentAnalysisLabel: {
    flexShrink: 0,
    color: '#a78bfa',
    fontWeight: 600,
  },
  assignmentAnalysisText: {
    color: '#d1d5db',
    lineHeight: 1.4,
  },
  assignmentTarget: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'rgba(139, 92, 246, 0.15)',
  },
  assignmentTargetIcon: {
    fontSize: '12px',
  },
  assignmentTargetName: {
    color: '#a78bfa',
    fontWeight: 600,
  },
  assignmentContent: {
    color: '#d1d5db',
    lineHeight: 1.4,
  },
  assignmentTime: {
    marginTop: '6px',
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  fileWriteBlock: {
    marginTop: '4px',
    borderRadius: '8px',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    background: 'rgba(59, 130, 246, 0.08)',
    overflow: 'hidden',
  },
  fileWriteHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    background: 'rgba(59, 130, 246, 0.12)',
    borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
  },
  fileWriteIcon: {
    fontSize: '12px',
  },
  fileWriteTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#60a5fa',
  },
  fileWriteCount: {
    fontSize: '10px',
    color: '#6b7280',
    marginLeft: 'auto',
  },
  fileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '4px',
    padding: '6px',
  },
  fileCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    borderRadius: '4px',
    background: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    transition: 'all 0.15s',
  },
  fileCardExpanded: {
    gridColumn: '1 / -1',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  fileCardClickable: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    cursor: 'pointer',
  },
  fileCardIcon: {
    fontSize: '12px',
    flexShrink: 0,
  },
  fileCardInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  fileCardName: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileCardDir: {
    fontSize: '8px',
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileCardExpandIcon: {
    fontSize: '8px',
    color: '#6b7280',
    marginLeft: 'auto',
    flexShrink: 0,
    transition: 'transform 0.25s ease',
  },
  filePreviewContainer: {
    overflow: 'hidden',
    transition: 'max-height 0.3s ease, opacity 0.25s ease',
  },
  filePreview: {
    margin: 0,
    padding: '8px 10px',
    fontSize: '10px',
    lineHeight: 1.5,
    color: '#d1d5db',
    background: 'rgba(0, 0, 0, 0.3)',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    maxHeight: '200px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  },
  filePreviewEmpty: {
    padding: '8px 10px',
    fontSize: '10px',
    color: '#6b7280',
    textAlign: 'center' as const,
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  skillBadge: {
    position: 'absolute' as const,
    bottom: '-2px',
    right: '-2px',
    fontSize: '8px',
    fontWeight: 700,
    color: '#fff',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    padding: '0 4px',
    borderRadius: '6px',
    lineHeight: '14px',
    border: '1px solid rgba(0,0,0,0.3)',
  },
  inlineFeedback: {
    display: 'flex',
    gap: '2px',
    marginLeft: '4px',
    alignSelf: 'flex-end',
    opacity: 0.6,
  },
  feedbackBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '2px 4px',
    lineHeight: 1,
    transition: 'opacity 0.15s',
  },
  feedbackGiven: {
    fontSize: '9px',
    color: '#10b981',
    marginLeft: '4px',
    alignSelf: 'flex-end',
  },
  feedbackForm: {
    display: 'flex',
    gap: '4px',
    marginLeft: '4px',
    alignItems: 'center',
    marginTop: '4px',
  },
  feedbackInput: {
    flex: 1,
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(0,0,0,0.3)',
    color: '#e2e8f0',
    fontSize: '11px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  feedbackSubmit: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    background: '#8b5cf6',
    color: '#fff',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  feedbackCancel: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'none',
    color: '#9ca3af',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toast: {
    position: 'absolute' as const,
    top: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    borderRadius: 6,
    background: 'rgba(16,185,129,0.9)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    zIndex: 100,
    animation: 'fadeIn 0.3s ease',
  },
  capWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    padding: '4px 8px',
    borderRadius: 6,
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.25)',
    fontSize: '10px',
  },
  capWarningIcon: { fontSize: 12, flexShrink: 0 },
  capWarningText: { color: '#fbbf24', lineHeight: 1.4 },
}
