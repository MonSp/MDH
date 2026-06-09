import React, { useMemo } from 'react'
import * as THREE from 'three'
import { DEFAULT_ROAD_CONFIG } from './RoadNetworkManager'
import type { RoadNetworkConfig } from './RoadNetworkManager'

const ROAD_Y = 0.02

export const roadMaterial = new THREE.MeshStandardMaterial({
  color: '#4a4a65',
  roughness: 0.35,
  metalness: 0.25,
  emissive: '#2a2a45',
  emissiveIntensity: 0.8,
})

/**
 * 创建贴地顶点的 BufferGeometry（用于十字主干道和放射路）
 */
function createFlatQuad(
  cx: number, cz: number,
  w: number, h: number,
  cosA: number, sinA: number
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const y = ROAD_Y
  // 切线方向 = (-sinA, 0, cosA), 径向方向 = (cosA, 0, sinA)
  const verts = new Float32Array([
    cx - w * sinA - h * cosA, y, cz + w * cosA - h * sinA,
    cx + w * sinA - h * cosA, y, cz - w * cosA - h * sinA,
    cx - w * sinA + h * cosA, y, cz + w * cosA + h * sinA,
    cx + w * sinA + h * cosA, y, cz - w * cosA + h * sinA,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geo.setIndex([0, 2, 1, 1, 2, 3])
  geo.computeVertexNormals()
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2))
  return geo
}

/**
 * 将 RingGeometry 的 XY 平面顶点翻转到 XZ 地面（Y = ROAD_Y）
 */
function flattenRingGeometry(src: THREE.RingGeometry): THREE.BufferGeometry {
  const pos = src.getAttribute('position')
  const flat = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    flat[i * 3]     = pos.getX(i)      // X
    flat[i * 3 + 1] = ROAD_Y           // Y → 地面高度
    flat[i * 3 + 2] = pos.getY(i)      // 原 Y → Z
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(flat, 3))
  geo.setIndex(src.getIndex())
  geo.computeVertexNormals()
  geo.setAttribute('uv', src.getAttribute('uv'))
  return geo
}

export default function RoadsFlat() {
  const config = DEFAULT_ROAD_CONFIG
  const { groundSize, ringRadii, radialCount, roadWidth, ringWidth, radialWidth } = config

  // ═══ 环形路 → RingGeometry（真圆）═══
  const ringGeos = useMemo(() => {
    const segments = 128
    return ringRadii.map((r) => {
      const inner = r - ringWidth / 2
      const outer = r + ringWidth / 2
      const src = new THREE.RingGeometry(inner, outer, segments)
      return flattenRingGeometry(src)
    })
  }, [ringRadii, ringWidth])

  // ═══ 放射路 → 贴地四边形 ═══
  const radialGeos = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    for (let i = 0; i < radialCount; i++) {
      const angle = (i / radialCount) * Math.PI * 2
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      for (let ri = 0; ri < ringRadii.length - 1; ri++) {
        const rInner = ringRadii[ri] + 3
        const rOuter = ringRadii[ri + 1] - 3
        const rMid = (rInner + rOuter) / 2
        const segLen = rOuter - rInner
        if (segLen < 4) continue
        geos.push(createFlatQuad(cosA * rMid, sinA * rMid, radialWidth / 2, segLen / 2, cosA, sinA))
      }
    }
    return geos
  }, [radialCount, radialWidth, ringRadii])

  // ═══ 十字主干道 → 贴地四边形 ═══
  const crossGeos = useMemo(() => [
    createFlatQuad(0, 0, groundSize / 2, roadWidth / 2, 1, 0),  // 东西向
    createFlatQuad(0, 0, roadWidth / 2, groundSize / 2, 0, 1),  // 南北向
  ], [groundSize, roadWidth])

  return (
    <group>
      {ringGeos.map((geo, i) => (
        <mesh key={`ring-${i}`} geometry={geo} material={roadMaterial} receiveShadow />
      ))}
      {radialGeos.map((geo, i) => (
        <mesh key={`rad-${i}`} geometry={geo} material={roadMaterial} receiveShadow />
      ))}
      {crossGeos.map((geo, i) => (
        <mesh key={`cross-${i}`} geometry={geo} material={roadMaterial} receiveShadow />
      ))}
    </group>
  )
}
