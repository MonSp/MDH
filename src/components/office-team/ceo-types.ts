/**
 * CeoChatPanel 共享类型
 */

export interface CeoMessage {
  role: 'user' | 'ceo' | 'system' | 'agent'
  content: string
  timestamp: number
  agentId?: string
  agentName?: string
  _workspaceConfirm?: boolean
  _workspaceReq?: any
}

export interface WorkspaceConfirmRequest {
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

export type MeetingPhase =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'discussing'
  | 'assigning'
  | 'executing'
  | 'reviewing'
  | 'summarizing'
  | 'done'

export interface RoleInfo {
  id: string
  name: string
  description: string
  department?: string
}

export interface CeoChatPanelProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onEnterProject: (projectId: string, meetingId: string) => void
  onProjectCreated?: (projectId: string) => void
  onClose: () => void
}
