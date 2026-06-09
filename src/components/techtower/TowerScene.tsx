import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Environment } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { CyberpunkBuildings, FlyingVehicles, CyberRain, NeonLights, SkyDome, generateBuildings } from '../cyberpunk'
import SkyBridge from '../cyberpunk/SkyBridge'
import FreightShip from '../cyberpunk/FreightShip'
import DroneSwarm from '../cyberpunk/DroneSwarm'
import SteamVent from '../cyberpunk/SteamVent'
import SmokePlume from '../cyberpunk/SmokePlume'
import PedestrianFlow from '../cyberpunk/PedestrianFlow'
import VehicleTraffic from '../cyberpunk/VehicleTraffic'
import StreetVendor from '../cyberpunk/StreetVendor'
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
      <ambientLight intensity={0.5} color="#1a1a3a" />
      <hemisphereLight intensity={0.5} color="#4a5a8a" groundColor="#1a2a4a" />

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

  // 生成建筑群数据（共享给CyberpunkBuildings和HolographicAds）— 三环分布
  const buildings = useMemo(() => generateBuildings(55, 15), [])

  return (
    <>
      <SkyDome />
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
      <fog attach="fog" args={['#1a1a3a', 5, 100]} near={fogEnabled ? 5 : 9999} far={fogEnabled ? 100 : 10000} />
      <color attach="background" args={['#1a1a3a']} />

      {/* 本地HDR环境反射（不从CDN下载） */}
      <Environment files="/dikhololo_night_1k.hdr" background={false} />

      <Ground />
      <BuildingBody />
      <DataFlowParticles totalIterations={totalIterations} />
      <GlassCurtainWall />
      <NeonEdges />

      {/* 赛博朋克世界 */}
      <CyberpunkBuildings buildings={buildings} />
      <SkyBridge buildings={buildings} maxBridges={25} maxDistance={20} />
      <FlyingVehicles />
      <FreightShip radius={80} height={45} speed={0.04} color="#0a84ff" size={1.0} />
      <FreightShip radius={90} height={50} speed={0.03} color="#ff375f" size={0.8} />
      <DroneSwarm count={8} radius={35} height={30} speed={0.08} color="#64d2ff" size={0.15} />
      <DroneSwarm count={6} radius={50} height={45} speed={0.06} color="#bf5af2" size={0.12} />
      <CyberRain />
      <NeonLights />

      {/* 蒸汽喷口效果 */}
      <SteamVent position={[15, 0, 15]} color="#ffffff" particleCount={50} speed={1.0} height={3} />
      <SteamVent position={[-15, 0, -15]} color="#aaccff" particleCount={40} speed={0.8} height={2.5} />
      <SteamVent position={[0, 0, 20]} color="#ffffff" particleCount={45} speed={1.2} height={3.5} />

      {/* 烟尘柱效果 */}
      <SmokePlume position={[25, 5, -10]} color="#4a4a6a" size={2.5} speed={0.3} opacity={0.08} />
      <SmokePlume position={[-20, 8, 15]} color="#3a3a5a" size={3.0} speed={0.25} opacity={0.06} />
      <SmokePlume position={[10, 12, -25]} color="#5a5a7a" size={2.0} speed={0.35} opacity={0.1} />

      {/* 地面人群与交通 */}
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="east" position={[0, 0.1, 22]} />
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="west" position={[0, 0.1, -22]} />
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="north" position={[22, 0.1, 0]} />
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="south" position={[-22, 0.1, 0]} />

      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="east" position={[0, 0.15, 20]} />
      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="west" position={[0, 0.15, -20]} />
      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="north" position={[20, 0.15, 0]} />
      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="south" position={[-20, 0.15, 0]} />

      {/* 街道摊贩 */}
      <StreetVendor position={[8, 0, 8]} color="#ff9f0a" size={0.5} steamParticleCount={30} />
      <StreetVendor position={[-8, 0, -8]} color="#0a84ff" size={0.5} steamParticleCount={25} />
      <StreetVendor position={[0, 0, 12]} color="#30d158" size={0.5} steamParticleCount={28} />
      <StreetVendor position={[-12, 0, 0]} color="#bf5af2" size={0.5} steamParticleCount={32} />
      <StreetVendor position={[12, 0, -8]} color="#ff375f" size={0.5} steamParticleCount={27} />

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

      {/* 后处理：Bloom + 色差 + 胶片颗粒 + 暗角（高对比度赛博朋克视觉） */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.3}
          luminanceSmoothing={0.4}
          intensity={1.8}
        />
        <ChromaticAberration
          offset={new THREE.Vector2(0.006, 0.006)}
          radialModulation={true}
          modulationOffset={0.5}
        />
        <Noise
          premultiply
          blendFunction={BlendFunction.ADD}
          opacity={0.15}
        />
        <Vignette
          offset={0.3}
          darkness={0.6}
        />
      </EffectComposer>

      {/* 体积雾层 — 12层渐变雾，由云雾按钮控制，动态密度 */}
      {[1, 2, 3, 5, 8, 12, 16, 20, 25, 30, 35, 40].map((y, i) => {
        const baseOpacity = 0.2 * Math.exp(-0.08 * (y - 1))
        const color = y <= 2 ? '#3a3a4a' : '#2a2a4e'
        const size = 80 + y * 3
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
    </>
  )
}
