import React, { useState, useRef, useEffect, useCallback } from 'react'
import WorkspaceConfirmPanel from './WorkspaceConfirmPanel'
import RoleSelector from './RoleSelector'
import { useCeoCommunication } from './useCeoCommunication'
import { isElectron, getMdH, STORAGE_KEYS } from '../../constants'
import type { CeoMessage, WorkspaceConfirmRequest, MeetingPhase, CeoChatPanelProps } from './ceo-types'
import { AGENT_NAMES, AGENT_COLORS, PHASE_LABELS, PHASE_ORDER } from './ceo-constants'

const isElectronMode = isElectron()

export default function CeoChatPanel({ wsRef, onEnterProject, onProjectCreated, onClose }: CeoChatPanelProps) {
  const [messages, setMessages] = useState<CeoMessage[]>([{
    role: 'ceo',
    content: '你好，我是公司CEO。请告诉我你需要完成什么任务，我会分析需求并组建合适的团队。',
    timestamp: Date.now(),
  }])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [projectReady, setProjectReady] = useState<{ projectId: string; meetingId: string } | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [roleLocations, setRoleLocations] = useState<Record<string, 'local' | 'remote'>>({})
  const [showRoleSelector, setShowRoleSelector] = useState(false)
  const [autoMode, setAutoMode] = useState(true)
  const [workspaceConfirm, setWorkspaceConfirm] = useState<WorkspaceConfirmRequest | null>(null)
  const [wsType, setWsType] = useState('standalone')
  const [wsRepoPath, setWsRepoPath] = useState('')
  const [wsBranchName, setWsBranchName] = useState('')
  const [wsOutputDir, setWsOutputDir] = useState('')
  const [meetingPhase, setMeetingPhase] = useState<MeetingPhase>('idle')
  const [meetingStartTime, setMeetingStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollRaf = useRef<number>(0)

  const addMsg = useCallback((role: CeoMessage['role'], content: string, agentId?: string, agentName?: string) => {
    setMessages(prev => [...prev, { role, content, timestamp: Date.now(), agentId, agentName }])
  }, [])

  const { sendToBackend, sendWorkspaceConfirm } = useCeoCommunication({
    wsRef, addMsg, setIsProcessing, setMeetingPhase, setProjectReady,
    setWorkspaceConfirm, setWsType, setWsRepoPath, setWsOutputDir,
    setWsBranchName, setMeetingStartTime, onProjectCreated,
  })

  // Auto-scroll
  useEffect(() => {
    cancelAnimationFrame(scrollRaf.current)
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(scrollRaf.current)
  }, [messages])

  // 计时器
  useEffect(() => {
    if (!meetingStartTime || meetingPhase === 'idle' || meetingPhase === 'done') {
      setElapsed(0)
      return
    }
    setElapsed(Math.floor((Date.now() - meetingStartTime) / 1000))
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - meetingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [meetingStartTime, meetingPhase])

  const formatElapsed = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}分${s.toString().padStart(2, '0')}秒` : `${s}秒`
  }, [])

  const handleSend = useCallback(() => {
    if (!input.trim() || isProcessing) return
    const text = input.trim()
    setInput('')
    addMsg('user', text)
    sendToBackend(text, selectedRoles, roleLocations, autoMode)
  }, [input, isProcessing, sendToBackend, addMsg, selectedRoles, roleLocations, autoMode])

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

  const handleWorkspaceConfirm = useCallback(() => {
    const isExistingProject = !!workspaceConfirm?.existing_project
    const confirmData = isExistingProject
      ? {
          action: wsType,
          workspace_type: wsType === 'continue' ? 'standalone' : wsType,
          repo_path: wsType === 'git_worktree' ? wsRepoPath : '',
          branch_name: wsType === 'git_worktree' ? wsBranchName : '',
          output_dir: wsOutputDir,
        }
      : {
          workspace_type: wsType,
          repo_path: wsType === 'git_worktree' ? wsRepoPath : '',
          branch_name: wsType === 'git_worktree' ? wsBranchName : '',
          output_dir: wsOutputDir,
        }

    if (isElectronMode) {
      getMdH()?.invoke('mdh:workspaceConfirmResponse', confirmData)
    } else {
      sendWorkspaceConfirm(confirmData)
    }

    if (isExistingProject) {
      const actionLabels: Record<string, string> = {
        continue: '继续在此目录',
        git_worktree: 'Git Worktree模式',
        new_dir: '使用新目录',
      }
      addMsg('system', `✅ 已确认：${actionLabels[wsType] || wsType}`)
    } else {
      addMsg('system', `✅ 工作区配置已确认：${wsType === 'git_worktree' ? 'Git Worktree' : '独立工作区'}`)
    }
    setWorkspaceConfirm(null)
  }, [wsType, wsRepoPath, wsBranchName, wsOutputDir, addMsg, workspaceConfirm, sendWorkspaceConfirm])

  // RoleSelector 回调
  const handleToggleRole = useCallback((roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    )
  }, [])

  const handleToggleLocation = useCallback((roleId: string) => {
    setRoleLocations(prev => ({ ...prev, [roleId]: prev[roleId] === 'local' ? 'remote' : 'local' }))
  }, [])

  const handleAutoModeChange = useCallback((auto: boolean) => {
    setAutoMode(auto)
    if (auto) setSelectedRoles([])
  }, [])

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.avatar}>🧠</span>
          <div>
            <div style={styles.title}>CEO 智能助手</div>
            <div style={styles.subtitle}>
              {meetingPhase !== 'idle' && meetingPhase !== 'done'
                ? `${PHASE_LABELS[meetingPhase]} · ${formatElapsed(elapsed)}`
                : '分析需求 · 组建团队 · 分配任务'}
            </div>
          </div>
        </div>
        <button style={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {/* 进度条 */}
      {meetingPhase !== 'idle' && meetingPhase !== 'done' && (
        <div style={styles.progressBar}>
          {PHASE_ORDER.map((phase, i) => {
            const phaseIdx = PHASE_ORDER.indexOf(meetingPhase)
            const isActive = i === phaseIdx
            const isDone = i < phaseIdx
            return (
              <div key={phase} style={{
                ...styles.progressStep,
                background: isDone ? '#10b981' : isActive ? '#8b5cf6' : 'rgba(255,255,255,0.08)',
                color: isDone || isActive ? '#fff' : '#6b7280',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
            )
          })}
        </div>
      )}

      <div style={styles.messages}>
        {messages.map((msg, i) => {
          const isMeetingReady = msg.content.startsWith('meeting_ready:')
          const isTaskDone = msg.content === 'task_done:enter_project'
          const isWsConfirm = msg.content === 'workspace_confirm:pending'
          const agentCount = isMeetingReady ? msg.content.split(':')[1] : ''
          return (
            <div key={i} style={{
              ...styles.msgRow,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              {msg.role !== 'user' && (
                <span style={{
                  ...styles.msgAvatar,
                  ...(msg.role === 'agent' && msg.agentId ? {
                    background: `${AGENT_COLORS[msg.agentId] || '#6b7280'}30`,
                    border: `1px solid ${AGENT_COLORS[msg.agentId] || '#6b7280'}50`,
                  } : {}),
                }}>
                  {msg.role === 'ceo' ? '🧠' : msg.role === 'agent' ? '👤' : '📋'}
                </span>
              )}
              <div style={{
                ...styles.msgBubble,
                ...(msg.role === 'user' ? styles.userBubble : {}),
                ...(msg.role === 'system' ? styles.systemBubble : {}),
                ...(msg.role === 'agent' && msg.agentId ? {
                  borderLeft: `3px solid ${AGENT_COLORS[msg.agentId] || '#6b7280'}`,
                } : {}),
              }}>
                {isMeetingReady ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>项目已创建，{agentCount} 人团队已就绪，会议正在处理中。</div>
                    <button style={styles.inlineEnterBtn} onClick={handleEnter}>
                      🚀 进入项目工作间查看会议 →
                    </button>
                  </div>
                ) : isTaskDone ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>任务处理完成。</div>
                    <button style={styles.inlineEnterBtn} onClick={handleEnter}>
                      🚀 进入项目工作间查看详情 →
                    </button>
                  </div>
                ) : isWsConfirm && workspaceConfirm ? (
                  <WorkspaceConfirmPanel
                    confirm={workspaceConfirm}
                    onConfirm={({ wsType: wt, wsRepoPath: rp, wsBranchName: bn, wsOutputDir: od }) => {
                      setWsType(wt)
                      setWsRepoPath(rp)
                      setWsBranchName(bn)
                      setWsOutputDir(od)
                      handleWorkspaceConfirm()
                    }}
                  />
                ) : msg._workspaceConfirm ? (
                  <div>
                    <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14 }}>
                      📁 选择项目工作区
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
                      项目文件将存放在你选择的目录中
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        style={styles.wsConfirmBtn}
                        onClick={() => {
                          addMsg('system', '✅ 使用默认工作区')
                          getMdH()?.invoke('mdh:workspaceConfirmResponse', { workspace_type: 'standalone' })
                        }}
                      >
                        📂 使用默认工作区
                      </button>
                      <button
                        style={{ ...styles.wsConfirmBtn, background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)' }}
                        onClick={() => {
                          getMdH()?.invoke('mdh:selectWorkspace').then((result: any) => {
                            if (result && !result.canceled && result.path) {
                              addMsg('system', `✅ 已选择工作区：${result.path}`)
                              getMdH()?.invoke('mdh:workspaceConfirmResponse', {
                                workspace_type: 'standalone',
                                output_dir: result.path,
                              })
                            } else {
                              addMsg('system', '取消选择，等待重新选择...')
                            }
                          })
                        }}
                      >
                        📁 选择其他目录...
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.role === 'agent' && msg.agentName && (
                      <div style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: AGENT_COLORS[msg.agentId || ''] || '#8b9dc3',
                        marginBottom: 4,
                      }}>
                        {msg.agentName}
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</div>
                  </>
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

      <RoleSelector
        selectedRoles={selectedRoles}
        roleLocations={roleLocations}
        autoMode={autoMode}
        showRoleSelector={showRoleSelector}
        onToggleRole={handleToggleRole}
        onToggleLocation={handleToggleLocation}
        onAutoModeChange={handleAutoModeChange}
        onToggleShow={() => setShowRoleSelector(!showRoleSelector)}
      />

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
  wsConfirmBtn: {
    width: '100%',
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
  },
  progressBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '6px 16px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  progressStep: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    transition: 'all 0.3s ease',
  },
}
