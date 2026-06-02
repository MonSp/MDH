import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { ViewState } from './office-team/types'
import { isOfficeView, isMeetingView } from './office-team/utils'
import OfficeHeader from './office-team/OfficeHeader'
import OfficeScene from './office-team/OfficeScene'
import MeetingChatPanel from './office-team/MeetingChatPanel'
import TaskAssignPanel from './office-team/TaskAssignPanel'
import MeetingLogPanel from './office-team/MeetingLogPanel'
import useMeetingSocket from '../hooks/useMeetingSocket'

interface OfficeTeamModeProps {
  wsRef: React.RefObject<WebSocket | null>
  onBackToSingle: () => void
  pendingApprovalCount?: number
  onOpenApproval?: () => void
}

export default function OfficeTeamMode({ wsRef, onBackToSingle, pendingApprovalCount = 0, onOpenApproval }: OfficeTeamModeProps) {
  const [taskInput, setTaskInput] = useState('')
  const [viewState, setViewState] = useState<ViewState>('office')
  const [agendaPhase, setAgendaPhase] = useState<string>('discussion')

  const {
    agents,
    tasks,
    chatMessages,
    isMeetingActive,
    startMeeting,
    sendMeetingMessage,
    assignTask,
    endMeeting,
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

  const handleEndMeeting = useCallback(() => {
    setViewState('transitioning-to-office')
    endMeeting()
    setTimeout(() => {
      setViewState('office')
    }, 1000)
  }, [endMeeting])

  const handleReset = useCallback(() => {
    setViewState('office')
    setTaskInput('')
  }, [])

  const handleAdvanceAgenda = useCallback(() => {
    sendMeetingMessage('[AGENDA] advance')
    const phases = ['idle', 'open_topic', 'discussion', 'proposal', 'voting', 'accepted']
    const idx = phases.indexOf(agendaPhase)
    if (idx >= 0 && idx < phases.length - 1) {
      setAgendaPhase(phases[idx + 1])
    }
  }, [agendaPhase, sendMeetingMessage])

  const handlePauseAgenda = useCallback(() => {
    sendMeetingMessage('[AGENDA] pause')
    setAgendaPhase('idle')
  }, [sendMeetingMessage])

  const handleEmergency = useCallback(() => {
    sendMeetingMessage('[AGENDA] emergency')
    setAgendaPhase('emergency')
  }, [sendMeetingMessage])

  const isOffice = isOfficeView(viewState)
  const isMeeting = isMeetingView(viewState)

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
            <MeetingChatPanel
              agents={agents}
              messages={chatMessages}
              onEndMeeting={handleEndMeeting}
              agendaPhase={agendaPhase}
            />
            <div style={styles.agendaControlBar}>
              <button style={styles.agendaBtn} onClick={handleAdvanceAgenda}>
                ⏭️ 推进议程
              </button>
              <button style={styles.agendaBtn} onClick={handlePauseAgenda}>
                ⏸️ 暂停
              </button>
              <button style={{
                ...styles.agendaBtn,
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                borderColor: 'rgba(239, 68, 68, 0.5)',
              }} onClick={handleEmergency}>
                🚨 紧急中断
              </button>
            </div>
            <TaskAssignPanel
              agents={agents}
              taskInput={taskInput}
              onTaskInputChange={setTaskInput}
              onSendMessage={handleSendMessage}
            />
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
  agendaControlBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 20px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  agendaBtn: {
    padding: '4px 10px',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#e2e8f0',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
}
