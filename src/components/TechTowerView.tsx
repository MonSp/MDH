import React, { useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import type { Project, ProjectDept, CustomTeam, PanelState, CameraTarget } from './techtower'
import { DEFAULT_DEPTS, DEFAULT_PROJECTS, ALL_AGENTS, TowerScene, SidePanel, ViewBookmarks, OverlayButtons } from './techtower'

/* ───────── 主组件 ───────── */

interface TechTowerViewProps {
  onStartMeeting: () => void
  onSendTask: (description: string) => void
  onBackToSingle: () => void
}

export default function TechTowerView({ onStartMeeting, onSendTask, onBackToSingle }: TechTowerViewProps) {
  void onSendTask

  const [projects] = useState<Project[]>(DEFAULT_PROJECTS)
  const [customTeams, setCustomTeams] = useState<CustomTeam[]>([])
  const [panel, setPanel] = useState<PanelState>(null)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const [cameraNav, setCameraNav] = useState<CameraTarget | null>(null)
  const [fogEnabled, setFogEnabled] = useState(true)

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
  const handleClose = useCallback(() => setPanel(null), [])

  const activeDeptColor = panel?.type === 'dept' ? panel.data.color : undefined

  const handleDoCreateTeam = useCallback((name: string, memberIds: string[]) => {
    const members = ALL_AGENTS.filter(a => memberIds.includes(a.id))
    setCustomTeams(prev => [...prev, { id: `team-${Date.now()}`, name, members }])
    setPanel(null)
  }, [])

  const handleCreateProject = useCallback((_deptId: string) => {
    setPanel(null)
    onSendTask('创建新项目')
  }, [onSendTask])

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
        />
      </Canvas>

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
      <SidePanel panel={panel} onClose={handleClose} onCreateTeam={handleDoCreateTeam} onCreateProject={handleCreateProject} isMobile={isMobile} depts={DEFAULT_DEPTS} />
      <OverlayButtons onStartMeeting={onStartMeeting} onBackToSingle={onBackToSingle} />

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
