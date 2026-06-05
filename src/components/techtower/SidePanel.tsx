import React, { useState, useEffect } from 'react'
import type { Project, ProjectDept, CustomTeam, PanelState } from './types'
import { DEFAULT_DEPTS, STATUS_MAP, ALL_AGENTS } from './constants'

/* ───────── 侧边详情面板 ───────── */

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (panel) {
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    }
  }, [panel, onClose])

  if (!panel) return null

  const toggleMember = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    ...(isMobile
      ? { bottom: 0, left: 0, right: 0, width: '100%', height: '50%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }
      : { top: 0, right: 0, width: 360, height: '100%' }
    ),
    background: 'linear-gradient(180deg, rgba(10,10,30,0.94), rgba(5,5,20,0.97))',
    borderLeft: isMobile ? 'none' : '1px solid',
    borderTop: isMobile ? '1px solid' : 'none',
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
    background: 'none', border: 'none', color: '#667', fontSize: 20,
    cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
  }

  const badge = (text: string, color: string): React.CSSProperties => {
    let animation = ''
    if (text === '进行中') animation = 'status-slide 2s ease-in-out infinite'
    else if (text === '规划中') animation = 'status-dash 1.5s ease-in-out infinite'
    else if (text === '已完成') animation = 'none'
    return {
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, color, background: `${color}20`,
      border: text === '规划中' ? `1px dashed ${color}60` : `1px solid ${color}40`,
      animation,
    }
  }

  const memberRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 8, marginBottom: 4,
    background: 'rgba(255,255,255,0.03)', fontSize: 13,
  }

  const btn = (color: string): React.CSSProperties => ({
    width: '100%', padding: '10px 0', borderRadius: 8,
    background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
    border: `1px solid ${color}60`, color: '#fff', fontWeight: 700,
    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12,
  })

  const avatarCircle: React.CSSProperties = {
    width: 44, height: 44, borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(100,210,255,0.2), rgba(191,90,242,0.2))',
    border: '1px solid rgba(100,210,255,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, color: '#e0e8f0', fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.2s',
    flexShrink: 0,
  }

  const scrollRow: React.CSSProperties = {
    display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
    scrollbarWidth: 'thin', scrollbarColor: 'rgba(100,210,255,0.2) transparent',
  }

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
          <span style={badge(st.label, st.color)}>
            {st.label === '已完成' && <span style={{ marginRight: 4 }}>✓</span>}
            {st.label}
            {st.label === '进行中' && (
              <span style={{
                display: 'inline-block', width: 4, height: 4, borderRadius: '50%',
                background: st.color, marginLeft: 6,
                animation: 'status-slide 2s ease-in-out infinite',
              }} />
            )}
          </span>
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
              <div style={{ ...avatarCircle, borderColor: dept.color + '60' }}>
                {m.name.charAt(0)}
              </div>
              <div style={{ fontSize: 11, color: '#d0dce8', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div style={{ fontSize: 9, color: '#667', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.title}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 6 }}>技术标签</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dept.keywords.map(k => (
            <span key={k} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.06)', color: '#8899aa' }}>{k}</span>
          ))}
        </div>
      </div>
      <button style={btn(dept.color)} onClick={() => onCreateProject(dept.deptId)}>创建项目</button>
    </>
  )

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
              <div style={avatarCircle}>
                {m.name.charAt(0)}
              </div>
              <div style={{ fontSize: 11, color: '#d0dce8', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div style={{ fontSize: 9, color: '#667', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.title}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const renderCreateTeam = () => (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>创建新团队</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 6 }}>团队名称</div>
        <input
          value={teamName}
          onChange={e => setTeamName(e.target.value)}
          placeholder="输入团队名称..."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(100,210,255,0.2)',
            color: '#e0e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
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
                  <div
                    key={agent.id}
                    className={`agent-card ${picked ? 'selected' : ''}`}
                    onClick={() => toggleMember(agent.id)}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: picked
                        ? `linear-gradient(135deg, ${dept.color}40, ${dept.color}20)`
                        : 'rgba(255,255,255,0.05)',
                      border: picked ? `2px solid ${dept.color}` : '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: picked ? '#fff' : '#8899aa',
                      transition: 'all 0.2s',
                    }}>
                      {picked ? '✓' : agent.name.charAt(0)}
                    </div>
                    <div style={{ fontSize: 10, color: picked ? '#e0e8f0' : '#667', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: 9, color: '#556', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {agent.title}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button
        style={btn('#ff9f0a')}
        onClick={() => {
          if (teamName.trim() && selectedIds.length > 0) {
            onCreateTeam(teamName.trim(), selectedIds)
            setTeamName('')
            setSelectedIds([])
          }
        }}
      >
        创建团队 ({selectedIds.length} 人)
      </button>
    </>
  )

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
        {isMobile && (
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: 'rgba(100,210,255,0.3)',
            margin: '0 auto 12px',
          }} />
        )}
        {panel.type === 'project' && renderProject(panel.data)}
        {panel.type === 'dept' && renderDept(panel.data)}
        {panel.type === 'team' && renderTeam(panel.data)}
        {panel.type === 'create-team' && renderCreateTeam()}
      </div>
    </>
  )
}

export default SidePanel
