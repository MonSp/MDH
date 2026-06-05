import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 角色配件类型 ───────── */

export interface Accessory {
  /** 配件位置偏移 [x, y, z] */
  position: [number, number, number]
  /** 配件几何体 */
  geometry: React.ReactNode
  /** 配件材质颜色 */
  color: string
  /** 是否发光 */
  emissive?: boolean
  emissiveIntensity?: number
}

/* ───────── 基础角色组件 ───────── */

export interface PersonFigureProps {
  /** 身体颜色 */
  bodyColor?: string
  /** 皮肤颜色 */
  skinColor?: string
  /** 整体缩放 */
  scale?: number
  /** 身体半径 */
  bodyRadius?: number
  /** 身体高度（胶囊圆柱部分） */
  bodyHeight?: number
  /** 头部半径 */
  headRadius?: number
  /** 头部 Y 偏移（相对于身体中心） */
  headOffsetY?: number
  /** 身体粗糙度 */
  bodyRoughness?: number
  /** 配件列表 */
  accessories?: Accessory[]
  /** 子节点（附加在身体组上） */
  children?: React.ReactNode
}

export const DEFAULT_PERSON_COLORS = {
  body: '#1a1a30',
  skin: '#e8c4a0',
} as const

export default function PersonFigure({
  bodyColor = DEFAULT_PERSON_COLORS.body,
  skinColor = DEFAULT_PERSON_COLORS.skin,
  scale = 1,
  bodyRadius = 0.2,
  bodyHeight = 0.6,
  headRadius = 0.18,
  headOffsetY = 0.55,
  bodyRoughness = 0.6,
  accessories = [],
  children,
}: PersonFigureProps) {
  const segments = scale > 0.5 ? 16 : 8

  return (
    <group scale={[scale, scale, scale]}>
      {/* 身体 */}
      <mesh castShadow>
        <capsuleGeometry args={[bodyRadius, bodyHeight, 8, segments]} />
        <meshStandardMaterial color={bodyColor} roughness={bodyRoughness} />
      </mesh>

      {/* 头部 */}
      <mesh position={[0, headOffsetY, 0]} castShadow>
        <sphereGeometry args={[headRadius, segments, segments]} />
        <meshStandardMaterial color={skinColor} roughness={0.8} />
      </mesh>

      {/* 配件 */}
      {accessories.map((acc, i) => (
        <mesh key={i} position={acc.position}>
          {acc.geometry}
          <meshStandardMaterial
            color={acc.color}
            emissive={acc.emissive ? acc.color : '#000000'}
            emissiveIntensity={acc.emissive ? (acc.emissiveIntensity ?? 0.3) : 0}
          />
        </mesh>
      ))}

      {children}
    </group>
  )
}
