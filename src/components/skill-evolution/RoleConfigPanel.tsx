import React, { useState, useEffect } from 'react'
import { DEPT_MAP } from './RoleConfigPanel.types'
import type { RoleConfig, ToolInfo, SkillInfo } from './RoleConfigPanel.types'
import NewRoleModal from './NewRoleModal'
import { apiGet, apiPost, apiPut, apiDelete } from '../../services/apiFetch'

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
      const data = await apiGet<{ base_roles?: Record<string, RoleConfig>; custom_roles?: Record<string, RoleConfig & { base_role?: string; extra_tools?: string[]; extra_skills?: string[]; custom_prompt?: string }>; tools?: Record<string, ToolInfo>; skills?: Record<string, SkillInfo> }>('/api/roles/config')
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
      await apiPut(`/api/roles/${roleId}`, editForm)
      await loadConfig()
      setEditingRole(null)
    } catch (e: any) {
      setError(e.message || '保存失败')
    }
  }

  const handleCreateRole = async () => {
    try {
      const roleId = newRoleForm.name.toLowerCase().replace(/\s+/g, '_')
      await apiPost(`/api/roles/${roleId}`, newRoleForm)
      await loadConfig()
      setShowNewRole(false)
      setNewRoleForm({ name: '', description: '', base_role: 'executor', extra_tools: [], extra_skills: [], custom_prompt: '' })
    } catch (e: any) {
      setError(e.message || '创建失败')
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm(`确定要删除角色 "${roleId}" 吗？`)) return
    try {
      await apiDelete(`/api/roles/${roleId}`)
      await loadConfig()
      if (selectedRole === roleId) setSelectedRole(null)
    } catch (e: any) {
      setError(e.message || '删除失败')
    }
  }

  const allRoles = { ...roles, ...customRoles }
  const selected = selectedRole ? allRoles[selectedRole] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif", color: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.2)', borderRadius: 8 }}>👥</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>角色配置管理</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>管理基础角色和自定义角色</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadConfig} disabled={loading} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loading ? '加载中...' : '刷新'}
          </button>
          <button onClick={() => setShowNewRole(true)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            + 新建角色
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 16px', color: '#ef4444', fontSize: 12, background: 'rgba(239,68,68,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden' }}>
        {/* 角色列表 */}
        <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', padding: 12, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
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
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
          {selectedRole && selected ? (
            <div style={{ borderRadius: 10, padding: 16, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {editingRole === selectedRole ? (
                /* 编辑模式 */
                <div>
                  <h4 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>编辑角色: {selectedRole}</h4>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>名称</label>
                    <input
                      value={editForm.name || ''}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13, background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>描述</label>
                    <input
                      value={editForm.description || ''}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13, background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>工具权限</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(tools).map(([id, tool]) => (
                        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: `1px solid ${editForm.permissions?.tools?.includes(id) ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, cursor: 'pointer', background: editForm.permissions?.tools?.includes(id) ? 'rgba(139,92,246,0.15)' : 'rgba(0,0,0,0.1)', color: editForm.permissions?.tools?.includes(id) ? '#a78bfa' : '#9ca3af' }}>
                          <input
                            type="checkbox"
                            checked={editForm.permissions?.tools?.includes(id) || false}
                            onChange={e => {
                              const t = editForm.permissions?.tools || []
                              setEditForm({ ...editForm, permissions: { ...editForm.permissions, tools: e.target.checked ? [...t, id] : t.filter((x: string) => x !== id) } })
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
                        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: `1px solid ${editForm.skills?.includes(id) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, cursor: 'pointer', background: editForm.skills?.includes(id) ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.1)', color: editForm.skills?.includes(id) ? '#60a5fa' : '#9ca3af' }}>
                          <input
                            type="checkbox"
                            checked={editForm.skills?.includes(id) || false}
                            onChange={e => {
                              const sk = editForm.skills || []
                              setEditForm({ ...editForm, skills: e.target.checked ? [...sk, id] : sk.filter((s: string) => s !== id) })
                            }}
                            style={{ display: 'none' }}
                          />
                          {skill.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button onClick={() => handleSaveRole(selectedRole)} style={{ padding: '6px 16px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>保存</button>
                    <button onClick={() => setEditingRole(null)} style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#9ca3af', fontFamily: 'inherit' }}>取消</button>
                  </div>
                </div>
              ) : (
                /* 查看模式 */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ margin: 0, color: '#e2e8f0' }}>{selected.name}</h4>
                    <button onClick={() => { setEditingRole(selectedRole); setEditForm({ ...selected }) }} style={{ padding: '4px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: '#9ca3af', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>编辑</button>
                  </div>
                  <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>{selected.description}</p>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>工具权限</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selected.permissions.tools.map(toolId => {
                        const tool = tools[toolId]
                        return (
                          <span key={toolId} style={{ padding: '4px 10px', background: 'rgba(139,92,246,0.1)', borderRadius: 12, fontSize: 12, color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                            {tool?.name || toolId}
                            {tool?.dangerous && <span style={{ color: '#f59e0b', marginLeft: 4 }}>⚠️</span>}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>技能包</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selected.skills.map(skillId => {
                        const skill = skills[skillId]
                        return (
                          <span key={skillId} style={{ padding: '4px 10px', background: 'rgba(59,130,246,0.1)', borderRadius: 12, fontSize: 12, color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
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
            <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
              <div>选择左侧角色查看详情</div>
            </div>
          )}
        </div>
      </div>

      {/* 新建角色对话框 */}
      {showNewRole && (
        <NewRoleModal
          newRoleForm={newRoleForm}
          setNewRoleForm={setNewRoleForm}
          roles={roles}
          tools={tools}
          skills={skills}
          onClose={() => setShowNewRole(false)}
          onCreate={handleCreateRole}
        />
      )}
    </div>
  )
}
