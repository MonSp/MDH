/**
 * RoleSelector — 角色选择组件
 *
 * 从 CeoChatPanel 提取的角色选择逻辑。
 */

import React from 'react'
import type { RoleInfo } from './ceo-types'
import { PRESET_ROLES, DEPT_COLORS, DEPT_NAMES } from './ceo-constants'

interface RoleSelectorProps {
  selectedRoles: string[]
  roleLocations: Record<string, 'local' | 'remote'>
  autoMode: boolean
  showRoleSelector: boolean
  onToggleRole: (roleId: string) => void
  onToggleLocation: (roleId: string) => void
  onAutoModeChange: (auto: boolean) => void
  onToggleShow: () => void
}

export default function RoleSelector({
  selectedRoles,
  roleLocations,
  autoMode,
  showRoleSelector,
  onToggleRole,
  onToggleLocation,
  onAutoModeChange,
  onToggleShow,
}: RoleSelectorProps) {
  return (
    <div style={styles.roleSection}>
      <div style={styles.roleHeader} onClick={onToggleShow}>
        <span style={{ fontSize: 12, color: '#8b9dc3' }}>
          👥 团队成员 {autoMode ? '(CEO智能组队)' : `(${selectedRoles.length}人)`}
        </span>
        <span style={{ fontSize: 11, color: '#667', transform: showRoleSelector ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {/* 已选角色标签 */}
      {!showRoleSelector && (
        <div style={styles.roleTags}>
          {autoMode ? (
            <span style={{ ...styles.roleTag, borderColor: '#8b5cf640', color: '#a78bfa' }}>
              🤖 CEO智能组队
            </span>
          ) : (
            selectedRoles.map(id => {
              const role = PRESET_ROLES.find(r => r.id === id)
              if (!role) return null
              const color = DEPT_COLORS[role.department || ''] || '#64d2ff'
              const loc = roleLocations[id] || 'local'
              const locIcon = loc === 'local' ? '💻' : '☁️'
              const locLabel = loc === 'local' ? '本地' : '远端'
              return (
                <span
                  key={id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleLocation(id)
                  }}
                  style={{ ...styles.roleTag, borderColor: color + '40', color, cursor: 'pointer' }}
                  title={`点击切换执行位置 (当前: ${locLabel})`}
                >
                  {locIcon} {role.name}
                </span>
              )
            })
          )}
        </div>
      )}

      {/* 角色选择面板 */}
      {showRoleSelector && (
        <div style={styles.roleSelector}>
          {/* CEO智能组队选项 */}
          <div
            onClick={() => onAutoModeChange(true)}
            style={{
              ...styles.roleOption,
              background: autoMode ? '#8b5cf620' : 'rgba(255,255,255,0.03)',
              borderColor: autoMode ? '#8b5cf660' : 'rgba(255,255,255,0.08)',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>🤖</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: autoMode ? 700 : 400, color: autoMode ? '#a78bfa' : '#8b9dc3' }}>
                CEO智能组队
              </div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>根据任务自动选择最佳团队配置</div>
            </div>
          </div>

          {/* 手动选择分隔线 */}
          <div style={{ fontSize: 10, color: '#4b5563', padding: '4px 0', marginBottom: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            或手动选择角色：
          </div>

          {Object.entries(DEPT_NAMES).map(([deptId, deptName]) => {
            const deptRoles = PRESET_ROLES.filter(r => r.department === deptId)
            if (deptRoles.length === 0) return null
            const color = DEPT_COLORS[deptId]
            return (
              <div key={deptId} style={styles.deptGroup}>
                <div style={{ ...styles.deptLabel, color }}>{deptName}</div>
                <div style={styles.deptRoles}>
                  {deptRoles.map(role => {
                    const isSelected = selectedRoles.includes(role.id)
                    const loc = roleLocations[role.id] || 'local'
                    return (
                      <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div
                          onClick={() => {
                            onAutoModeChange(false)
                            onToggleRole(role.id)
                          }}
                          style={{
                            ...styles.roleOption,
                            flex: 1,
                            background: isSelected ? color + '20' : 'rgba(255,255,255,0.03)',
                            borderColor: isSelected ? color + '60' : 'rgba(255,255,255,0.08)',
                            opacity: autoMode ? 0.5 : 1,
                          }}
                          title={role.description}
                        >
                          <div style={{ fontSize: 11, fontWeight: isSelected ? 600 : 400, color: isSelected ? color : '#8b9dc3' }}>
                            {role.name}
                          </div>
                        </div>
                        {isSelected && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleLocation(role.id)
                            }}
                            style={{
                              fontSize: 9,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: loc === 'local' ? '#0a84ff20' : '#ff9f0a20',
                              color: loc === 'local' ? '#0a84ff' : '#ff9f0a',
                              border: `1px solid ${loc === 'local' ? '#0a84ff40' : '#ff9f0a40'}`,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              userSelect: 'none',
                            }}
                            title="点击切换：本地💻 / 远端☁️"
                          >
                            {loc === 'local' ? '💻 本地' : '☁️ 远端'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  roleSection: {
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
  },
  roleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    cursor: 'pointer',
  },
  roleTags: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    padding: '0 14px 8px',
  },
  roleTag: {
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 10,
    border: '1px solid',
    background: 'rgba(255,255,255,0.03)',
  },
  roleSelector: {
    padding: '0 14px 10px',
    maxHeight: 200,
    overflowY: 'auto' as const,
  },
  deptGroup: {
    marginBottom: 8,
  },
  deptLabel: {
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  deptRoles: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  roleOption: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
}
