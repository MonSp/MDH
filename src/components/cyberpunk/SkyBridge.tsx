import React, { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import type { BuildingData } from './CyberpunkBuildings'

/* ───────── 楼间连桥组件 ───────── */

interface SkyBridgeProps {
  buildings: BuildingData[]
  maxBridges?: number
  maxDistance?: number
}

/** 从原点沿方向(dirX,dirZ)射出射线，返回与AABB边界的交点距离 */
function rayAABBExit(dirX: number, dirZ: number, halfW: number, halfD: number): number {
  // 分别计算射线击中X面和Z面的距离
  const tX = Math.abs(dirX) > 1e-6 ? halfW / Math.abs(dirX) : Infinity
  const tZ = Math.abs(dirZ) > 1e-6 ? halfD / Math.abs(dirZ) : Infinity
  // 取较小值（首先击中的面）
  return Math.min(tX, tZ)
}

export default function SkyBridge({ buildings, maxBridges = 50, maxDistance = 20 }: SkyBridgeProps) {
  const bridges = useMemo(() => {
    const result: {
      start: [number, number, number]
      end: [number, number, number]
      color: string
    }[] = []

    // 将建筑按环分组（基于到中心的距离），每环内部独立按角度排序
    const rings = [
      { min: 0, max: 20 },   // 环1
      { min: 20, max: 35 },  // 环2
    ]

    for (const ring of rings) {
      const ringBuildings = buildings
        .filter(b => {
          const r = Math.sqrt(b.position[0] ** 2 + b.position[2] ** 2)
          return r >= ring.min && r < ring.max
        })
        .map(b => ({
          ...b,
          angle: Math.atan2(b.position[2], b.position[0]),
        }))
        .sort((a, b) => a.angle - b.angle)

      // 同环内角度相邻的建筑之间生成连桥
      for (let i = 0; i < ringBuildings.length && result.length < maxBridges; i++) {
        const b1 = ringBuildings[i]
        const b2 = ringBuildings[(i + 1) % ringBuildings.length]

        const dx = b2.position[0] - b1.position[0]
        const dz = b2.position[2] - b1.position[2]
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist > maxDistance || dist < 0.1) continue

        const dirX = dx / dist
        const dirZ = dz / dist

        // 连桥高度
        const bridgeHeight = Math.min(b1.height, b2.height) * (0.6 + Math.random() * 0.2)

        // 射线与AABB相交：找到方向向量首先击中的面
        const b1Edge = rayAABBExit(dirX, dirZ, b1.width / 2, b1.depth / 2)
        const b2Edge = rayAABBExit(-dirX, -dirZ, b2.width / 2, b2.depth / 2)

        const start: [number, number, number] = [
          b1.position[0] + dirX * b1Edge,
          bridgeHeight,
          b1.position[2] + dirZ * b1Edge,
        ]
        const end: [number, number, number] = [
          b2.position[0] - dirX * b2Edge,
          bridgeHeight,
          b2.position[2] - dirZ * b2Edge,
        ]

        result.push({ start, end, color: b1.neonColor })
      }
    }

    return result
  }, [buildings, maxBridges, maxDistance])

  return (
    <group>
      {bridges.map((bridge, i) => (
        <SkyBridgeLine key={i} start={bridge.start} end={bridge.end} color={bridge.color} />
      ))}
    </group>
  )
}

/* ───────── 连桥渲染：Line + Box ───────── */

function SkyBridgeLine({ start, end, color }: {
  start: [number, number, number]
  end: [number, number, number]
  color: string
}) {
  // 直接用start/end世界坐标构建线段几何体
  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      start[0], start[1], start[2],
      end[0], end[1], end[2],
    ], 3))
    return geo
  }, [start[0], start[1], start[2], end[0], end[1], end[2]])

  // 桥体用Box，位置设为start，lookAt指向end
  const bridgeRef = useRef<THREE.Group>(null)
  useEffect(() => {
    if (bridgeRef.current) {
      bridgeRef.current.position.set(start[0], start[1], start[2])
      bridgeRef.current.lookAt(end[0], end[1], end[2])
    }
  }, [start[0], start[1], start[2], end[0], end[1], end[2]])

  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const dz = end[2] - start[2]
  const bridgeLen = Math.sqrt(dx * dx + dy * dy + dz * dz)

  return (
    <group>
      {/* 发光线段 */}
      <line geometry={lineGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.9} />
      </line>
      {/* 桥体Box：从start位置lookAt end */}
      <group ref={bridgeRef}>
        <mesh position={[0, 0, bridgeLen / 2]}>
          <boxGeometry args={[0.4, 0.15, bridgeLen]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.8}
            transparent
            opacity={0.7}
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
        <mesh position={[0, 0.08, bridgeLen / 2]}>
          <boxGeometry args={[0.3, 0.02, bridgeLen]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.5}
            transparent
            opacity={0.9}
          />
        </mesh>
      </group>
    </group>
  )
}
