/**
 * useCeoCommunication — CEO 通信 hook
 *
 * 封装 CeoChatPanel 的 IPC/WS 通信逻辑。
 */

import { useCallback, useRef, useEffect } from 'react'
import { isElectron, getMdH, STORAGE_KEYS } from '../../constants'
import type { CeoMessage, WorkspaceConfirmRequest, MeetingPhase } from './ceo-types'

const isElectronMode = isElectron()

export interface CeoCommunicationOptions {
  wsRef: React.MutableRefObject<WebSocket | null>
  addMsg: (role: CeoMessage['role'], content: string, agentId?: string, agentName?: string) => void
  setIsProcessing: (v: boolean) => void
  setMeetingPhase: (phase: MeetingPhase) => void
  setProjectReady: (v: { projectId: string; meetingId: string } | null) => void
  setWorkspaceConfirm: (req: WorkspaceConfirmRequest | null) => void
  setWsType: (v: string) => void
  setWsRepoPath: (v: string) => void
  setWsOutputDir: (v: string) => void
  setWsBranchName: (v: string) => void
  setMeetingStartTime: (v: number | null) => void
  onProjectCreated?: (projectId: string) => void
  onEnterProject?: (projectId: string, meetingId: string) => void
}

export function useCeoCommunication(options: CeoCommunicationOptions) {
  const {
    wsRef, addMsg, setIsProcessing, setMeetingPhase, setProjectReady,
    setWorkspaceConfirm, setWsType, setWsRepoPath, setWsOutputDir,
    setWsBranchName, setMeetingStartTime, onProjectCreated,
  } = options

  const listenerCleanupRef = useRef<(() => void) | null>(null)

  const sendToBackend = useCallback((content: string, selectedRoles: string[], roleLocations: Record<string, 'local' | 'remote'>, autoMode: boolean, executionPreference?: string) => {
    setIsProcessing(true)

    // Electron IPC 模式
    if (isElectronMode) {
      const mdh = getMdH()!
      mdh.invoke('mdh:sendCeoMessage', { content }).then((result: any) => {
        if (result.error) {
          addMsg('system', `❌ ${result.error}`)
          setIsProcessing(false)
          return
        }
        // 处理 agent 消息
        if (result.messages) {
          for (const msg of result.messages) {
            const agentId = msg.agentId || ''
            const agentName = msg.agentName || agentId.replace('agent-', '')
            if (agentId === 'agent-ceo') {
              addMsg('ceo', msg.content)
            } else if (agentId.startsWith('agent-')) {
              addMsg('agent', msg.content, agentId, agentName)
            }
          }
        }
        setIsProcessing(false)
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

        // 仅处理 CeoChatPanel 特有的消息类型
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
        } else if (t === 'complexity_result') {
          const level = msg.level === 'simple' ? '简单任务' : '复杂任务'
          addMsg('system', `📊 任务分析：${level}（置信度 ${Math.round((msg.confidence || 0) * 100)}%）`)
        } else if (t === 'workspace_confirm_request') {
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
        } else if (t === 'path_selected') {
          addMsg('system', `📊 执行路径：${msg.path}`)
        } else if (t === 'path_upgrade') {
          addMsg('system', `⬆️ 路径升级：${msg.from} → ${msg.to}`)
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
      execution_preference: executionPreference || 'auto',
      provider: localStorage.getItem(STORAGE_KEYS.PROVIDER) || undefined,
      model_name: localStorage.getItem(STORAGE_KEYS.MODEL_NAME) || undefined,
      api_key: localStorage.getItem(STORAGE_KEYS.API_KEY) || undefined,
      base_url: localStorage.getItem(STORAGE_KEYS.BASE_URL) || undefined,
    }))
  }, [wsRef, addMsg, setIsProcessing, setMeetingPhase, setProjectReady, setWorkspaceConfirm, setWsType, setWsRepoPath, setWsOutputDir, setWsBranchName, setMeetingStartTime, onProjectCreated])

  const sendWorkspaceConfirm = useCallback((confirmData: any) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'workspace_confirm_response',
        ...confirmData,
      }))
    }
  }, [wsRef])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listenerCleanupRef.current?.()
    }
  }, [])

  return {
    sendToBackend,
    sendWorkspaceConfirm,
  }
}
