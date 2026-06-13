import React, { useState, useEffect } from 'react'

interface RoleConfig {
  name: string
  description: string
  department?: string
  team_role?: string
  permissions: {
    tools: string[]
    dangerous_tools: string[]
  }
  skills: string[]
  prompt_template: string
}

interface ToolInfo {
  name: string
  description: string
  category: string
  dangerous: boolean
}

interface SkillInfo {
  name: string
  description: string
  required_tools: string[]
}

// 部门配置
const DEPT_MAP: Record<string, { icon: string; name: string; color: string }> = {
  'dept-software': { icon: '💻', name: '软件产品部', color: '#0a84ff' },
  'dept-ai-movie': { icon: '🎬', name: 'AI影视部', color: '#ff375f' },
  'dept-data': { icon: '📊', name: '数据智能部', color: '#bf5af2' },
  'dept-content': { icon: '✍️', name: '内容创作部', color: '#ff9f0a' },
  'dept-ppt': { icon: '🎯', name: '演示设计部', color: '#30d158' },
}

export default function RoleConfigPanel() {
  const [roles, setRoles] = useState<Record<string, RoleConfig>>({})
  const [customRoles, setCustomRoles] = useState<Record<string, RoleConfig & { base_role?: string; extra_tools?: string[]; extra_skills?: string[]; custom_prompt?: string }>>({})
  const [tools, setTools] = useState<Record<string, ToolInfo>>({})
  const [skills, setSkills] = useState<Record<string, SkillInfo>>({})
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNewRole, setShowNewRole] = useState(false)
  const [newRoleForm, setNewRoleForm] = useState({
    name: '',
    description: '',
    base_role: 'executor',
    extra_tools: [] as string[],
    extra_skills: [] as string[],
    custom_prompt: '',
  })

  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/roles/config')
      const data = await res.json()
      setRoles(data.base_roles || {})
      setCustomRoles(data.custom_roles || {})
      setTools(data.tools || {})
      setSkills(data.skills || {})
    } catch (e: any) {
      setError(e.message || '加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const handleSaveRole = async (roleId: string) => {
    try {
      const res = await fetch(`/api/roles/${roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        await loadConfig()
        setEditingRole(null)
      } else {
        setError('保存失败')
      }
    } catch (e: any) {
      setError(e.message || '保存失败')
    }
  }

  const handleCreateRole = async () => {
    try {
      const roleId = newRoleForm.name.toLowerCase().replace(/\s+/g, '_')
      const res = await fetch(`/api/roles/${roleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRoleForm),
      })
      if (res.ok) {
        await loadConfig()
        setShowNewRole(false)
        setNewRoleForm({ name: '', description: '', base_role: 'executor', extra_tools: [], extra_skills: [], custom_prompt: '' })
      } else {
        setError('创建失败')
      }
    } catch (e: any) {
      setError(e.message || '创建失败')
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm(`确定要删除角色 "${roleId}" 吗？`)) return
    try {
      const res = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadConfig()
        if (selectedRole === roleId) setSelectedRole(null)
      } else {
        setError('删除失败')
      }
    } catch (e: any) {
      setError(e.message || '删除失败')
    }
  }

  const allRoles = { ...roles, ...customRoles }
  const selected = selectedRole ? allRoles[selectedRole] : null

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>👥 角色配置管理</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={loadConfig}
            disabled={loading}
            style={{ padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12 }}
          >
            {loading ? '加载中...' : '刷新'}
          </button>
          <button
            onClick={() => setShowNewRole(true)}
            style={{ padding: '4px 12px', border: '1px solid #3b82f6', borderRadius: 4, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 12 }}
          >
            + 新建角色
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#dc2626', fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        {/* 角色列表 */}
        <div style={{ width: 260, flexShrink: 0 }}>
          {/* 按部门分组显示基础角色 */}
          {Object.entries(DEPT_MAP).map(([deptId, dept]) => {
            const deptRoles = Object.entries(roles).filter(([, r]) => r.department === deptId)
            if (deptRoles.length === 0) return null
            return (
              <div key={deptId} style={{ marginBottom: 16 }}>
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 6, 
                  marginBottom: 8, padding: '4px 0',
                  borderBottom: `1px solid ${dept.color}20`,
                }}>
                  <span style={{ fontSize: 14 }}>{dept.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: dept.color }}>{dept.name}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>{deptRoles.length}</span>
                </div>
                {deptRoles.map(([id, role]) => (
                  <div
                    key={id}
                    onClick={() => setSelectedRole(id)}
                    style={{
                      padding: '8px 10px', marginBottom: 2, borderRadius: 6, cursor: 'pointer',
                      background: selectedRole === id ? `${dept.color}15` : 'transparent',
                      border: selectedRole === id ? `1px solid ${dept.color}40` : '1px solid transparent',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: dept.color, flexShrink: 0,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ 
                        fontSize: 13, fontWeight: selectedRole === id ? 600 : 400, 
                        color: selectedRole === id ? dept.color : '#374151',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{role.name}</div>
                      <div style={{ 
                        fontSize: 10, color: '#9ca3af', marginTop: 1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{role.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* 没有部门的角色 */}
          {(() => {
            const noDeptRoles = Object.entries(roles).filter(([, r]) => !r.department)
            if (noDeptRoles.length === 0) return null
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>通用角色</div>
                {noDeptRoles.map(([id, role]) => (
                  <div
                    key={id}
                    onClick={() => setSelectedRole(id)}
                    style={{
                      padding: '8px 10px', marginBottom: 2, borderRadius: 6, cursor: 'pointer',
                      background: selectedRole === id ? '#eff6ff' : 'transparent',
                      border: selectedRole === id ? '1px solid #bfdbfe' : '1px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: selectedRole === id ? '#1d4ed8' : '#374151' }}>{role.name}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{role.description}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* 自定义角色 - 卡片式布局 */}
          {Object.keys(customRoles).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 6, 
                marginBottom: 8, padding: '4px 0',
                borderBottom: '1px solid rgba(139,92,246,0.2)',
              }}>
                <span style={{ fontSize: 14 }}>✨</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6' }}>自定义角色</span>
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>{Object.keys(customRoles).length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(customRoles).map(([id, role]) => {
                  const baseRole = roles[role.base_role || '']
                  const baseDept = baseRole?.department ? DEPT_MAP[baseRole.department] : null
                  return (
                    <div
                      key={id}
                      onClick={() => setSelectedRole(id)}
                      style={{
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        background: selectedRole === id 
                          ? 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.08))' 
                          : 'rgba(255,255,255,0.03)',
                        border: selectedRole === id 
                          ? '1px solid rgba(139,92,246,0.4)' 
                          : '1px solid rgba(139,92,246,0.15)',
                        transition: 'all 0.15s',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: selectedRole === id ? '#8b5cf6' : '#374151' }}>
                            {role.name}
                          </div>
                          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                            继承自 {baseRole?.name || role.base_role}
                            {baseDept && <span style={{ marginLeft: 6 }}>{baseDept.icon}</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteRole(id) }}
                          style={{ 
                            background: 'none', border: 'none', cursor: 'pointer', 
                            color: '#ef4444', fontSize: 14, padding: '2px 4px',
                            opacity: 0.6,
                          }}
                          title="删除"
                        >
                          ×
                        </button>
                      </div>
                      {/* 显示额外工具和技能数量 */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        {role.extra_tools && role.extra_tools.length > 0 && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(100,210,255,0.1)', color: '#64d2ff' }}>
                            +{role.extra_tools.length} 工具
                          </span>
                        )}
                        {role.extra_skills && role.extra_skills.length > 0 && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(48,209,88,0.1)', color: '#30d158' }}>
                            +{role.extra_skills.length} 技能
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 角色详情 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedRole && selected ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              {editingRole === selectedRole ? (
                /* 编辑模式 */
                <div>
                  <h4 style={{ margin: '0 0 12px' }}>编辑角色: {selectedRole}</h4>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>名称</label>
                    <input
                      value={editForm.name || ''}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>描述</label>
                    <input
                      value={editForm.description || ''}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>工具权限</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(tools).map(([id, tool]) => (
                        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', background: editForm.permissions?.tools?.includes(id) ? '#eff6ff' : '#fff' }}>
                          <input
                            type="checkbox"
                            checked={editForm.permissions?.tools?.includes(id) || false}
                            onChange={e => {
                              const tools = editForm.permissions?.tools || []
                              setEditForm({
                                ...editForm,
                                permissions: {
                                  ...editForm.permissions,
                                  tools: e.target.checked ? [...tools, id] : tools.filter((t: string) => t !== id)
                                }
                              })
                            }}
                            style={{ display: 'none' }}
                          />
                          {tool.name}
                          {tool.dangerous && <span style={{ color: '#f59e0b' }}>⚠️</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>技能包</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(skills).map(([id, skill]) => (
                        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', background: editForm.skills?.includes(id) ? '#eff6ff' : '#fff' }}>
                          <input
                            type="checkbox"
                            checked={editForm.skills?.includes(id) || false}
                            onChange={e => {
                              const skills = editForm.skills || []
                              setEditForm({
                                ...editForm,
                                skills: e.target.checked ? [...skills, id] : skills.filter((s: string) => s !== id)
                              })
                            }}
                            style={{ display: 'none' }}
                          />
                          {skill.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button
                      onClick={() => handleSaveRole(selectedRole)}
                      style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingRole(null)}
                      style={{ padding: '6px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                /* 查看模式 */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ margin: 0 }}>{selected.name}</h4>
                    <button
                      onClick={() => {
                        setEditingRole(selectedRole)
                        setEditForm({ ...selected })
                      }}
                      style={{ padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12 }}
                    >
                      编辑
                    </button>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>{selected.description}</p>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>工具权限</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selected.permissions.tools.map(toolId => {
                        const tool = tools[toolId]
                        return (
                          <span key={toolId} style={{ padding: '4px 10px', background: '#f3f4f6', borderRadius: 12, fontSize: 12, color: '#374151' }}>
                            {tool?.name || toolId}
                            {tool?.dangerous && <span style={{ color: '#f59e0b', marginLeft: 4 }}>⚠️</span>}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>技能包</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selected.skills.map(skillId => {
                        const skill = skills[skillId]
                        return (
                          <span key={skillId} style={{ padding: '4px 10px', background: '#eff6ff', borderRadius: 12, fontSize: 12, color: '#1d4ed8' }}>
                            {skill?.name || skillId}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
              <div>选择左侧角色查看详情</div>
            </div>
          )}
        </div>
      </div>

      {/* 新建角色对话框 */}
      {showNewRole && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 500, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px' }}>新建自定义角色</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>角色名称</label>
              <input
                value={newRoleForm.name}
                onChange={e => setNewRoleForm({ ...newRoleForm, name: e.target.value })}
                placeholder="例如：安全开发工程师"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>描述</label>
              <input
                value={newRoleForm.description}
                onChange={e => setNewRoleForm({ ...newRoleForm, description: e.target.value })}
                placeholder="角色的职责描述"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>继承基础角色</label>
              <select
                value={newRoleForm.base_role}
                onChange={e => setNewRoleForm({ ...newRoleForm, base_role: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
              >
                {Object.entries(roles).map(([id, role]) => (
                  <option key={id} value={id}>{role.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>额外工具</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(tools).map(([id, tool]) => (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', background: newRoleForm.extra_tools.includes(id) ? '#eff6ff' : '#fff' }}>
                    <input
                      type="checkbox"
                      checked={newRoleForm.extra_tools.includes(id)}
                      onChange={e => {
                        setNewRoleForm({
                          ...newRoleForm,
                          extra_tools: e.target.checked ? [...newRoleForm.extra_tools, id] : newRoleForm.extra_tools.filter(t => t !== id)
                        })
                      }}
                      style={{ display: 'none' }}
                    />
                    {tool.name}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>额外技能</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(skills).map(([id, skill]) => (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', background: newRoleForm.extra_skills.includes(id) ? '#eff6ff' : '#fff' }}>
                    <input
                      type="checkbox"
                      checked={newRoleForm.extra_skills.includes(id)}
                      onChange={e => {
                        setNewRoleForm({
                          ...newRoleForm,
                          extra_skills: e.target.checked ? [...newRoleForm.extra_skills, id] : newRoleForm.extra_skills.filter(s => s !== id)
                        })
                      }}
                      style={{ display: 'none' }}
                    />
                    {skill.name}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewRole(false)}
                style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleCreateRole}
                disabled={!newRoleForm.name}
                style={{ padding: '8px 16px', background: newRoleForm.name ? '#3b82f6' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, cursor: newRoleForm.name ? 'pointer' : 'not-allowed' }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
