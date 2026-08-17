import React, { useRef, useEffect, useState } from 'react'
import { AgentRole } from '../../modules/agentTypes'
import RoleAvatar from '../RoleAvatar'
import type { TeamAgent, ChatMessage } from './types'
import { ROLE_EMOJI } from './constants'
import { formatTime } from './utils'

interface MeetingChatPanelProps {
  agents: TeamAgent[]
  messages: ChatMessage[]
  onEndMeeting: () => void
  agendaPhase?: string
}

export default function MeetingChatPanel({ agents, messages, onEndMeeting, agendaPhase }: MeetingChatPanelProps) {
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const getAgentById = (id?: string) => agents.find(a => a.id === id)

  // 切换文件展开状态
  const toggleFileExpand = (fileKey: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(fileKey)) next.delete(fileKey)
      else next.add(fileKey)
      return next
    })
  }

  // 从消息内容中提取代码块
  const extractCodeBlock = (content: string, filePath: string): string | null => {
    // 尝试匹配 ```filename\ncontent\n``` 格式
    const regex = new RegExp('```[^\\n]*' + filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\n([\\s\\S]*?)```', 'i')
    const match = content.match(regex)
    if (match) return match[1].trim()
    
    // 尝试匹配 ```path\ncontent\n``` 格式
    const codeBlockRegex = /```([^\n`]+(?:\.[^\n`]+)?)\n([\s\S]*?)```/g
    let m
    while ((m = codeBlockRegex.exec(content)) !== null) {
      const blockPath = m[1].trim()
      if (blockPath === filePath || blockPath.endsWith(filePath.split('/').pop() || '')) {
        return m[2].trim()
      }
    }
    return null
  }

  // 解析写入文件消息，返回文件列表
  const parseFileWriteMessage = (content: string): { files: string[]; charCount?: string } | null => {
    const match = content.match(/\[写入文件\]\s*(.+?)\s*\((\d+)\s*字符\)/)
    if (match) {
      const files = match[1].split(',').map(f => f.trim()).filter(Boolean)
      return { files, charCount: match[2] }
    }
    const match2 = content.match(/已写入\s*\d+\s*个文件[：:]\s*(.+)/)
    if (match2) {
      const files = match2[1].split(',').map(f => f.trim()).filter(Boolean)
      return { files }
    }
    return null
  }

  // 获取文件图标
  const getFileIcon = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || ''
    if (['py'].includes(ext)) return '🐍'
    if (['js', 'ts', 'tsx', 'jsx'].includes(ext)) return '📜'
    if (['html', 'htm'].includes(ext)) return '🌐'
    if (['css', 'scss', 'less'].includes(ext)) return '🎨'
    if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) return '📋'
    if (['md', 'txt'].includes(ext)) return '📝'
    if (['java'].includes(ext)) return '☕'
    if (['go'].includes(ext)) return '🔷'
    if (['rs'].includes(ext)) return '🦀'
    if (['sql'].includes(ext)) return '🗄️'
    return '📄'
  }

  // 渲染文件块
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

  return (
    <div style={styles.chatPanel}>
      <div style={styles.chatHeader}>
        <h3 style={styles.chatTitle}>💬 会议讨论</h3>
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
                   agendaPhase === 'discussion' ? '#3b82f6' :
                   '#9ca3af',
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
          <button style={styles.endMeetingBtn} onClick={onEndMeeting}>
            结束会议
          </button>
        </div>
      </div>

      <div style={styles.chatMessages}>
        {messages.map((msg, index) => {
          const agent = getAgentById(msg.agentId)
          const isBoss = msg.role === 'boss'
          const isCeo = msg.agentId === 'agent-ceo' || msg.role === 'ceo'
          const isAssignmentNotification = msg.content.includes('CEO分析') || msg.content.includes('已将任务分配给')

          if (isAssignmentNotification) {
            const assignMatch = msg.content.match(/已将任务分配给(.+?)(?:[。！]|$)/)
            const ceoAnalysisMatch = msg.content.match(/CEO分析[：:]\s*(.+)/)
            const assignee = assignMatch ? assignMatch[1].trim() : ''
            const analysis = ceoAnalysisMatch ? ceoAnalysisMatch[1].trim() : ''

            return (
              <div
                key={index}
                style={{
                  ...styles.chatMessage,
                  justifyContent: 'center',
                }}
              >
                <div style={styles.assignmentNotification}>
                  <div style={styles.assignmentHeader}>
                    <span style={styles.assignmentIcon}>📋</span>
                    <span style={styles.assignmentTitle}>任务指派通知</span>
                  </div>
                  <div style={styles.assignmentBody}>
                    {analysis && (
                      <div style={styles.assignmentAnalysis}>
                        <span style={styles.assignmentAnalysisLabel}>🧠 CEO分析：</span>
                        <span style={styles.assignmentAnalysisText}>{analysis}</span>
                      </div>
                    )}
                    {assignee && (
                      <div style={styles.assignmentTarget}>
                        <span style={styles.assignmentTargetIcon}>👉</span>
                        <span>已将任务分配给 </span>
                        <span style={styles.assignmentTargetName}>{assignee}</span>
                      </div>
                    )}
                    {!assignee && !analysis && (
                      <div style={styles.assignmentContent}>{msg.content}</div>
                    )}
                  </div>
                  <div style={styles.assignmentTime}>{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            )
          }

          const subtype = msg._msgSubtype
          const isFeedback = subtype === 'feedback' || !!msg._structuredFeedback
          const isRouting = subtype === 'routing' || !!msg._routingDecision
          const isExperience = subtype === 'experience'
          const isIteration = subtype === 'iteration' || !!msg._iterationStatus

          // 结构化反馈消息的特殊渲染
          if (isFeedback && msg._structuredFeedback) {
            const fb = msg._structuredFeedback
            const isApproved = fb.status === 'approved'
            return (
              <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: isApproved
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.15) 100%)'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%)',
                  border: `1px solid ${isApproved ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{isApproved ? '✅' : '⚠️'}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isApproved ? '#065f46' : '#92400e' }}>
                      结构化验收 ({fb.current_iteration}/{fb.max_iterations})
                    </span>
                    <span style={{
                      padding: '1px 8px',
                      borderRadius: 10,
                      fontSize: 11,
                      background: isApproved ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: isApproved ? '#065f46' : '#92400e',
                    }}>
                      {isApproved ? '通过' : '需修改'}
                    </span>
                  </div>
                  {fb.overall_comment && (
                    <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>{fb.overall_comment}</div>
                  )}
                  {fb.issues?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {fb.issues.map((issue: any, i: number) => (
                        <div key={i} style={{
                          padding: '4px 8px',
                          background: 'rgba(0,0,0,0.05)',
                          borderRadius: 6,
                          fontSize: 11,
                        }}>
                          <span style={{
                            padding: '1px 4px',
                            borderRadius: 3,
                            marginRight: 4,
                            background: issue.type === 'logic_error' ? 'rgba(239, 68, 68, 0.2)' :
                                        issue.type === 'missing_feature' ? 'rgba(245, 158, 11, 0.2)' :
                                        'rgba(59, 130, 246, 0.2)',
                            color: issue.type === 'logic_error' ? '#dc2626' :
                                   issue.type === 'missing_feature' ? '#d97706' : '#2563eb',
                          }}>
                            {issue.type === 'logic_error' ? '逻辑' :
                             issue.type === 'missing_feature' ? '缺失' :
                             issue.type === 'performance' ? '性能' : '格式'}
                          </span>
                          <span style={{ color: '#374151' }}>{issue.detail}</span>
                          {issue.suggestion && (
                            <div style={{ color: '#6b7280', marginTop: 2 }}>💡 {issue.suggestion}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            )
          }

          // 路由决策消息的特殊渲染
          if (isRouting && msg._routingDecision) {
            const rd = msg._routingDecision
            return (
              <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>🧭</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af' }}>路由决策</span>
                    <span style={{
                      padding: '1px 8px',
                      borderRadius: 10,
                      fontSize: 11,
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#1e40af',
                    }}>
                      置信度 {(rd.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151' }}>{rd.reason}</div>
                  {rd.candidate_depts?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {rd.candidate_depts.slice(0, 3).map((dept: any) => (
                        <span key={dept.dept_id} style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          background: dept.dept_id === rd.selected_dept ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.05)',
                          color: dept.dept_id === rd.selected_dept ? '#1e40af' : '#6b7280',
                          fontWeight: dept.dept_id === rd.selected_dept ? 600 : 400,
                        }}>
                          {dept.dept_name} ({(dept.score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            )
          }

          // 经验注入消息
          if (isExperience) {
            return (
              <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
                <div style={{
                  maxWidth: '70%',
                  padding: '6px 14px',
                  borderRadius: 10,
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#6b21a8',
                }}>
                  🧪 {msg.content}
                </div>
              </div>
            )
          }

          // 迭代状态消息
          if (isIteration && msg._iterationStatus) {
            const it = msg._iterationStatus
            return (
              <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
                <div style={{
                  maxWidth: '70%',
                  padding: '6px 14px',
                  borderRadius: 10,
                  background: it.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                  border: `1px solid ${it.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                  textAlign: 'center',
                  fontSize: 12,
                  color: it.status === 'approved' ? '#065f46' : '#92400e',
                }}>
                  🔄 {msg.content}
                </div>
              </div>
            )
          }

          return (
            <div
              key={index}
              style={{
                ...styles.chatMessage,
                justifyContent: isBoss || isCeo ? 'flex-end' : 'flex-start',
              }}
            >
              {!isBoss && !isCeo && msg.agentId && (
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
                  : isCeo
                  ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                  : 'rgba(255, 255, 255, 0.08)',
                borderBottomRightRadius: isBoss || isCeo ? '4px' : '14px',
                borderBottomLeftRadius: !isBoss && !isCeo ? '4px' : '14px',
              }}>
                <div style={styles.msgHeader}>
                  <span style={styles.msgSender}>
                    {isBoss
                      ? '👔 老板'
                      : isCeo
                      ? '🧠 CEO分析'
                      : `${ROLE_EMOJI[agent?.role || AgentRole.Planner]} ${agent?.name?.split('-')[0] || 'Agent'}`
                    }
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
                  <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: '4px',
                    fontSize: '10px',
                  }}>
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
                      <span style={{ color: '#9ca3af' }}>
                        置信度 {Math.round((msg as any)._confidence * 100)}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              {(isBoss || isCeo) && (
                <div style={styles.msgAvatarEmoji}>{isBoss ? '👔' : '🧠'}</div>
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
}
