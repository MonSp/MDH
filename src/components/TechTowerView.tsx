import React, { useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import type { Project, ProjectDept, CustomTeam, PanelState, CameraTarget } from './techtower'
import { DEFAULT_DEPTS, DEFAULT_PROJECTS, ALL_AGENTS, TowerScene, SidePanel, ViewBookmarks, OverlayButtons } from './techtower'
import CeoChatPanel from './office-team/CeoChatPanel'
import { useLocalStorage } from '../hooks/useLocalStorage'

const CATEGORY_ICONS: Record<string, string> = {
  '软件开发': '💻',
  'AI影视': '🎬',
  '数据分析': '📊',
  '内容创作': '✍️',
  'PPT设计': '📑',
  '物流系统': '🚚',
  '客服系统': '💬',
  '其他': '📋',
  '未分类': '📁',
}

const CATEGORY_COLORS: Record<string, string> = {
  '软件开发': '#3b82f6',
  'AI影视': '#ef4444',
  '数据分析': '#8b5cf6',
  '内容创作': '#f59e0b',
  'PPT设计': '#10b981',
  '物流系统': '#06b6d4',
  '客服系统': '#ec4899',
  '其他': '#6b7280',
  '未分类': '#4b5563',
}

/* ───────── 主组件 ───────── */

interface TechTowerViewProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onStartMeeting: () => void
  onSendTask: (description: string) => void
  onBackToSingle: () => void
  onEnterProject?: (projectId: string, projectName: string) => void
  refreshKey?: number
}

export default function TechTowerView({ wsRef, onStartMeeting, onSendTask, onBackToSingle, onEnterProject, refreshKey }: TechTowerViewProps) {
  void onSendTask

  const {
    isReady,
    isSupported,
    dirName,
    needPermission,
    projects: storedProjects,
    initStorage,
    grantAccess,
    createProject,
    renameProject,
    deleteProject,
    addTask,
    getCategories,
    exportData,
    importData,
  } = useLocalStorage()

  const simplifyName = (name: string) => {
    if (name.startsWith('任务-')) name = name.slice(3)
    if (name.length > 12) name = name.slice(0, 12) + '…'
    return name
  }

  // 合并存储项目和默认项目
  const projects: Project[] = [
    ...storedProjects.map(p => ({
      id: p.project_id,
      name: simplifyName(p.name),
      description: p.category || '本地项目',
      selectedDeptIds: ['dept-software'],
      status: (p.status === 'running' ? 'active' : p.status === 'archived' ? 'completed' : 'planning') as 'planning' | 'active' | 'completed',
      createdAt: new Date(p.created_at).getTime() || Date.now(),
      iterations: p.tasks?.length || 0,
    })),
    ...DEFAULT_PROJECTS,
  ]

  // 获取分类
  const categories = getCategories()
  const categoriesForDisplay: Record<string, Array<{ project_id: string; name: string; status: string; created_at: string }>> = {}
  for (const [cat, projs] of Object.entries(categories)) {
    categoriesForDisplay[cat] = projs.map(p => ({
      project_id: p.project_id,
      name: p.name,
      status: p.status,
      created_at: p.created_at,
    }))
  }

  const [selectedFloor, setSelectedFloor] = useState<string | null>(null)
  const [showFloorPanel, setShowFloorPanel] = useState(false)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [customTeams, setCustomTeams] = useState<CustomTeam[]>([])
  const [panel, setPanel] = useState<PanelState>(null)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const [showCeoChat, setShowCeoChat] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const [cameraNav, setCameraNav] = useState<CameraTarget | null>(null)
  const [fogEnabled, setFogEnabled] = useState(true)
  const [isDayMode, setIsDayMode] = useState(false)

  // 场景元素显示/隐藏控制
  const [showBuildings, setShowBuildings] = useState(true)
  const [showBillboards, setShowBillboards] = useState(true)
  const [showFlyingVehicles, setShowFlyingVehicles] = useState(true)
  const [showBridges, setShowBridges] = useState(true)
  const [showParticles, setShowParticles] = useState(true)
  const [showRain, setShowRain] = useState(true)
  const [showNeonLines, setShowNeonLines] = useState(true)
  const [controlsExpanded, setControlsExpanded] = useState(true)
  const handleNavigate = useCallback((pos: [number, number, number], target: [number, number, number]) => {
    setCameraNav({ pos, target })
  }, [])

  const handleFocusFloor = useCallback((cameraPos: [number, number, number], target: [number, number, number]) => {
    setCameraNav({ pos: cameraPos, target })
  }, [])

  const handleSelectProject = useCallback((p: Project) => setPanel({ type: 'project', data: p }), [])
  const handleSelectDept = useCallback((d: ProjectDept) => setPanel({ type: 'dept', data: d }), [])
  const handleSelectTeam = useCallback((t: CustomTeam) => setPanel({ type: 'team', data: t }), [])
  const handleCreateTeam = useCallback(() => setPanel({ type: 'create-team' }), [])
  const handleOpenRoles = useCallback(() => setPanel({ type: 'roles' }), [])
  const handleOpenSkills = useCallback(() => setPanel({ type: 'skills' }), [])
  const handleOpenTools = useCallback(() => setPanel({ type: 'tools' }), [])
  const handleClose = useCallback(() => setPanel(null), [])

  const activeDeptColor = panel?.type === 'dept' ? panel.data.color : undefined

  const handleDoCreateTeam = useCallback((name: string, memberIds: string[]) => {
    const members = ALL_AGENTS.filter(a => memberIds.includes(a.id))
    setCustomTeams(prev => [...prev, { id: `team-${Date.now()}`, name, members }])
    setPanel(null)
  }, [])

  const handleCreateProject = useCallback(async (deptId: string) => {
    setPanel(null)
    const dept = DEFAULT_DEPTS.find(d => d.deptId === deptId)
    await createProject(`新项目 ${projects.length + 1}`, dept?.name || '其他')
  }, [createProject, projects.length])

  const handleCeoEnterProject = useCallback((projectId: string, meetingId: string) => {
    setShowCeoChat(false)
    onStartMeeting()
  }, [onStartMeeting])

  const handleCeoProjectCreated = useCallback(async (projectId: string) => {
    // CEO创建的项目已经在后端，同步到本地存储
    // 这里可以添加从后端同步的逻辑
  }, [])

  // 处理楼层点击（进入分类视图）
  const handleFloorClick = useCallback((category: string, cameraPos: [number, number, number], target: [number, number, number]) => {
    setSelectedFloor(category)
    setCameraNav({ pos: cameraPos, target })
  }, [])

  // 返回全局视图
  const handleBackToFloors = useCallback(() => {
    setSelectedFloor(null)
    setShowFloorPanel(false)
    setCameraNav({ pos: [30, 55, 45], target: [0, 14, 0] })
  }, [])

  // 点击电脑打开项目面板
  const handleComputerClick = useCallback((category: string) => {
    setShowFloorPanel(true)
  }, [])

  // 重命名项目
  const handleRename = useCallback(async (projectId: string) => {
    if (!renameValue.trim()) return
    await renameProject(projectId, renameValue.trim())
    setRenamingProjectId(null)
    setRenameValue('')
  }, [renameValue, renameProject])

  // 删除项目
  const handleDelete = useCallback(async (projectId: string) => {
    await deleteProject(projectId)
    setDeletingProjectId(null)
  }, [deleteProject])

  // 导出数据
  const handleExport = useCallback(async () => {
    const data = await exportData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tech-tower-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportData])

  // 导入数据
  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const text = await file.text()
        await importData(text)
      }
    }
    input.click()
  }, [importData])

  const [skipSetup, setSkipSetup] = useState(false)

  // 如果需要授权访问已保存的目录
  if (isSupported && needPermission && !skipSetup) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        background: '#080818', color: '#e2e8f0',
      }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <h2 style={{ margin: 0, fontSize: 20 }}>需要访问存储目录</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          检测到之前选择的存储目录，需要你授权访问以加载项目数据。
        </p>
        <button
          onClick={grantAccess}
          style={{
            padding: '12px 32px', borderRadius: 10, cursor: 'pointer',
            fontSize: 15, fontWeight: 600, border: 'none',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
            transition: 'all 0.2s',
          }}
        >
          🔓 授权访问
        </button>
        <button
          onClick={() => setSkipSetup(true)}
          style={{
            padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
            fontSize: 12, border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
            transition: 'all 0.2s',
          }}
        >
          选择其他目录
        </button>
      </div>
    )
  }

  // 如果不支持 File System API 或未选择目录，显示设置提示
  if (isSupported && !dirName && !skipSetup) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        background: '#080818', color: '#e2e8f0',
      }}>
        <div style={{ fontSize: 48 }}>📁</div>
        <h2 style={{ margin: 0, fontSize: 20 }}>选择数据存储目录</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          项目数据将存储在你选择的本地目录中，所有文件以 JSON 格式保存，方便备份和管理。
        </p>
        <button
          onClick={initStorage}
          style={{
            padding: '12px 32px', borderRadius: 10, cursor: 'pointer',
            fontSize: 15, fontWeight: 600, border: 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            color: '#fff', boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
            transition: 'all 0.2s',
          }}
        >
          📂 选择存储目录
        </button>
        <button
          onClick={() => setSkipSetup(true)}
          style={{
            padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
            fontSize: 12, border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
            transition: 'all 0.2s',
          }}
        >
          跳过，使用浏览器本地存储
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#080818', display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
      <Canvas
        shadows
        camera={{ position: [30, 55, 45], fov: 45 }}
        onCreated={({ gl }) => { gl.shadowMap.type = 2 /* PCFSoftShadowMap */ }}
        style={{ width: '100%', height: isMobile ? '60%' : '100%' }}
      >
        <TowerScene
          projects={projects}
          customTeams={customTeams}
          onSelectProject={handleSelectProject}
          onSelectDept={handleSelectDept}
          onSelectTeam={handleSelectTeam}
          onCreateTeam={handleCreateTeam}
          cameraNav={cameraNav}
          onFocusFloor={handleFocusFloor}
          activeDeptColor={activeDeptColor}
          fogEnabled={fogEnabled}
          showBuildings={showBuildings}
          showBillboards={showBillboards}
          showFlyingVehicles={showFlyingVehicles}
          showBridges={showBridges}
          showParticles={showParticles}
          showRain={showRain}
          showNeonLines={showNeonLines}
          isDayMode={isDayMode}
          categories={categoriesForDisplay}
          selectedFloor={selectedFloor}
          onFloorClick={handleFloorClick}
          onEnterProject={onEnterProject}
          onComputerClick={handleComputerClick}
        />
      </Canvas>

      {/* 楼层项目管理面板（点击电脑后弹出） */}
      {showFloorPanel && (
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
              <button onClick={handleExport} style={{
                padding: '4px 10px', borderRadius: 4,
                border: '1px solid rgba(59,130,246,0.4)',
                background: 'rgba(59,130,246,0.15)',
                color: '#60a5fa', fontSize: 11, cursor: 'pointer',
              }}>导出</button>
              <button onClick={handleImport} style={{
                padding: '4px 10px', borderRadius: 4,
                border: '1px solid rgba(16,185,129,0.4)',
                background: 'rgba(16,185,129,0.15)',
                color: '#10b981', fontSize: 11, cursor: 'pointer',
              }}>导入</button>
              <button onClick={() => setShowFloorPanel(false)} style={{
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
                      onClick={() => setSelectedFloor(cat)}
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
                      const statusMap: Record<string, { label: string; color: string; bg: string }> = {
                        active: { label: '进行中', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
                        completed: { label: '已完成', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
                        planning: { label: '规划中', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
                        created: { label: '已创建', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
                        running: { label: '运行中', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
                      }
                      const st = statusMap[proj.status] ?? statusMap.planning
                      const timeStr = new Date(proj.created_at).toLocaleString('zh-CN', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })

                      return (
                        <div
                          key={proj.project_id}
                          onClick={() => {
                            if (renamingProjectId === proj.project_id) return
                            setShowFloorPanel(false)
                            setSelectedFloor(null)
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
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* 白天/晚上切换按钮 */}
      <div
        onClick={() => setIsDayMode(v => !v)}
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10,
          padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14, fontWeight: 600, letterSpacing: '0.5px', border: 'none',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          transition: 'background 0.4s, box-shadow 0.4s',
          ...(isDayMode
            ? { background: 'rgba(255,248,220,0.9)', color: '#8b6914', boxShadow: '0 2px 12px rgba(255,200,50,0.3)' }
            : { background: 'rgba(15,10,30,0.85)', color: '#a78bfa', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }
          ),
        }}
      >
        {isDayMode ? '☀️ 白天模式' : '🌙 夜晚模式'}
      </div>

      {/* 返回楼层按钮（当进入某个分类时显示） */}
      {selectedFloor && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <button
            onClick={handleBackToFloors}
            style={{
              padding: '10px 24px', borderRadius: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 600, border: '1px solid rgba(139,92,246,0.5)',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.3))',
              color: '#fff', boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
              backdropFilter: 'blur(12px)', transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 16 }}>🏢</span>
            <span>返回大楼全景</span>
          </button>
          <div style={{
            fontSize: 11, color: '#9ca3af',
            background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 6,
            backdropFilter: 'blur(8px)',
          }}>
            当前在: {selectedFloor}
          </div>
        </div>
      )}

      {/* 面板标题提示 */}
      {!panel && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 24, zIndex: 10,
        }}>
          <div style={{
            padding: '8px 18px', borderRadius: 8,
            background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.25)',
            color: '#30d158', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(10px)',
          }}>
            正面 → 项目工作间
          </div>
          <div style={{
            padding: '8px 18px', borderRadius: 8,
            background: 'rgba(10,132,255,0.12)', border: '1px solid rgba(10,132,255,0.25)',
            color: '#0a84ff', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(10px)',
          }}>
            右侧 → 部门与团队
          </div>
        </div>
      )}

      <ViewBookmarks onNavigate={handleNavigate} />
      <SidePanel panel={panel} onClose={handleClose} onCreateTeam={handleDoCreateTeam} onCreateProject={handleCreateProject} onEnterProject={onEnterProject} isMobile={isMobile} depts={DEFAULT_DEPTS} />
      <OverlayButtons onStartMeeting={onStartMeeting} onBackToSingle={onBackToSingle} />

      {/* CEO对话入口按钮 */}
      {!showCeoChat && (
        <button
          onClick={() => setShowCeoChat(true)}
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 14, fontWeight: 600, border: 'none',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(59, 130, 246, 0.9))',
            color: '#fff',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.4), 0 4px 16px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s',
          }}
        >
          🧠 与CEO对话
        </button>
      )}

      {/* 资源管理入口按钮组 - 左侧竖排 */}
      <div style={{ position: 'absolute', top: 60, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={handleOpenRoles}
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
          onClick={handleOpenSkills}
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
          onClick={handleOpenTools}
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

      {/* CEO对话面板 */}
      {showCeoChat && (
        <CeoChatPanel
          wsRef={wsRef}
          onEnterProject={handleCeoEnterProject}
          onProjectCreated={handleCeoProjectCreated}
          onClose={() => setShowCeoChat(false)}
        />
      )}

      {/* 右下角场景控制面板 */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {controlsExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(5,5,15,0.85)', borderRadius: 8, padding: 10, border: '1px solid rgba(0,238,255,0.2)', backdropFilter: 'blur(12px)' }}>
            <div style={{ color: '#00eeff', fontSize: 11, fontFamily: 'monospace', marginBottom: 4, opacity: 0.7 }}>SCENE CONTROLS</div>
            {[
              { label: 'Buildings', active: showBuildings, toggle: () => setShowBuildings(v => !v) },
              { label: 'Billboards', active: showBillboards, toggle: () => setShowBillboards(v => !v) },
              { label: 'Flying Objects', active: showFlyingVehicles, toggle: () => setShowFlyingVehicles(v => !v) },
              { label: 'Sky Bridges', active: showBridges, toggle: () => setShowBridges(v => !v) },
              { label: 'Particles', active: showParticles, toggle: () => setShowParticles(v => !v) },
              { label: 'Rain', active: showRain, toggle: () => setShowRain(v => !v) },
              { label: 'Neon Lines', active: showNeonLines, toggle: () => setShowNeonLines(v => !v) },
              { label: 'Fog', active: fogEnabled, toggle: () => setFogEnabled(v => !v) },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.toggle}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  border: `1px solid ${btn.active ? 'rgba(0,238,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 4,
                  background: btn.active ? 'rgba(0,238,255,0.1)' : 'rgba(0,0,0,0.4)',
                  color: btn.active ? '#00eeff' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
                  transition: 'all 0.2s', userSelect: 'none', whiteSpace: 'nowrap',
                }}
              >
                {btn.active ? '◈' : '◇'} {btn.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setControlsExpanded(v => !v)}
          style={{
            width: 36, height: 36, borderRadius: 6,
            border: '1px solid rgba(0,238,255,0.4)',
            background: 'rgba(0,0,0,0.6)', color: '#00eeff',
            cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}
          title="Scene Controls"
        >
          {controlsExpanded ? '×' : '⚙'}
        </button>
      </div>
    </div>
  )
}
