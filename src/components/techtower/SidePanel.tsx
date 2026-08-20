import React, { useState, useEffect } from 'react'
import type { Project, ProjectDept, CustomTeam, PanelState, RoleConfig, ToolInfo, SkillInfo } from './types'
import { DEFAULT_DEPTS, STATUS_MAP, ALL_AGENTS } from './constants'
import { useRolesConfig } from './useRolesConfig'
import RolePanel from './RolePanel'
import SkillPanel from './SkillPanel'
import ToolPanel from './ToolPanel'
import RolePanel from './RolePanel'
import SkillPanel from './SkillPanel'
import ToolPanel from './ToolPanel'

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

export const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(100,210,255,0.1)',
}

export const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#667', fontSize: 20, cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
}

export const btn = (color: string): React.CSSProperties => ({
  width: '100%', padding: '10px 0', borderRadius: 8,
  background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
  border: `1px solid ${color}60`, color: '#fff', fontWeight: 700,
  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12,
})

export const badge = (text: string, color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, color, background: `${color}20`,
  border: `1px solid ${color}40`,
})

/* ───────── 主组件 ───────── */

function SidePanel({ panel, onClose, onCreateTeam, onCreateProject, onEnterProject, isMobile, depts }: {
  panel: PanelState
  onClose: () => void
  onCreateTeam: (name: string, memberIds: string[]) => void
  onCreateProject: (deptId: string) => void
  onEnterProject?: (projectId: string, projectName: string) => void
  isMobile?: boolean
  depts?: ProjectDept[]
}) {
  const [teamName, setTeamName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const deptList = depts ?? DEFAULT_DEPTS

  // 角色/技能/工具配置（从 hook 获取数据和 CRUD 操作）
  const {
    roles, customRoles, tools, skills, loadingRoles,
    loadRolesConfig, handleSaveRole, handleCreateRole, handleDeleteRole,
    handleGenerateSkill, handleImportSkill, handleDeleteSkill,
    handleImportTool, handleDeleteTool,
  } = useRolesConfig()

  // UI 状态（角色/技能/工具子面板内部管理）

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (panel) { document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler) }
  }, [panel, onClose])

  useEffect(() => {
    if (panel?.type === 'roles' || panel?.type === 'skills' || panel?.type === 'tools') loadRolesConfig()
  }, [panel, loadRolesConfig])

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

  // headerStyle, closeBtn, btn, badge 已移到模块级（供子组件使用）

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
        <button style={btn('#64d2ff')} onClick={() => { onEnterProject?.(proj.id, proj.name); onClose() }}>进入工作间</button>
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

  /* ───── 渲染：角色/技能/工具管理（已提取为子组件） ───── */

  // renderRoles / renderSkills / renderTools 已迁移到 RolePanel / SkillPanel / ToolPanel
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

  /* ───── 渲染：技能包/工具包管理（已提取为子组件） ───── */

  // renderSkills / renderTools 已迁移到 SkillPanel / ToolPanel

