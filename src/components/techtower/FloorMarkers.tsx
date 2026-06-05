import React, { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text, Billboard, Float, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Project, ProjectDept, CustomTeam } from './types'
import { DEFAULT_DEPTS, BUILDING_W, BUILDING_D, FLOOR_H, BUILDING_H, PENTHOUSE_H, FLOOR_LABELS } from './constants'

/* ───────── 呼吸光晕 ───────── */

function BreathingRing({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.15
      ref.current.scale.set(s, s, 1)
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.opacity = 0.2 + Math.sin(clock.elapsedTime * 3) * 0.15
    }
  })
  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[1.5, 1.8, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ───────── 可点击楼层标记 ───────── */

export function FloorClickMarker({
  position, rotation, label, sublabel, color, onClick, onFocus, index, width, children, faceType, previewContent,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  label: string
  sublabel: string
  color: string
  onClick: () => void
  onFocus?: (cameraPos: [number, number, number], target: [number, number, number]) => void
  index: number
  width?: number
  children?: React.ReactNode
  faceType?: 'front' | 'right'
  previewContent?: React.ReactNode
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = hovered
        ? 1.0 + Math.sin(clock.elapsedTime * 4) * 0.3
        : 0.3 + Math.sin(clock.elapsedTime * 1.5 + index * 0.7) * 0.15
      mat.opacity = hovered ? 0.4 : 0.15
    }
  })

  const isSide = Math.abs(rotation[1]) > 0.1
  const panelW = width ?? (isSide ? BUILDING_D * 0.82 : BUILDING_W * 0.82)

  return (
    <group position={position} rotation={rotation}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation(); onClick()
          if (onFocus) {
            const target: [number, number, number] = [position[0], position[1], position[2]]
            if (faceType === 'right') {
              const dist = 12
              onFocus([position[0] + dist, position[1] + 2, position[2]], target)
            } else {
              const dist = 12
              onFocus([position[0], position[1] + 2, position[2] + dist], target)
            }
          }
        }}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <boxGeometry args={[panelW, FLOOR_H - 0.3, 0.06]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={faceType === 'right' ? 0.15 : 0.3}
          transparent
          opacity={faceType === 'right' ? 0.1 : 0.15}
          wireframe={faceType === 'right'}
          roughness={faceType === 'front' ? 0.15 : 0.8}
        />
      </mesh>
      <Text position={[0, 0.3, 0.06]} fontSize={0.2} color={hovered ? '#ffffff' : color} anchorX="center" anchorY="middle" maxWidth={panelW - 0.3}>
        {label}
      </Text>
      <Text position={[0, 0.08, 0.06]} fontSize={0.11} color={hovered ? '#aaccdd' : '#556677'} anchorX="center" anchorY="middle" maxWidth={panelW - 0.3}>
        {sublabel}
      </Text>
      {children}
      {hovered && previewContent && (
        <Html position={[panelW / 2 + 0.5, 0.3, 0.1]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(10,10,30,0.92)',
            border: '1px solid rgba(100,210,255,0.2)',
            borderRadius: 8,
            padding: '8px 12px',
            minWidth: 160,
            backdropFilter: 'blur(10px)',
            whiteSpace: 'nowrap',
          }}>
            {previewContent}
          </div>
        </Html>
      )}
      {hovered && <BreathingRing position={[0, 0, 0.03]} color={color} />}
    </group>
  )
}

/* ───────── 动态小人 ───────── */

export function TeamFigure({ x, color, delay }: { x: number; color: string; delay: number }) {
  const ref = useRef<THREE.Group>(null!)
  const { camera } = useThree()
  const isNear = useRef(true)
  useFrame(({ clock }) => {
    if (ref.current) {
      const dist = camera.position.distanceTo(ref.current.position)
      isNear.current = dist < 40

      const t = clock.elapsedTime
      if (isNear.current) {
        ref.current.position.y = -0.5 + Math.sin(t * 2 + delay) * 0.03
        ref.current.position.x = x + Math.sin(t * 0.5 + delay) * 0.3
        ref.current.rotation.y = Math.sin(t * 0.5 + delay) > 0 ? 0.4 : -0.4
      } else {
        ref.current.position.y = -0.5
        ref.current.position.x = x
        ref.current.rotation.y = 0
      }

      const targetScale = isNear.current ? 1 : 0.3
      ref.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1)
    }
  })
  return (
    <group ref={ref} position={[x, -0.5, 0.08]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.05, 0.12, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#e8c4a0" roughness={0.8} />
      </mesh>
    </group>
  )
}

/* ───────── 前面：项目工作间 ───────── */

export function FrontFaceProjects({ projects, onSelect, onFocusFloor }: {
  projects: Project[]; onSelect: (p: Project) => void; onFocusFloor?: (cameraPos: [number, number, number], target: [number, number, number]) => void
}) {
  const COLS = 3
  const GAP = 0.15
  const ITEM_W = (BUILDING_W - GAP * (COLS + 1)) / COLS

  return (
    <group>
      {projects.slice(0, 12).map((proj, i) => {
        const floor = Math.floor(i / COLS)
        const col = i % COLS
        const x = (col - (COLS - 1) / 2) * (ITEM_W + GAP)
        const y = floor * FLOOR_H + FLOOR_H / 2
        const dept = DEFAULT_DEPTS.find(d => proj.selectedDeptIds.includes(d.deptId))
        const statusMap: Record<string, { label: string; color: string }> = {
          active: { label: '进行中', color: '#30d158' },
          completed: { label: '已完成', color: '#bf5af2' },
          planning: { label: '规划中', color: '#0a84ff' },
        }
        const st = statusMap[proj.status] ?? statusMap.planning
        const figureCount = dept ? Math.min(dept.team.length, 4) : 2

        return (
          <FloorClickMarker
            key={proj.id}
            position={[x, y, BUILDING_D / 2 + 0.06]}
            rotation={[0, 0, 0]}
            label={proj.name}
            sublabel={`${dept?.icon ?? '📋'} ${dept?.name ?? '未分配'} · ${st.label}`}
            color={st.color}
            onClick={() => onSelect(proj)}
            onFocus={onFocusFloor}
            index={i}
            width={ITEM_W}
            faceType="front"
            previewContent={
              <div>
                <div style={{ color: '#e0e8f0', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{proj.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ width: proj.status === 'completed' ? '100%' : proj.status === 'active' ? '60%' : '20%', height: '100%', background: st.color, borderRadius: 2 }} />
                  </div>
                  <span style={{ color: st.color, fontSize: 10 }}>{st.label}</span>
                </div>
                <div style={{ color: '#667', fontSize: 10 }}>{dept?.icon} {dept?.name}</div>
              </div>
            }
          >
            {Array.from({ length: figureCount }, (_, j) => (
              <TeamFigure key={j} x={(j - (figureCount - 1) / 2) * 0.4} color={dept?.color ?? '#64d2ff'} delay={j * 1.3} />
            ))}
          </FloorClickMarker>
        )
      })}
    </group>
  )
}

/* ───────── 右面：部门与团队 ───────── */

export function RightFaceDepts({ depts, customTeams, onSelectDept, onSelectTeam, onCreateTeam, onFocusFloor }: {
  depts: ProjectDept[]
  customTeams: CustomTeam[]
  onSelectDept: (d: ProjectDept) => void
  onSelectTeam: (t: CustomTeam) => void
  onCreateTeam: () => void
  onFocusFloor?: (cameraPos: [number, number, number], target: [number, number, number]) => void
}) {
  const COLS = 3
  const GAP = 0.12
  const ITEM_W = (BUILDING_D - GAP * (COLS + 1)) / COLS

  const items: { label: string; sublabel: string; color: string; onClick: () => void; figureCount: number }[] = []

  depts.forEach((d) => {
    items.push({
      label: `${d.icon} ${d.name}`,
      sublabel: `${d.team.length}人 · ${d.projectType}`,
      color: d.color,
      onClick: () => onSelectDept(d),
      figureCount: Math.min(d.team.length, 4),
    })
  })
  customTeams.forEach((t) => {
    items.push({
      label: `👥 ${t.name}`,
      sublabel: `${t.members.length}人 · 自定义团队`,
      color: '#64d2ff',
      onClick: () => onSelectTeam(t),
      figureCount: Math.min(t.members.length, 4),
    })
  })
  items.push({
    label: '+ 创建新团队',
    sublabel: '组建你的自定义团队',
    color: '#ff9f0a',
    onClick: onCreateTeam,
    figureCount: 0,
  })

  return (
    <group>
      {items.slice(0, 12).map((item, i) => {
        const floor = Math.floor(i / COLS)
        const col = i % COLS
        const z = (col - (COLS - 1) / 2) * (ITEM_W + GAP)
        const y = floor * FLOOR_H + FLOOR_H / 2
        return (
          <FloorClickMarker
            key={i}
            position={[BUILDING_W / 2 + 0.06, y, z]}
            rotation={[0, Math.PI / 2, 0]}
            label={item.label}
            sublabel={item.sublabel}
            color={item.color}
            onClick={item.onClick}
            onFocus={onFocusFloor}
            index={i}
            width={ITEM_W}
            faceType="right"
            previewContent={
              <div>
                <div style={{ color: '#e0e8f0', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                <div style={{ color: '#667', fontSize: 10 }}>{item.sublabel}</div>
              </div>
            }
          >
            {Array.from({ length: item.figureCount }, (_, j) => (
              <TeamFigure key={j} x={(j - (item.figureCount - 1) / 2) * 0.4} color={item.color} delay={j * 1.1} />
            ))}
          </FloorClickMarker>
        )
      })}
    </group>
  )
}

/* ───────── 浮动标签 ───────── */

export function FloorLabels() {
  return (
    <group>
      {FLOOR_LABELS.map((label, i) => (
        <Billboard key={i} follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[BUILDING_W / 2 + 1.5, i * FLOOR_H + FLOOR_H / 2, 0]}
            fontSize={0.4}
            color="#64d2ff"
            anchorX="left"
            anchorY="middle"
          >
            {label}
          </Text>
        </Billboard>
      ))}
    </group>
  )
}

export function CEOTextLabel() {
  return (
    <Float speed={2} floatIntensity={0.5} rotationIntensity={0}>
      <Text
        position={[0, BUILDING_H + PENTHOUSE_H + 3, 0]}
        fontSize={0.7}
        color="#bf5af2"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        CEO PENTHOUSE
      </Text>
    </Float>
  )
}
