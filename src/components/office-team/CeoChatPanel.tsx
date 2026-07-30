import React, { useState, useRef, useEffect, useCallback } from 'react'

const isElectron = typeof window !== 'undefined' && (window as any).mdh?.isElectron === true

const AGENT_NAMES: Record<string, string> = {
  'agent-ceo': 'CTO',
  'agent-coordinator': '项目经理',
  'agent-planner': '架构师',
  'agent-executor': '全栈开发',
  'agent-reviewer': 'QA工程师',
  'agent-monitor': 'DevOps',
}

const AGENT_COLORS: Record<string, string> = {
  'agent-ceo': '#8b5cf6',
  'agent-coordinator': '#3b82f6',
  'agent-planner': '#10b981',
  'agent-executor': '#f59e0b',
  'agent-reviewer': '#ef4444',
  'agent-monitor': '#06b6d4',
}

interface CeoMessage {
  role: 'user' | 'ceo' | 'system' | 'agent'
  content: string
  timestamp: number
  agentId?: string
  agentName?: string
  _workspaceConfirm?: boolean
  _workspaceReq?: any
}

interface WorkspaceConfirmRequest {
  project_id: string
  task_description: string
  suggested_type: string
  suggested_path: string
  existing_project?: {
    path: string
    has_git: boolean
    file_count: number
    files: string[]
    project_hints: string[]
  }
  options: {
    workspace_types: Array<{ id: string; name: string; desc: string }>
    default_output_dir: string
  }
}

type MeetingPhase =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'discussing'
  | 'assigning'
  | 'executing'
  | 'reviewing'
  | 'summarizing'
  | 'done'

const PHASE_LABELS: Record<MeetingPhase, string> = {
  idle: '等待中',
  analyzing: '需求分析',
  planning: '项目规划',
  discussing: '团队讨论',
  assigning: '任务分派',
  executing: '代码执行',
  reviewing: '质量审查',
  summarizing: '生成报告',
  done: '已完成',
}

const PHASE_ORDER: MeetingPhase[] = [
  'analyzing', 'planning', 'discussing', 'assigning', 'executing', 'reviewing', 'summarizing',
]

interface RoleInfo {
  id: string
  name: string
  description: string
  department?: string
}

interface CeoChatPanelProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onEnterProject: (projectId: string, meetingId: string) => void
  onProjectCreated?: (projectId: string) => void
  onClose: () => void
}

// 预设角色列表（与后端 roles_config.yaml 对应）
const PRESET_ROLES: RoleInfo[] = [
  // 软件产品部
  { id: 'coordinator', name: '产品经理', description: '需求分析与项目管理', department: 'dept-software' },
  { id: 'planner', name: '架构师', description: '系统设计与技术选型', department: 'dept-software' },
  { id: 'executor', name: '全栈开发', description: '前后端代码实现', department: 'dept-software' },
  { id: 'reviewer', name: 'QA工程师', description: '测试与质量保障', department: 'dept-software' },
  { id: 'monitor', name: 'DevOps', description: 'CI/CD与部署运维', department: 'dept-software' },
  // AI影视部
  { id: 'director', name: '导演', description: '创意把控与整体调度', department: 'dept-ai-movie' },
  { id: 'screenwriter', name: '编剧', description: '剧本创作与分镜设计', department: 'dept-ai-movie' },
  { id: 'image_artist', name: '图像生成师', description: 'AI图像生成', department: 'dept-ai-movie' },
  { id: 'video_artist', name: '视频生成师', description: 'AI视频生成', department: 'dept-ai-movie' },
  // 数据智能部
  { id: 'data_lead', name: '数据负责人', description: '需求拆解与分析策略', department: 'dept-data' },
  { id: 'data_engineer', name: '数据工程师', description: '数据采集/清洗/ETL', department: 'dept-data' },
  { id: 'data_analyst', name: '数据分析师', description: '统计分析与洞察', department: 'dept-data' },
  // 内容创作部
  { id: 'content_director', name: '内容总监', description: '选题策划与风格把控', department: 'dept-content' },
  { id: 'content_writer', name: '撰稿人', description: '深度文章与技术写作', department: 'dept-content' },
  // 演示设计部
  { id: 'ppt_lead', name: '演示负责人', description: '需求沟通与内容梳理', department: 'dept-ppt' },
  { id: 'slide_designer', name: '视觉设计师', description: '版式/配色/图表设计', department: 'dept-ppt' },
]

// 部门颜色映射
const DEPT_COLORS: Record<string, string> = {
  'dept-software': '#0a84ff',
  'dept-ai-movie': '#ff375f',
  'dept-data': '#bf5af2',
  'dept-content': '#ff9f0a',
  'dept-ppt': '#30d158',
}

// 部门名称映射
const DEPT_NAMES: Record<string, string> = {
  'dept-software': '💻 软件产品部',
  'dept-ai-movie': '🎬 AI影视部',
  'dept-data': '📊 数据智能部',
  'dept-content': '✍️ 内容创作部',
  'dept-ppt': '🎯 演示设计部',
}

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
  const listenerCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 计时器：会议进行中每秒更新elapsed
  useEffect(() => {
    if (!meetingStartTime || meetingPhase === 'idle' || meetingPhase === 'done') {
      setElapsed(0)
      return
    }
    // 立即更新一次，不等 setInterval
    setElapsed(Math.floor((Date.now() - meetingStartTime) / 1000))
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - meetingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [meetingStartTime, meetingPhase])

  const detectPhase = useCallback((text: string): MeetingPhase | null => {
    if (text.includes('确认细节') || text.includes('需求确认')) return 'analyzing'
    if (text.includes('项目经理分析') || text.includes('意图')) return 'analyzing'
    if (text.includes('制定项目计划') || text.includes('阶段1')) return 'planning'
    if (text.includes('组织团队讨论')) return 'discussing'
    if (text.includes('整合') && text.includes('讨论')) return 'discussing'
    if (text.includes('分派') && text.includes('任务')) return 'assigning'
    if (text.includes('正在执行任务') || text.includes('轮开发')) return 'executing'
    if (text.includes('写入文件')) return 'executing'
    if (text.includes('轮质量审查') || text.includes('轮审查')) return 'reviewing'
    if (text.includes('审查通过')) return 'reviewing'
    if (text.includes('项目总结') || text.includes('总结报告')) return 'summarizing'
    if (text.includes('汇报结果') || text.includes('任务已完成')) return 'done'
    return null
  }, [])

  const formatElapsed = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}分${s.toString().padStart(2, '0')}秒` : `${s}秒`
  }, [])

  useEffect(() => {
    return () => {
      listenerCleanupRef.current?.()
    }
  }, [])

  const addMsg = useCallback((role: CeoMessage['role'], content: string, agentId?: string, agentName?: string) => {
    setMessages(prev => [...prev, { role, content, timestamp: Date.now(), agentId, agentName }])
  }, [])

  const sendToBackend = useCallback((content: string) => {
    setIsProcessing(true)
    addMsg('user', content)

    // Electron 模式：通过 IPC 发送
    if (isElectron) {
      const mdh = (window as any).mdh
      mdh.invoke('mdh:sendMessage', {
        content,
        roles: autoMode ? [] : selectedRoles,
      }).then((result: any) => {
        if (result?.error) {
          addMsg('system', `❌ ${result.error}`)
          setIsProcessing(false)
        } else {
          addMsg('system', '任务已发送，等待团队响应...')

          // 监听工作区确认请求 — 在对话中显示选项
          const wsConfirmHandler = (req: any) => {
            setMessages(prev => [...prev, {
              role: 'ceo',
              content: '请选择项目工作区：',
              timestamp: Date.now(),
              _workspaceConfirm: true,
              _workspaceReq: req,
            }])
          }
          mdh.on('mdh:onWorkspaceConfirm', wsConfirmHandler)

          // 监听 IPC 推送的消息
          const handler = (event: any) => {
            if (event.type === 'meeting_ended') {
              setIsProcessing(false)
              addMsg('ceo', '任务已完成。')
              mdh.off('mdh:onAgentMessage', handler)
              mdh.off('mdh:onWorkspaceConfirm', wsConfirmHandler)
            } else if (event.type === 'error') {
              setIsProcessing(false)
              addMsg('system', `❌ ${event.message}`)
              mdh.off('mdh:onAgentMessage', handler)
              mdh.off('mdh:onWorkspaceConfirm', wsConfirmHandler)
            } else if (event.type === 'assistant_message' && event.content) {
              // 根据 agentId 判断角色
              const agentId = event.agentId || ''
              const agentName = AGENT_NAMES[agentId] || agentId.replace('agent-', '')
              if (agentId === 'agent-ceo') {
                addMsg('ceo', event.content)
              } else if (agentId.startsWith('agent-')) {
                addMsg('agent', event.content, agentId, agentName)
              } else {
                addMsg('ceo', event.content)
              }
            } else if (event.type === 'phase') {
              // 阶段变化
              setMeetingPhase?.(event.phase || 'idle')
            }
          }
          mdh.on('mdh:onAgentMessage', handler)
        }
      }).catch((err: any) => {
        addMsg('system', `❌ ${String(err)}`)
        setIsProcessing(false)
      })
      return
    }

    // WebSocket 模式（浏览器）
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setIsProcessing(false)
      return
    }

    let currentProjectId = ''
    let currentMeetingId = ''
    let meetingStarted = false

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)
        const t = msg.type

        // 会议启动后，显示关键进度消息
        if (meetingStarted) {
          if (t === 'task_result') {
            setIsProcessing(false)
            setMeetingPhase('done')
            if (currentProjectId && currentMeetingId) {
              setProjectReady({ projectId: currentProjectId, meetingId: currentMeetingId })
              addMsg('ceo', 'task_done:enter_project')
            } else {
              addMsg('ceo', '任务已完成。')
            }
            cleanup()
          } else if (t === 'meeting_error') {
            setIsProcessing(false)
            setMeetingPhase('done')
            addMsg('system', `❌ ${msg.message}`)
            cleanup()
          } else if (t === 'agent_message' && !msg.delta) {
            const agentId = msg.agentId || ''
            const text = msg.content || ''
            // 检测阶段变化
            const phase = detectPhase(text)
            if (phase) setMeetingPhase(phase)
            // 实时显示所有代理消息
            const isKeyMessage =
              agentId === 'agent-coordinator' ||
              agentId === 'agent-ceo' ||
              agentId.startsWith('agent-') ||
              text.includes('分析') ||
              text.includes('讨论') ||
              text.includes('审查') ||
              text.includes('执行任务') ||
              text.includes('分派') ||
              text.includes('汇报') ||
              text.includes('写入文件') ||
              text.includes('已写入') ||
              text.includes('总结') ||
              text.includes('轮开发') ||
              text.includes('轮审查') ||
              text.includes('需求') ||
              text.includes('计划') ||
              text.includes('分配')
            if (isKeyMessage) {
              addMsg('system', `[${agentId}] ${text}`)
            }
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
        } else if (t === 'workspace_confirm_request') {
          // 收到工作区确认请求，显示配置UI
          console.log('[CeoChatPanel] 收到 workspace_confirm_request:', msg)
          const req: WorkspaceConfirmRequest = {
            project_id: msg.project_id || '',
            task_description: msg.task_description || '',
            suggested_type: msg.suggested_type || 'standalone',
            suggested_path: msg.suggested_path || '',
            options: msg.options || { workspace_types: [], default_output_dir: '' },
          }
          setWorkspaceConfirm(req)
          setWsType(req.existing_project ? 'continue' : req.suggested_type)
          setWsRepoPath(req.suggested_path)
          setWsOutputDir(req.options.default_output_dir)
          setWsBranchName(`agent/task-${req.project_id.slice(0, 8)}`)
          addMsg('ceo', 'workspace_confirm:pending')
        } else if (t === 'meeting_started') {
          meetingStarted = true
          currentMeetingId = msg.meeting_id || ''
          currentProjectId = msg.project_id || ''
          const agentCount = (msg.agents || []).length
          setProjectReady({ projectId: currentProjectId, meetingId: currentMeetingId })
          setMeetingStartTime(Date.now())
          setMeetingPhase('analyzing')
          addMsg('ceo', `meeting_ready:${agentCount}`)
          if (currentProjectId) onProjectCreated?.(currentProjectId)
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
      selected_roles: autoMode ? [] : selectedRoles,
      role_locations: autoMode ? {} : roleLocations,
      provider: localStorage.getItem('llm_provider') || undefined,
      model_name: localStorage.getItem('llm_model_name') || undefined,
      api_key: localStorage.getItem('deepseek_api_key') || undefined,
      base_url: localStorage.getItem('deepseek_base_url') || undefined,
    }))
  }, [wsRef, addMsg, selectedRoles, onProjectCreated])

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

    // Electron 模式：通过 IPC 发送
    if (isElectron) {
      (window as any).mdh.invoke('mdh:workspaceConfirmResponse', confirmData)
    } else {
      // WebSocket 模式
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: 'workspace_confirm_response', ...confirmData }))
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
  }, [wsRef, wsType, wsRepoPath, wsBranchName, wsOutputDir, addMsg, workspaceConfirm])

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

      {/* 进度条：会议进行中显示 */}
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
                ) : isWsConfirm && workspaceConfirm ? (
                  <div>
                    <div style={{ marginBottom: 10, fontWeight: 600 }}>
                      {workspaceConfirm.existing_project ? '⚠️ 目录已有内容' : '📁 工作区配置'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                      项目: {workspaceConfirm.task_description}
                    </div>

                    {/* 已有项目信息 */}
                    {workspaceConfirm.existing_project && (
                      <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(245,158,11,0.1)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>
                          目标目录: {workspaceConfirm.existing_project.path}
                        </div>
                        <div style={{ fontSize: 11, color: '#d4a056' }}>
                          已有 {workspaceConfirm.existing_project.file_count} 个文件/目录
                          {workspaceConfirm.existing_project.project_hints.length > 0 &&
                            ` · 检测到: ${workspaceConfirm.existing_project.project_hints.join(', ')}`}
                        </div>
                        {workspaceConfirm.existing_project.files.length > 0 && (
                          <div style={{ fontSize: 10, color: '#92744c', marginTop: 4, fontFamily: 'monospace' }}>
                            {workspaceConfirm.existing_project.files.slice(0, 8).join(', ')}
                            {workspaceConfirm.existing_project.files.length > 8 && '...'}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginBottom: 8 }}>
                      <label style={styles.wsLabel}>
                        {workspaceConfirm.existing_project ? '请选择操作' : '工作区类型'}
                      </label>
                      <div style={styles.wsOptionGroup}>
                        {workspaceConfirm.options.workspace_types.map(wt => (
                          <div
                            key={wt.id}
                            onClick={() => setWsType(wt.id)}
                            style={{
                              ...styles.wsOption,
                              ...(wsType === wt.id ? styles.wsOptionActive : {}),
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{wt.name}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{wt.desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {wsType === 'git_worktree' && (
                      <>
                        <div style={{ marginBottom: 8 }}>
                          <label style={styles.wsLabel}>仓库路径</label>
                          <input
                            style={styles.wsInput}
                            value={wsRepoPath}
                            onChange={e => setWsRepoPath(e.target.value)}
                            placeholder="/path/to/repo"
                          />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <label style={styles.wsLabel}>分支名</label>
                          <input
                            style={styles.wsInput}
                            value={wsBranchName}
                            onChange={e => setWsBranchName(e.target.value)}
                            placeholder="agent/task-xxx"
                          />
                        </div>
                      </>
                    )}

                    {wsType === 'new_dir' && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={styles.wsLabel}>新目录路径</label>
                        <input
                          style={styles.wsInput}
                          value={wsOutputDir}
                          onChange={e => setWsOutputDir(e.target.value)}
                          placeholder="请输入空目录路径"
                        />
                      </div>
                    )}

                    {!workspaceConfirm.existing_project && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={styles.wsLabel}>输出目录</label>
                        <input
                          style={styles.wsInput}
                          value={wsOutputDir}
                          onChange={e => setWsOutputDir(e.target.value)}
                          placeholder="留空使用默认目录"
                        />
                      </div>
                    )}

                    <button
                      style={styles.wsConfirmBtn}
                      onClick={handleWorkspaceConfirm}
                    >
                      ✅ 确认配置并继续
                    </button>
                  </div>
                ) : msg._workspaceConfirm ? (
                  // 工作区选择 UI
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
                          mdh.invoke('mdh:workspaceConfirmResponse', { workspace_type: 'standalone' })
                        }}
                      >
                        📂 使用默认工作区
                      </button>
                      <button
                        style={{ ...styles.wsConfirmBtn, background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)' }}
                        onClick={() => {
                          mdh.invoke('mdh:selectWorkspace').then((result: any) => {
                            if (result && !result.canceled && result.path) {
                              addMsg('system', `✅ 已选择工作区：${result.path}`)
                              mdh.invoke('mdh:workspaceConfirmResponse', {
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

      {/* 角色选择器 */}
      <div style={styles.roleSection}>
        <div
          style={styles.roleHeader}
          onClick={() => setShowRoleSelector(!showRoleSelector)}
        >
          <span style={{ fontSize: 12, color: '#8b9dc3' }}>
            👥 团队成员 {autoMode ? '(CEO智能组队)' : `(${selectedRoles.length}人)`}
          </span>
          <span style={{ fontSize: 11, color: '#667', transform: showRoleSelector ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </div>

        {/* 已选角色标签 */}
        {!showRoleSelector && (
          <div style={styles.roleTags}>
            {autoMode ? (
              <span style={{ ...styles.roleTag, borderColor: '#8b5cf640', color: '#a78bfa' }}>
                🤖 CEO智能组队
              </span>
            ) : (
              selectedRoles.map(id => {
                const role = PRESET_ROLES.find(r => r.id === id)
                if (!role) return null
                const color = DEPT_COLORS[role.department || ''] || '#64d2ff'
                const loc = roleLocations[id] || 'local'
                const locIcon = loc === 'local' ? '💻' : '☁️'
                const locLabel = loc === 'local' ? '本地' : '远端'
                return (
                  <span
                    key={id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setRoleLocations(prev => ({ ...prev, [id]: prev[id] === 'local' ? 'remote' : 'local' }))
                    }}
                    style={{ ...styles.roleTag, borderColor: color + '40', color, cursor: 'pointer' }}
                    title={`点击切换执行位置 (当前: ${locLabel})`}
                  >
                    {locIcon} {role.name}
                  </span>
                )
              })
            )}
          </div>
        )}

        {/* 角色选择面板 */}
        {showRoleSelector && (
          <div style={styles.roleSelector}>
            {/* CEO智能组队选项 */}
            <div
              onClick={() => {
                setAutoMode(true)
                setSelectedRoles([])
              }}
              style={{
                ...styles.roleOption,
                background: autoMode ? '#8b5cf620' : 'rgba(255,255,255,0.03)',
                borderColor: autoMode ? '#8b5cf660' : 'rgba(255,255,255,0.08)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>🤖</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: autoMode ? 700 : 400, color: autoMode ? '#a78bfa' : '#8b9dc3' }}>
                  CEO智能组队
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>根据任务自动选择最佳团队配置</div>
              </div>
            </div>

            {/* 手动选择分隔线 */}
            <div style={{ fontSize: 10, color: '#4b5563', padding: '4px 0', marginBottom: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              或手动选择角色：
            </div>

            {Object.entries(DEPT_NAMES).map(([deptId, deptName]) => {
              const deptRoles = PRESET_ROLES.filter(r => r.department === deptId)
              if (deptRoles.length === 0) return null
              const color = DEPT_COLORS[deptId]
              return (
                <div key={deptId} style={styles.deptGroup}>
                  <div style={{ ...styles.deptLabel, color }}>{deptName}</div>
                  <div style={styles.deptRoles}>
                    {deptRoles.map(role => {
                      const isSelected = selectedRoles.includes(role.id)
                      const loc = roleLocations[role.id] || 'local'
                      return (
                        <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div
                            onClick={() => {
                              setAutoMode(false)
                              setSelectedRoles(prev =>
                                isSelected
                                  ? prev.filter(id => id !== role.id)
                                  : [...prev, role.id]
                              )
                            }}
                            style={{
                              ...styles.roleOption,
                              flex: 1,
                              background: isSelected ? color + '20' : 'rgba(255,255,255,0.03)',
                              borderColor: isSelected ? color + '60' : 'rgba(255,255,255,0.08)',
                              opacity: autoMode ? 0.5 : 1,
                            }}
                            title={role.description}
                          >
                            <div style={{ fontSize: 11, fontWeight: isSelected ? 600 : 400, color: isSelected ? color : '#8b9dc3' }}>
                              {role.name}
                            </div>
                          </div>
                          {isSelected && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation()
                                setRoleLocations(prev => ({ ...prev, [role.id]: prev[role.id] === 'local' ? 'remote' : 'local' }))
                              }}
                              style={{
                                fontSize: 9,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: loc === 'local' ? '#0a84ff20' : '#ff9f0a20',
                                color: loc === 'local' ? '#0a84ff' : '#ff9f0a',
                                border: `1px solid ${loc === 'local' ? '#0a84ff40' : '#ff9f0a40'}`,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                userSelect: 'none',
                              }}
                              title="点击切换：本地💻 / 远端☁️"
                            >
                              {loc === 'local' ? '💻 本地' : '☁️ 远端'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
  roleSection: {
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
  },
  roleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    cursor: 'pointer',
  },
  roleTags: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    padding: '0 14px 8px',
  },
  roleTag: {
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 10,
    border: '1px solid',
    background: 'rgba(255,255,255,0.03)',
  },
  roleSelector: {
    padding: '0 14px 10px',
    maxHeight: 200,
    overflowY: 'auto' as const,
  },
  deptGroup: {
    marginBottom: 8,
  },
  deptLabel: {
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  deptRoles: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  roleOption: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  wsLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: '#8b9dc3',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  wsOptionGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  wsOption: {
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  wsOptionActive: {
    borderColor: 'rgba(139, 92, 246, 0.6)',
    background: 'rgba(139, 92, 246, 0.15)',
  },
  wsInput: {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.3)',
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: 'monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
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
