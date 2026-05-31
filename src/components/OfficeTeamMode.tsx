import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { TeamAgent, Task, ChatMessage, ViewState } from './office-team/types'
import { AGENT_CONFIGS } from './office-team/constants'
import { isOfficeView, isMeetingView } from './office-team/utils'
import OfficeHeader from './office-team/OfficeHeader'
import OfficeScene from './office-team/OfficeScene'
import MeetingChatPanel from './office-team/MeetingChatPanel'
import TaskAssignPanel from './office-team/TaskAssignPanel'
import MeetingLogPanel from './office-team/MeetingLogPanel'

interface OfficeTeamModeProps {
  wsRef: React.RefObject<WebSocket | null>
  onBackToSingle: () => void
}

export default function OfficeTeamMode({ wsRef, onBackToSingle }: OfficeTeamModeProps) {
  const [agents, setAgents] = useState<TeamAgent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [viewState, setViewState] = useState<ViewState>('office')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const wanderIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    const initialAgents: TeamAgent[] = AGENT_CONFIGS.map(config => ({
      id: config.id,
      name: config.name,
      role: config.role,
      status: 'idle',
      currentTask: null,
      workstationId: config.workstationId,
      wanderAngle: Math.random() * Math.PI * 2,
    }))
    setAgents(initialAgents)
  }, [])

  useEffect(() => {
    if (viewState === 'office') {
      wanderIntervalRef.current = window.setInterval(() => {
        setAgents(prev => prev.map(agent => {
          if (agent.status === 'idle') {
            return {
              ...agent,
              wanderAngle: (agent.wanderAngle || 0) + 0.05,
              status: 'wandering',
            }
          }
          return agent
        }))
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
  }, [viewState])

  const addMessage = useCallback((role: 'boss' | 'agent', content: string, agentId?: string) => {
    setChatMessages(prev => [...prev, { role, agentId, content, timestamp: Date.now() }])
  }, [])

  const handleStartMeeting = useCallback(() => {
    setViewState('transitioning-to-meeting')

    setAgents(prev => prev.map(agent => ({
      ...agent,
      status: 'meeting' as const,
    })))

    addMessage('boss', '各位，请到会议桌集合，我们有新任务要讨论。')

    setTimeout(() => addMessage('agent', '收到，马上到！', 'agent-planner'), 400)
    setTimeout(() => addMessage('agent', '好的，正在前往会议桌。', 'agent-executor'), 700)
    setTimeout(() => addMessage('agent', '全员到齐，请老板指示。', 'agent-coordinator'), 1000)

    setTimeout(() => {
      setViewState('meeting')
    }, 1200)
  }, [addMessage])

  const handleAssignTask = useCallback(() => {
    if (!selectedAgentId || !taskInput.trim()) return

    const agent = agents.find(a => a.id === selectedAgentId)
    if (!agent) return

    const newTask: Task = {
      id: 'task-' + Date.now().toString(36),
      agentId: selectedAgentId,
      description: taskInput.trim(),
      status: 'assigned',
      createdAt: Date.now(),
    }

    setTasks(prev => [...prev, newTask])
    setAgents(prev => prev.map(a =>
      a.id === selectedAgentId ? { ...a, currentTask: newTask.id } : a
    ))

    addMessage('boss', `${agent.name}，请负责：${taskInput.trim()}`)
    addMessage('agent', '收到！我会尽快完成。', selectedAgentId)

    setTaskInput('')
    setSelectedAgentId(null)
  }, [selectedAgentId, taskInput, agents, addMessage])

  const handleEndMeeting = useCallback(() => {
    setViewState('transitioning-to-office')

    setAgents(prev => prev.map(agent => ({
      ...agent,
      status: agent.currentTask ? 'working' as const : 'idle' as const,
    })))

    setTasks(prev => prev.map(t =>
      t.status === 'assigned' ? { ...t, status: 'executing' as const } : t
    ))

    addMessage('boss', '好的，任务已分配完毕，大家回去开始工作吧！')

    setTimeout(() => {
      setViewState('office')
      addMessage('agent', '已回到工位，开始执行任务。', 'agent-executor')
    }, 1000)
  }, [addMessage])

  const handleCompleteTask = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'completed' as const } : t
    ))
    setAgents(prev => prev.map(a =>
      a.currentTask === taskId ? { ...a, currentTask: null, status: 'idle' as const } : a
    ))

    addMessage('agent', `任务已完成：${task.description}`, task.agentId)
  }, [tasks, addMessage])

  const handleReset = useCallback(() => {
    setViewState('office')
    setTasks([])
    setSelectedAgentId(null)
    setTaskInput('')
    setChatMessages([])
    setAgents(prev => prev.map(agent => ({
      ...agent,
      status: 'idle' as const,
      currentTask: null,
    })))
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
