import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { CyberpunkBuildings, FlyingVehicles, HolographicAds, CyberRain, NeonLights, generateBuildings } from '../cyberpunk'
import type { Project, ProjectDept, CustomTeam, CameraTarget } from './types'
import { DEFAULT_DEPTS, PENTHOUSE_Y, BUILDING_H, PENTHOUSE_H, BUILDING_W, BUILDING_D } from './constants'
import { BuildingBody, GlassCurtainWall, NeonEdges, Ground, Antenna, DataFlowParticles, PenthouseFloor, PenthouseWalls } from './BuildingScene'
import { Desk, ComputerScreen, Chair, Minibar, Plant, CEOPerson, HolographicAI } from './PenthouseFurniture'
import { FrontFaceProjects, RightFaceDepts, FloorLabels, CEOTextLabel } from './FloorMarkers'

/* ───────── 赛博朋克黄昏太阳 ───────── */
function DuskSun() {
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
      material.opacity = 0.3 + Math.sin(time * 0.5) * 0.1
    }
  })

  return (
    <group position={[60, 15, -80]}>
      {/* 太阳球体 */}
      <mesh ref={sunRef}>
        <sphereGeometry args={[8, 32, 32]} />
        <meshBasicMaterial color="#ff6b35" />
      </mesh>

      {/* 太阳光晕 */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[12, 32, 32]} />
        <meshBasicMaterial color="#ff8c42" transparent opacity={0.3} />
      </mesh>

      {/* 黄昏方向光 */}
      <directionalLight
        ref={sunLightRef}
        position={[0, 0, 0]}
        intensity={1.5}
        color="#ff7e47"
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
function CyberpunkLights() {
  const light1Ref = useRef<THREE.PointLight>(null!)
  const light2Ref = useRef<THREE.PointLight>(null!)
  const light3Ref = useRef<THREE.PointLight>(null!)
  const light4Ref = useRef<THREE.PointLight>(null!)
  const light5Ref = useRef<THREE.PointLight>(null!)
  const light6Ref = useRef<THREE.PointLight>(null!)

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    const pulse = Math.sin(time * 0.5) * 0.3 + 0.7

    // 动态调整灯光强度
    if (light1Ref.current) light1Ref.current.intensity = 2.0 * pulse
    if (light2Ref.current) light2Ref.current.intensity = 1.5 * (1 - pulse * 0.5)
    if (light3Ref.current) light3Ref.current.intensity = 1.0 * (Math.sin(time * 0.7) * 0.3 + 0.7)
    if (light4Ref.current) light4Ref.current.intensity = 1.0 * (Math.cos(time * 0.6) * 0.3 + 0.7)
    if (light5Ref.current) light5Ref.current.intensity = 0.8 * (Math.sin(time * 0.4) * 0.4 + 0.6)
    if (light6Ref.current) light6Ref.current.intensity = 0.7 * (Math.cos(time * 0.3) * 0.4 + 0.6)
  })

  return (
    <>
      <ambientLight intensity={0.5} color="#2a1a3a" />
      <hemisphereLight intensity={0.5} color="#6b4a8a" groundColor="#1a2a4a" />

      {/* 赛博朋克氛围灯光 - 动态点光源 */}
      <pointLight ref={light1Ref} position={[0, 32, 0]} intensity={2.0} color="#bf5af2" distance={30} decay={2} />
      <pointLight ref={light2Ref} position={[0, 28, 5]} intensity={1.5} color="#64d2ff" distance={20} decay={2} />
      <pointLight ref={light3Ref} position={[-15, 5, 15]} intensity={1.0} color="#ff375f" distance={35} decay={2} />
      <pointLight ref={light4Ref} position={[15, 8, -15]} intensity={1.0} color="#0a84ff" distance={35} decay={2} />
      <pointLight ref={light5Ref} position={[0, 2, 0]} intensity={0.8} color="#bf5af2" distance={40} decay={2} />
      <pointLight ref={light6Ref} position={[-20, 12, -20]} intensity={0.7} color="#ff9f0a" distance={30} decay={2} />
    </>
  )
}

/* ───────── 完整 3D 场景 ───────── */

export default function TowerScene({ projects, customTeams, onSelectProject, onSelectDept, onSelectTeam, onCreateTeam, cameraNav, onFocusFloor, activeDeptColor, fogEnabled = true }: {
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
}) {
  const [hovering, setHovering] = useState(false)
  const onEnter = useCallback(() => setHovering(true), [])
  const onLeave = useCallback(() => setHovering(false), [])

  const controlsRef = useRef<any>(null)
  const navPosRef = useRef(new THREE.Vector3(30, 38, 30))
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

    camera.position.lerp(navPosRef.current, 0.08)
    if (controlsRef.current) {
      controlsRef.current.target.lerp(navTargetRef.current, 0.08)
      controlsRef.current.update()
    }

    if (camera.position.distanceTo(navPosRef.current) < 0.1) {
      navActive.current = false
    }
  })

  const totalIterations = projects.reduce((sum, p) => sum + p.iterations, 0)

  // 生成建筑群数据（共享给CyberpunkBuildings和HolographicAds）
  const buildings = useMemo(() => generateBuildings(20, 15), [])

  return (
    <>
      <DuskSun />
      <CyberpunkLights />

      <OrbitControls
        ref={controlsRef}
        enablePan={hovering}
        enableRotate={!hovering}
        panSpeed={1.5}
        rotateSpeed={0.8}
        minDistance={8}
        maxDistance={100}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.1}
        mouseButtons={{
          LEFT: hovering ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
        }}
      />

      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0.5} fade speed={0.5} />

      {/* 赛博朋克大气雾 — 由云雾按钮控制，关闭时near=far使雾完全消失 */}
      <fog attach="fog" args={['#1a0a2e', 5, 80]} near={fogEnabled ? 5 : 9999} far={fogEnabled ? 80 : 10000} />
      <color attach="background" args={['#1a0a2e']} />

      {/* 本地HDR环境反射（不从CDN下载） */}
      <Environment files="/dikhololo_night_1k.hdr" background={false} />

      <Ground />
      <BuildingBody />
      <DataFlowParticles totalIterations={totalIterations} />
      <GlassCurtainWall />
      <NeonEdges />

      {/* 赛博朋克世界 */}
      <CyberpunkBuildings buildings={buildings} />
      <FlyingVehicles />
      <HolographicAds buildings={buildings} />
      <CyberRain />
      <NeonLights />

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

      <Desk />
      <ComputerScreen />
      <Chair />
      <Minibar />
      <Plant />
      <CEOPerson />
      <HolographicAI activeDeptColor={activeDeptColor} />
      <Antenna activeDeptColor={activeDeptColor} />

      <FrontFaceProjects projects={projects} onSelect={onSelectProject} onFocusFloor={onFocusFloor} />
      <RightFaceDepts depts={DEFAULT_DEPTS} customTeams={customTeams} onSelectDept={onSelectDept} onSelectTeam={onSelectTeam} onCreateTeam={onCreateTeam} onFocusFloor={onFocusFloor} />

      <FloorLabels />
      <CEOTextLabel />

      {/* 后处理：Bloom辉光效果 */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.1}
          luminanceSmoothing={0.9}
          intensity={1.8}
        />
      </EffectComposer>

      {/* 体积雾层 — 由云雾按钮控制，关闭时全透明 */}
      {[5, 10, 15, 20, 25].map((y, i) => (
        <mesh key={`fog-layer-${i}`} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[120, 120]} />
          <meshBasicMaterial color="#1a0a2e" transparent opacity={fogEnabled ? 0.04 + i * 0.02 : 0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}
