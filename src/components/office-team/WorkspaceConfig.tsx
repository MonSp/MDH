/**
 * WorkspaceConfig — 工作区配置组件
 *
 * 从 CeoChatPanel 提取的工作区配置逻辑。
 */

import React from 'react'

interface WorkspaceConfirmRequest {
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

interface WorkspaceConfigProps {
  request: WorkspaceConfirmRequest
  wsType: string
  wsRepoPath: string
  wsBranchName: string
  wsOutputDir: string
  onTypeChange: (v: string) => void
  onRepoPathChange: (v: string) => void
  onBranchNameChange: (v: string) => void
  onOutputDirChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export default function WorkspaceConfig({
  request,
  wsType,
  wsRepoPath,
  wsBranchName,
  wsOutputDir,
  onTypeChange,
  onRepoPathChange,
  onBranchNameChange,
  onOutputDirChange,
  onConfirm,
  onCancel,
}: WorkspaceConfigProps) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>📁</span>
        <span style={styles.title}>工作区配置</span>
      </div>

      <div style={styles.content}>
        <div style={styles.field}>
          <label style={styles.label}>类型</label>
          <select style={styles.select} value={wsType} onChange={e => onTypeChange(e.target.value)}>
            <option value="standalone">独立工作区</option>
            <option value="git_worktree">Git Worktree</option>
            {request.existing_project && <option value="continue">继续已有项目</option>}
          </select>
        </div>

        {wsType === 'git_worktree' && (
          <>
            <div style={styles.field}>
              <label style={styles.label}>仓库路径</label>
              <input
                style={styles.input}
                value={wsRepoPath}
                onChange={e => onRepoPathChange(e.target.value)}
                placeholder="/path/to/repo"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>分支名</label>
              <input
                style={styles.input}
                value={wsBranchName}
                onChange={e => onBranchNameChange(e.target.value)}
                placeholder="feature/my-task"
              />
            </div>
          </>
        )}

        <div style={styles.field}>
          <label style={styles.label}>输出目录</label>
          <input
            style={styles.input}
            value={wsOutputDir}
            onChange={e => onOutputDirChange(e.target.value)}
            placeholder={request.options.default_output_dir}
          />
        </div>

        {request.existing_project && (
          <div style={styles.existingInfo}>
            <div style={styles.infoTitle}>已有项目信息</div>
            <div style={styles.infoItem}>路径: {request.existing_project.path}</div>
            <div style={styles.infoItem}>文件数: {request.existing_project.file_count}</div>
            <div style={styles.infoItem}>Git: {request.existing_project.has_git ? '是' : '否'}</div>
          </div>
        )}
      </div>

      <div style={styles.actions}>
        <button style={styles.confirmBtn} onClick={onConfirm}>确认</button>
        <button style={styles.cancelBtn} onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: 'rgba(59, 130, 246, 0.1)',
    borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
  },
  icon: {
    fontSize: '16px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  content: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  input: {
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
  },
  select: {
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
  },
  existingInfo: {
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  infoTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: '8px',
  },
  infoItem: {
    fontSize: '12px',
    color: '#e2e8f0',
    marginBottom: '4px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  confirmBtn: {
    padding: '8px 24px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '8px 24px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#94a3b8',
    fontSize: '13px',
    cursor: 'pointer',
  },
}
