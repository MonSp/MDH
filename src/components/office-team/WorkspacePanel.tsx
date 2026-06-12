import React, { useState } from 'react'

interface Workspace {
  workspace_id: string
  task_id: string
  workspace_type: string
  root_path: string
  branch_name?: string
}

interface ToolCallLog {
  tool_name: string
  arguments: Record<string, unknown>
  success: boolean
  output?: string
  error?: string
  timestamp: string
}

interface WorkspacePanelProps {
  workspace: Workspace | null
  toolCallLogs: ToolCallLog[]
  onToolCall: (toolName: string, arguments: Record<string, unknown>) => void
  onDestroy: () => void
}

export default function WorkspacePanel({
  workspace,
  toolCallLogs,
  onToolCall,
  onDestroy,
}: WorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'files' | 'logs'>('info')

  if (!workspace) {
    return (
      <div style={{ padding: 16, color: '#8e8e93' }}>
        暂无工作区
      </div>
    )
  }

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'rgba(0,0,0,0.3)',
      borderRadius: 8,
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#00eeff', fontWeight: 600 }}>
          工作区
        </span>
        <button
          onClick={onDestroy}
          style={{
            padding: '4px 8px',
            background: 'rgba(255,59,48,0.2)',
            border: '1px solid rgba(255,59,48,0.5)',
            borderRadius: 4,
            color: '#ff3b30',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          销毁
        </button>
      </div>

      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        {(['info', 'files', 'logs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: activeTab === tab ? 'rgba(0,238,255,0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #00eeff' : '2px solid transparent',
              color: activeTab === tab ? '#00eeff' : '#8e8e93',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {tab === 'info' ? '信息' : tab === 'files' ? '文件' : '日志'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'info' && (
          <div style={{ color: '#fff', fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8e8e93' }}>ID: </span>
              {workspace.workspace_id}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8e8e93' }}>类型: </span>
              {workspace.workspace_type}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8e8e93' }}>路径: </span>
              <span style={{ wordBreak: 'break-all' }}>{workspace.root_path}</span>
            </div>
            {workspace.branch_name && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#8e8e93' }}>分支: </span>
                <span style={{ color: '#30d158' }}>{workspace.branch_name}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div style={{ color: '#8e8e93', fontSize: 13 }}>
            文件浏览器（待实现）
          </div>
        )}

        {activeTab === 'logs' && (
          <div style={{ fontSize: 12 }}>
            {toolCallLogs.length === 0 ? (
              <div style={{ color: '#8e8e93' }}>暂无工具调用记录</div>
            ) : (
              toolCallLogs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ 
                    color: log.success ? '#30d158' : '#ff3b30',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}>
                    {log.tool_name}
                  </div>
                  <pre style={{ 
                    margin: 0,
                    color: '#8e8e93',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {log.success ? log.output : log.error}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
