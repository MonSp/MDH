import React, { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '../../services/apiFetch'

interface RoleConfig {
  name: string
  description: string
  base_role?: string
  extra_tools?: string[]
  extra_skills?: string[]
  custom_prompt?: string
}

interface RoleManagerProps {
  onRolesLoaded?: (roles: Record<string, RoleConfig>, customRoles: Record<string, RoleConfig>) => void
}

export default function RoleManager({ onRolesLoaded }: RoleManagerProps) {
  const [roles, setRoles] = useState<Record<string, RoleConfig>>({})
  const [customRoles, setCustomRoles] = useState<Record<string, RoleConfig>>({})
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<RoleConfig>({ name: '', description: '' })
  const [showNewRole, setShowNewRole] = useState(false)
  const [newRoleForm, setNewRoleForm] = useState<RoleConfig>({
    name: '', description: '', base_role: 'executor', extra_tools: [], extra_skills: [], custom_prompt: ''
  })
  const [loading, setLoading] = useState(false)

  const loadRolesConfig = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<{ base_roles?: Record<string, RoleConfig>; custom_roles?: Record<string, RoleConfig> }>('/api/roles/config')
      if (data) {
        setRoles(data.base_roles || {})
        setCustomRoles(data.custom_roles || {})
        onRolesLoaded?.(data.base_roles || {}, data.custom_roles || {})
      }
    } catch (e) { console.error('加载角色配置失败:', e) }
    finally { setLoading(false) }
  }, [onRolesLoaded])

  useEffect(() => { loadRolesConfig() }, [loadRolesConfig])

  const handleSaveRole = async (roleId: string) => {
    try {
      await apiPut(`/api/roles/${roleId}`, editForm)
      await loadRolesConfig()
      setEditingRole(null)
    } catch (e) { console.error('保存失败:', e) }
  }

  const handleCreateRole = async () => {
    const roleId = newRoleForm.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!roleId) return
    try {
      await apiPost(`/api/roles/${roleId}`, newRoleForm)
      await loadRolesConfig()
      setShowNewRole(false)
      setNewRoleForm({ name: '', description: '', base_role: 'executor', extra_tools: [], extra_skills: [], custom_prompt: '' })
    } catch (e) { console.error('创建失败:', e) }
  }

  const handleDeleteRole = async (roleId: string) => {
    try {
      await apiDelete(`/api/roles/${roleId}`)
      await loadRolesConfig()
      if (selectedRole === roleId) setSelectedRole(null)
    } catch (e) { console.error('删除失败:', e) }
  }

  const allRoles = { ...roles, ...customRoles }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>角色管理</span>
        <button style={s.btn} onClick={() => setShowNewRole(true)}>+ 新建</button>
      </div>

      {loading && <div style={s.loading}>加载中...</div>}

      <div style={s.list}>
        {Object.entries(allRoles).map(([id, role]) => (
          <div key={id} style={{
            ...s.item,
            ...(selectedRole === id ? s.itemActive : {}),
          }} onClick={() => setSelectedRole(selectedRole === id ? null : id)}>
            <div style={s.itemHeader}>
              <span style={s.roleName}>{role.name || id}</span>
              {customRoles[id] && <span style={s.badge}>自定义</span>}
            </div>
            {role.description && <div style={s.desc}>{role.description}</div>}

            {selectedRole === id && (
              <div style={s.actions}>
                <button style={s.btnSmall} onClick={(e) => {
                  e.stopPropagation()
                  setEditingRole(id)
                  setEditForm(role)
                }}>编辑</button>
                {customRoles[id] && (
                  <button style={s.btnDanger} onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteRole(id)
                  }}>删除</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showNewRole && (
        <div style={s.form}>
          <div style={s.formTitle}>新建角色</div>
          <input style={s.input} placeholder="角色名称" value={newRoleForm.name}
            onChange={e => setNewRoleForm({ ...newRoleForm, name: e.target.value })} />
          <input style={s.input} placeholder="描述" value={newRoleForm.description}
            onChange={e => setNewRoleForm({ ...newRoleForm, description: e.target.value })} />
          <div style={s.formActions}>
            <button style={s.btn} onClick={handleCreateRole}>创建</button>
            <button style={s.btnSecondary} onClick={() => setShowNewRole(false)}>取消</button>
          </div>
        </div>
      )}

      {editingRole && (
        <div style={s.form}>
          <div style={s.formTitle}>编辑角色: {editingRole}</div>
          <input style={s.input} placeholder="名称" value={editForm.name}
            onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
          <input style={s.input} placeholder="描述" value={editForm.description}
            onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
          <div style={s.formActions}>
            <button style={s.btn} onClick={() => handleSaveRole(editingRole)}>保存</button>
            <button style={s.btnSecondary} onClick={() => setEditingRole(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 8 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
  loading: { fontSize: 12, color: '#6b7280', textAlign: 'center' as const, padding: 10 },
  list: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflow: 'auto' },
  item: {
    padding: 10, borderRadius: 6, cursor: 'pointer',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
  },
  itemActive: { background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)' },
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roleName: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  badge: { fontSize: 10, color: '#a78bfa', background: 'rgba(139,92,246,0.15)', padding: '1px 6px', borderRadius: 3 },
  desc: { fontSize: 11, color: '#94a3b8', marginBottom: 6 },
  actions: { display: 'flex', gap: 6, marginTop: 6 },
  form: {
    padding: 10, borderRadius: 6,
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
  },
  formTitle: { fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 },
  input: {
    width: '100%', padding: '6px 10px', borderRadius: 4, marginBottom: 6,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0', fontSize: 12, outline: 'none',
  },
  formActions: { display: 'flex', gap: 8, marginTop: 8 },
  btn: {
    padding: '4px 10px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: 4,
    color: '#a78bfa', fontSize: 11, cursor: 'pointer',
  },
  btnSmall: {
    padding: '2px 8px', background: 'rgba(139,92,246,0.15)',
    border: '1px solid rgba(139,92,246,0.3)', borderRadius: 3,
    color: '#a78bfa', fontSize: 10, cursor: 'pointer',
  },
  btnSecondary: {
    padding: '4px 10px', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
    color: '#94a3b8', fontSize: 11, cursor: 'pointer',
  },
  btnDanger: {
    padding: '2px 8px', background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 3,
    color: '#ef4444', fontSize: 10, cursor: 'pointer',
  },
}
