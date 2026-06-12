import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ViewState, MeetingTab } from './office-team/types'
import { isOfficeView, isMeetingView } from './office-team/utils'
import OfficeHeader from './office-team/OfficeHeader'
import OfficeScene from './office-team/OfficeScene'
import MeetingChatPanel from './office-team/MeetingChatPanel'
import TaskAssignPanel from './office-team/TaskAssignPanel'
import MeetingLogPanel from './office-team/MeetingLogPanel'
import AgendaPanel from './office-team/AgendaPanel'
import SkillEvolutionDashboard from './skill-evolution/SkillEvolutionDashboard'
import TechTowerView from './TechTowerView'
import WorkflowPanel from './WorkflowPanel'
import WorkspacePanel from './office-team/WorkspacePanel'
import useMeetingSocket from '../hooks/useMeetingSocket'

interface OfficeTeamModeProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onBackToSingle: () => void
  pendingApprovalCount?: number
  onOpenApproval?: () => void
}

export default function OfficeTeamMode({ wsRef, onBackToSingle, pendingApprovalCount = 0, onOpenApproval }: OfficeTeamModeProps) {
  const [taskInput, setTaskInput] = useState('')
  const [viewState, setViewState] = useState<ViewState>('tower')
  const [meetingTab, setMeetingTab] = useState<MeetingTab>('chat')

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
    assignTask,
    endMeeting,
    sendAgendaAction,
    sendToolCall,
    sendWorkspaceAction,
  } = useMeetingSocket({ wsRef })

  const wanderIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (viewState === 'office' && agents.length > 0) {
      wanderIntervalRef.current = window.setInterval(() => {
      }, 100)
    } else {
      if (wanderIntervalRef.current) {
        clearInterval(wanderIntervalRef.current)
      }
    }
    return () => {
      if (wanderIntervalRef.current) {
        clearInterval(wanderIntervalRef.current)
      }
    }
  }, [viewState, agents.length])

  const handleStartMeeting = useCallback(() => {
    setViewState('transitioning-to-meeting')
    startMeeting()
    setTimeout(() => {
      setViewState('meeting')
    }, 1200)
  }, [startMeeting])

  const handleSendMessage = useCallback(() => {
    if (!taskInput.trim()) return
    sendMeetingMessage(taskInput.trim())
    setTaskInput('')
  }, [taskInput, sendMeetingMessage])

  const handleReset = useCallback(() => {
    setViewState('tower')
    setTaskInput('')
  }, [])

  /* 从大楼屋顶办公室发送任务 → 直接进入会议并提交 */
  const handleTowerSendTask = useCallback((description: string) => {
    setViewState('transitioning-to-meeting')
    startMeeting()
    setTimeout(() => {
      setViewState('meeting')
      sendMeetingMessage(description)
    }, 1200)
  }, [startMeeting, sendMeetingMessage])

  /* 从大楼楼层进入会议 */
  const handleTowerEnterMeeting = useCallback(() => {
    setViewState('transitioning-to-meeting')
    startMeeting()
    setTimeout(() => {
      setViewState('meeting')
    }, 1200)
  }, [startMeeting])

  /* 结束会议后回到大楼 */
  const handleEndMeeting = useCallback(() => {
    setViewState('transitioning-to-office')
    endMeeting()
    setTimeout(() => {
      setViewState('tower')
    }, 1000)
  }, [endMeeting])

  const isTower = viewState === 'tower'
  const isOffice = isOfficeView(viewState)
  const isMeeting = isMeetingView(viewState)

  /* ─── 大楼视图 ─── */
  if (isTower) {
    return (
      <TechTowerView
        wsRef={wsRef}
        onStartMeeting={handleTowerEnterMeeting}
        onSendTask={handleTowerSendTask}
        onBackToSingle={onBackToSingle}
      />
    )
  }

  return (
    <div style={styles.container}>
      <OfficeHeader
        viewState={viewState}
        tasks={tasks}
        hasMessages={chatMessages.length > 0}
        onBackToSingle={onBackToSingle}
        onStartMeeting={handleStartMeeting}
      />

      {pendingApprovalCount > 0 && (
        <div style={styles.approvalBar}>
          <button style={styles.approvalButton} onClick={onOpenApproval}>
            <span style={styles.approvalIcon}>🔔</span>
            <span style={styles.approvalText}>
              {pendingApprovalCount} 个审批请求待处理
            </span>
            <span style={styles.approvalBadge}>{pendingApprovalCount}</span>
          </button>
        </div>
      )}

      <div style={styles.mainContent}>
        <div
          style={{
            ...styles.officePanel,
            ...(isMeeting ? styles.officePanelMinimized : {}),
            ...(viewState === 'transitioning-to-meeting' ? styles.officePanelAnimating : {}),
            ...(viewState === 'transitioning-to-office' ? styles.officePanelExpanding : {}),
          }}
        >
          <OfficeScene
            agents={agents}
            viewState={viewState}
            onStartMeeting={handleStartMeeting}
          />
        </div>

        {isMeeting && (
          <div style={{
            ...styles.meetingPanel,
            ...(viewState === 'transitioning-to-meeting' ? styles.meetingPanelEntering : {}),
            ...(viewState === 'meeting' ? styles.meetingPanelActive : {}),
          }}>
            {/* 会议选项卡栏 */}
            <div style={styles.meetingTabBar}>
              <button
                style={{
                  ...styles.meetingTabBtn,
                  ...(meetingTab === 'chat' ? styles.meetingTabBtnActive : {}),
                }}
                onClick={() => setMeetingTab('chat')}
              >
                💬 会议
              </button>
              <button
                style={{
                  ...styles.meetingTabBtn,
                  ...(meetingTab === 'skills' ? styles.meetingTabBtnActive : {}),
                }}
                onClick={() => setMeetingTab('skills')}
              >
                🧬 技能进化
              </button>
              <button
                style={{
                  ...styles.meetingTabBtn,
                  ...(meetingTab === 'workspace' ? styles.meetingTabBtnActive : {}),
                }}
                onClick={() => setMeetingTab('workspace')}
              >
                💼 工作区
              </button>
            </div>

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
                <TaskAssignPanel
                  agents={agents}
                  taskInput={taskInput}
                  onTaskInputChange={setTaskInput}
                  onSendMessage={handleSendMessage}
                />
              </>
            ) : meetingTab === 'workspace' ? (
              <WorkspacePanel
                workspace={workspace}
                toolCallLogs={toolCallLogs}
                onToolCall={(name, args) => sendToolCall(name, args)}
                onDestroy={() => sendWorkspaceAction('destroy', workspace?.workspace_id)}
              />
            ) : (
              <SkillEvolutionDashboard />
            )}
          </div>
        )}

        {isOffice && chatMessages.length > 0 && (
          <MeetingLogPanel
            agents={agents}
            messages={chatMessages}
            tasks={tasks}
            viewState={viewState}
          />
        )}
      </div>

      {/* 工作流弹窗 - 对话触发后弹出 */}
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
  officePanel: {
    flex: 1,
    position: 'relative',
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  },
  officePanelMinimized: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    width: '280px',
    height: '200px',
    borderRadius: '16px',
    border: '2px solid rgba(139, 92, 246, 0.4)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    zIndex: 5,
    flex: 'none',
  },
  officePanelAnimating: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    width: '280px',
    height: '200px',
    borderRadius: '16px',
    border: '2px solid rgba(139, 92, 246, 0.4)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    zIndex: 5,
    flex: 'none',
  },
  officePanelExpanding: {
    flex: 1,
  },
  meetingPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    marginLeft: '300px',
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: 0,
    transform: 'translateX(20px)',
  },
  meetingPanelEntering: {
    opacity: 0,
    transform: 'translateX(20px)',
  },
  meetingPanelActive: {
    opacity: 1,
    transform: 'translateX(0)',
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
  approvalIcon: {
    fontSize: '14px',
  },
  approvalText: {
    color: '#fca5a5',
  },
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
  meetingTabBar: {
    display: 'flex',
    gap: '2px',
    padding: '4px 16px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  meetingTabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 14px',
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
}
