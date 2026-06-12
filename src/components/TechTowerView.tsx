import React, { useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import type { Project, ProjectDept, CustomTeam, PanelState, CameraTarget } from './techtower'
import { DEFAULT_DEPTS, DEFAULT_PROJECTS, ALL_AGENTS, TowerScene, SidePanel, ViewBookmarks, OverlayButtons } from './techtower'
import CeoChatPanel from './office-team/CeoChatPanel'

/* ───────── 主组件 ───────── */

interface TechTowerViewProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onStartMeeting: () => void
  onSendTask: (description: string) => void
  onBackToSingle: () => void
}

export default function TechTowerView({ wsRef, onStartMeeting, onSendTask, onBackToSingle }: TechTowerViewProps) {
  void onSendTask

  const [projects] = useState<Project[]>(DEFAULT_PROJECTS)
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
          isDayMode={isDayMode}
        />
      </Canvas>

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
          onEnterProject={() => {
            setShowCeoChat(false)
            onStartMeeting()
          }}
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
