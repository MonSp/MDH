import React, { useRef, useState, useCallback, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { SkyDome } from '../cyberpunk'
import type { Project, ProjectDept, CustomTeam, CameraTarget } from './types'
import { DEFAULT_DEPTS, PENTHOUSE_Y, BUILDING_H, PENTHOUSE_H, BUILDING_W, BUILDING_D } from './constants'
import { BuildingBody, GlassCurtainWall, NeonEdges, Ground, Antenna, DataFlowParticles, PenthouseFloor, PenthouseWalls } from './BuildingScene'
import { Desk, ComputerScreen, Chair, Minibar, Plant, CEOPerson, HolographicAI } from './PenthouseFurniture'
import { FrontFaceProjects, RightFaceDepts, FloorLabels, CEOTextLabel } from './FloorMarkers'
import AgentStatusOverlay from './AgentStatusOverlay'

/* ───────── Lazy-loaded decorative 3D components ───────── */
const CyberpunkSceneElements = React.lazy(() => import('./CyberpunkSceneElements'))
const PostProcessingEffects = React.lazy(() => import('./PostProcessingEffects'))

/* ───────── 赛博朋克黄昏太阳 ───────── */
function DuskSun({ isDayMode }: { isDayMode?: boolean }) {
  const sunRef = useRef<THREE.Mesh>(null!)
  const sunLightRef = useRef<THREE.DirectionalLight>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    // 太阳轻微脉动效果
    if (sunRef.current) {
      const scale = 1 + Math.sin(time * 0.3) * 0.05
      sunRef.current.scale.set(scale, scale, scale)
    }
    // 光晕效果
    if (glowRef.current) {
      const material = glowRef.current.material as THREE.MeshBasicMaterial
      material.opacity = isDayMode ? 0.6 + Math.sin(time * 0.3) * 0.1 : 0.3 + Math.sin(time * 0.5) * 0.1
    }
  })

  return (
    <group position={[60, 15, -80]}>
      {/* 太阳球体 */}
      <mesh ref={sunRef}>
        <sphereGeometry args={[8, 32, 32]} />
        <meshBasicMaterial color={isDayMode ? '#fff5e0' : '#ff6b35'} />
      </mesh>

      {/* 太阳光晕 */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[12, 32, 32]} />
        <meshBasicMaterial color={isDayMode ? '#fff8e7' : '#ff8c42'} transparent opacity={isDayMode ? 0.6 : 0.3} />
      </mesh>

      {/* 方向光（白天白光/黄昏橙光） */}
      <directionalLight
        ref={sunLightRef}
        position={[0, 0, 0]}
        intensity={isDayMode ? 3.0 : 1.5}
        color={isDayMode ? '#fffbe6' : '#ff7e47'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />
    </group>
  )
}

/* ───────── 赛博朋克动态灯光组件 ───────── */
function CyberpunkLights({ isDayMode }: { isDayMode?: boolean }) {
  const light1Ref = useRef<THREE.PointLight>(null!)
  const light2Ref = useRef<THREE.PointLight>(null!)
  const light3Ref = useRef<THREE.PointLight>(null!)
  const light4Ref = useRef<THREE.PointLight>(null!)
  const light5Ref = useRef<THREE.PointLight>(null!)
  const light6Ref = useRef<THREE.PointLight>(null!)

  useFrame(({ clock }) => {
    const time = clock.elapsedTime

    if (isDayMode) {
      // 白天：微弱脉动，主要靠太阳和环境光
      const gentle = Math.sin(time * 0.3) * 0.05 + 0.95
      if (light1Ref.current) light1Ref.current.intensity = 0.3 * gentle
      if (light2Ref.current) light2Ref.current.intensity = 0.5 * gentle
      if (light3Ref.current) light3Ref.current.intensity = 0.15 * gentle
      if (light4Ref.current) light4Ref.current.intensity = 0.15 * gentle
      if (light5Ref.current) light5Ref.current.intensity = 0.4 * gentle
      if (light6Ref.current) light6Ref.current.intensity = 0.2 * gentle
    } else {
      // 晚上：动态赛博朋克灯光
      const pulse = Math.sin(time * 0.5) * 0.3 + 0.7
      if (light1Ref.current) light1Ref.current.intensity = 2.0 * pulse
      if (light2Ref.current) light2Ref.current.intensity = 1.5 * (1 - pulse * 0.5)
      if (light3Ref.current) light3Ref.current.intensity = 1.0 * (Math.sin(time * 0.7) * 0.3 + 0.7)
      if (light4Ref.current) light4Ref.current.intensity = 1.0 * (Math.cos(time * 0.6) * 0.3 + 0.7)
      if (light5Ref.current) light5Ref.current.intensity = 0.8 * (Math.sin(time * 0.4) * 0.4 + 0.6)
      if (light6Ref.current) light6Ref.current.intensity = 0.7 * (Math.cos(time * 0.3) * 0.4 + 0.6)
    }
  })

  return (
    <>
      <ambientLight intensity={isDayMode ? 0.8 : 0.3} color={isDayMode ? '#b0c4de' : '#0a0a1a'} />
      {isDayMode ? (
        <>
          <hemisphereLight intensity={1.0} color="#87ceeb" groundColor="#f5deb3" />
          <directionalLight position={[50, 80, 30]} intensity={2.0} color="#fffbe6" />
          {/* 白天环境补光 — 柔和暖色 */}
          <pointLight ref={light1Ref} position={[0, 32, 0]} intensity={0.3} color="#ffe4b5" distance={60} decay={1} />
          <pointLight ref={light2Ref} position={[0, 28, 5]} intensity={0.5} color="#b0c4de" distance={50} decay={1} />
          <pointLight ref={light3Ref} position={[-15, 5, 15]} intensity={0.15} color="#ffd700" distance={40} decay={2} />
          <pointLight ref={light4Ref} position={[15, 8, -15]} intensity={0.15} color="#87ceeb" distance={40} decay={2} />
          <pointLight ref={light5Ref} position={[0, 2, 0]} intensity={0.4} color="#ffe4b5" distance={50} decay={1} />
          <pointLight ref={light6Ref} position={[-20, 12, -20]} intensity={0.2} color="#ffd700" distance={40} decay={2} />
        </>
      ) : (
        <>
          <hemisphereLight intensity={0.4} color="#2a3a5a" groundColor="#0a0a1a" />
          {/* 赛博朋克氛围灯光 - 动态点光源 */}
          <pointLight ref={light1Ref} position={[0, 32, 0]} intensity={2.0} color="#bf5af2" distance={30} decay={2} />
          <pointLight ref={light2Ref} position={[0, 28, 5]} intensity={1.5} color="#64d2ff" distance={20} decay={2} />
          <pointLight ref={light3Ref} position={[-15, 5, 15]} intensity={1.0} color="#ff375f" distance={35} decay={2} />
          <pointLight ref={light4Ref} position={[15, 8, -15]} intensity={1.0} color="#0a84ff" distance={35} decay={2} />
          <pointLight ref={light5Ref} position={[0, 2, 0]} intensity={0.8} color="#bf5af2" distance={40} decay={2} />
          <pointLight ref={light6Ref} position={[-20, 12, -20]} intensity={0.7} color="#ff9f0a" distance={30} decay={2} />
        </>
      )}
    </>
  )
}

/* ───────── 动态体积雾层组件 ───────── */
function DynamicFogLayer({ y, baseOpacity, color, size, fogEnabled }: {
  y: number
  baseOpacity: number
  color: string
  size: number
  fogEnabled: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshBasicMaterial
    // 动态密度：使用正弦波缓慢变化
    const dynamicOpacity = fogEnabled
      ? baseOpacity * (0.7 + Math.sin(clock.elapsedTime * 0.1 + y * 0.5) * 0.3)
      : 0
    mat.opacity = dynamicOpacity
  })

  return (
    <mesh ref={meshRef} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={fogEnabled ? baseOpacity : 0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ───────── 完整 3D 场景 ───────── */

interface CategoryProjects {
  [category: string]: Array<{ project_id: string; name: string; status: string; created_at: string }>
}

export default function TowerScene({ projects, customTeams, onSelectProject, onSelectDept, onSelectTeam, onCreateTeam, cameraNav, onFocusFloor, activeDeptColor, fogEnabled = true, showBuildings = true, showBillboards = true, showFlyingVehicles = true, showBridges = true, showParticles = true, showRain = true, showNeonLines = true, isDayMode = false, categories = {}, selectedFloor = null, onFloorClick, onEnterProject, onComputerClick }: {
  projects: Project[]
  customTeams: CustomTeam[]
  onSelectProject: (p: Project) => void
  onSelectDept: (d: ProjectDept) => void
  onSelectTeam: (t: CustomTeam) => void
  onCreateTeam: () => void
  cameraNav?: CameraTarget | null
  onFocusFloor?: (cameraPos: [number, number, number], target: [number, number, number]) => void
  activeDeptColor?: string
  fogEnabled?: boolean
  showBuildings?: boolean
  showBillboards?: boolean
  showFlyingVehicles?: boolean
  showBridges?: boolean
  showParticles?: boolean
  showRain?: boolean
  showNeonLines?: boolean
  isDayMode?: boolean
  categories?: CategoryProjects
  selectedFloor?: string | null
  onFloorClick?: (category: string, cameraPos: [number, number, number], target: [number, number, number]) => void
  onEnterProject?: (projectId: string, projectName: string) => void
  onComputerClick?: (category: string) => void
}) {
  const [hovering, setHovering] = useState(false)
  const onEnter = useCallback(() => setHovering(true), [])
  const onLeave = useCallback(() => setHovering(false), [])

  const controlsRef = useRef<any>(null)
  const navPosRef = useRef(new THREE.Vector3(30, 55, 45))
  const navTargetRef = useRef(new THREE.Vector3(0, PENTHOUSE_Y, 0))
  const navActive = useRef(false)

  useEffect(() => {
    if (cameraNav) {
      navPosRef.current.set(...cameraNav.pos)
      navTargetRef.current.set(...cameraNav.target)
      navActive.current = true
    }
  }, [cameraNav])

  useFrame(({ camera }) => {
    if (!navActive.current) return

    // 更快的相机动画（0.12 vs 0.08）
    camera.position.lerp(navPosRef.current, 0.12)
    if (controlsRef.current) {
      controlsRef.current.target.lerp(navTargetRef.current, 0.12)
      controlsRef.current.update()
    }

    if (camera.position.distanceTo(navPosRef.current) < 0.05) {
      navActive.current = false
    }
  })

  const totalIterations = projects.reduce((sum, p) => sum + p.iterations, 0)

  return (
    <>
      <SkyDome />
      <DuskSun isDayMode={isDayMode} />
      <CyberpunkLights isDayMode={isDayMode} />

      <OrbitControls
        ref={controlsRef}
        enablePan={hovering}
        enableRotate={!hovering}
        panSpeed={1.5}
        rotateSpeed={0.8}
        minDistance={8}
        maxDistance={150}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2.3}
        mouseButtons={{
          LEFT: hovering ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
        }}
      />

      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0.5} fade speed={0.5} />

      {/* 大气雾 — 白天/晚上不同颜色和密度 */}
      <fogExp2 attach="fog" args={[isDayMode ? '#c8ddf0' : '#0a0a1a', fogEnabled ? (isDayMode ? 0.012 : 0.018) : 0]} />
      <color attach="background" args={[isDayMode ? '#87ceeb' : '#0a0a1a']} />

      {/* 本地HDR环境反射（不从CDN下载） */}
      <Environment files="./dikhololo_night_1k.hdr" background={false} />

      <Ground showNeonLines={showNeonLines} />
      
      {/* 建筑主体（进入楼层时隐藏） */}
      {!selectedFloor && (
        <>
          <BuildingBody />
          <GlassCurtainWall />
          <NeonEdges />
        </>
      )}
      <DataFlowParticles totalIterations={totalIterations} />

      {/* Lazy-loaded decorative cyberpunk city effects */}
      <Suspense fallback={null}>
        <CyberpunkSceneElements
          showBuildings={showBuildings}
          showBillboards={showBillboards}
          showFlyingVehicles={showFlyingVehicles}
          showBridges={showBridges}
          showParticles={showParticles}
          showRain={showRain}
          showNeonLines={showNeonLines}
        />
      </Suspense>

      {/* 透明碰撞检测层 */}
      <mesh
        position={[0, (BUILDING_H + PENTHOUSE_H) / 2, 0]}
        onPointerOver={onEnter}
        onPointerOut={onLeave}
      >
        <boxGeometry args={[BUILDING_W + 1, BUILDING_H + PENTHOUSE_H + 2, BUILDING_D + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <PenthouseFloor />
      <PenthouseWalls />

      {/* 顶层设施（进入楼层时隐藏） */}
      {!selectedFloor && (
        <>
          <Desk />
          <ComputerScreen />
          <Chair />
          <Minibar />
          <Plant />
          <CEOPerson />
          <HolographicAI activeDeptColor={activeDeptColor} />
          <Antenna activeDeptColor={activeDeptColor} />
        </>
      )}

      <FrontFaceProjects
        projects={projects}
        onSelect={onSelectProject}
        onFocusFloor={onFocusFloor}
        categories={categories}
        selectedFloor={selectedFloor}
        onFloorClick={onFloorClick}
        onEnterProject={onEnterProject}
        onComputerClick={onComputerClick}
      />
      <RightFaceDepts depts={DEFAULT_DEPTS} customTeams={customTeams} onSelectDept={onSelectDept} onSelectTeam={onSelectTeam} onCreateTeam={onCreateTeam} onFocusFloor={onFocusFloor} />

      <FloorLabels />
      <CEOTextLabel />

      {/* Lazy-loaded post-processing: Bloom + ChromaticAberration + Film Grain + Vignette */}
      <Suspense fallback={null}>
        <PostProcessingEffects isDayMode={isDayMode} />
      </Suspense>

      {/* 体积雾层 — 12层渐变雾，由云雾按钮控制，动态密度 */}
      {[1, 2, 3, 5, 8, 12, 16, 20, 25, 30, 35, 40].map((y, i) => {
        const baseOpacity = isDayMode ? 0.08 * Math.exp(-0.1 * (y - 1)) : 0.15 * Math.exp(-0.08 * (y - 1))
        const color = isDayMode ? '#d0e0f0' : (y <= 2 ? '#1a1a2e' : '#0a0a1a')
        const size = 100 + y * 3
        return (
          <DynamicFogLayer
            key={`fog-layer-${i}`}
            y={y}
            baseOpacity={baseOpacity}
            color={color}
            size={size}
            fogEnabled={fogEnabled}
          />
        )
      })}

      {/* Agent 状态叠加层 — 会议进行时显示 */}
      <AgentStatusOverlay />
    </>
  )
}
