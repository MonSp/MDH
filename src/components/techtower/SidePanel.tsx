import React, { useState, useEffect } from 'react'
import type { Project, ProjectDept, CustomTeam, PanelState, RoleConfig, ToolInfo, SkillInfo } from './types'
import { DEFAULT_DEPTS, STATUS_MAP, ALL_AGENTS } from './constants'

/* ───────── 样式常量 ───────── */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(100,210,255,0.2)',
  color: '#e0e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none' as const,
}

const tagStyle = (active: boolean, color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
  background: active ? `${color}25` : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? color + '50' : 'rgba(255,255,255,0.08)'}`,
  color: active ? color : '#667', transition: 'all 0.15s',
})

const cardStyle: React.CSSProperties = {
  padding: '10px 12px', marginBottom: 6, borderRadius: 8,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,210,255,0.1)',
}

/* ───────── 主组件 ───────── */

function SidePanel({ panel, onClose, onCreateTeam, onCreateProject, isMobile, depts }: {
  panel: PanelState
  onClose: () => void
  onCreateTeam: (name: string, memberIds: string[]) => void
  onCreateProject: (deptId: string) => void
  isMobile?: boolean
  depts?: ProjectDept[]
}) {
  const [teamName, setTeamName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const deptList = depts ?? DEFAULT_DEPTS

  // 角色管理状态
  const [roles, setRoles] = useState<Record<string, RoleConfig>>({})
  const [customRoles, setCustomRoles] = useState<Record<string, RoleConfig & { base_role?: string; extra_tools?: string[]; extra_skills?: string[]; custom_prompt?: string }>>({})
  const [tools, setTools] = useState<Record<string, ToolInfo>>({})
  const [skills, setSkills] = useState<Record<string, SkillInfo>>({})
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [showNewRole, setShowNewRole] = useState(false)
  const [newRoleForm, setNewRoleForm] = useState({ name: '', description: '', base_role: 'executor', extra_tools: [] as string[], extra_skills: [] as string[], custom_prompt: '' })
  const [loadingRoles, setLoadingRoles] = useState(false)

  // 技能/工具导入状态
  const [showImportSkill, setShowImportSkill] = useState(false)
  const [showImportTool, setShowImportTool] = useState(false)
  const [importSkillForm, setImportSkillForm] = useState({ id: '', name: '', description: '', required_tools: [] as string[] })
  const [importToolForm, setImportToolForm] = useState({ id: '', name: '', description: '', category: 'general', dangerous: false })
  const [importError, setImportError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (panel) { document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler) }
  }, [panel, onClose])

  useEffect(() => {
    if (panel?.type === 'roles' || panel?.type === 'skills' || panel?.type === 'tools') loadRolesConfig()
  }, [panel])

  const loadRolesConfig = async () => {
    setLoadingRoles(true)
    try {
      const res = await fetch('/api/roles/config')
      if (!res.ok) {
        console.error('API请求失败:', res.status, res.statusText)
        return
      }
      const data = await res.json()
      if (data.success && data.data) {
        setRoles(data.data.base_roles || {})
        setCustomRoles(data.data.custom_roles || {})
        setTools(data.data.tools || {})
        setSkills(data.data.skills || {})
      }
    } catch (e) { console.error('加载配置失败:', e) }
    finally { setLoadingRoles(false) }
  }

  /* ───── 角色操作 ───── */

  const handleSaveRole = async (roleId: string) => {
    try {
      await fetch(`/api/roles/${roleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
      await loadRolesConfig(); setEditingRole(null)
    } catch (e) { console.error('保存失败:', e) }
  }

  const handleCreateRole = async () => {
    const roleId = newRoleForm.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!roleId) return
    try {
      await fetch(`/api/roles/${roleId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newRoleForm) })
      await loadRolesConfig(); setShowNewRole(false); setNewRoleForm({ name: '', description: '', base_role: 'executor', extra_tools: [], extra_skills: [], custom_prompt: '' })
    } catch (e) { console.error('创建失败:', e) }
  }

  const handleDeleteRole = async (roleId: string) => {
    try { await fetch(`/api/roles/${roleId}`, { method: 'DELETE' }); await loadRolesConfig(); if (selectedRole === roleId) setSelectedRole(null) }
    catch (e) { console.error('删除失败:', e) }
  }

  /* ───── 技能操作 ───── */

  const handleImportSkill = async () => {
    setImportError('')
    const id = importSkillForm.id.trim()
    if (!id) { setImportError('请输入技能ID'); return }
    try {
      const res = await fetch(`/api/roles/skills/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(importSkillForm) })
      const data = await res.json()
      if (data.success) { await loadRolesConfig(); setShowImportSkill(false); setImportSkillForm({ id: '', name: '', description: '', required_tools: [] }) }
      else setImportError(data.error || '导入失败')
    } catch (e) { setImportError('导入失败') }
  }

  const handleDeleteSkill = async (skillId: string) => {
    try { await fetch(`/api/roles/skills/${skillId}`, { method: 'DELETE' }); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }

  /* ───── 工具操作 ───── */

  const handleImportTool = async () => {
    setImportError('')
    const id = importToolForm.id.trim()
    if (!id) { setImportError('请输入工具ID'); return }
    try {
      const res = await fetch(`/api/roles/tools/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(importToolForm) })
      const data = await res.json()
      if (data.success) { await loadRolesConfig(); setShowImportTool(false); setImportToolForm({ id: '', name: '', description: '', category: 'general', dangerous: false }) }
      else setImportError(data.error || '导入失败')
    } catch (e) { setImportError('导入失败') }
  }

  const handleDeleteTool = async (toolId: string) => {
    try { await fetch(`/api/roles/tools/${toolId}`, { method: 'DELETE' }); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }

  /* ───── 通用样式 ───── */

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    ...(isMobile
      ? { bottom: 0, left: 0, right: 0, width: '100%', height: '50%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }
      : { top: 0, right: 0, width: 380, height: '100%' }
    ),
    background: 'linear-gradient(180deg, rgba(10,10,30,0.94), rgba(5,5,20,0.97))',
    borderLeft: isMobile ? 'none' : '1px solid', borderTop: isMobile ? '1px solid' : 'none',
    borderImage: 'linear-gradient(180deg, #bf5af2, #5e56e0) 1',
    backdropFilter: 'blur(20px)', zIndex: 20, overflowY: 'auto',
    padding: isMobile ? '8px 20px 20px' : '24px 20px',
    color: '#c8d6e5', fontFamily: 'inherit',
    boxShadow: isMobile ? '0 -8px 32px rgba(0,0,0,0.5)' : '-8px 0 32px rgba(0,0,0,0.5)',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(100,210,255,0.1)',
  }

  const closeBtn: React.CSSProperties = {
    background: 'none', border: 'none', color: '#667', fontSize: 20, cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
  }

  const btn = (color: string): React.CSSProperties => ({
    width: '100%', padding: '10px 0', borderRadius: 8,
    background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
    border: `1px solid ${color}60`, color: '#fff', fontWeight: 700,
    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12,
  })

  const badge = (text: string, color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, color, background: `${color}20`,
    border: `1px solid ${color}40`,
  })

  const memberRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: 'rgba(255,255,255,0.03)', fontSize: 13,
  }

  const avatarCircle: React.CSSProperties = {
    width: 44, height: 44, borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(100,210,255,0.2), rgba(191,90,242,0.2))',
    border: '1px solid rgba(100,210,255,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, color: '#e0e8f0', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
  }

  const scrollRow: React.CSSProperties = {
    display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
    scrollbarWidth: 'thin', scrollbarColor: 'rgba(100,210,255,0.2) transparent',
  }

  const toggleMember = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  /* ───── 渲染：项目 ───── */

  const renderProject = (proj: Project) => {
    const st = STATUS_MAP[proj.status]
    const depts = DEFAULT_DEPTS.filter(d => proj.selectedDeptIds.includes(d.deptId))
    return (
      <>
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>项目工作间</span>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{proj.name}</h2>
        <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px', lineHeight: 1.6 }}>{proj.description}</p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={badge(st.label, st.color)}>{st.label}</span>
          <span style={{ fontSize: 12, color: '#667' }}>{proj.iterations} 轮迭代</span>
        </div>
        {depts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#667', marginBottom: 8 }}>参与部门</div>
            {depts.map(d => (
              <div key={d.deptId} style={{ ...memberRow, cursor: 'pointer' }} onClick={() => onCreateProject(d.deptId)}>
                <span>{d.icon}</span>
                <span style={{ color: d.color, fontWeight: 600 }}>{d.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#556' }}>{d.team.length}人</span>
              </div>
            ))}
          </div>
        )}
        <button style={btn('#64d2ff')} onClick={onClose}>进入工作间</button>
      </>
    )
  }

  /* ───── 渲染：部门 ───── */

  const renderDept = (dept: ProjectDept) => (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>{dept.icon} {dept.name}</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px', lineHeight: 1.6 }}>{dept.desc}</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={badge(dept.color, dept.color)}>{dept.projectType}</span>
        <span style={{ fontSize: 12, color: '#667' }}>成功率 {Math.round(dept.successRate * 100)}%</span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 8 }}>团队成员</div>
        <div className="member-scroll" style={scrollRow}>
          {dept.team.map(m => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 60 }}>
              <div style={{ ...avatarCircle, borderColor: dept.color + '60' }}>{m.name.charAt(0)}</div>
              <div style={{ fontSize: 11, color: '#d0dce8', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div style={{ fontSize: 9, color: '#667', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.title}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 6 }}>技术标签</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dept.keywords.map(k => <span key={k} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.06)', color: '#8899aa' }}>{k}</span>)}
        </div>
      </div>
      <button style={btn(dept.color)} onClick={() => onCreateProject(dept.deptId)}>创建项目</button>
    </>
  )

  /* ───── 渲染：团队 ───── */

  const renderTeam = (team: CustomTeam) => (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>👥 {team.name}</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px' }}>自定义团队 · {team.members.length} 名成员</p>
      <div style={{ marginBottom: 16 }}>
        <div className="member-scroll" style={scrollRow}>
          {team.members.map(m => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 60 }}>
              <div style={avatarCircle}>{m.name.charAt(0)}</div>
              <div style={{ fontSize: 11, color: '#d0dce8', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div style={{ fontSize: 9, color: '#667', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.title}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  /* ───── 渲染：创建团队 ───── */

  const renderCreateTeam = () => (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>创建新团队</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 6 }}>团队名称</div>
        <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="输入团队名称..." style={{ ...inputStyle, padding: '10px 12px', fontSize: 14 }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 12 }}>选择成员（点击头像添加）</div>
        {deptList.map(dept => (
          <div key={dept.deptId} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{dept.icon}</span>
              <span style={{ fontSize: 11, color: dept.color, fontWeight: 600 }}>{dept.name}</span>
            </div>
            <div className="dept-grid">
              {dept.team.map(agent => {
                const picked = selectedIds.includes(agent.id)
                return (
                  <div key={agent.id} className={`agent-card ${picked ? 'selected' : ''}`} onClick={() => toggleMember(agent.id)}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: picked ? `linear-gradient(135deg, ${dept.color}40, ${dept.color}20)` : 'rgba(255,255,255,0.05)', border: picked ? `2px solid ${dept.color}` : '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: picked ? '#fff' : '#8899aa', transition: 'all 0.2s' }}>
                      {picked ? '✓' : agent.name.charAt(0)}
                    </div>
                    <div style={{ fontSize: 10, color: picked ? '#e0e8f0' : '#667', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>{agent.name}</div>
                    <div style={{ fontSize: 9, color: '#556', textAlign: 'center', whiteSpace: 'nowrap' }}>{agent.title}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button style={btn('#ff9f0a')} onClick={() => { if (teamName.trim() && selectedIds.length > 0) { onCreateTeam(teamName.trim(), selectedIds); setTeamName(''); setSelectedIds([]) } }}>
        创建团队 ({selectedIds.length} 人)
      </button>
    </>
  )

  /* ───── 渲染：角色管理 ───── */

  const renderRoles = () => {
    const allRoles = { ...roles, ...customRoles }
    const selected = selectedRole ? allRoles[selectedRole] : null
    const isCustom = selectedRole ? selectedRole in customRoles : false

    return (
      <>
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>👥 角色管理</span>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>

        {/* 上半部分：角色列表（可滚动） */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <button onClick={() => { setShowNewRole(true); setSelectedRole(null); setEditingRole(null) }} style={{ ...btn('#30d158'), marginTop: 0, fontSize: 12, padding: '8px 0', marginBottom: 12 }}>
            + 新建自定义角色
          </button>

          {/* 基础角色 */}
          <div style={{ fontSize: 11, color: '#667', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>基础角色</div>
          {Object.entries(roles).map(([id, role]) => (
            <div key={id} onClick={() => { setSelectedRole(id); setEditingRole(null); setShowNewRole(false) }} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 6, cursor: 'pointer', background: selectedRole === id ? 'rgba(100,210,255,0.12)' : 'transparent', border: selectedRole === id ? '1px solid rgba(100,210,255,0.3)' : '1px solid transparent' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: selectedRole === id ? '#64d2ff' : '#c8d6e5' }}>{role.name}</div>
              <div style={{ fontSize: 11, color: '#667', marginTop: 2 }}>{role.description}</div>
            </div>
          ))}

          {/* 自定义角色 */}
          {Object.keys(customRoles).length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#667', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>自定义角色</div>
              {Object.entries(customRoles).map(([id, role]) => (
                <div key={id} onClick={() => { setSelectedRole(id); setEditingRole(null); setShowNewRole(false) }} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 6, cursor: 'pointer', background: selectedRole === id ? 'rgba(100,210,255,0.12)' : 'transparent', border: selectedRole === id ? '1px solid rgba(100,210,255,0.3)' : '1px solid transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: selectedRole === id ? '#64d2ff' : '#c8d6e5' }}>{role.name}</div>
                    <div style={{ fontSize: 11, color: '#667', marginTop: 2 }}>继承自 {roles[role.base_role || '']?.name || role.base_role}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteRole(id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 16, padding: '2px 6px' }}>×</button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* 下半部分：角色详情（固定显示） */}
        {selectedRole && selected && editingRole !== selectedRole && !showNewRole && (
          <div style={{ borderTop: '1px solid rgba(100,210,255,0.1)', padding: '12px 0', maxHeight: '45%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e8f0' }}>{selected.name}</div>
              <button onClick={() => { setEditingRole(selectedRole); setEditForm({ ...selected }) }} style={{ padding: '4px 10px', background: 'rgba(100,210,255,0.15)', border: '1px solid rgba(100,210,255,0.3)', borderRadius: 4, color: '#64d2ff', fontSize: 11, cursor: 'pointer' }}>编辑</button>
            </div>
            <p style={{ fontSize: 12, color: '#8899aa', margin: '0 0 10px' }}>{selected.description}</p>
            
            {/* 关联部门和团队成员 */}
            {selected.department && (() => {
              const dept = deptList.find(d => d.deptId === selected.department)
              if (!dept) return null
              const teamMember = selected.team_role ? dept.team.find(m => m.role === selected.team_role) : null
              return (
                <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(100,210,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: teamMember ? 6 : 0 }}>
                    <span style={{ fontSize: 14 }}>{dept.icon}</span>
                    <span style={{ fontSize: 12, color: dept.color, fontWeight: 500 }}>{dept.name}</span>
                  </div>
                  {teamMember && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${dept.color}30, ${dept.color}15)`, border: `1px solid ${dept.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#e0e8f0', fontWeight: 600 }}>
                        {teamMember.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#e0e8f0' }}>{teamMember.name}</div>
                        <div style={{ fontSize: 10, color: '#667' }}>{teamMember.title}</div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
            
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>工具权限</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {(selected.permissions?.tools || []).map(t => <span key={t} style={{ padding: '2px 8px', background: 'rgba(100,210,255,0.1)', borderRadius: 10, fontSize: 10, color: '#64d2ff' }}>{tools[t]?.name || t}</span>)}
            </div>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>技能包</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(selected.skills || []).map(s => <span key={s} style={{ padding: '2px 8px', background: 'rgba(48,209,88,0.1)', borderRadius: 10, fontSize: 10, color: '#30d158' }}>{skills[s]?.name || s}</span>)}
            </div>
          </div>
        )}

        {/* 编辑角色 */}
        {editingRole && editForm.name && (
          <div style={{ borderTop: '1px solid rgba(100,210,255,0.1)', padding: '12px 0', maxHeight: '50%', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e8f0', marginBottom: 10 }}>编辑角色: {editForm.name}</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称</div>
              <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
              <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>工具权限（点击切换）</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(tools).map(([id, tool]) => {
                  const active = editForm.permissions?.tools?.includes(id) || false
                  return (
                    <span key={id} onClick={() => {
                      const t = editForm.permissions?.tools || []
                      setEditForm({ ...editForm, permissions: { ...editForm.permissions, tools: active ? t.filter((x: string) => x !== id) : [...t, id] } })
                    }} style={tagStyle(active, '#64d2ff')}>
                      {tool.name}{tool.dangerous ? ' ⚠' : ''}
                    </span>
                  )
                })}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>技能包（点击切换）</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(skills).map(([id, skill]) => {
                  const active = editForm.skills?.includes(id) || false
                  return (
                    <span key={id} onClick={() => {
                      const s = editForm.skills || []
                      setEditForm({ ...editForm, skills: active ? s.filter((x: string) => x !== id) : [...s, id] })
                    }} style={tagStyle(active, '#30d158')}>
                      {skill.name}
                    </span>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleSaveRole(editingRole)} style={{ flex: 1, padding: '6px 0', background: '#30d158', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>保存</button>
              <button onClick={() => setEditingRole(null)} style={{ flex: 1, padding: '6px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        )}

        {/* 新建角色 */}
        {showNewRole && (
          <div style={{ borderTop: '1px solid rgba(100,210,255,0.1)', padding: '12px 0', maxHeight: '50%', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e8f0', marginBottom: 10 }}>新建自定义角色</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>角色名称 *</div>
              <input value={newRoleForm.name} onChange={e => setNewRoleForm({ ...newRoleForm, name: e.target.value })} placeholder="例如：安全开发工程师" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
              <input value={newRoleForm.description} onChange={e => setNewRoleForm({ ...newRoleForm, description: e.target.value })} placeholder="角色职责描述" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>继承基础角色</div>
              <select value={newRoleForm.base_role} onChange={e => setNewRoleForm({ ...newRoleForm, base_role: e.target.value })} style={selectStyle}>
                {Object.entries(roles).map(([id, r]) => <option key={id} value={id} style={{ background: '#1a1a2e' }}>{r.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>额外工具</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(tools).map(([id, tool]) => {
                  const active = newRoleForm.extra_tools.includes(id)
                  return <span key={id} onClick={() => setNewRoleForm({ ...newRoleForm, extra_tools: active ? newRoleForm.extra_tools.filter(t => t !== id) : [...newRoleForm.extra_tools, id] })} style={tagStyle(active, '#64d2ff')}>{tool.name}</span>
                })}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>额外技能</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(skills).map(([id, skill]) => {
                  const active = newRoleForm.extra_skills.includes(id)
                  return <span key={id} onClick={() => setNewRoleForm({ ...newRoleForm, extra_skills: active ? newRoleForm.extra_skills.filter(s => s !== id) : [...newRoleForm.extra_skills, id] })} style={tagStyle(active, '#30d158')}>{skill.name}</span>
                })}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>自定义提示词（可选）</div>
              <textarea value={newRoleForm.custom_prompt} onChange={e => setNewRoleForm({ ...newRoleForm, custom_prompt: e.target.value })} placeholder="留空则使用基础角色的提示词模板..." rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreateRole} disabled={!newRoleForm.name.trim()} style={{ flex: 1, padding: '6px 0', background: newRoleForm.name.trim() ? '#30d158' : '#333', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: newRoleForm.name.trim() ? 'pointer' : 'not-allowed' }}>创建</button>
              <button onClick={() => setShowNewRole(false)} style={{ flex: 1, padding: '6px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        )}
      </>
    )
  }

  /* ───── 渲染：技能包管理 ───── */

  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)

  const renderSkills = () => {
    const selected = selectedSkill ? skills[selectedSkill] : null

    return (
      <>
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>📦 技能包管理</span>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>

        {/* 上半部分：技能包列表（可滚动） */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <button onClick={() => { setShowImportSkill(true); setImportError(''); setSelectedSkill(null) }} style={{ ...btn('#0a84ff'), marginTop: 0, fontSize: 12, padding: '8px 0', marginBottom: 12 }}>+ 新增技能包</button>

          {Object.entries(skills).map(([id, skill]) => (
            <div
              key={id}
              onClick={() => setSelectedSkill(id)}
              style={{
                padding: '8px 10px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
                background: selectedSkill === id ? 'rgba(10,132,255,0.12)' : 'transparent',
                border: selectedSkill === id ? '1px solid rgba(10,132,255,0.3)' : '1px solid transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: selectedSkill === id ? '#0a84ff' : '#c8d6e5' }}>{skill.name}</div>
                <div style={{ fontSize: 11, color: '#667', marginTop: 2 }}>{skill.description}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteSkill(id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 16, padding: '2px 6px' }}>×</button>
            </div>
          ))}

          {Object.keys(skills).length === 0 && !showImportSkill && (
            <div style={{ textAlign: 'center', padding: 24, color: '#556', fontSize: 12 }}>暂无技能包，点击上方按钮新增</div>
          )}
        </div>

        {/* 下半部分：技能包详情（固定显示） */}
        {selectedSkill && selected && !showImportSkill && (
          <div style={{ borderTop: '1px solid rgba(10,132,255,0.1)', padding: '12px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e8f0', marginBottom: 4 }}>{selected.name}</div>
            <div style={{ fontSize: 10, color: '#556', fontFamily: 'monospace', marginBottom: 8 }}>{selectedSkill}</div>
            <p style={{ fontSize: 12, color: '#8899aa', margin: '0 0 10px' }}>{selected.description}</p>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>依赖工具</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(selected.required_tools || []).map(t => <span key={t} style={{ padding: '2px 8px', background: 'rgba(100,210,255,0.1)', borderRadius: 10, fontSize: 10, color: '#64d2ff' }}>{tools[t]?.name || t}</span>)}
            </div>
          </div>
        )}

        {/* 导入技能包表单 */}
        {showImportSkill && (
          <div style={{ borderTop: '1px solid rgba(10,132,255,0.1)', padding: '12px 0', maxHeight: '50%', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e8f0', marginBottom: 10 }}>新增技能包</div>

            {importError && <div style={{ padding: '6px 10px', marginBottom: 8, background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 4, color: '#ff453a', fontSize: 11 }}>{importError}</div>}

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>技能ID * <span style={{ color: '#556' }}>(英文标识，如 frontend_dev)</span></div>
              <input value={importSkillForm.id} onChange={e => setImportSkillForm({ ...importSkillForm, id: e.target.value })} placeholder="my_skill" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称 *</div>
              <input value={importSkillForm.name} onChange={e => setImportSkillForm({ ...importSkillForm, name: e.target.value })} placeholder="我的技能" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
              <input value={importSkillForm.description} onChange={e => setImportSkillForm({ ...importSkillForm, description: e.target.value })} placeholder="技能描述" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>依赖工具</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(tools).map(([id, tool]) => {
                  const active = importSkillForm.required_tools.includes(id)
                  return <span key={id} onClick={() => setImportSkillForm({ ...importSkillForm, required_tools: active ? importSkillForm.required_tools.filter(t => t !== id) : [...importSkillForm.required_tools, id] })} style={tagStyle(active, '#64d2ff')}>{tool.name}</span>
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleImportSkill} style={{ flex: 1, padding: '6px 0', background: '#0a84ff', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>添加</button>
              <button onClick={() => setShowImportSkill(false)} style={{ flex: 1, padding: '6px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        )}
      </>
    )
  }

  /* ───── 渲染：工具包管理 ───── */

  const [selectedToolCategory, setSelectedToolCategory] = useState<string | null>(null)

  const renderTools = () => {
    const catLabel: Record<string, string> = { file: '📁 文件操作', shell: '💻 命令执行', git: '🔀 Git操作', search: '🔍 搜索', test: '🧪 测试', general: '⚙️ 通用', document: '📄 文档', design: '🎨 设计', data: '📊 数据', ai: '🤖 AI', content: '✍️ 内容' }

    return (
      <>
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>🔧 工具包管理</span>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>

        {/* 上半部分：工具列表（可滚动） */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <button onClick={() => { setShowImportTool(true); setImportError('') }} style={{ ...btn('#bf5af2'), marginTop: 0, fontSize: 12, padding: '8px 0', marginBottom: 12 }}>+ 新增工具</button>

          {/* 按分类分组 */}
          {Object.entries(catLabel).map(([cat, label]) => {
            const catTools = Object.entries(tools).filter(([, t]) => t.category === cat)
            if (catTools.length === 0) return null
            const isExpanded = selectedToolCategory === cat
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div
                  onClick={() => setSelectedToolCategory(isExpanded ? null : cat)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                    background: isExpanded ? 'rgba(191,90,242,0.1)' : 'transparent',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 11, color: '#8899aa', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#556' }}>{catTools.length}</span>
                </div>
                {isExpanded && catTools.map(([id, tool]) => (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 20px', marginBottom: 2 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: tool.dangerous ? 'rgba(255,159,10,0.15)' : 'rgba(48,209,88,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
                      {tool.dangerous ? '⚠️' : '✓'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#c8d6e5' }}>{tool.name}</div>
                      <div style={{ fontSize: 10, color: '#556' }}>{tool.description}</div>
                    </div>
                    <button onClick={() => handleDeleteTool(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, padding: '2px 4px', flexShrink: 0, opacity: 0.6 }}>×</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* 下半部分：新增工具表单 */}
        {showImportTool && (
          <div style={{ borderTop: '1px solid rgba(191,90,242,0.1)', padding: '12px 0', maxHeight: '50%', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e8f0', marginBottom: 10 }}>新增工具</div>

            {importError && <div style={{ padding: '6px 10px', marginBottom: 8, background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 4, color: '#ff453a', fontSize: 11 }}>{importError}</div>}

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>工具ID * <span style={{ color: '#556' }}>(英文标识，如 deploy_k8s)</span></div>
              <input value={importToolForm.id} onChange={e => setImportToolForm({ ...importToolForm, id: e.target.value })} placeholder="my_tool" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称 *</div>
              <input value={importToolForm.name} onChange={e => setImportToolForm({ ...importToolForm, name: e.target.value })} placeholder="我的工具" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
              <input value={importToolForm.description} onChange={e => setImportToolForm({ ...importToolForm, description: e.target.value })} placeholder="工具功能描述" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>分类</div>
              <select value={importToolForm.category} onChange={e => setImportToolForm({ ...importToolForm, category: e.target.value })} style={selectStyle}>
                {Object.entries(catLabel).map(([id, label]) => (
                  <option key={id} value={id} style={{ background: '#1a1a2e' }}>{label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#c8d6e5', cursor: 'pointer' }}>
                <input type="checkbox" checked={importToolForm.dangerous} onChange={e => setImportToolForm({ ...importToolForm, dangerous: e.target.checked })} />
                标记为危险操作（需要额外确认）
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleImportTool} style={{ flex: 1, padding: '6px 0', background: '#bf5af2', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>添加</button>
              <button onClick={() => setShowImportTool(false)} style={{ flex: 1, padding: '6px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        )}
      </>
    )
  }

  /* ───── 主渲染 ───── */

  if (!panel) return null

  return (
    <>
      <style>{`
        .side-panel-scroll::-webkit-scrollbar { width: 4px; }
        .side-panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .side-panel-scroll::-webkit-scrollbar-thumb { background: rgba(100,210,255,0.2); border-radius: 2px; }
        .side-panel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100,210,255,0.35); }
        .member-scroll::-webkit-scrollbar { height: 3px; }
        .member-scroll::-webkit-scrollbar-track { background: transparent; }
        .member-scroll::-webkit-scrollbar-thumb { background: rgba(100,210,255,0.2); border-radius: 2px; }
        @keyframes status-slide { 0%,100%{transform:translateX(-6px)} 50%{transform:translateX(6px)} }
        @keyframes status-dash { 0%,100%{border-color:rgba(10,132,255,0.3)} 50%{border-color:rgba(10,132,255,0.8)} }
        @keyframes status-float { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-12px)} }
        .dept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:12px}
        .dept-header{font-size:11px;color:#64d2ff;margin-bottom:6px;font-weight:600}
        .agent-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:8px;cursor:pointer;transition:all 0.2s;background:rgba(255,255,255,0.02);border:1px solid transparent}
        .agent-card:hover{background:rgba(100,210,255,0.08);border-color:rgba(100,210,255,0.15)}
        .agent-card.selected{background:rgba(100,210,255,0.12);border-color:rgba(100,210,255,0.3)}
      `}</style>
      <div style={panelStyle} className="side-panel-scroll">
        {isMobile && <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(100,210,255,0.3)', margin: '0 auto 12px' }} />}
        {panel.type === 'project' && renderProject(panel.data)}
        {panel.type === 'dept' && renderDept(panel.data)}
        {panel.type === 'team' && renderTeam(panel.data)}
        {panel.type === 'create-team' && renderCreateTeam()}
        {panel.type === 'roles' && renderRoles()}
        {panel.type === 'skills' && renderSkills()}
        {panel.type === 'tools' && renderTools()}
      </div>
    </>
  )
}

export default SidePanel
