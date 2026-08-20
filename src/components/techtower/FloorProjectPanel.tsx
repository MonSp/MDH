import React, { useState, useCallback } from 'react'
import { CATEGORY_ICONS, CATEGORY_COLORS } from './constants'

interface FloorProjectEntry {
  project_id: string
  name: string
  status: string
  created_at: string
}

interface FloorProjectPanelProps {
  categoriesForDisplay: Record<string, FloorProjectEntry[]>
  selectedFloor: string | null
  onSelectFloor: (cat: string) => void
  onClose: () => void
  onEnterProject?: (projectId: string, projectName: string) => void
  onExport: () => void
  onImport: () => void
}

export default function FloorProjectPanel({
  categoriesForDisplay,
  selectedFloor,
  onSelectFloor,
  onClose,
  onEnterProject,
  onExport,
  onImport,
}: FloorProjectPanelProps) {
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)

  const handleRename = useCallback(async (projectId: string) => {
    // Rename is handled via onEnterProject not applicable here; keep placeholder
    setRenamingProjectId(null)
    setRenameValue('')
  }, [])

  const handleDelete = useCallback((projectId: string) => {
    setDeletingProjectId(null)
  }, [])

  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    active: { label: '进行中', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    completed: { label: '已完成', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
    planning: { label: '规划中', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
    created: { label: '已创建', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
    running: { label: '运行中', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  }

  return (
    <>
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 500,
        background: 'rgba(10, 10, 30, 0.97)',
        borderLeft: '1px solid rgba(139, 92, 246, 0.3)',
        display: 'flex', flexDirection: 'column',
        zIndex: 200,
        animation: 'slideInRight 0.3s ease',
      }}>
        {/* 面板头部 */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
            📂 项目管理中心
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onExport} style={{
              padding: '4px 10px', borderRadius: 4,
              border: '1px solid rgba(59,130,246,0.4)',
              background: 'rgba(59,130,246,0.15)',
              color: '#60a5fa', fontSize: 11, cursor: 'pointer',
            }}>导出</button>
            <button onClick={onImport} style={{
              padding: '4px 10px', borderRadius: 4,
              border: '1px solid rgba(16,185,129,0.4)',
              background: 'rgba(16,185,129,0.15)',
              color: '#10b981', fontSize: 11, cursor: 'pointer',
            }}>导入</button>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#9ca3af', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>

        {/* 内容区：左侧分类导航 + 右侧项目列表 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左侧分类导航 */}
          <div style={{
            width: 160,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto',
            padding: '8px',
          }}>
            {Object.keys(categoriesForDisplay)
              .sort((a, b) => (categoriesForDisplay[b]?.length || 0) - (categoriesForDisplay[a]?.length || 0))
              .map(cat => {
                const color = CATEGORY_COLORS[cat] || '#6b7280'
                const icon = CATEGORY_ICONS[cat] || '📋'
                const isActive = selectedFloor === cat

                return (
                  <div
                    key={cat}
                    onClick={() => onSelectFloor(cat)}
                    style={{
                      padding: '10px 12px',
                      marginBottom: 4,
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      background: isActive ? `${color}20` : 'transparent',
                      border: `1px solid ${isActive ? `${color}40` : 'transparent'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{icon}</span>
                      <div>
                        <div style={{
                          fontSize: 12, fontWeight: isActive ? 700 : 500,
                          color: isActive ? '#fff' : '#9ca3af',
                        }}>{cat}</div>
                        <div style={{ fontSize: 10, color: '#6b7280' }}>
                          {categoriesForDisplay[cat]?.length || 0} 个
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>

          {/* 右侧项目列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {selectedFloor && categoriesForDisplay[selectedFloor] ? (
              <>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 12,
                  padding: '8px 12px',
                  background: 'rgba(139,92,246,0.1)',
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>{CATEGORY_ICONS[selectedFloor] || '📋'}</span>
                  <span>{selectedFloor}</span>
                  <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
                    {categoriesForDisplay[selectedFloor].length} 个项目
                  </span>
                </div>

                {/* 按时间排序（最新在前） */}
                {[...categoriesForDisplay[selectedFloor]]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((proj) => {
                    const st = statusMap[proj.status] ?? statusMap.planning
                    const timeStr = new Date(proj.created_at).toLocaleString('zh-CN', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })

                    return (
                      <div
                        key={proj.project_id}
                        onClick={() => {
                          if (renamingProjectId === proj.project_id) return
                          onClose()
                          if (onEnterProject) {
                            onEnterProject(proj.project_id, proj.name)
                          }
                        }}
                        style={{
                          padding: '12px 14px',
                          marginBottom: 8,
                          borderRadius: 10,
                          background: renamingProjectId === proj.project_id ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${renamingProjectId === proj.project_id ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                          cursor: renamingProjectId === proj.project_id ? 'default' : 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          {renamingProjectId === proj.project_id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRename(proj.project_id)
                                  if (e.key === 'Escape') { setRenamingProjectId(null); setRenameValue('') }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                                style={{
                                  flex: 1, padding: '4px 8px', borderRadius: 4,
                                  border: '1px solid rgba(139,92,246,0.4)',
                                  background: 'rgba(0,0,0,0.3)',
                                  color: '#e2e8f0', fontSize: 12, outline: 'none',
                                }}
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRename(proj.project_id) }}
                                style={{
                                  padding: '4px 8px', borderRadius: 4,
                                  border: '1px solid rgba(16,185,129,0.4)',
                                  background: 'rgba(16,185,129,0.15)',
                                  color: '#10b981', fontSize: 11, cursor: 'pointer',
                                }}
                              >✓</button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setRenamingProjectId(null); setRenameValue('') }}
                                style={{
                                  padding: '4px 8px', borderRadius: 4,
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  background: 'rgba(255,255,255,0.05)',
                                  color: '#9ca3af', fontSize: 11, cursor: 'pointer',
                                }}
                              >✕</button>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                                  background: st.bg, color: st.color,
                                }}>{st.label}</span>
                                {deletingProjectId === proj.project_id ? (
                                  <>
                                    <span style={{ fontSize: 10, color: '#f59e0b', whiteSpace: 'nowrap' }}>确认删除?</span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDelete(proj.project_id) }}
                                      style={{
                                        padding: '3px 8px', borderRadius: 4,
                                        border: '1px solid rgba(239,68,68,0.5)',
                                        background: 'rgba(239,68,68,0.2)',
                                        color: '#ef4444', fontSize: 10, cursor: 'pointer', fontWeight: 600,
                                      }}
                                    >删除</button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeletingProjectId(null) }}
                                      style={{
                                        padding: '3px 8px', borderRadius: 4,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#9ca3af', fontSize: 10, cursor: 'pointer',
                                      }}
                                    >取消</button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setRenamingProjectId(proj.project_id)
                                        setRenameValue(proj.name)
                                      }}
                                      style={{
                                        width: 22, height: 22, borderRadius: 4,
                                        border: '1px solid rgba(59,130,246,0.3)',
                                        background: 'rgba(59,130,246,0.1)',
                                        color: '#3b82f6', fontSize: 11, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                      title="重命名"
                                    >✎</button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeletingProjectId(proj.project_id) }}
                                      style={{
                                        width: 22, height: 22, borderRadius: 4,
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        background: 'rgba(239,68,68,0.1)',
                                        color: '#ef4444', fontSize: 12, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                      title="删除项目"
                                    >×</button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        {renamingProjectId !== proj.project_id && deletingProjectId !== proj.project_id && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
                              {proj.project_id.slice(0, 16)}...
                            </div>
                            <div style={{ fontSize: 10, color: '#4b5563' }}>{timeStr}</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
              </>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: '#6b7280', fontSize: 13,
              }}>
                ← 请选择分类
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}
