import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ViewState } from './office-team/types'
import OfficeHeader from './office-team/OfficeHeader'
import OfficeScene from './office-team/OfficeScene'
import MeetingChatPanel from './office-team/MeetingChatPanel'
import TaskAssignPanel from './office-team/TaskAssignPanel'
import AgendaPanel from './office-team/AgendaPanel'
import TechTowerView from './TechTowerView'
import WorkflowPanel from './WorkflowPanel'
import WorkspacePanel from './office-team/WorkspacePanel'
import SkillEvolutionPanel from './skill-evolution/SkillEvolutionPanel'
import useMeetingSocket from '../hooks/useMeetingSocket'

interface OfficeTeamModeProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onBackToSingle: () => void
  pendingApprovalCount?: number
  onOpenApproval?: () => void
}

interface ProjectDetail {
  project_id: string
  name: string
  status: string
  brief: Record<string, unknown>
  created_at: string
  employees: Array<{ id: string; name: string; role: string; status: string }>
  skill_packages: Array<{ skill_id: string; name: string }>
  execution_logs: Array<Record<string, unknown>>
}

export default function OfficeTeamMode({ wsRef, onBackToSingle, pendingApprovalCount = 0, onOpenApproval }: OfficeTeamModeProps) {
  const [viewState, setViewState] = useState<ViewState>('tower')
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null)
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [meetingTab, setMeetingTab] = useState<'chat' | 'files' | 'skills'>('chat')
  const [refreshKey, setRefreshKey] = useState(0)

  const {
    agents,
    tasks,
    chatMessages,
    isMeetingActive,
    lastWorkflow,
    agendaState,
    workspace,
    toolCallLogs,
    clearWorkflow,
    startMeeting,
    sendMeetingMessage,
    endMeeting,
    sendAgendaAction,
    sendToolCall,
    sendWorkspaceAction,
    meetingPhase,
    meetingStartTime,
  } = useMeetingSocket({ wsRef })

  const wanderIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (viewState === 'office' && agents.length > 0) {
      wanderIntervalRef.current = window.setInterval(() => {}, 100)
    } else {
      if (wanderIntervalRef.current) clearInterval(wanderIntervalRef.current)
    }
    return () => { if (wanderIntervalRef.current) clearInterval(wanderIntervalRef.current) }
  }, [viewState, agents.length])

  // 从科技大厦进入办公室
  const handleEnterOffice = useCallback((projectId: string, projectName: string) => {
    setSelectedProject({ id: projectId, name: projectName })
    setViewState('office')
    // 获取项目详情
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setProjectDetail(data.data)
        }
      })
      .catch(() => {})
  }, [])

  // 启动会议（留在办公室，弹出面板）
  const handleStartMeeting = useCallback(() => {
    startMeeting()
    setViewState('meeting')
    setMeetingTab('chat')
  }, [startMeeting])

  // 结束会议（收回面板，回到办公室）
  const handleEndMeeting = useCallback(() => {
    endMeeting()
    setViewState('office')
  }, [endMeeting])

  // 返回科技大厦
  const handleBackToTower = useCallback(() => {
    setViewState('tower')
    setSelectedProject(null)
    setProjectDetail(null)
    setRefreshKey(k => k + 1) // 触发项目列表刷新
  }, [])

  // 发送会议消息
  const handleSendMessage = useCallback(() => {
    if (!taskInput.trim()) return
    sendMeetingMessage(taskInput.trim())
    setTaskInput('')
  }, [taskInput, sendMeetingMessage])

  // 从大厦直接发送任务
  const handleTowerSendTask = useCallback((description: string) => {
    startMeeting()
    setViewState('meeting')
    setTimeout(() => sendMeetingMessage(description), 500)
  }, [startMeeting, sendMeetingMessage])

  const isTower = viewState === 'tower'
  const isMeeting = viewState === 'meeting'

  // 第一层：公司大楼
  if (isTower) {
    return (
      <TechTowerView
        wsRef={wsRef}
        onStartMeeting={() => handleTowerSendTask('开始新会议')}
        onSendTask={handleTowerSendTask}
        onBackToSingle={onBackToSingle}
        onEnterProject={handleEnterOffice}
        refreshKey={refreshKey}
      />
    )
  }

  // 第二层：办公室 + 第三层：会议面板（叠加）
  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <OfficeHeader
        viewState={viewState}
        tasks={tasks}
        hasMessages={chatMessages.length > 0}
        onBackToSingle={onBackToSingle}
        onBackToTower={handleBackToTower}
        onStartMeeting={handleStartMeeting}
        meetingPhase={meetingPhase}
        meetingStartTime={meetingStartTime}
        projectName={selectedProject?.name}
      />

      {pendingApprovalCount > 0 && (
        <div style={styles.approvalBar}>
          <button style={styles.approvalButton} onClick={onOpenApproval}>
            <span style={styles.approvalIcon}>🔔</span>
            <span style={styles.approvalText}>{pendingApprovalCount} 个审批请求待处理</span>
            <span style={styles.approvalBadge}>{pendingApprovalCount}</span>
          </button>
        </div>
      )}

      <div style={styles.mainContent}>
        {/* 办公室主体（始终保持显示） */}
        <div style={styles.officeArea}>
          <OfficeScene
            agents={agents}
            viewState={viewState}
            onStartMeeting={handleStartMeeting}
            projectName={selectedProject?.name}
            projectId={selectedProject?.id}
            projectDetail={projectDetail}
          />
        </div>

        {/* 会议面板（从右侧滑出，覆盖办公室右侧） */}
        {isMeeting && (
          <div style={styles.meetingOverlay}>
            <div style={styles.meetingPanel}>
              <div style={styles.meetingHeader}>
                <div style={styles.meetingTitle}>
                  <span>📋 会议进行中</span>
                  <span style={styles.meetingPhase}>{meetingPhase !== 'idle' ? meetingPhase : ''}</span>
                </div>
                <button style={styles.closeMeetingBtn} onClick={handleEndMeeting}>×</button>
              </div>

              <div style={styles.meetingTabBar}>
                {([['chat', '💬 对话'], ['files', '📄 文件'], ['skills', '🧬 技能进化']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMeetingTab(key)}
                    style={{
                      ...styles.meetingTabBtn,
                      ...(meetingTab === key ? styles.meetingTabBtnActive : {}),
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={styles.meetingContent}>
                {meetingTab === 'chat' ? (
                  <>
                    <MeetingChatPanel
                      agents={agents}
                      messages={chatMessages}
                      onEndMeeting={handleEndMeeting}
                      agendaPhase={agendaState?.phase || 'idle'}
                    />
                    <AgendaPanel
                      agendaState={agendaState}
                      onAction={sendAgendaAction}
                    />
                  </>
                ) : meetingTab === 'files' ? (
                  <WorkspacePanel
                    workspace={workspace}
                    toolCallLogs={toolCallLogs}
                    onToolCall={(name, args) => sendToolCall(name, args)}
                    onDestroy={() => sendWorkspaceAction('destroy', workspace?.workspace_id)}
                    messages={chatMessages}
                  />
                ) : (
                  <SkillEvolutionPanel />
                )}
              </div>

              <TaskAssignPanel
                agents={agents}
                taskInput={taskInput}
                onTaskInputChange={setTaskInput}
                onSendMessage={handleSendMessage}
              />
            </div>
          </div>
        )}
      </div>

      <WorkflowPanel
        workflow={lastWorkflow}
        onClose={clearWorkflow}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a2a 100%)',
    color: '#e2e8f0',
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  officeArea: {
    flex: 1,
    position: 'relative',
    transition: 'all 0.3s ease',
  },
  meetingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '450px',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(10, 10, 30, 0.95)',
    borderLeft: '1px solid rgba(139, 92, 246, 0.3)',
    boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.5)',
    zIndex: 100,
    animation: 'slideInRight 0.3s ease',
  },
  meetingPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  meetingHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(139, 92, 246, 0.1)',
  },
  meetingTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  meetingPhase: {
    fontSize: '11px',
    color: '#a78bfa',
    padding: '2px 8px',
    background: 'rgba(139, 92, 246, 0.15)',
    borderRadius: '10px',
  },
  closeMeetingBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#9ca3af',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingTabBar: {
    display: 'flex',
    gap: '2px',
    padding: '4px 12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  meetingTabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  meetingTabBtnActive: {
    background: 'rgba(139, 92, 246, 0.15)',
    color: '#a78bfa',
  },
  meetingContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  approvalBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 16px',
    background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
  },
  approvalButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    background: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  approvalIcon: { fontSize: '14px' },
  approvalText: { color: '#fca5a5' },
  approvalBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    background: '#ef4444',
    borderRadius: '9px',
    color: 'white',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
  },
}
