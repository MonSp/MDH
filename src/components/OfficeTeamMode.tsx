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
}

export default function OfficeTeamMode({ wsRef, onBackToSingle }: OfficeTeamModeProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [viewState, setViewState] = useState<ViewState>('office')

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

  const handleAssignTask = useCallback(() => {
    if (!selectedAgentId || !taskInput.trim()) return
    assignTask(selectedAgentId, taskInput.trim())
    setTaskInput('')
    setSelectedAgentId(null)
  }, [selectedAgentId, taskInput, assignTask])

  const handleEndMeeting = useCallback(() => {
    setViewState('transitioning-to-office')
    endMeeting()
    setTimeout(() => {
      setViewState('office')
    }, 1000)
  }, [endMeeting])

  const handleReset = useCallback(() => {
    setViewState('office')
    setSelectedAgentId(null)
    setTaskInput('')
  }, [])

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
            />
            <TaskAssignPanel
              agents={agents}
              selectedAgentId={selectedAgentId}
              taskInput={taskInput}
              onSelectAgent={setSelectedAgentId}
              onTaskInputChange={setTaskInput}
              onAssignTask={handleAssignTask}
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
}
