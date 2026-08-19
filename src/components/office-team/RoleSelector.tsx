/**
 * RoleSelector — 角色选择组件
 *
 * 从 CeoChatPanel 提取的角色选择逻辑。
 */

import React from 'react'

interface RoleInfo {
  id: string
  name: string
  emoji: string
  dept: string
}

interface RoleSelectorProps {
  roles: RoleInfo[]
  selectedRoles: string[]
  roleLocations: Record<string, 'local' | 'remote'>
  autoMode: boolean
  onToggleRole: (roleId: string) => void
  onToggleLocation: (roleId: string) => void
  onToggleAutoMode: () => void
}

const DEPT_COLORS: Record<string, string> = {
  architecture: '#8b5cf6',
  frontend: '#3b82f6',
  backend: '#10b981',
  qa: '#ef4444',
  devops: '#f59e0b',
  pm: '#06b6d4',
}

const DEPT_NAMES: Record<string, string> = {
  architecture: '架构',
  frontend: '前端',
  backend: '后端',
  qa: '质量',
  devops: '运维',
  pm: '产品',
}

export default function RoleSelector({
  roles,
  selectedRoles,
  roleLocations,
  autoMode,
  onToggleRole,
  onToggleLocation,
  onToggleAutoMode,
}: RoleSelectorProps) {
  // 按部门分组
  const grouped = roles.reduce<Record<string, RoleInfo[]>>((acc, role) => {
    if (!acc[role.dept]) acc[role.dept] = []
    acc[role.dept].push(role)
    return acc
  }, {})

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>👥 角色选择</span>
        <button
          style={autoMode ? styles.autoBtnActive : styles.autoBtn}
          onClick={onToggleAutoMode}
        >
          {autoMode ? '🤖 自动' : '🔧 手动'}
        </button>
      </div>

      {!autoMode && (
        <div style={styles.roleGrid}>
          {Object.entries(grouped).map(([dept, deptRoles]) => (
            <div key={dept} style={styles.deptGroup}>
              <div style={{ ...styles.deptLabel, color: DEPT_COLORS[dept] || '#94a3b8' }}>
                {DEPT_NAMES[dept] || dept}
              </div>
              <div style={styles.deptRoles}>
                {deptRoles.map(role => {
                  const isSelected = selectedRoles.includes(role.id)
                  const location = roleLocations[role.id] || 'local'
                  return (
                    <div key={role.id} style={styles.roleItem}>
                      <button
                        style={isSelected ? styles.roleBtnSelected : styles.roleBtn}
                        onClick={() => onToggleRole(role.id)}
                      >
                        <span style={styles.roleEmoji}>{role.emoji}</span>
                        <span style={styles.roleName}>{role.name}</span>
                      </button>
                      {isSelected && (
                        <button
                          style={location === 'local' ? styles.locationLocal : styles.locationRemote}
                          onClick={() => onToggleLocation(role.id)}
                          title={location === 'local' ? '本地执行' : '远端执行'}
                        >
                          {location === 'local' ? '💻' : '☁️'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
  },
  autoBtn: {
    padding: '4px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#94a3b8',
    fontSize: '11px',
    cursor: 'pointer',
  },
  autoBtnActive: {
    padding: '4px 10px',
    background: 'rgba(139, 92, 246, 0.15)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '6px',
    color: '#a78bfa',
    fontSize: '11px',
    cursor: 'pointer',
  },
  roleGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  deptGroup: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  deptLabel: {
    fontSize: '10px',
    fontWeight: 600,
    minWidth: '32px',
    paddingTop: '6px',
  },
  deptRoles: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  roleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  roleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    color: '#94a3b8',
    fontSize: '11px',
    cursor: 'pointer',
  },
  roleBtnSelected: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: 'rgba(139, 92, 246, 0.15)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '6px',
    color: '#a78bfa',
    fontSize: '11px',
    cursor: 'pointer',
  },
  roleEmoji: {
    fontSize: '12px',
  },
  roleName: {
    fontSize: '11px',
  },
  locationLocal: {
    padding: '2px 4px',
    background: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '4px',
    fontSize: '10px',
    cursor: 'pointer',
  },
  locationRemote: {
    padding: '2px 4px',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '4px',
    fontSize: '10px',
    cursor: 'pointer',
  },
}
