import React, { useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import type { Project, ProjectDept, CustomTeam, PanelState, CameraTarget } from './techtower'
import { DEFAULT_DEPTS, DEFAULT_PROJECTS, ALL_AGENTS, TowerScene, SidePanel, ViewBookmarks, OverlayButtons } from './techtower'
import StorageSetupPrompt from './techtower/StorageSetupPrompt'
import FloorProjectPanel from './techtower/FloorProjectPanel'
import SceneControlsPanel from './techtower/SceneControlsPanel'
import ResourceButtons from './techtower/ResourceButtons'
import CeoChatPanel from './office-team/CeoChatPanel'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { isElectron } from '../constants'

const simplifyName = (name: string) => {
  if (name.startsWith('任务-')) name = name.slice(3)
  if (name.length > 12) name = name.slice(0, 12) + '…'
  return name
}

/* ───────── 主组件 ───────── */

interface TechTowerViewProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onStartMeeting: () => void
  onSendTask: (description: string) => void
  onBackToSingle?: () => void
  onEnterProject?: (projectId: string, projectName: string) => void
  refreshKey?: number
}

export default function TechTowerView({ wsRef, onStartMeeting, onSendTask, onBackToSingle, onEnterProject, refreshKey }: TechTowerViewProps) {
  void onSendTask

  const isElectronMode = isElectron()

  const {
    isReady, isSupported, dirName, needPermission,
    projects: storedProjects,
    initStorage, grantAccess, createProject, renameProject, deleteProject,
    addTask, getCategories, exportData, importData,
  } = useLocalStorage()

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

  // 获取分类（合并存储项目和默认项目）
  const storedCategories = getCategories()
  const categoriesForDisplay: Record<string, Array<{ project_id: string; name: string; status: string; created_at: string }>> = {}

  for (const [cat, projs] of Object.entries(storedCategories)) {
    categoriesForDisplay[cat] = projs.map(p => ({
      project_id: p.project_id, name: p.name, status: p.status, created_at: p.created_at,
    }))
  }

  for (const p of DEFAULT_PROJECTS) {
    const cat = p.description?.includes('LLM') ? '软件开发' :
                p.description?.includes('AI') ? 'AI影视' :
                p.description?.includes('数据') ? '数据分析' :
                p.description?.includes('博客') || p.description?.includes('内容') ? '内容创作' :
                p.description?.includes('PPT') || p.description?.includes('路演') ? 'PPT设计' :
                '其他'
    if (!categoriesForDisplay[cat]) categoriesForDisplay[cat] = []
    if (!categoriesForDisplay[cat].some(ep => ep.project_id === p.id)) {
      categoriesForDisplay[cat].push({
        project_id: p.id, name: p.name, status: p.status,
        created_at: new Date(p.createdAt).toISOString(),
      })
    }
  }

  const [selectedFloor, setSelectedFloor] = useState<string | null>(null)
  const [showFloorPanel, setShowFloorPanel] = useState(false)
  const [customTeams, setCustomTeams] = useState<CustomTeam[]>([])
  const [panel, setPanel] = useState<PanelState>(null)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const [showCeoChat, setShowCeoChat] = useState(false)
  const [cameraNav, setCameraNav] = useState<CameraTarget | null>(null)
  const [canvasError, setCanvasError] = useState(false)
  const [skipSetup, setSkipSetup] = useState(isElectronMode)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 场景元素显示/隐藏控制
  const [showBuildings, setShowBuildings] = useState(true)
  const [showBillboards, setShowBillboards] = useState(true)
  const [showFlyingVehicles, setShowFlyingVehicles] = useState(true)
  const [showBridges, setShowBridges] = useState(true)
  const [showParticles, setShowParticles] = useState(true)
  const [showRain, setShowRain] = useState(true)
  const [showNeonLines, setShowNeonLines] = useState(true)
  const [fogEnabled, setFogEnabled] = useState(true)
  const [isDayMode, setIsDayMode] = useState(false)
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

  const handleCeoEnterProject = useCallback((_projectId: string, _meetingId: string) => {
    setShowCeoChat(false)
    onStartMeeting()
  }, [onStartMeeting])

  const handleCeoProjectCreated = useCallback(async (_projectId: string) => {}, [])

  const handleFloorClick = useCallback((category: string, cameraPos: [number, number, number], target: [number, number, number]) => {
    setSelectedFloor(category)
    setCameraNav({ pos: cameraPos, target })
  }, [])

  const handleBackToFloors = useCallback(() => {
    setSelectedFloor(null)
    setShowFloorPanel(false)
    setCameraNav({ pos: [30, 55, 45], target: [0, 14, 0] })
  }, [])

  const handleComputerClick = useCallback((_category: string) => {
    setShowFloorPanel(true)
  }, [])

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

  // ─── 早期返回：存储设置 ───
  const needsSetupPrompt = (isSupported && needPermission && !skipSetup)
    || (isSupported && !dirName && !skipSetup)

  if (needsSetupPrompt) {
    return (
      <StorageSetupPrompt
        isSupported={isSupported}
        needPermission={needPermission}
        dirName={dirName}
        onGrantAccess={grantAccess}
        onInitStorage={initStorage}
        onSkip={() => setSkipSetup(true)}
      />
    )
  }

  // ─── 2D 回退视图 ───
  if (canvasError) {
    return (
      <StorageSetupPrompt
        canvasError
        onSkip={() => {}}
        fallbackContent={
          <div style={{ width: '100%', height: '100%', background: '#080818', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(139, 92, 246, 0.2)', background: 'rgba(139, 92, 246, 0.05)' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>⚡</span> MDH 科技大厦
              </div>
              <div style={{ fontSize: 12, color: '#8899b4', marginTop: 4 }}>3D 渲染不可用，使用简化视图</div>
            </div>
            <div style={{ flex: 1, padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, alignContent: 'start' }}>
              {projects.map(project => (
                <div key={project.id} onClick={() => onEnterProject?.(project.id, project.name)} style={{ padding: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)'; e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>{project.name}</div>
                  <div style={{ fontSize: 12, color: '#8899b4' }}>{project.description}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>{project.status === 'active' ? '🟢 进行中' : project.status === 'completed' ? '✅ 已完成' : '⏳ 规划中'}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            </div>
          </div>
        }
      />
    )
  }

  const sceneToggles = [
    { label: 'Buildings', active: showBuildings, toggle: () => setShowBuildings(v => !v) },
    { label: 'Billboards', active: showBillboards, toggle: () => setShowBillboards(v => !v) },
    { label: 'Flying Objects', active: showFlyingVehicles, toggle: () => setShowFlyingVehicles(v => !v) },
    { label: 'Sky Bridges', active: showBridges, toggle: () => setShowBridges(v => !v) },
    { label: 'Particles', active: showParticles, toggle: () => setShowParticles(v => !v) },
    { label: 'Rain', active: showRain, toggle: () => setShowRain(v => !v) },
    { label: 'Neon Lines', active: showNeonLines, toggle: () => setShowNeonLines(v => !v) },
    { label: 'Fog', active: fogEnabled, toggle: () => setFogEnabled(v => !v) },
  ]

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#080818', display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
      <Canvas
        shadows
        camera={{ position: [30, 55, 45], fov: 45 }}
        onCreated={({ gl }) => { gl.shadowMap.type = 2 /* PCFSoftShadowMap */ }}
        onError={() => setCanvasError(true)}
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

      {/* 楼层项目管理面板 */}
      {showFloorPanel && (
        <FloorProjectPanel
          categoriesForDisplay={categoriesForDisplay}
          selectedFloor={selectedFloor}
          onSelectFloor={setSelectedFloor}
          onClose={() => setShowFloorPanel(false)}
          onEnterProject={onEnterProject}
          onExport={handleExport}
          onImport={handleImport}
        />
      )}

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

      {/* 返回楼层按钮 */}
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
      <OverlayButtons onStartMeeting={onStartMeeting} />

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

      <ResourceButtons onOpenRoles={handleOpenRoles} onOpenSkills={handleOpenSkills} onOpenTools={handleOpenTools} />

      {/* CEO对话面板 */}
      {showCeoChat && (
        <CeoChatPanel
          wsRef={wsRef}
          onEnterProject={handleCeoEnterProject}
          onProjectCreated={handleCeoProjectCreated}
          onClose={() => setShowCeoChat(false)}
        />
      )}

      <SceneControlsPanel
        toggles={sceneToggles}
        controlsExpanded={controlsExpanded}
        onToggleExpanded={() => setControlsExpanded(v => !v)}
      />
    </div>
  )
}
