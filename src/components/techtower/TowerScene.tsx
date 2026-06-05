import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { CyberpunkBuildings, FlyingVehicles, HolographicAds, CyberRain, NeonLights } from '../cyberpunk'
import type { Project, ProjectDept, CustomTeam, CameraTarget } from './types'
import { DEFAULT_DEPTS, PENTHOUSE_Y, BUILDING_H, PENTHOUSE_H, BUILDING_W, BUILDING_D } from './constants'
import { BuildingBody, GlassCurtainWall, NeonEdges, Ground, Antenna, DataFlowParticles, PenthouseFloor, PenthouseWalls } from './BuildingScene'
import { Desk, ComputerScreen, Chair, Minibar, Plant, CEOPerson, HolographicAI } from './PenthouseFurniture'
import { FrontFaceProjects, RightFaceDepts, FloorLabels, CEOTextLabel } from './FloorMarkers'

/* ───────── 完整 3D 场景 ───────── */

export default function TowerScene({ projects, customTeams, onSelectProject, onSelectDept, onSelectTeam, onCreateTeam, cameraNav, onFocusFloor, activeDeptColor }: {
  projects: Project[]
  customTeams: CustomTeam[]
  onSelectProject: (p: Project) => void
  onSelectDept: (d: ProjectDept) => void
  onSelectTeam: (t: CustomTeam) => void
  onCreateTeam: () => void
  cameraNav?: CameraTarget | null
  onFocusFloor?: (cameraPos: [number, number, number], target: [number, number, number]) => void
  activeDeptColor?: string
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

  return (
    <>
      <ambientLight intensity={0.35} color="#2a2a5a" />
      <directionalLight
        position={[15, 30, 10]}
        intensity={1.0}
        color="#e0e0ff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <hemisphereLight intensity={0.3} color="#4a3a8a" groundColor="#1a2a4a" />
      <pointLight position={[0, 32, 0]} intensity={1.5} color="#bf5af2" distance={25} />
      <pointLight position={[0, 28, 5]} intensity={1.0} color="#64d2ff" distance={18} />

      {/* 赛博朋克氛围灯光 */}
      <pointLight position={[-15, 5, 15]} intensity={0.8} color="#ff375f" distance={30} />
      <pointLight position={[15, 8, -15]} intensity={0.8} color="#0a84ff" distance={30} />
      <pointLight position={[0, 2, 0]} intensity={0.6} color="#bf5af2" distance={35} />
      <pointLight position={[-20, 12, -20]} intensity={0.6} color="#ff9f0a" distance={25} />
      <pointLight position={[20, 10, 20]} intensity={0.5} color="#30d158" distance={25} />
      <pointLight position={[0, 3, -20]} intensity={0.5} color="#64d2ff" distance={20} />

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

      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0.5} fade speed={0.5} />

      {/* 赛博朋克大气雾 */}
      <fog attach="fog" args={['#141430', 50, 160]} />
      <color attach="background" args={['#141430']} />

      <Ground />
      <BuildingBody />
      <DataFlowParticles totalIterations={totalIterations} />
      <GlassCurtainWall />
      <NeonEdges />

      {/* 赛博朋克世界 */}
      <CyberpunkBuildings />
      <FlyingVehicles />
      <HolographicAds />
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
    </>
  )
}
