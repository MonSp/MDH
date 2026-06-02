import { useState, useCallback, useEffect, useRef } from 'react'
import type { MeetingAgentInfo, MeetingSummary } from '../modules/meetingProtocol'
import type { TeamAgent, Task, ChatMessage } from '../components/office-team/types'
import { AgentRole } from '../modules/agentTypes'

const WORKSTATION_MAP: Record<string, string> = {
  'agent-ceo': 'ws-0',
  'agent-planner': 'ws-1',
  'agent-executor': 'ws-2',
  'agent-monitor': 'ws-3',
  'agent-reviewer': 'ws-4',
  'agent-coordinator': 'ws-5',
}

const MAX_RECONNECT_ATTEMPTS = 5

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

function mapAgentToTeamAgent(agent: MeetingAgentInfo): TeamAgent {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role as AgentRole,
    status: 'meeting',
    currentTask: null,
    workstationId: WORKSTATION_MAP[agent.id] ?? 'ws-1',
  }
}

export default function useMeetingSocket({
  wsRef,
  url,
}: {
  wsRef: React.RefObject<WebSocket | null>
  url?: string
}) {
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [agents, setAgents] = useState<TeamAgent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isMeetingActive, setIsMeetingActive] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')

  const pendingMessages = useRef<Map<string, string>>(new Map())
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSequenceNo = useRef(-1)

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [wsRef])

  const startMeeting = useCallback(() => {
    send({ type: 'start_meeting' })
  }, [send])

  const sendMeetingMessage = useCallback((content: string) => {
    send({ type: 'meeting_message', content })
  }, [send])

  const assignTask = useCallback((agentId: string, description: string) => {
    send({ type: 'task_assign', agentId, description })
  }, [send])

  const endMeeting = useCallback(() => {
    send({ type: 'end_meeting' })
  }, [send])

  const createReconnectSocket = useCallback(() => {
    if (!url) return

    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {}
    }

    setConnectionState('connecting')
    const newWs = new WebSocket(url)
    wsRef.current = newWs

    const handleOpen = () => {
      setConnectionState('connected')
      reconnectAttempts.current = 0
      lastSequenceNo.current = -1
    }

    const handleClose = () => {
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        setConnectionState('reconnecting')
        reconnectTimer.current = setTimeout(() => {
          createReconnectSocket()
        }, delay)
      } else {
        setConnectionState('disconnected')
      }
    }

    const handleError = () => {
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        setConnectionState('reconnecting')
        reconnectTimer.current = setTimeout(() => {
          createReconnectSocket()
        }, delay)
      } else {
        setConnectionState('disconnected')
      }
    }

    newWs.addEventListener('open', handleOpen)
    newWs.addEventListener('close', handleClose)
    newWs.addEventListener('error', handleError)
  }, [url, wsRef])

  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return

    const handleMessage = (event: MessageEvent) => {
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.sequenceNo !== undefined) {
        if (msg.sequenceNo > lastSequenceNo.current + 1) {
          send({
            type: 'request_retransmit',
            fromSequenceNo: lastSequenceNo.current + 1,
          })
        }
        lastSequenceNo.current = msg.sequenceNo
      }

      switch (msg.type) {
        case 'meeting_started': {
          setMeetingId(msg.meetingId)
          setAgents(msg.agents.map(mapAgentToTeamAgent))
          setTasks([])
          setChatMessages([])
          setIsMeetingActive(true)
          pendingMessages.current.clear()
          setChatMessages([{
            role: 'boss',
            content: '会议已开始',
            timestamp: Date.now(),
          }])
          break
        }
        case 'agent_message': {
          if (msg.delta) {
            const existing = pendingMessages.current.get(msg.agentId) ?? ''
            const accumulated = existing + msg.delta
            pendingMessages.current.set(msg.agentId, accumulated)
            setChatMessages(prev => {
              const idx = [...prev].reverse().findIndex(
                m => m.role === 'agent' && m.agentId === msg.agentId && (m as any)._streaming
              )
              if (idx !== -1) {
                const actualIdx = prev.length - 1 - idx
                const updated = [...prev]
                updated[actualIdx] = {
                  ...updated[actualIdx],
                  content: accumulated,
                }
                return updated
              }
              return [...prev, {
                role: 'agent' as const,
                agentId: msg.agentId,
                content: accumulated,
                timestamp: Date.now(),
                _streaming: true,
              } as ChatMessage & { _streaming?: boolean }]
            })
          } else {
            pendingMessages.current.delete(msg.agentId)
            setChatMessages(prev => {
              const filtered = prev.filter(
                m => !(m.role === 'agent' && m.agentId === msg.agentId && (m as any)._streaming)
              )
              return [...filtered, {
                role: 'agent' as const,
                agentId: msg.agentId,
                content: msg.content,
                timestamp: Date.now(),
              }]
            })
          }
          break
        }
        case 'task_assigned': {
          const newTask: Task = {
            id: msg.taskId,
            agentId: msg.agentId,
            description: '',
            status: msg.status,
            createdAt: Date.now(),
          }
          setTasks(prev => [...prev, newTask])
          setAgents(prev => prev.map(a =>
            a.id === msg.agentId ? { ...a, currentTask: msg.taskId } : a
          ))
          break
        }
        case 'agent_status_update': {
          setAgents(prev => prev.map(a =>
            a.id === msg.agentId
              ? { ...a, status: msg.status, currentTask: msg.currentTask ?? a.currentTask }
              : a
          ))
          break
        }
        case 'meeting_ended': {
          setIsMeetingActive(false)
          setChatMessages(prev => [...prev, {
            role: 'boss' as const,
            content: '会议已结束',
            timestamp: Date.now(),
          }])
          break
        }
        case 'meeting_error': {
          setChatMessages(prev => [...prev, {
            role: 'boss' as const,
            content: `会议错误：${msg.message}`,
            timestamp: Date.now(),
          }])
          break
        }
        case 'semantic_analysis_result': {
          setChatMessages(prev => [...prev, {
            role: 'ceo' as const,
            agentId: 'agent-ceo',
            content: msg.analysisResult,
            timestamp: Date.now(),
          }])
          break
        }
        case 'task_auto_assigned': {
          setChatMessages(prev => [...prev, {
            role: 'ceo' as const,
            agentId: 'agent-ceo',
            content: `任务已自动指派给 ${msg.agentId}：${msg.description}`,
            timestamp: Date.now(),
          }])
          const autoTask: Task = {
            id: msg.taskId,
            agentId: msg.agentId,
            description: msg.description,
            status: msg.status,
            createdAt: Date.now(),
          }
          setTasks(prev => [...prev, autoTask])
          break
        }
      }
    }

    ws.addEventListener('message', handleMessage)
    return () => {
      ws.removeEventListener('message', handleMessage)
    }
  }, [wsRef, send])

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
    }
  }, [])

  return {
    meetingId,
    agents,
    tasks,
    chatMessages,
    isMeetingActive,
    connectionState,
    startMeeting,
    sendMeetingMessage,
    assignTask,
    endMeeting,
  }
}
