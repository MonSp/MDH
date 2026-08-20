import React from 'react'
import type { ProjectDept, RoleConfig, ToolInfo, SkillInfo } from './types'
import { headerStyle, closeBtn, btn, inputStyle, selectStyle, tagStyle } from './SidePanel'

export interface RolePanelProps {
  roles: Record<string, RoleConfig>
  customRoles: Record<string, RoleConfig>
  tools: Record<string, ToolInfo>
  skills: Record<string, SkillInfo>
  deptList: ProjectDept[]
  onClose: () => void
  handleSaveRole: (id: string, data: any) => Promise<void>
  handleCreateRole: (data: any) => Promise<void>
  handleDeleteRole: (id: string) => void
}

function RolePanel({
  roles, customRoles, tools, skills, deptList, onClose,
  handleSaveRole, handleCreateRole, handleDeleteRole,
}: RolePanelProps) {
  const [selectedRole, setSelectedRole] = React.useState<string | null>(null)
  const [editingRole, setEditingRole] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<any>({})
  const [showNewRole, setShowNewRole] = React.useState(false)
  const [newRoleForm, setNewRoleForm] = React.useState({ name: '', description: '', base_role: 'executor', extra_tools: [] as string[], extra_skills: [] as string[], custom_prompt: '' })
  const [roleGroupBy, setRoleGroupBy] = React.useState<'department' | 'category' | 'none'>('department')
  const [selectedRoleDept, setSelectedRoleDept] = React.useState<string | null>(null)

  const allRoles = { ...roles, ...customRoles }
  const selected = selectedRole ? allRoles[selectedRole] : null

  // 按部门分组
  const groupByDepartment = () => {
    const groups: Record<string, Array<[string, any]>> = {}
    Object.entries(allRoles).forEach(([id, role]) => {
      const deptId = role.department || 'no-dept'
      if (!groups[deptId]) groups[deptId] = []
      groups[deptId].push([id, role])
    })
    return groups
  }

  // 详情视图
  if (selectedRole && selected && editingRole !== selectedRole && !showNewRole) {
    return (
      <>
        <div style={headerStyle}>
          <button onClick={() => setSelectedRole(null)} style={{ background: 'none', border: 'none', color: '#64d2ff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            ← 返回列表
          </button>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: '#556', fontFamily: 'monospace', marginTop: 2 }}>{selectedRole}</div>
            </div>
            <button onClick={() => { setEditingRole(selectedRole!); setEditForm({ ...selected }) }} style={{ padding: '4px 10px', background: 'rgba(100,210,255,0.15)', border: '1px solid rgba(100,210,255,0.3)', borderRadius: 4, color: '#64d2ff', fontSize: 11, cursor: 'pointer' }}>编辑</button>
          </div>
          <p style={{ fontSize: 12, color: '#8899aa', margin: '0 0 12px' }}>{selected.description}</p>
          {selected.department && (() => {
            const dept = deptList.find(d => d.deptId === selected.department)
            if (!dept) return null
            const teamMember = selected.team_role ? dept.team.find(m => m.role === selected.team_role) : null
            return (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(100,210,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: teamMember ? 8 : 0 }}>
                  <span style={{ fontSize: 16 }}>{dept.icon}</span>
                  <span style={{ fontSize: 13, color: dept.color, fontWeight: 600 }}>{dept.name}</span>
                </div>
                {teamMember && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${dept.color}30, ${dept.color}15)`, border: `1px solid ${dept.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#e0e8f0', fontWeight: 600 }}>
                      {teamMember.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: '#e0e8f0' }}>{teamMember.name}</div>
                      <div style={{ fontSize: 11, color: '#667' }}>{teamMember.title} · {teamMember.description}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 6, fontWeight: 600 }}>🔧 工具权限</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(selected.permissions?.tools || []).map(t => {
                const tool = tools[t]
                return (
                  <span key={t} style={{ padding: '3px 8px', background: tool?.dangerous ? 'rgba(255,159,10,0.1)' : 'rgba(100,210,255,0.1)', borderRadius: 8, fontSize: 10, color: tool?.dangerous ? '#ff9f0a' : '#64d2ff', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {tool?.dangerous && '⚠'}{tool?.name || t}
                  </span>
                )
              })}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 6, fontWeight: 600 }}>📦 技能包</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(selected.skills || []).map(s => {
                const skill = skills[s]
                return (
                  <div key={s} style={{ padding: '6px 10px', background: 'rgba(48,209,88,0.08)', borderRadius: 6, border: '1px solid rgba(48,209,88,0.15)' }}>
                    <div style={{ fontSize: 12, color: '#30d158', fontWeight: 500 }}>{skill?.name || s}</div>
                    {skill?.description && <div style={{ fontSize: 10, color: '#667', marginTop: 2 }}>{skill.description}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </>
    )
  }

  // 编辑视图
  if (editingRole && editForm.name) {
    return (
      <>
        <div style={headerStyle}>
          <button onClick={() => setEditingRole(null)} style={{ background: 'none', border: 'none', color: '#64d2ff', cursor: 'pointer', fontSize: 13 }}>← 取消编辑</button>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e8f0', marginBottom: 12 }}>编辑: {editForm.name}</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称</div>
            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
            <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 6 }}>工具权限（点击切换）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(tools).map(([id, tool]) => {
                const active = editForm.permissions?.tools?.includes(id) || false
                return <span key={id} onClick={() => { const t = editForm.permissions?.tools || []; setEditForm({ ...editForm, permissions: { ...editForm.permissions, tools: active ? t.filter((x: string) => x !== id) : [...t, id] } }) }} style={tagStyle(active, tool.dangerous ? '#ff9f0a' : '#64d2ff')}>{tool.dangerous ? '⚠' : ''}{tool.name}</span>
              })}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 6 }}>技能包（点击切换）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(skills).map(([id, skill]) => {
                const active = editForm.skills?.includes(id) || false
                return <span key={id} onClick={() => { const s = editForm.skills || []; setEditForm({ ...editForm, skills: active ? s.filter((x: string) => x !== id) : [...s, id] }) }} style={tagStyle(active, '#30d158')}>{skill.name}</span>
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={async () => { await handleSaveRole(editingRole, editForm); setEditingRole(null) }} style={{ flex: 1, padding: '8px 0', background: '#30d158', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>保存</button>
            <button onClick={() => setEditingRole(null)} style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
          </div>
        </div>
      </>
    )
  }

  // 新建角色视图
  if (showNewRole) {
    return (
      <>
        <div style={headerStyle}>
          <button onClick={() => setShowNewRole(false)} style={{ background: 'none', border: 'none', color: '#64d2ff', cursor: 'pointer', fontSize: 13 }}>← 取消</button>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e8f0', marginBottom: 12 }}>新建自定义角色</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>角色名称 *</div>
            <input value={newRoleForm.name} onChange={e => setNewRoleForm({ ...newRoleForm, name: e.target.value })} placeholder="例如：安全开发工程师" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
            <input value={newRoleForm.description} onChange={e => setNewRoleForm({ ...newRoleForm, description: e.target.value })} placeholder="角色职责描述" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>继承基础角色</div>
            <select value={newRoleForm.base_role} onChange={e => setNewRoleForm({ ...newRoleForm, base_role: e.target.value })} style={selectStyle}>
              {Object.entries(roles).map(([id, r]) => <option key={id} value={id} style={{ background: '#1a1a2e' }}>{r.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>额外工具</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(tools).map(([id, tool]) => {
                const active = newRoleForm.extra_tools.includes(id)
                return <span key={id} onClick={() => setNewRoleForm({ ...newRoleForm, extra_tools: active ? newRoleForm.extra_tools.filter(t => t !== id) : [...newRoleForm.extra_tools, id] })} style={tagStyle(active, '#64d2ff')}>{tool.name}</span>
              })}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>额外技能</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(skills).map(([id, skill]) => {
                const active = newRoleForm.extra_skills.includes(id)
                return <span key={id} onClick={() => setNewRoleForm({ ...newRoleForm, extra_skills: active ? newRoleForm.extra_skills.filter(s => s !== id) : [...newRoleForm.extra_skills, id] })} style={tagStyle(active, '#30d158')}>{skill.name}</span>
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={async () => { await handleCreateRole(newRoleForm); setShowNewRole(false); setNewRoleForm({ name: '', description: '', base_role: 'executor', extra_tools: [], extra_skills: [], custom_prompt: '' }) }} disabled={!newRoleForm.name.trim()} style={{ flex: 1, padding: '8px 0', background: newRoleForm.name.trim() ? '#30d158' : '#333', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: newRoleForm.name.trim() ? 'pointer' : 'not-allowed' }}>创建</button>
            <button onClick={() => setShowNewRole(false)} style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
          </div>
        </div>
      </>
    )
  }

  // 列表视图（默认）
  const deptGroups = groupByDepartment()

  return (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>👥 角色管理</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => { setShowNewRole(true); setSelectedRole(null); setEditingRole(null) }} style={{ ...btn('#30d158'), marginTop: 0, fontSize: 12, padding: '8px 0', flex: 1 }}>
            + 新建角色
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, padding: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
          {[
            { key: 'department' as const, label: '按部门', icon: '🏢' },
            { key: 'category' as const, label: '按类别', icon: '📁' },
            { key: 'none' as const, label: '全部', icon: '📋' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setRoleGroupBy(tab.key)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: 'none',
                background: roleGroupBy === tab.key ? 'rgba(100,210,255,0.2)' : 'transparent',
                color: roleGroupBy === tab.key ? '#64d2ff' : '#667',
                fontSize: 11, fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        {/* 按部门分组 - 手风琴式 */}
        {roleGroupBy === 'department' && Object.entries(deptGroups).map(([deptId, deptRoles]) => {
          const dept = deptList.find(d => d.deptId === deptId)
          const deptName = dept ? dept.name : '通用角色'
          const deptIcon = dept ? dept.icon : '⚙️'
          const deptColor = dept ? dept.color : '#667'
          const isExpanded = selectedRoleDept === deptId
          return (
            <div key={deptId} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setSelectedRoleDept(isExpanded ? null : deptId)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{deptIcon}</span>
                  <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500 }}>{deptName}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#556', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>{deptRoles.length}</span>
                  <span style={{ fontSize: 10, color: '#444', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ paddingLeft: 12 }}>
                  {deptRoles.map(([id, role]) => (
                    <div key={id} onClick={() => setSelectedRole(id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 2, borderRadius: 4, cursor: 'pointer' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: deptColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#c8d6e5' }}>{role.name}</div>
                        <div style={{ fontSize: 10, color: '#556' }}>{role.description}</div>
                      </div>
                      {id in customRoles && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteRole(id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, opacity: 0.4 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {/* 按类别分组 */}
        {roleGroupBy === 'category' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>基础角色 ({Object.keys(roles).length})</div>
              {Object.entries(roles).map(([id, role]) => {
                const dept = role.department ? deptList.find(d => d.deptId === role.department) : null
                return (
                  <div key={id} onClick={() => setSelectedRole(id)} style={{ padding: '8px 10px', marginBottom: 2, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {dept && <span style={{ fontSize: 12 }}>{dept.icon}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#c8d6e5' }}>{role.name}</div>
                      <div style={{ fontSize: 10, color: '#556' }}>{role.description}</div>
                    </div>
                    <span style={{ fontSize: 10, color: '#444' }}>›</span>
                  </div>
                )
              })}
            </div>
            {Object.keys(customRoles).length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#667', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>自定义角色 ({Object.keys(customRoles).length})</div>
                {Object.entries(customRoles).map(([id, role]) => (
                  <div key={id} onClick={() => setSelectedRole(id)} style={{ padding: '8px 10px', marginBottom: 2, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12 }}>✨</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#c8d6e5' }}>{role.name}</div>
                      <div style={{ fontSize: 10, color: '#556' }}>继承自 {roles[role.base_role || '']?.name || role.base_role}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteRole(id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, opacity: 0.5 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {/* 全部列表 */}
        {roleGroupBy === 'none' && Object.entries(allRoles).map(([id, role]) => {
          const dept = role.department ? deptList.find(d => d.deptId === role.department) : null
          const isCustom = id in customRoles
          return (
            <div key={id} onClick={() => setSelectedRole(id)} style={{ padding: '8px 10px', marginBottom: 2, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              {dept ? <span style={{ fontSize: 12 }}>{dept.icon}</span> : <span style={{ fontSize: 12 }}>{isCustom ? '✨' : '👤'}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#c8d6e5' }}>{role.name}</div>
                <div style={{ fontSize: 10, color: '#556' }}>{role.description}</div>
              </div>
              {isCustom && (
                <button onClick={(e) => { e.stopPropagation(); handleDeleteRole(id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, opacity: 0.4 }}>×</button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export default RolePanel
