/**
 * CyberpunkGround 子组件
 *
 * 从 CyberpunkGround.tsx 提取的地面几何组件。
 */

import React, { useMemo } from 'react'
import * as THREE from 'three'
import {
  GROUND_SIZE, PLAZA_RADIUS, ROAD_WIDTH, SIDEWALK_WIDTH,
  sidewalkMaterial, plazaMaterial, grassMaterial, curbMaterial,
} from './CyberpunkGround.materials'

/* ───────── 创建平铺在地面的矩形 ───────── */

export function GroundPlane({
  position,
  size,
  rotation = 0,
  material,
}: {
  position: [number, number, number]
  size: [number, number]
  rotation?: number
  material: THREE.Material
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, rotation, 0]} material={material}>
      <planeGeometry args={size} />
    </mesh>
  )
}

/* ───────── 广场组件 ───────── */

export function Plaza() {
  return (
    <group>
      <GroundPlane position={[0, 0.02, 0]} size={[PLAZA_RADIUS * 2, PLAZA_RADIUS * 2]} material={plazaMaterial} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[5, 6, 64]} />
        <meshStandardMaterial color="#cc66ff" emissive="#bf5af2" emissiveIntensity={2.0} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[2, 2.8, 64]} />
        <meshStandardMaterial color="#44ee77" emissive="#30d158" emissiveIntensity={2.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[10, 11, 64]} />
        <meshStandardMaterial color="#00ddff" emissive="#00ccff" emissiveIntensity={1.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ───────── 路缘石组件 ───────── */

export function Curbs() {
  const curbH = 0.04
  const curbW = 0.15
  const curbBaseY = 0.025
  const offset = ROAD_WIDTH / 2 + curbW / 2

  const curbs = useMemo(() => {
    const result: { position: [number, number, number]; size: [number, number, number] }[] = []
    result.push({ position: [0, curbBaseY + curbH / 2, offset], size: [GROUND_SIZE, curbH, curbW] })
    result.push({ position: [0, curbBaseY + curbH / 2, -offset], size: [GROUND_SIZE, curbH, curbW] })
    result.push({ position: [offset, curbBaseY + curbH / 2, 0], size: [curbW, curbH, GROUND_SIZE] })
    result.push({ position: [-offset, curbBaseY + curbH / 2, 0], size: [curbW, curbH, GROUND_SIZE] })
    return result
  }, [])

  return (
    <group>
      {curbs.map((c, i) => (
        <mesh key={i} position={c.position} material={curbMaterial}>
          <boxGeometry args={c.size} />
        </mesh>
      ))}
    </group>
  )
}

/* ───────── 人行道组件 ───────── */

export function Sidewalks() {
  const sidewalks = useMemo(() => {
    const result = []
    const offset = PLAZA_RADIUS + SIDEWALK_WIDTH / 2
    result.push({ position: [0, 0.04, offset] as [number, number, number], size: [PLAZA_RADIUS * 2 + SIDEWALK_WIDTH * 2, SIDEWALK_WIDTH] as [number, number] })
    result.push({ position: [0, 0.04, -offset] as [number, number, number], size: [PLAZA_RADIUS * 2 + SIDEWALK_WIDTH * 2, SIDEWALK_WIDTH] as [number, number] })
    result.push({ position: [offset, 0.04, 0] as [number, number, number], size: [SIDEWALK_WIDTH, PLAZA_RADIUS * 2] as [number, number] })
    result.push({ position: [-offset, 0.04, 0] as [number, number, number], size: [SIDEWALK_WIDTH, PLAZA_RADIUS * 2] as [number, number] })
    return result
  }, [])

  return (
    <group>
      {sidewalks.map((sw, i) => (
        <GroundPlane key={i} position={sw.position} size={sw.size} material={sidewalkMaterial} />
      ))}
    </group>
  )
}

/* ───────── 草坪/绿化带组件 ───────── */

export function GrassAreas() {
  const grassAreas = useMemo(() => {
    const result = []
    const start = PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH + 1
    const size = (GROUND_SIZE / 2 - start)
    const positions: [number, number, number][] = [
      [start + size / 2, 0.01, start + size / 2],
      [-(start + size / 2), 0.01, start + size / 2],
      [start + size / 2, 0.01, -(start + size / 2)],
      [-(start + size / 2), 0.01, -(start + size / 2)],
    ]
    positions.forEach(pos => { result.push({ position: pos, size: [size - 2, size - 2] as [number, number] }) })
    return result
  }, [])

  return (
    <group>
      {grassAreas.map((grass, i) => (
        <GroundPlane key={i} position={grass.position} size={grass.size} material={grassMaterial} />
      ))}
    </group>
  )
}

/* ───────── 外圈装饰组件 ───────── */

export function OuterDecorations() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[38, 38.8, 64]} />
        <meshStandardMaterial color="#ff4466" emissive="#ff375f" emissiveIntensity={1.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[48, 48.8, 64]} />
        <meshStandardMaterial color="#ffaa22" emissive="#ff9f0a" emissiveIntensity={1.0} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[56, 56.8, 64]} />
        <meshStandardMaterial color="#88ddff" emissive="#64d2ff" emissiveIntensity={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ───────── 霓虹道路线组件 ───────── */

export function NeonRoadLines() {
  const lines = useMemo(() => {
    const result: { position: [number, number, number]; size: [number, number]; rotation: number; color: string }[] = []
    const lineY = 0.035
    const lineWidth = 0.12
    const roadCenter = PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2

    result.push({ position: [0, lineY, roadCenter], size: [GROUND_SIZE, lineWidth], rotation: 0, color: '#00eeff' })
    result.push({ position: [0, lineY, -roadCenter], size: [GROUND_SIZE, lineWidth], rotation: 0, color: '#00eeff' })
    result.push({ position: [roadCenter, lineY, 0], size: [lineWidth, GROUND_SIZE], rotation: 0, color: '#00eeff' })
    result.push({ position: [-roadCenter, lineY, 0], size: [lineWidth, GROUND_SIZE], rotation: 0, color: '#00eeff' })

    const ringRadii = [22, 34, 48, 64, 82, 102]
    const ringColors = ['#ff00aa', '#00ddff', '#44ff88', '#ff6600', '#aa44ff', '#ffaa00']
    for (let ri = 0; ri < ringRadii.length; ri++) {
      const r = ringRadii[ri]
      const segments = Math.max(6, Math.floor((2 * Math.PI * r) / 15))
      const arcLen = (2 * Math.PI * r) / segments
      const color = ringColors[ri % ringColors.length]
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        const cx = Math.cos(angle) * r
        const cz = Math.sin(angle) * r
        result.push({ position: [cx, lineY, cz], size: [arcLen * 0.98, lineWidth], rotation: -(angle + Math.PI / 2), color })
      }
    }

    const numRadials = 8
    for (let i = 0; i < numRadials; i++) {
      const angle = (i / numRadials) * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (let ri = 0; ri < ringRadii.length - 1; ri++) {
        const rInner = ringRadii[ri] + 3
        const rOuter = ringRadii[ri + 1] - 3
        const rMid = (rInner + rOuter) / 2
        const segLen = rOuter - rInner
        if (segLen < 4) continue
        result.push({ position: [cos * rMid, lineY, sin * rMid], size: [lineWidth, segLen], rotation: 3 * Math.PI / 2 - angle, color: '#ff66cc' })
      }
    }

    return result
  }, [])

  return (
    <group>
      {lines.map((line, i) => (
        <mesh key={i} position={line.position} rotation={[-Math.PI / 2, line.rotation, 0]}>
          <planeGeometry args={line.size} />
          <meshStandardMaterial color={line.color} emissive={line.color} emissiveIntensity={3.5} roughness={0.1} metalness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/* ───────── 霓虹水坑/反光叠层 ───────── */

export function NeonPuddles() {
  const puddles = useMemo(() => {
    const result: { position: [number, number, number]; size: [number, number]; color: string; intensity: number }[] = []
    const rand = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
    const neonColors = ['#ff00aa', '#00ddff', '#44ff88', '#ff6600', '#aa44ff', '#ffaa00']
    const roadOffset = PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2

    for (let i = 0; i < 40; i++) {
      const seed = i * 41 + 7
      const isEastWest = rand(seed) > 0.5
      const roadSign = rand(seed + 1) > 0.5 ? 1 : -1
      const roadPos = roadSign * roadOffset
      let x: number, z: number
      if (isEastWest) { x = (rand(seed + 2) - 0.5) * GROUND_SIZE * 0.8; z = roadPos + (rand(seed + 3) - 0.5) * ROAD_WIDTH * 0.6 }
      else { x = roadPos + (rand(seed + 3) - 0.5) * ROAD_WIDTH * 0.6; z = (rand(seed + 2) - 0.5) * GROUND_SIZE * 0.8 }
      const w = 1 + rand(seed + 4) * 3
      const h = 0.5 + rand(seed + 5) * 2
      const color = neonColors[Math.floor(rand(seed + 6) * neonColors.length)]
      const intensity = 0.15 + rand(seed + 7) * 0.25
      result.push({ position: [x, 0.012, z], size: [w, h], color, intensity })
    }

    for (let i = 0; i < 20; i++) {
      const seed = i * 53 + 200
      const angle = rand(seed) * Math.PI * 2
      const radius = 25 + rand(seed + 1) * 80
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const w = 1.5 + rand(seed + 2) * 4
      const h = 1 + rand(seed + 3) * 3
      const color = neonColors[Math.floor(rand(seed + 4) * neonColors.length)]
      const intensity = 0.1 + rand(seed + 5) * 0.2
      result.push({ position: [x, 0.012, z], size: [w, h], color, intensity })
    }

    return result
  }, [])

  return (
    <group>
      {puddles.map((p, i) => (
        <mesh key={i} position={p.position} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={p.size} />
          <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={p.intensity} transparent opacity={0.25} roughness={0.05} metalness={0.9} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}
