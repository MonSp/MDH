import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { BuildingStyle, SetbackSegment } from './BuildingProfileGenerator'
import { getSetbackSegments } from './BuildingProfileGenerator'

/* ───────── 伪随机 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/* ───────── 窗户实例数据 ───────── */

interface WindowInstance {
  position: THREE.Vector3
  rotation: THREE.Euler
  lit: boolean
  warm: boolean
}

/**
 * 生成窗户实例布局：每栋建筑在 4 个立面上按网格放置。
 * 退台感知：根据 setback segments 计算每个高度层级的实际建筑面宽度，
 * 确保窗户贴合建筑表面而非悬空。
 * 行间距 2.5，列间距 1.2，每面约 50 个，4 面共约 200 个。
 */
function generateWindowLayout(width: number, depth: number, height: number, seed: number, maxCount: number, style: BuildingStyle): WindowInstance[] {
  const r = (offset: number) => pseudoRandom(seed + offset)
  const windows: WindowInstance[] = []
  const colSpacing = 1.2
  const rowSpacing = 2.5
  const startY = 1.5

  // 获取退台配置
  const segments = getSetbackSegments(style)
  // 预计算每段的累积底部高度
  const segBottoms: number[] = []
  let cumH = 0
  for (const seg of segments) {
    segBottoms.push(cumH)
    cumH += height * seg.heightRatio
  }

  // 给定 Y 坐标，返回该高度处的退台缩放
  const getScaleAtY = (y: number): { sw: number; sd: number } => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (y >= segBottoms[i]) {
        return { sw: segments[i].scaleW, sd: segments[i].scaleD }
      }
    }
    return { sw: segments[0].scaleW, sd: segments[0].scaleD }
  }

  // 4 个立面的配置：extent 用原始宽/高，offset 用退台缩放后的实际位置
  const faces = [
    { axis: 'z' as const, sign: 1, extentKey: 'width' as const, depthKey: 'depth' as const, rotY: 0 },          // 前面
    { axis: 'z' as const, sign: -1, extentKey: 'width' as const, depthKey: 'depth' as const, rotY: Math.PI },   // 后面
    { axis: 'x' as const, sign: -1, extentKey: 'depth' as const, depthKey: 'width' as const, rotY: -Math.PI / 2 }, // 左面
    { axis: 'x' as const, sign: 1, extentKey: 'depth' as const, depthKey: 'width' as const, rotY: Math.PI / 2 },   // 右面
  ]

  let count = 0
  for (const face of faces) {
    const baseExtent = face.extentKey === 'width' ? width : depth
    const baseDepth = face.depthKey === 'width' ? width : depth
    const cols = Math.max(1, Math.floor((baseExtent - 0.4) / colSpacing))
    const rows = Math.max(1, Math.floor((height - startY - 1) / rowSpacing))

    for (let row = 0; row < rows && count < maxCount; row++) {
      const y = startY + row * rowSpacing
      if (y > height - 1) break

      // 该高度处的退台缩放
      const { sw, sd } = getScaleAtY(y)
      const extent = baseExtent * sw  // 实际建筑面宽度
      const faceOffset = (baseDepth * sd) / 2 + 0.03  // 贴合实际建筑表面

      const colsAtLevel = Math.max(1, Math.floor((extent - 0.4) / colSpacing))
      const colStart = Math.max(0, Math.floor((cols - colsAtLevel) / 2)) // 居中对齐

      for (let col = colStart; col < colStart + colsAtLevel && count < maxCount; col++) {
        const lateral = -extent / 2 + 0.2 + (col - colStart) * colSpacing + (colSpacing - 0.6) / 2

        let pos: THREE.Vector3
        if (face.axis === 'z') {
          pos = new THREE.Vector3(lateral, y, face.sign * faceOffset)
        } else {
          pos = new THREE.Vector3(face.sign * faceOffset, y, lateral)
        }

        // 每个窗户独立的 seed 决定是否点亮和色调
        const winSeed = seed * 1000 + count * 37
        const lit = pseudoRandom(winSeed) < 0.6
        const warm = pseudoRandom(winSeed + 1) < 0.5

        windows.push({
          position: pos,
          rotation: new THREE.Euler(0, face.rotY, 0),
          lit,
          warm,
        })
        count++
      }
    }
  }

  return windows
}

/* ───────── InstancedMesh 窗户渲染器 ───────── */

interface BuildingWindowsProps {
  width: number
  depth: number
  height: number
  seed: number
  style: BuildingStyle
  simplified?: boolean
}

const WINDOW_W = 0.6
const WINDOW_H = 0.4
const MAX_WINDOWS_NORMAL = 200
const MAX_WINDOWS_SIMPLIFIED = 50

const warmColor = new THREE.Color('#ffaa44')
const coldColor = new THREE.Color('#4488ff')
const darkColor = new THREE.Color('#000000')

/**
 * InstancedMesh 窗户渲染器。
 * 每栋建筑约 200 个独立窗户实例（远景降至 50）。
 * 支持 emissive 发光、随机点亮、脉冲动画。
 */
export default React.memo(function BuildingWindows({ width, depth, height, seed, style, simplified }: BuildingWindowsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const maxCount = simplified ? MAX_WINDOWS_SIMPLIFIED : MAX_WINDOWS_NORMAL

  const windows = useMemo(
    () => generateWindowLayout(width, depth, height, seed, maxCount, style),
    [width, depth, height, seed, maxCount, style]
  )

  const geometry = useMemo(() => new THREE.PlaneGeometry(WINDOW_W, WINDOW_H), [])

  // 窗户材质：emissive + toneMapped=false
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ffaa44',
      emissiveIntensity: 1.0,
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
    })
    return m
  }, [])

  // 初始化实例变换和颜色
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()

    for (let i = 0; i < windows.length; i++) {
      const w = windows[i]
      dummy.position.copy(w.position)
      dummy.rotation.copy(w.rotation)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // 设置颜色：点亮的窗户有暖黄/冷蓝色，未点亮的全黑
      if (w.lit) {
        color.copy(w.warm ? warmColor : coldColor)
        // 根据风格调整发光强度
        const intensityMul = style === 'glass' ? 1.2 : style === 'brick' ? 0.8 : 1.0
        color.multiplyScalar(intensityMul)
      } else {
        color.copy(darkColor)
      }
      mesh.setColorAt(i, color)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.count = windows.length
  }, [windows, style])

  // 脉冲动画：已点亮窗户的 emissiveIntensity 微弱脉冲
  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * 0.5) * 0.2
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, maxCount]}
      frustumCulled={false}
    />
  )
})
