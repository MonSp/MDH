import React, { useMemo } from 'react'
import * as THREE from 'three'
import type { BuildingStyle } from './BuildingProfileGenerator'

/* ───────── 伪随机 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/* ───────── 建筑细节附件组件 ───────── */

interface BuildingDetailsProps {
  width: number
  depth: number
  height: number
  seed: number
  style: BuildingStyle
  simplified?: boolean
}

/**
 * 为每栋建筑生成可辨识的细节附件：
 * - 空调外机（BoxGeometry 0.5x0.3x0.4）
 * - 管道（CylinderGeometry）
 * - 阳台（BoxGeometry 扁平悬挑）
 * - 广告牌支架（L形金属架）
 *
 * 通过 seed 确定性放置。
 * simplified 模式：保留天线和1-2个简化空调外机，跳过管道/阳台/支架。
 */
export default React.memo(function BuildingDetails({ width, depth, height, seed, style, simplified }: BuildingDetailsProps) {
  const details = useMemo(() => {
    const r = (offset: number) => pseudoRandom(seed + offset)
    const items: { type: 'ac' | 'pipe' | 'balcony' | 'bracket'; pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number] }[] = []

    if (simplified) {
      // 简化模式：仅保留1-2个简化空调外机
      const acCount = 1 + Math.floor(r(100) * 2)
      for (let i = 0; i < acCount; i++) {
        const face = Math.floor(r(200 + i) * 4)
        const y = 3 + r(300 + i) * (height - 6)
        let x = 0, z = 0, rotY = 0
        if (face === 0) { x = width / 2 + 0.2; rotY = Math.PI / 2 }
        else if (face === 1) { x = -width / 2 - 0.2; rotY = -Math.PI / 2 }
        else if (face === 2) { z = depth / 2 + 0.2; rotY = Math.PI }
        else { z = -depth / 2 - 0.2; rotY = 0 }
        // 简化版空调：scale缩小50%
        items.push({ type: 'ac', pos: [x, y, z], rot: [0, rotY, 0], scale: [0.25, 0.15, 0.2] })
      }
      return items
    }

    // 完整模式：生成所有附件
    // 空调外机：3-6 个，放置在立面中上部
    const acCount = 3 + Math.floor(r(100) * 4)
    for (let i = 0; i < acCount; i++) {
      const face = Math.floor(r(200 + i) * 4)
      const y = 3 + r(300 + i) * (height - 6)
      let x = 0, z = 0, rotY = 0
      if (face === 0) { x = width / 2 + 0.2; rotY = Math.PI / 2 }
      else if (face === 1) { x = -width / 2 - 0.2; rotY = -Math.PI / 2 }
      else if (face === 2) { z = depth / 2 + 0.2; rotY = Math.PI }
      else { z = -depth / 2 - 0.2; rotY = 0 }
      items.push({ type: 'ac', pos: [x, y, z], rot: [0, rotY, 0], scale: [0.5, 0.3, 0.4] })
    }

    // 管道：1-2 根，水平垂直于墙面伸出，短管道
    const pipeCount = 1 + Math.floor(r(400) * 2)
    for (let i = 0; i < pipeCount; i++) {
      const face = Math.floor(r(500 + i) * 4) // 四面都可能
      const y = height * 0.3 + r(600 + i) * height * 0.4
      const pipeLen = 0.3 + r(700 + i) * 0.7 // 短管道，长度 0.3-1.0
      let x = 0, z = 0, rotY = 0
      if (face === 0) { x = width / 2 + pipeLen / 2; rotY = Math.PI / 2 }
      else if (face === 1) { x = -width / 2 - pipeLen / 2; rotY = -Math.PI / 2 }
      else if (face === 2) { z = depth / 2 + pipeLen / 2; rotY = Math.PI }
      else { z = -depth / 2 - pipeLen / 2; rotY = 0 }
      const radius = 0.06 + r(750 + i) * 0.04
      // CylinderGeometry 默认Y轴向上，水平放置需要绕X轴转90度
      items.push({ type: 'pipe', pos: [x, y, z], rot: [Math.PI / 2, rotY, 0], scale: [radius, pipeLen, radius] })
    }

    // 阳台：2-4 个，悬挑在立面
    const balconyCount = 2 + Math.floor(r(800) * 3)
    for (let i = 0; i < balconyCount; i++) {
      const face = Math.floor(r(900 + i) * 4)
      const y = 4 + r(1000 + i) * (height - 8)
      let x = 0, z = 0, rotY = 0
      if (face === 0) { x = width / 2 + 0.5; rotY = Math.PI / 2 }
      else if (face === 1) { x = -width / 2 - 0.5; rotY = -Math.PI / 2 }
      else if (face === 2) { z = depth / 2 + 0.5; rotY = Math.PI }
      else { z = -depth / 2 - 0.5; rotY = 0 }
      items.push({ type: 'balcony', pos: [x, y, z], rot: [0, rotY, 0], scale: [1.5, 0.1, 0.8] })
    }

    // 广告牌支架：1-2 个，放置在低楼层
    const styleBracketCount = style === 'glass' ? 2 : style === 'brick' ? 1 : 1
    for (let i = 0; i < styleBracketCount; i++) {
      const face = Math.floor(r(1100 + i) * 4)
      const y = 2 + r(1200 + i) * 4
      let x = 0, z = 0, rotY = 0
      if (face === 0) { x = width / 2 + 0.1; rotY = Math.PI / 2 }
      else if (face === 1) { x = -width / 2 - 0.1; rotY = -Math.PI / 2 }
      else if (face === 2) { z = depth / 2 + 0.1; rotY = Math.PI }
      else { z = -depth / 2 - 0.1; rotY = 0 }
      items.push({ type: 'bracket', pos: [x, y, z], rot: [0, rotY, 0], scale: [1.0, 1.5, 0.05] })
    }

    return items
  }, [width, depth, height, seed, style, simplified])

  if (!details) return null

  const detailMat = useMemo(() => (
    <meshStandardMaterial color="#252535" roughness={0.7} metalness={0.3} />
  ), [])

  return (
    <group>
      {details.map((d, i) => {
        if (d.type === 'ac') {
          return (
            <mesh key={`ac-${i}`} position={d.pos} rotation={d.rot as unknown as THREE.Euler}>
              <boxGeometry args={d.scale} />
              {detailMat}
            </mesh>
          )
        }
        if (d.type === 'pipe') {
          return (
            <mesh key={`pipe-${i}`} position={d.pos} rotation={d.rot as unknown as THREE.Euler}>
              <cylinderGeometry args={[d.scale[0], d.scale[0], d.scale[1], 6]} />
              {detailMat}
            </mesh>
          )
        }
        if (d.type === 'balcony') {
          return (
            <mesh key={`bal-${i}`} position={d.pos} rotation={d.rot as unknown as THREE.Euler}>
              <boxGeometry args={d.scale} />
              {detailMat}
            </mesh>
          )
        }
        // bracket - L形支架
        return (
          <group key={`br-${i}`} position={d.pos} rotation={d.rot as unknown as THREE.Euler}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[d.scale[0], 0.08, 0.08]} />
              {detailMat}
            </mesh>
            <mesh position={[-d.scale[0] / 2 + 0.04, -d.scale[1] / 2, 0]}>
              <boxGeometry args={[0.08, d.scale[1], 0.08]} />
              {detailMat}
            </mesh>
          </group>
        )
      })}
    </group>
  )
})
