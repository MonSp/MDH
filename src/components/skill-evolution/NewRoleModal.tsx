import React from 'react'
import type { ToolInfo, SkillInfo, RoleConfig } from './RoleConfigPanel.types'

interface NewRoleModalProps {
  newRoleForm: {
    name: string
    description: string
    base_role: string
    extra_tools: string[]
    extra_skills: string[]
    custom_prompt: string
  }
  setNewRoleForm: React.Dispatch<React.SetStateAction<{
    name: string
    description: string
    base_role: string
    extra_tools: string[]
    extra_skills: string[]
    custom_prompt: string
  }>>
  roles: Record<string, RoleConfig>
  tools: Record<string, ToolInfo>
  skills: Record<string, SkillInfo>
  onClose: () => void
  onCreate: () => void
}

export default function NewRoleModal({
  newRoleForm,
  setNewRoleForm,
  roles,
  tools,
  skills,
  onClose,
  onCreate,
}: NewRoleModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 24, width: 500, maxHeight: '80vh', overflow: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ margin: '0 0 16px', color: '#e2e8f0' }}>新建自定义角色</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>角色名称</label>
          <input
            value={newRoleForm.name}
            onChange={e => setNewRoleForm({ ...newRoleForm, name: e.target.value })}
            placeholder="例如：安全开发工程师"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13, background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>描述</label>
          <input
            value={newRoleForm.description}
            onChange={e => setNewRoleForm({ ...newRoleForm, description: e.target.value })}
            placeholder="角色的职责描述"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13, background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>继承基础角色</label>
          <select
            value={newRoleForm.base_role}
            onChange={e => setNewRoleForm({ ...newRoleForm, base_role: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13, background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' }}
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
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: `1px solid ${newRoleForm.extra_tools.includes(id) ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, cursor: 'pointer', background: newRoleForm.extra_tools.includes(id) ? 'rgba(139,92,246,0.15)' : 'rgba(0,0,0,0.1)', color: newRoleForm.extra_tools.includes(id) ? '#a78bfa' : '#9ca3af' }}>
                <input
                  type="checkbox"
                  checked={newRoleForm.extra_tools.includes(id)}
                  onChange={e => setNewRoleForm({ ...newRoleForm, extra_tools: e.target.checked ? [...newRoleForm.extra_tools, id] : newRoleForm.extra_tools.filter(t => t !== id) })}
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
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', border: `1px solid ${newRoleForm.extra_skills.includes(id) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, cursor: 'pointer', background: newRoleForm.extra_skills.includes(id) ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.1)', color: newRoleForm.extra_skills.includes(id) ? '#60a5fa' : '#9ca3af' }}>
                <input
                  type="checkbox"
                  checked={newRoleForm.extra_skills.includes(id)}
                  onChange={e => setNewRoleForm({ ...newRoleForm, extra_skills: e.target.checked ? [...newRoleForm.extra_skills, id] : newRoleForm.extra_skills.filter(s => s !== id) })}
                  style={{ display: 'none' }}
                />
                {skill.name}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', color: '#9ca3af', fontFamily: 'inherit' }}>取消</button>
          <button onClick={onCreate} disabled={!newRoleForm.name} style={{ padding: '8px 16px', background: newRoleForm.name ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : 'rgba(255,255,255,0.06)', color: '#fff', border: 'none', borderRadius: 6, cursor: newRoleForm.name ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>创建</button>
        </div>
      </div>
    </div>
  )
}
