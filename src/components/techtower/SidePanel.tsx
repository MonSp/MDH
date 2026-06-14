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
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [selectedToolCategory, setSelectedToolCategory] = useState<string | null>(null)
  const [selectedRoleDept, setSelectedRoleDept] = useState<string | null>(null)
  const [selectedSkillCategory, setSelectedSkillCategory] = useState<string | null>(null)
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

  const [roleGroupBy, setRoleGroupBy] = useState<'department' | 'category' | 'none'>('department')

  const renderRoles = () => {
    const allRoles = { ...roles, ...customRoles }
    const selected = selectedRole ? allRoles[selectedRole] : null
    const isCustom = selectedRole ? selectedRole in customRoles : false

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

    // 按类别分组（基础角色 vs 自定义角色）
    const groupByCategory = () => {
      return {
        'base': Object.entries(roles),
        'custom': Object.entries(customRoles),
      }
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
            {/* 角色头部 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: '#556', fontFamily: 'monospace', marginTop: 2 }}>{selectedRole}</div>
              </div>
              <button onClick={() => { setEditingRole(selectedRole!); setEditForm({ ...selected }) }} style={{ padding: '4px 10px', background: 'rgba(100,210,255,0.15)', border: '1px solid rgba(100,210,255,0.3)', borderRadius: 4, color: '#64d2ff', fontSize: 11, cursor: 'pointer' }}>编辑</button>
            </div>

            <p style={{ fontSize: 12, color: '#8899aa', margin: '0 0 12px' }}>{selected.description}</p>

            {/* 关联部门 */}
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

            {/* 工具权限 */}
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

            {/* 技能包 */}
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
              <button onClick={() => handleSaveRole(editingRole)} style={{ flex: 1, padding: '8px 0', background: '#30d158', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>保存</button>
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
              <button onClick={handleCreateRole} disabled={!newRoleForm.name.trim()} style={{ flex: 1, padding: '8px 0', background: newRoleForm.name.trim() ? '#30d158' : '#333', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: newRoleForm.name.trim() ? 'pointer' : 'not-allowed' }}>创建</button>
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
          {/* 操作栏 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => { setShowNewRole(true); setSelectedRole(null); setEditingRole(null) }} style={{ ...btn('#30d158'), marginTop: 0, fontSize: 12, padding: '8px 0', flex: 1 }}>
              + 新建角色
            </button>
          </div>

          {/* 分组切换 */}
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

  /* ───── 渲染：技能包管理 ───── */

  const renderSkills = () => {
    const selected = selectedSkill ? skills[selectedSkill] : null

    // 详情视图
    if (selectedSkill && selected && !showImportSkill) {
      return (
        <>
          <div style={headerStyle}>
            <button onClick={() => setSelectedSkill(null)} style={{ background: 'none', border: 'none', color: '#0a84ff', cursor: 'pointer', fontSize: 13 }}>← 返回列表</button>
            <button style={closeBtn} onClick={onClose} autoFocus>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0', marginBottom: 4 }}>{selected.name}</div>
            <div style={{ fontSize: 11, color: '#556', fontFamily: 'monospace', marginBottom: 12 }}>{selectedSkill}</div>
            <p style={{ fontSize: 12, color: '#8899aa', margin: '0 0 16px' }}>{selected.description}</p>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 6, fontWeight: 600 }}>依赖工具</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(selected.required_tools || []).map(t => {
                const tool = tools[t]
                return (
                  <div key={t} style={{ padding: '6px 10px', background: 'rgba(100,210,255,0.06)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: tool?.dangerous ? '#ff9f0a' : '#64d2ff' }}>{tool?.dangerous ? '⚠' : '✓'}</span>
                    <span style={{ fontSize: 12, color: '#c8d6e5' }}>{tool?.name || t}</span>
                    {tool?.description && <span style={{ fontSize: 10, color: '#556', marginLeft: 'auto' }}>{tool.description}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )
    }

    // 导入表单视图
    if (showImportSkill) {
      return (
        <>
          <div style={headerStyle}>
            <button onClick={() => setShowImportSkill(false)} style={{ background: 'none', border: 'none', color: '#0a84ff', cursor: 'pointer', fontSize: 13 }}>← 取消</button>
            <button style={closeBtn} onClick={onClose} autoFocus>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e8f0', marginBottom: 12 }}>新增技能包</div>
            {importError && <div style={{ padding: '6px 10px', marginBottom: 10, background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 4, color: '#ff453a', fontSize: 11 }}>{importError}</div>}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>技能ID *</div>
              <input value={importSkillForm.id} onChange={e => setImportSkillForm({ ...importSkillForm, id: e.target.value })} placeholder="frontend_dev" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称 *</div>
              <input value={importSkillForm.name} onChange={e => setImportSkillForm({ ...importSkillForm, name: e.target.value })} placeholder="前端开发" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
              <input value={importSkillForm.description} onChange={e => setImportSkillForm({ ...importSkillForm, description: e.target.value })} placeholder="React/Vue组件开发" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>依赖工具</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(tools).map(([id, tool]) => {
                  const active = importSkillForm.required_tools.includes(id)
                  return <span key={id} onClick={() => setImportSkillForm({ ...importSkillForm, required_tools: active ? importSkillForm.required_tools.filter(t => t !== id) : [...importSkillForm.required_tools, id] })} style={tagStyle(active, '#64d2ff')}>{tool.name}</span>
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleImportSkill} style={{ flex: 1, padding: '8px 0', background: '#0a84ff', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>添加</button>
              <button onClick={() => setShowImportSkill(false)} style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        </>
      )
    }

    // 列表视图
    const skillCategories: Record<string, { label: string; icon: string; match: (name: string) => boolean }> = {
      dev: { label: '开发技能', icon: '💻', match: n => /开发|Dev|前端|后端|全栈|API|数据库/.test(n) },
      data: { label: '数据技能', icon: '📊', match: n => /数据|Data|ML|机器学习|ETL|可视化/.test(n) },
      content: { label: '内容技能', icon: '✍️', match: n => /内容|写作|文案|编辑|SEO/.test(n) },
      design: { label: '设计技能', icon: '🎨', match: n => /设计|品牌|平面|UI/.test(n) },
      testing: { label: '测试技能', icon: '🧪', match: n => /测试|审查|安全审计|性能/.test(n) },
      ops: { label: '运维技能', icon: '⚙️', match: n => /运维|DevOps|部署|监控/.test(n) },
      ux: { label: '用户研究', icon: '🔬', match: n => /用户|UX|可用性|画像/.test(n) },
      sales: { label: '销售技能', icon: '💰', match: n => /销售|竞争|赋能/.test(n) },
      general: { label: '通用技能', icon: '📋', match: () => true },
    }

    const categorizeSkill = (name: string): string => {
      for (const [cat, config] of Object.entries(skillCategories)) {
        if (cat !== 'general' && config.match(name)) return cat
      }
      return 'general'
    }

    const skillGroups: Record<string, Array<[string, SkillInfo]>> = {}
    Object.entries(skills).forEach(([id, skill]) => {
      const cat = categorizeSkill(skill.name)
      if (!skillGroups[cat]) skillGroups[cat] = []
      skillGroups[cat].push([id, skill])
    })

    return (
      <>
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>📦 技能包管理</span>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <button onClick={() => { setShowImportSkill(true); setImportError(''); setSelectedSkill(null) }} style={{ ...btn('#0a84ff'), marginTop: 0, fontSize: 12, padding: '8px 0', marginBottom: 12 }}>+ 新增技能包</button>

          {Object.entries(skillCategories).map(([cat, config]) => {
            const catSkills = skillGroups[cat] || []
            if (catSkills.length === 0) return null
            const isExpanded = selectedSkillCategory === cat
            return (
              <div key={cat} style={{ marginBottom: 4 }}>
                <div
                  onClick={() => setSelectedSkillCategory(isExpanded ? null : cat)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500 }}>{config.icon} {config.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#556', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>{catSkills.length}</span>
                    <span style={{ fontSize: 10, color: '#444', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ paddingLeft: 12 }}>
                    {catSkills.map(([id, skill]) => (
                      <div key={id} onClick={() => setSelectedSkill(id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 2, borderRadius: 4, cursor: 'pointer' }}>
                        <span style={{ fontSize: 10, color: '#0a84ff' }}>📦</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#c8d6e5' }}>{skill.name}</div>
                          <div style={{ fontSize: 10, color: '#556' }}>{skill.description}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSkill(id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, opacity: 0.4 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {Object.keys(skills).length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#556', fontSize: 12 }}>暂无技能包</div>
          )}
        </div>
      </>
    )
  }

  /* ───── 渲染：工具包管理 ───── */

  const renderTools = () => {
    const catLabel: Record<string, string> = { file: '📁 文件操作', shell: '💻 命令执行', git: '🔀 Git操作', search: '🔍 搜索', test: '🧪 测试', general: '⚙️ 通用', document: '📄 文档', design: '🎨 设计', data: '📊 数据', ai: '🤖 AI', content: '✍️ 内容' }

    // 导入表单视图
    if (showImportTool) {
      return (
        <>
          <div style={headerStyle}>
            <button onClick={() => setShowImportTool(false)} style={{ background: 'none', border: 'none', color: '#bf5af2', cursor: 'pointer', fontSize: 13 }}>← 取消</button>
            <button style={closeBtn} onClick={onClose} autoFocus>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e8f0', marginBottom: 12 }}>新增工具</div>
            {importError && <div style={{ padding: '6px 10px', marginBottom: 10, background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 4, color: '#ff453a', fontSize: 11 }}>{importError}</div>}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>工具ID *</div>
              <input value={importToolForm.id} onChange={e => setImportToolForm({ ...importToolForm, id: e.target.value })} placeholder="deploy_k8s" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称 *</div>
              <input value={importToolForm.name} onChange={e => setImportToolForm({ ...importToolForm, name: e.target.value })} placeholder="部署到K8s" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
              <input value={importToolForm.description} onChange={e => setImportToolForm({ ...importToolForm, description: e.target.value })} placeholder="部署应用到Kubernetes集群" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>分类</div>
              <select value={importToolForm.category} onChange={e => setImportToolForm({ ...importToolForm, category: e.target.value })} style={selectStyle}>
                {Object.entries(catLabel).map(([id, label]) => <option key={id} value={id} style={{ background: '#1a1a2e' }}>{label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#c8d6e5', cursor: 'pointer' }}>
                <input type="checkbox" checked={importToolForm.dangerous} onChange={e => setImportToolForm({ ...importToolForm, dangerous: e.target.checked })} />
                标记为危险操作
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleImportTool} style={{ flex: 1, padding: '8px 0', background: '#bf5af2', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>添加</button>
              <button onClick={() => setShowImportTool(false)} style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        </>
      )
    }

    // 列表视图
    return (
      <>
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>🔧 工具包管理</span>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <button onClick={() => { setShowImportTool(true); setImportError('') }} style={{ ...btn('#bf5af2'), marginTop: 0, fontSize: 12, padding: '8px 0', marginBottom: 12 }}>+ 新增工具</button>

          {/* 按分类分组 - 手风琴式 */}
          {Object.entries(catLabel).map(([cat, label]) => {
            const catTools = Object.entries(tools).filter(([, t]) => t.category === cat)
            if (catTools.length === 0) return null
            return (
              <div key={cat} style={{ marginBottom: 4 }}>
                <div
                  onClick={() => setSelectedToolCategory(selectedToolCategory === cat ? null : cat)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500 }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#556', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>{catTools.length}</span>
                    <span style={{ fontSize: 10, color: '#444', transform: selectedToolCategory === cat ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                  </div>
                </div>
                {selectedToolCategory === cat && (
                  <div style={{ paddingLeft: 12 }}>
                    {catTools.map(([id, tool]) => (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: tool.dangerous ? '#ff9f0a' : '#30d158' }}>{tool.dangerous ? '⚠' : '✓'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#c8d6e5' }}>{tool.name}</div>
                          <div style={{ fontSize: 10, color: '#556' }}>{tool.description}</div>
                        </div>
                        <button onClick={() => handleDeleteTool(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, opacity: 0.4 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
