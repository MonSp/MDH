import React, { useState, useMemo } from 'react'

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

interface ChatMessage {
  role: string
  agentId?: string
  content: string
  timestamp: number
}

interface WorkspacePanelProps {
  workspace: Workspace | null
  toolCallLogs: ToolCallLog[]
  onToolCall: (toolName: string, args: Record<string, unknown>) => void
  onDestroy: () => void
  messages?: ChatMessage[]
}

interface FileEntry {
  path: string
  size: number
  agent: string
}

export default function WorkspacePanel({
  workspace,
  toolCallLogs,
  onToolCall,
  onDestroy,
  messages = [],
}: WorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<'files' | 'info' | 'logs'>('files')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // 从消息中提取已写入的文件
  const writtenFiles = useMemo(() => {
    const files: FileEntry[] = []
    const seen = new Set<string>()
    for (const msg of messages) {
      // 匹配 "[写入文件] path (N字符)" 格式
      const writeMatch = msg.content.match(/\[写入文件\]\s*(.+?)\s*\((\d+)\s*字符\)/)
      if (writeMatch) {
        const paths = writeMatch[1].split(',').map(s => s.trim())
        for (const p of paths) {
          if (!seen.has(p)) {
            seen.add(p)
            files.push({ path: p, size: parseInt(writeMatch[2]) || 0, agent: msg.agentId || '' })
          }
        }
      }
      // 匹配 "已写入 N 个文件: path1, path2" 格式
      const writtenMatch = msg.content.match(/已写入\s*\d+\s*个文件[：:]\s*(.+)/)
      if (writtenMatch) {
        const paths = writtenMatch[1].split(',').map(s => s.trim())
        for (const p of paths) {
          if (!seen.has(p)) {
            seen.add(p)
            files.push({ path: p, size: 0, agent: msg.agentId || '' })
          }
        }
      }
    }
    return files
  }, [messages])

  // 从消息中提取文件内容预览
  const fileContents = useMemo(() => {
    const contents: Record<string, string> = {}
    for (const msg of messages) {
      // 匹配代码块: ```path\ncontent\n```
      const codeBlockRegex = /```([^\n`]+(?:\.[^\n`]+)?)\n([\s\S]*?)```/g
      let match
      while ((match = codeBlockRegex.exec(msg.content)) !== null) {
        const filename = match[1].trim()
        const content = match[2].trim()
        if (filename.includes('/') || filename.includes('\\') || filename.includes('.')) {
          contents[filename] = content
        }
      }
    }
    return contents
  }, [messages])

  if (!workspace) {
    return (
      <div style={{ padding: 24, color: '#6b7280', textAlign: 'center', fontSize: 13 }}>
        暂无工作区
      </div>
    )
  }

  const renderFiles = () => {
    // 按文件类型分组
    const groupedFiles = writtenFiles.reduce((acc, f) => {
      const ext = f.path.split('.').pop()?.toLowerCase() || 'other'
      const type = 
        ['py'].includes(ext) ? '🐍 Python' :
        ['js', 'ts', 'tsx', 'jsx'].includes(ext) ? '📜 JavaScript/TypeScript' :
        ['html', 'htm'].includes(ext) ? '🌐 HTML' :
        ['css', 'scss', 'less'].includes(ext) ? '🎨 CSS' :
        ['json', 'yaml', 'yml', 'toml'].includes(ext) ? '📋 配置文件' :
        ['md', 'txt'].includes(ext) ? '📝 文档' : '📁 其他'
      if (!acc[type]) acc[type] = []
      acc[type].push(f)
      return acc
    }, {} as Record<string, typeof writtenFiles>)

    const totalSize = writtenFiles.reduce((sum, f) => sum + f.size, 0)

    return (
      <div style={{ flex: 1, overflow: 'auto' }}>
        {writtenFiles.length === 0 ? (
          <div style={{ padding: 24, color: '#6b7280', textAlign: 'center', fontSize: 13 }}>
            暂无写入的文件
          </div>
        ) : (
          <div>
            {/* 文件统计 */}
            <div style={{
              padding: '10px 12px',
              background: 'rgba(139, 92, 246, 0.08)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#9ca3af',
            }}>
              <span>📄 {writtenFiles.length} 个文件</span>
              <span>💾 {totalSize > 1024 ? `${(totalSize / 1024).toFixed(1)} KB` : `${totalSize} 字符`}</span>
            </div>

            {/* 按类型分组显示 */}
            {Object.entries(groupedFiles).map(([type, files]) => (
              <div key={type}>
                <div style={{
                  padding: '6px 12px',
                  background: 'rgba(0,0,0,0.15)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#8b5cf6',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {type} ({files.length})
                </div>
                {files.map((f, i) => {
                  const isSelected = selectedFile === f.path
                  const hasPreview = !!fileContents[f.path]
                  return (
                    <div key={i}>
                      <div
                        onClick={() => setSelectedFile(isSelected ? null : f.path)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px 8px 24px',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                          borderLeft: isSelected ? '2px solid #8b5cf6' : '2px solid transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace' }}>
                          {f.path.split('/').pop() || f.path}
                        </span>
                        {f.size > 0 && (
                          <span style={{ fontSize: 10, color: '#6b7280', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            {f.size > 1024 ? `${(f.size / 1024).toFixed(1)}K` : `${f.size}字`}
                          </span>
                        )}
                        {hasPreview && (
                          <span style={{ fontSize: 10, color: '#8b5cf6', padding: '2px 6px', background: 'rgba(139,92,246,0.15)', borderRadius: 4 }}>
                            预览
                          </span>
                        )}
                      </div>
                      {isSelected && fileContents[f.path] && (
                        <pre style={{
                          margin: 0,
                          padding: '8px 12px 8px 36px',
                          fontSize: 11,
                          lineHeight: 1.5,
                          color: '#d1d5db',
                          background: 'rgba(0,0,0,0.25)',
                          maxHeight: 300,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                          borderLeft: '2px solid rgba(139,92,246,0.3)',
                        }}>
                          {fileContents[f.path].length > 2000
                            ? fileContents[f.path].slice(0, 2000) + '\n... (截断)'
                            : fileContents[f.path]}
                        </pre>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderInfo = () => (
    <div style={{ padding: 16, fontSize: 13 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>工作区ID</div>
        <div style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{workspace.workspace_id}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>类型</div>
        <div style={{ color: '#e2e8f0' }}>{workspace.workspace_type}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>路径</div>
        <div style={{ color: '#e2e8f0', fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 12 }}>{workspace.root_path}</div>
      </div>
      {workspace.branch_name && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>分支</div>
          <div style={{ color: '#10b981', fontFamily: 'monospace' }}>{workspace.branch_name}</div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>已写入文件</div>
        <div style={{ color: '#e2e8f0' }}>{writtenFiles.length} 个</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>工具调用</div>
        <div style={{ color: '#e2e8f0' }}>{toolCallLogs.length} 次</div>
      </div>
    </div>
  )

  const renderLogs = () => (
    <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
      {toolCallLogs.length === 0 ? (
        <div style={{ color: '#6b7280', textAlign: 'center', fontSize: 13, padding: 24 }}>
          暂无工具调用记录
        </div>
      ) : (
        toolCallLogs.map((log, i) => (
          <div key={i} style={{
            marginBottom: 8,
            padding: 10,
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 6,
            border: `1px solid ${log.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}>
              <span style={{
                color: log.success ? '#10b981' : '#ef4444',
                fontWeight: 600,
                fontSize: 12,
              }}>
                {log.success ? '✓' : '✗'} {log.tool_name}
              </span>
              <span style={{ fontSize: 10, color: '#6b7280' }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {(log.output || log.error) && (
              <pre style={{
                margin: 0,
                fontSize: 11,
                color: '#9ca3af',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 100,
                overflow: 'auto',
              }}>
                {log.success ? log.output : log.error}
              </pre>
            )}
          </div>
        ))
      )}
    </div>
  )

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(0,0,0,0.2)',
    }}>
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.15)',
      }}>
        {([['files', '📄 文件'], ['info', 'ℹ️ 信息'], ['logs', '📋 日志']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: activeTab === key ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid #8b5cf6' : '2px solid transparent',
              color: activeTab === key ? '#a78bfa' : '#6b7280',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: activeTab === key ? 600 : 400,
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'files' && renderFiles()}
      {activeTab === 'info' && renderInfo()}
      {activeTab === 'logs' && renderLogs()}
    </div>
  )
}
