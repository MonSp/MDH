import React, { useState } from 'react'

interface WorkspaceType {
  id: string
  name: string
  desc: string
}

interface ExistingProject {
  path: string
  file_count: number
  files: string[]
  project_hints: string[]
}

interface WorkspaceConfirm {
  task_description: string
  options: { workspace_types: WorkspaceType[] }
  existing_project?: ExistingProject
}

interface WorkspaceConfirmPanelProps {
  confirm: WorkspaceConfirm
  onConfirm: (config: { wsType: string; wsRepoPath: string; wsBranchName: string; wsOutputDir: string }) => void
}

export default function WorkspaceConfirmPanel({ confirm, onConfirm }: WorkspaceConfirmPanelProps) {
  const [wsType, setWsType] = useState('standalone')
  const [wsRepoPath, setWsRepoPath] = useState('')
  const [wsBranchName, setWsBranchName] = useState('')
  const [wsOutputDir, setWsOutputDir] = useState('')

  return (
    <div>
      <div style={{ marginBottom: 10, fontWeight: 600 }}>
        {confirm.existing_project ? '⚠️ 目录已有内容' : '📁 工作区配置'}
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
        项目: {confirm.task_description}
      </div>

      {confirm.existing_project && (
        <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(245,158,11,0.1)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>
            目标目录: {confirm.existing_project.path}
          </div>
          <div style={{ fontSize: 11, color: '#d4a056' }}>
            已有 {confirm.existing_project.file_count} 个文件/目录
            {confirm.existing_project.project_hints.length > 0 &&
              ` · 检测到: ${confirm.existing_project.project_hints.join(', ')}`}
          </div>
          {confirm.existing_project.files.length > 0 && (
            <div style={{ fontSize: 10, color: '#92744c', marginTop: 4, fontFamily: 'monospace' }}>
              {confirm.existing_project.files.slice(0, 8).join(', ')}
              {confirm.existing_project.files.length > 8 && '...'}
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <label style={s.label}>
          {confirm.existing_project ? '请选择操作' : '工作区类型'}
        </label>
        <div style={s.optionGroup}>
          {confirm.options.workspace_types.map(wt => (
            <div
              key={wt.id}
              onClick={() => setWsType(wt.id)}
              style={{ ...s.option, ...(wsType === wt.id ? s.optionActive : {}) }}
            >
              <div style={{ fontWeight: 600, fontSize: 12 }}>{wt.name}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{wt.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {wsType === 'git_worktree' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={s.label}>仓库路径</label>
            <input style={s.input} value={wsRepoPath}
              onChange={e => setWsRepoPath(e.target.value)} placeholder="/path/to/repo" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={s.label}>分支名</label>
            <input style={s.input} value={wsBranchName}
              onChange={e => setWsBranchName(e.target.value)} placeholder="agent/task-xxx" />
          </div>
        </>
      )}

      {wsType === 'new_dir' && (
        <div style={{ marginBottom: 10 }}>
          <label style={s.label}>新目录路径</label>
          <input style={s.input} value={wsOutputDir}
            onChange={e => setWsOutputDir(e.target.value)} placeholder="请输入空目录路径" />
        </div>
      )}

      {!confirm.existing_project && (
        <div style={{ marginBottom: 10 }}>
          <label style={s.label}>输出目录</label>
          <input style={s.input} value={wsOutputDir}
            onChange={e => setWsOutputDir(e.target.value)} placeholder="留空使用默认目录" />
        </div>
      )}

      <button style={s.confirmBtn}
        onClick={() => onConfirm({ wsType, wsRepoPath, wsBranchName, wsOutputDir })}>
        ✅ 确认配置并继续
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  label: { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'block' },
  optionGroup: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 },
  option: {
    padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  },
  optionActive: {
    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)',
  },
  input: {
    width: '100%', padding: '6px 10px', borderRadius: 4,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0', fontSize: 12, outline: 'none', marginTop: 4,
  },
  confirmBtn: {
    width: '100%', padding: '8px', borderRadius: 6, cursor: 'pointer',
    background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)',
    color: '#10b981', fontSize: 13, fontWeight: 600,
  },
}
