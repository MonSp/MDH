import React, { useMemo } from 'react'
import * as THREE from 'three'
import { DEFAULT_ROAD_CONFIG } from './RoadNetworkManager'

const LINE_Y = 0.035
const LINE_WIDTH = 0.12

const RING_COLORS = ['#ff00aa', '#00ddff', '#44ff88', '#ff6600', '#aa44ff', '#ffaa00']

/**
 * 将 RingGeometry 的 XY 平面顶点翻转到 XZ 地面
 */
function flattenRing(src: THREE.RingGeometry): THREE.BufferGeometry {
  const pos = src.getAttribute('position')
  const flat = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    flat[i * 3]     = pos.getX(i)
    flat[i * 3 + 1] = LINE_Y
    flat[i * 3 + 2] = pos.getY(i)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(flat, 3))
  geo.setIndex(src.getIndex())
  geo.computeVertexNormals()
  geo.setAttribute('uv', src.getAttribute('uv'))
  return geo
}

/**
 * 创建贴地四边形（用于十字主干道和放射路霓虹线）
 */
function createFlatQuad(
  cx: number, cz: number,
  w: number, h: number,
  cosA: number, sinA: number
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const y = LINE_Y
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
 * 创建霓虹材质
 */
function neonMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 3.5,
    roughness: 0.1,
    metalness: 0.9,
    side: THREE.DoubleSide,
  })
}

interface LineData {
  geo: THREE.BufferGeometry
  mat: THREE.MeshStandardMaterial
}

export default function NeonLinesFlat() {
  const { ringRadii, radialCount, roadWidth, groundSize } = DEFAULT_ROAD_CONFIG
  const roadCenter = 15 + 2.5 + roadWidth / 2  // PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH/2

  const lines = useMemo(() => {
    const result: LineData[] = []

    // ═══ 环形霓虹线 → RingGeometry（真圆）═══
    const ringSegs = 128
    ringRadii.forEach((r, ri) => {
      const halfW = LINE_WIDTH / 2
      const src = new THREE.RingGeometry(r - halfW, r + halfW, ringSegs)
      result.push({
        geo: flattenRing(src),
        mat: neonMaterial(RING_COLORS[ri % RING_COLORS.length]),
      })
    })

    // ═══ 主干道中心线（青色）═══
    const crossMat = neonMaterial('#00eeff')
    const halfGround = groundSize / 2
    const halfLine = LINE_WIDTH / 2
    // 东西向两条
    result.push({ geo: createFlatQuad(0, roadCenter, halfGround, halfLine, 1, 0), mat: crossMat })
    result.push({ geo: createFlatQuad(0, -roadCenter, halfGround, halfLine, 1, 0), mat: crossMat })
    // 南北向两条
    result.push({ geo: createFlatQuad(roadCenter, 0, halfLine, halfGround, 0, 1), mat: crossMat })
    result.push({ geo: createFlatQuad(-roadCenter, 0, halfLine, halfGround, 0, 1), mat: crossMat })

    // ═══ 放射路边线（粉色）═══
    const radialMat = neonMaterial('#ff66cc')
    for (let i = 0; i < radialCount; i++) {
      const angle = (i / radialCount) * Math.PI * 2
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      for (let ri = 0; ri < ringRadii.length - 1; ri++) {
        const rInner = ringRadii[ri] + 3
        const rOuter = ringRadii[ri + 1] - 3
        const rMid = (rInner + rOuter) / 2
        const segLen = rOuter - rInner
        if (segLen < 4) continue
        result.push({
          geo: createFlatQuad(cosA * rMid, sinA * rMid, halfLine, segLen / 2, cosA, sinA),
          mat: radialMat,
        })
      }
    }

    return result
  }, [ringRadii, radialCount, roadWidth, groundSize, roadCenter])

  return (
    <group>
      {lines.map((line, i) => (
        <mesh key={i} geometry={line.geo} material={line.mat} />
      ))}
    </group>
  )
}
