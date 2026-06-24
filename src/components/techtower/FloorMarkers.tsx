import React, { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Billboard, Float, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Project, ProjectDept, CustomTeam } from './types'
import { DEFAULT_DEPTS, BUILDING_W, BUILDING_D, FLOOR_H, BUILDING_H, PENTHOUSE_H, FLOOR_LABELS } from './constants'
import { TeamMemberFigure as TeamFigure } from './characters'

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

/* ───────── 动态小人（已迁移至 characters/TeamMemberFigure） ───────── */

export { TeamMemberFigure as TeamFigure } from './characters'

/* ───────── 前面：项目工作间（分类楼层版） ───────── */

interface CategoryProjects {
  [category: string]: Array<{ project_id: string; name: string; status: string; created_at: string }>
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

export function FrontFaceProjects({ projects, onSelect, onFocusFloor, categories = {}, selectedFloor = null, onFloorClick, onEnterProject, onComputerClick }: {
  projects: Project[]
  onSelect: (p: Project) => void
  onFocusFloor?: (cameraPos: [number, number, number], target: [number, number, number]) => void
  categories?: CategoryProjects
  selectedFloor?: string | null
  onFloorClick?: (category: string, cameraPos: [number, number, number], target: [number, number, number]) => void
  onEnterProject?: (projectId: string, projectName: string) => void
  onComputerClick?: (category: string) => void
}) {
  const COLS = 3
  const GAP = 0.15
  const ITEM_W = (BUILDING_W - GAP * (COLS + 1)) / COLS

  // 获取分类列表（按项目数量排序）
  const categoryList = Object.keys(categories)
    .filter(cat => cat !== '未分类' || Object.keys(categories).length === 1)
    .sort((a, b) => (categories[b]?.length || 0) - (categories[a]?.length || 0))

  // 如果选择了某个分类，显示楼层内部 + 电脑工作台
  if (selectedFloor && categories[selectedFloor]) {
    const categoryProjects = categories[selectedFloor]
    const color = CATEGORY_COLORS[selectedFloor] || '#6b7280'
    const icon = CATEGORY_ICONS[selectedFloor] || '📋'
    const floorIndex = categoryList.indexOf(selectedFloor)
    const floorY = floorIndex * FLOOR_H + FLOOR_H / 2

    return (
      <group>
        {/* 地板 */}
        <mesh position={[0, floorY - FLOOR_H / 2 + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[BUILDING_W - 1, BUILDING_D - 1]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.3} roughness={0.8} />
        </mesh>

        {/* 后墙 */}
        <mesh position={[0, floorY, -BUILDING_D / 2 + 0.05]}>
          <planeGeometry args={[BUILDING_W - 1, FLOOR_H - 0.2]} />
          <meshStandardMaterial color="#0d0d1a" metalness={0.2} roughness={0.9} />
        </mesh>

        {/* 左墙 */}
        <mesh position={[-BUILDING_W / 2 + 0.05, floorY, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[BUILDING_D - 1, FLOOR_H - 0.2]} />
          <meshStandardMaterial color="#0d0d1a" metalness={0.2} roughness={0.9} />
        </mesh>

        {/* 右墙 */}
        <mesh position={[BUILDING_W / 2 - 0.05, floorY, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[BUILDING_D - 1, FLOOR_H - 0.2]} />
          <meshStandardMaterial color="#0d0d1a" metalness={0.2} roughness={0.9} />
        </mesh>

        {/* 桌子 */}
        <group position={[0, floorY - FLOOR_H / 2 + 0.4, -1]}>
          {/* 桌面 */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[3, 0.08, 1.2]} />
            <meshStandardMaterial color="#2a2a3a" metalness={0.5} roughness={0.5} />
          </mesh>
          {/* 桌腿 */}
          {[[-1.3, -0.2, -0.4], [1.3, -0.2, -0.4], [-1.3, -0.2, 0.4], [1.3, -0.2, 0.4]].map((pos, i) => (
            <mesh key={i} position={pos as [number, number, number]}>
              <boxGeometry args={[0.06, 0.4, 0.06]} />
              <meshStandardMaterial color="#1a1a2a" />
            </mesh>
          ))}
        </group>

        {/* 电脑屏幕（可点击） */}
        <group
          position={[0, floorY - FLOOR_H / 2 + 1.3, -1.5]}
          onClick={() => onComputerClick?.(selectedFloor)}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => document.body.style.cursor = 'default'}
        >
          {/* 屏幕底座 */}
          <mesh position={[0, -0.5, 0.2]}>
            <boxGeometry args={[1.2, 0.06, 0.6]} />
            <meshStandardMaterial color="#1a1a2a" />
          </mesh>
          {/* 屏幕支架 */}
          <mesh position={[0, -0.2, 0.1]}>
            <boxGeometry args={[0.1, 0.55, 0.1]} />
            <meshStandardMaterial color="#1a1a2a" />
          </mesh>
          {/* 屏幕边框 */}
          <mesh>
            <boxGeometry args={[3.2, 2, 0.1]} />
            <meshStandardMaterial color="#111122" />
          </mesh>
          {/* 屏幕发光面 */}
          <mesh position={[0, 0, 0.06]}>
            <planeGeometry args={[2.9, 1.7]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.6}
              transparent
              opacity={0.9}
            />
          </mesh>

          {/* 屏幕内容（HTML） */}
          <Html
            position={[0, 0, 0.1]}
            center
            distanceFactor={5}
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              width: 380,
              height: 230,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              background: 'rgba(10, 10, 30, 0.9)',
              borderRadius: 10,
              border: `1px solid ${color}40`,
              padding: 20,
            }}>
              <div style={{ fontSize: 44 }}>{icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{selectedFloor}</div>
              <div style={{
                fontSize: 14, color: '#9ca3af',
                padding: '8px 24px',
                background: `${color}20`,
                borderRadius: 24,
                border: `1px solid ${color}40`,
              }}>
                {categoryProjects.length} 个项目 · 点击打开
              </div>
            </div>
          </Html>
        </group>

        {/* 椅子 */}
        <group position={[0, floorY - FLOOR_H / 2 + 0.25, 0.5]}>
          {/* 座椅 */}
          <mesh>
            <boxGeometry args={[0.8, 0.06, 0.8]} />
            <meshStandardMaterial color="#2a2a4a" />
          </mesh>
          {/* 靠背 */}
          <mesh position={[0, 0.35, -0.35]}>
            <boxGeometry args={[0.8, 0.65, 0.06]} />
            <meshStandardMaterial color="#2a2a4a" />
          </mesh>
          {/* 椅子底座 */}
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.35]} />
            <meshStandardMaterial color="#1a1a2a" />
          </mesh>
        </group>

        {/* 楼层标签（悬浮在后墙上方） */}
        <Html
          position={[0, floorY + FLOOR_H / 2 - 0.4, -BUILDING_D / 2 + 0.2]}
          center
          distanceFactor={10}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: `linear-gradient(135deg, ${color}30, ${color}10)`,
            border: `1px solid ${color}60`,
            borderRadius: 10,
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            backdropFilter: 'blur(12px)',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 20px ${color}30`,
          }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{selectedFloor}</span>
          </div>
        </Html>
      </group>
    )
  }

  // 默认显示分类楼层（每层一个分类入口）
  return (
    <group>
      {categoryList.slice(0, 8).map((category, i) => {
        const floor = i
        const y = floor * FLOOR_H + FLOOR_H / 2
        const color = CATEGORY_COLORS[category] || '#6b7280'
        const icon = CATEGORY_ICONS[category] || '📋'
        const projectCount = categories[category]?.length || 0

        // 相机进入楼层内部（在建筑内部，面向后墙）
        const cameraPos: [number, number, number] = [0, y + 1.5, 2]
        const target: [number, number, number] = [0, y + 0.5, -BUILDING_D / 2]

        return (
          <group key={category}>
            {/* 楼层入口卡片 */}
            <FloorClickMarker
              position={[0, y, BUILDING_D / 2 + 0.06]}
              rotation={[0, 0, 0]}
              label={`${icon} ${category}`}
              sublabel={`${projectCount} 个项目 · 点击进入`}
              color={color}
              onClick={() => onFloorClick?.(category, cameraPos, target)}
              onFocus={onFocusFloor}
              index={i}
              width={BUILDING_W * 0.7}
              faceType="front"
            />
          </group>
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
