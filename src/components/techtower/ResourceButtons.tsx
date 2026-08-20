import React from 'react'

interface ResourceButtonsProps {
  onOpenRoles: () => void
  onOpenSkills: () => void
  onOpenTools: () => void
}

export default function ResourceButtons({ onOpenRoles, onOpenSkills, onOpenTools }: ResourceButtonsProps) {
  return (
    <div style={{ position: 'absolute', top: 60, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={onOpenRoles}
        style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600, border: '1px solid rgba(48,209,88,0.3)',
          background: 'rgba(48,209,88,0.15)',
          color: '#30d158',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s',
        }}
      >
        👥 角色管理
      </button>
      <button
        onClick={onOpenSkills}
        style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600, border: '1px solid rgba(10,132,255,0.3)',
          background: 'rgba(10,132,255,0.15)',
          color: '#0a84ff',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s',
        }}
      >
        📦 技能包
      </button>
      <button
        onClick={onOpenTools}
        style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600, border: '1px solid rgba(191,90,242,0.3)',
          background: 'rgba(191,90,242,0.15)',
          color: '#bf5af2',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s',
        }}
      >
        🔧 工具包
      </button>
    </div>
  )
}
