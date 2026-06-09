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

      {/* 云雾开关按钮 */}
      <button
        onClick={() => setFogEnabled(prev => !prev)}
        style={{
          position: 'absolute', bottom: 16, right: 16,
          width: 40, height: 40, borderRadius: 8,
          background: fogEnabled ? 'rgba(100,210,255,0.15)' : 'rgba(0,0,0,0.5)',
          border: `1px solid ${fogEnabled ? 'rgba(100,210,255,0.5)' : 'rgba(100,210,255,0.2)'}`,
          color: fogEnabled ? '#64d2ff' : '#4a5a7a',
          fontSize: 16, cursor: 'pointer', zIndex: 10,
          fontFamily: 'inherit', backdropFilter: 'blur(8px)',
          transition: 'all 0.2s',
        }}
        title={fogEnabled ? '关闭云雾' : '开启云雾'}
      >
        ☁
      </button>
    </div>
  )
}
