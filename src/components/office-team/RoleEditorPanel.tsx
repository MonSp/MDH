import React, { useState, useEffect, useCallback } from 'react'

interface RoleConfig {
  name: string
  description?: string
  permissions?: { tools: string[]; dangerous_tools?: string[] }
  skills?: string[]
  system_prompt?: string
}

interface RoleEditorPanelProps {
  wsRef: React.MutableRefObject<WebSocket | null>
}

export default function RoleEditorPanel({ wsRef }: RoleEditorPanelProps) {
  const [roles, setRoles] = useState<Record<string, RoleConfig>>({})
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTools, setEditTools] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [isNew, setIsNew] = useState(false)

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/roles/config')
      const data = await res.json()
      if (data.base_roles || data.custom_roles) {
        setRoles({ ...(data.base_roles || {}), ...(data.custom_roles || {}) })
      }
    } catch (e) {
      console.error('Failed to fetch roles:', e)
    }
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  const selectRole = (roleId: string) => {
    setSelectedRole(roleId)
    setIsNew(false)
    const role = roles[roleId]
    if (role) {
      setEditName(role.name || '')
      setEditDesc(role.description || '')
      setEditTools(role.permissions?.tools?.join(', ') || '')
      setEditPrompt(role.system_prompt || '')
    }
  }

  const startNew = () => {
    setSelectedRole(null)
    setIsNew(true)
    setEditName('')
    setEditDesc('')
    setEditTools('')
    setEditPrompt('')
  }

  const saveRole = async () => {
    const roleId = isNew ? editName.toLowerCase().replace(/\s+/g, '_') : selectedRole
    if (!roleId) return

    const payload = {
      name: editName,
      description: editDesc,
      permissions: { tools: editTools.split(',').map(t => t.trim()).filter(Boolean) },
      system_prompt: editPrompt,
    }

    const method = isNew ? 'POST' : 'PUT'
    await fetch(`/api/roles/${roleId}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    await fetchRoles()
    setSelectedRole(roleId)
    setIsNew(false)
  }

  const deleteRole = async () => {
    if (!selectedRole) return
    await fetch(`/api/roles/${selectedRole}`, { method: 'DELETE' })
    setSelectedRole(null)
    await fetchRoles()
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>角色模板</span>
        <button style={styles.newBtn} onClick={startNew}>+ 新建</button>
      </div>

      <div style={styles.body}>
        {/* 角色列表 */}
        <div style={styles.roleList}>
          {Object.entries(roles).map(([id, role]) => (
            <div
              key={id}
              style={{
                ...styles.roleItem,
                ...(selectedRole === id ? styles.roleItemSelected : {}),
              }}
              onClick={() => selectRole(id)}
            >
              <span style={styles.roleName}>{role.name || id}</span>
              <span style={styles.roleId}>{id}</span>
            </div>
          ))}
        </div>

        {/* 编辑区域 */}
        {selectedRole || isNew ? (
          <div style={styles.editor}>
            <div style={styles.field}>
              <label style={styles.label}>名称</label>
              <input style={styles.input} value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>描述</label>
              <input style={styles.input} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>工具（逗号分隔）</label>
              <input style={styles.input} value={editTools} onChange={e => setEditTools(e.target.value)} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>系统提示词</label>
              <textarea
                style={styles.textarea}
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                rows={6}
              />
            </div>
            <div style={styles.actions}>
              <button style={styles.saveBtn} onClick={saveRole}>
                {isNew ? '创建' : '保存'}
              </button>
              {!isNew && (
                <button style={styles.deleteBtn} onClick={deleteRole}>删除</button>
              )}
            </div>
          </div>
        ) : (
          <div style={styles.empty}>选择一个角色进行编辑</div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
    background: 'rgba(15,23,42,0.6)', borderRadius: '8px',
    border: '1px solid rgba(139,92,246,0.2)', maxHeight: '400px',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
  newBtn: {
    padding: '4px 10px', background: 'rgba(34,197,94,0.2)',
    border: '1px solid rgba(34,197,94,0.4)', borderRadius: '4px',
    color: '#22c55e', fontSize: '11px', cursor: 'pointer',
  },
  body: { display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' },
  roleList: {
    width: '120px', display: 'flex', flexDirection: 'column', gap: '2px',
    overflow: 'auto', flexShrink: 0,
  },
  roleItem: {
    padding: '6px 8px', borderRadius: '4px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
  },
  roleItemSelected: {
    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)',
  },
  roleName: { fontSize: '12px', color: '#e2e8f0', display: 'block' },
  roleId: { fontSize: '10px', color: '#6b7280' },
  editor: { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'auto' },
  field: { display: 'flex', flexDirection: 'column', gap: '2px' },
  label: { fontSize: '11px', color: '#94a3b8', fontWeight: 600 },
  input: {
    padding: '6px 8px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '12px', outline: 'none',
  },
  textarea: {
    padding: '6px 8px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '12px', outline: 'none', resize: 'vertical' as const,
    fontFamily: 'monospace',
  },
  actions: { display: 'flex', gap: '8px', marginTop: '4px' },
  saveBtn: {
    padding: '6px 16px', background: 'rgba(59,130,246,0.2)',
    border: '1px solid rgba(59,130,246,0.4)', borderRadius: '4px',
    color: '#3b82f6', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  },
  deleteBtn: {
    padding: '6px 16px', background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px',
    color: '#ef4444', fontSize: '12px', cursor: 'pointer',
  },
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', color: '#6b7280',
  },
}
