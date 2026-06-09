import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSetbackSegments } from './BuildingProfileGenerator'
import type { BuildingStyle } from './BuildingProfileGenerator'
import { createBuildingMaterial, getStyleNeonColor } from './BuildingMaterials'
import BuildingDetails from './BuildingDetails'
import BuildingWindows from './BuildingWindows'

/* ───────── 程序化纹理生成 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function generateProceduralTexture(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  if (type === 'rust') {
    ctx.fillStyle = '#5a3a28'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 120; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const r = rand(i * 3 + 2) * 20 + 5
      ctx.fillStyle = `rgba(${160 + rand(i * 7) * 70}, ${80 + rand(i * 11) * 50}, ${20 + rand(i * 13) * 30}, ${0.3 + rand(i * 17) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 60; i++) {
      const x = rand(i * 103) * 256, y = rand(i * 107) * 256
      const r = rand(i * 109) * 10 + 3
      ctx.fillStyle = `rgba(${190 + rand(i * 113) * 50}, ${70 + rand(i * 127) * 40}, ${10 + rand(i * 131) * 15}, ${0.35 + rand(i * 137) * 0.35})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = `rgba(30, 15, 8, ${0.2 + rand(i * 23) * 0.3})`
      ctx.lineWidth = rand(i * 29) * 2.5 + 0.5
      ctx.beginPath()
      ctx.moveTo(rand(i * 31) * 256, rand(i * 37) * 256)
      ctx.lineTo(rand(i * 41) * 256, rand(i * 43) * 256)
      ctx.stroke()
    }
    for (let i = 0; i < 8; i++) {
      const sx = rand(i * 91) * 256
      ctx.fillStyle = `rgba(25, 18, 12, ${0.15 + rand(i * 97) * 0.2})`
      ctx.fillRect(sx, 0, 2 + rand(i * 101) * 4, 256)
    }
  } else if (type === 'concrete') {
    ctx.fillStyle = '#6a6a7a'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 4000; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const brightness = rand(i * 5) * 80 - 40
      const r = 70 + brightness, g = 70 + brightness, b = 85 + brightness
      ctx.fillStyle = `rgba(${Math.max(0, r)}, ${Math.max(0, g)}, ${Math.max(0, b)}, 0.18)`
      ctx.fillRect(x, y, rand(i * 7) * 5 + 1, rand(i * 11) * 5 + 1)
    }
    for (let x = 64; x < 256; x += 64) {
      ctx.strokeStyle = `rgba(15, 15, 25, 0.6)`
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke()
    }
    for (let y = 128; y < 256; y += 128) {
      ctx.strokeStyle = `rgba(15, 15, 25, 0.45)`
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
    }
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(12, 12, 20, ${0.35 + rand(i * 19) * 0.35})`
      ctx.lineWidth = 0.5 + rand(i * 23) * 1.5
      ctx.beginPath()
      let px = rand(i * 31) * 256, py = rand(i * 37) * 256
      ctx.moveTo(px, py)
      for (let j = 0; j < 5; j++) {
        px += rand(i * 41 + j * 43) * 50 - 25
        py += rand(i * 47 + j * 53) * 50
        ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(20, 20, 30, ${0.12 + rand(i * 67) * 0.18})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 71) * 256, rand(i * 73) * 256, rand(i * 79) * 25 + 8, rand(i * 83) * 35 + 10, rand(i * 89) * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(40, 55, 35, ${0.1 + rand(i * 143) * 0.12})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 149) * 256, rand(i * 151) * 256, rand(i * 157) * 18 + 6, rand(i * 163) * 22 + 8, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#2a2a40'
    ctx.fillRect(0, 0, 256, 256)
    const panelSize = 64
    for (let x = 0; x < 256; x += panelSize) {
      for (let y = 0; y < 256; y += panelSize) {
        const brightness = rand(x * 13 + y * 17) * 30
        ctx.fillStyle = `rgba(${50 + brightness}, ${50 + brightness}, ${70 + brightness}, 0.85)`
        ctx.fillRect(x + 2, y + 2, panelSize - 4, panelSize - 4)
        ctx.fillStyle = `rgba(120, 120, 140, 0.7)`
        ctx.beginPath(); ctx.arc(x + 6, y + 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 6, y + panelSize - 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + panelSize - 6, 2.5, 0, Math.PI * 2); ctx.fill()
      }
    }
    for (let i = 0; i < 15; i++) {
      const edge = Math.floor(rand(i * 83) * 4)
      let x = 0, y = 0
      if (edge === 0) { x = rand(i * 89) * 256; y = rand(i * 91) * 20 }
      else if (edge === 1) { x = rand(i * 89) * 256; y = 236 + rand(i * 91) * 20 }
      else if (edge === 2) { x = rand(i * 91) * 20; y = rand(i * 89) * 256 }
      else { x = 236 + rand(i * 91) * 20; y = rand(i * 89) * 256 }
      ctx.fillStyle = `rgba(${140 + rand(i * 97) * 60}, ${60 + rand(i * 101) * 30}, ${15 + rand(i * 103) * 10}, ${0.2 + rand(i * 107) * 0.2})`
      ctx.beginPath(); ctx.arc(x, y, 8 + rand(i * 109) * 12, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(15, 15, 25, ${0.12 + rand(i * 59) * 0.15})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 61) * 256, rand(i * 67) * 256, rand(i * 71) * 20 + 5, rand(i * 73) * 30 + 5, rand(i * 79) * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function generateNormalMap(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  const heightData = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0
      if (type === 'rust') {
        h = rand(x * 3 + y * 5) * 0.6
        for (let i = 0; i < 30; i++) {
          const dx = x - rand(i * 7) * size, dy = y - rand(i * 11) * size
          const dist = Math.sqrt(dx * dx + dy * dy)
          h += Math.max(0, 1 - dist / (rand(i * 13) * 30 + 10)) * (0.2 + rand(i * 17) * 0.3)
        }
      } else if (type === 'concrete') {
        h = rand(x * 2 + y * 3) * 0.3
        if (x % 64 < 3 || x % 64 > 61) h += 0.5
        if (y % 128 < 2 || y % 128 > 126) h += 0.4
        for (let i = 0; i < 3; i++) {
          const cx = rand(i * 31) * size, cy = rand(i * 37) * size
          const dist = Math.abs((x - cx) * rand(i * 41) - (y - cy) * rand(i * 43))
          h += Math.max(0, 1 - dist / 4) * 0.6
        }
      } else {
        const panelSize = 64
        const lx = x % panelSize, ly = y % panelSize
        const edgeDist = Math.min(lx, ly, panelSize - lx, panelSize - ly)
        h = edgeDist < 3 ? 0.8 : 0.1 + rand(x * 5 + y * 7) * 0.1
        for (let px = 0; px < size; px += panelSize) {
          for (let py = 0; py < size; py += panelSize) {
            for (const [rx, ry] of [[px + 6, py + 6], [px + panelSize - 6, py + 6], [px + 6, py + panelSize - 6], [px + panelSize - 6, py + panelSize - 6]]) {
              const dist = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2)
              if (dist < 4) h = Math.max(h, 1 - dist / 4)
            }
          }
        }
      }
      heightData[y * size + x] = Math.min(1, h)
    }
  }

  const normalScale = type === 'rust' ? 3.0 : type === 'concrete' ? 2.0 : 4.0
  const imageData = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size
      const ym = (y - 1 + size) % size, yp = (y + 1) % size
      const gx = (heightData[y * size + xp] - heightData[y * size + xm]) * normalScale
      const gy = (heightData[yp * size + x] - heightData[ym * size + x]) * normalScale
      const len = Math.sqrt(gx * gx + gy * gy + 1)
      const nx = -gx / len, ny = -gy / len, nz = 1 / len
      const idx = (y * size + x) * 4
      imageData.data[idx] = Math.round((nx * 0.5 + 0.5) * 255)
      imageData.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      imageData.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      imageData.data[idx + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function generateMetalnessMap(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  if (type === 'rust') {
    for (let i = 0; i < 80; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const r = rand(i * 5) * 15 + 5
      const edgeFactor = Math.min(x, y, size - x, size - y) < 30 ? 200 : 100
      const brightness = edgeFactor + rand(i * 7) * 55
      ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${0.3 + rand(i * 11) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  } else if (type === 'concrete') {
    for (let i = 0; i < 10; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const brightness = 20 + rand(i * 5) * 30
      ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.3)`
      ctx.beginPath(); ctx.arc(x, y, 3 + rand(i * 7) * 4, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    const panelSize = 64
    for (let px = 0; px < size; px += panelSize) {
      for (let py = 0; py < size; py += panelSize) {
        const brightness = 200 + rand(px * 13 + py * 17) * 55
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`
        ctx.fillRect(px + 3, py + 3, panelSize - 6, panelSize - 6)
      }
    }
  }

  for (let i = 0; i < 500; i++) {
    const x = rand(i * 3 + 100) * size, y = rand(i * 3 + 101) * size
    const brightness = rand(i * 5 + 102) * 40
    ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.1)`
    ctx.fillRect(x, y, 2, 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/* ───────── 风格到纹理类型映射 ───────── */

function styleToTextureType(style: BuildingStyle): 'rust' | 'concrete' | 'metal' {
  if (style === 'glass') return 'metal'
  if (style === 'brick') return 'concrete'
  return 'rust' // industrial
}

/* ───────── 赛博朋克背景建筑（ExtrudeGeometry + MeshPhysicalMaterial + InstancedMesh 窗户） ───────── */

interface BuildingProps {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
  style: BuildingStyle
  seed: number
  simplified?: boolean
}

function CyberBuilding({ position, width, depth, height, neonColor, style, seed, simplified }: BuildingProps) {
  const groupRef = useRef<THREE.Group>(null!)

  const textureType = useMemo(() => styleToTextureType(style), [style])

  // 程序化纹理（保留，作为 MeshPhysicalMaterial 的 map）
  const diffuseMap = useMemo(() => {
    const tex = generateProceduralTexture(seed, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])
  const roughnessMap = useMemo(() => {
    const tex = generateProceduralTexture(seed * 3, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])
  const normalMap = useMemo(() => {
    const tex = generateNormalMap(seed * 5, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])
  const metalnessMap = useMemo(() => {
    const tex = generateMetalnessMap(seed * 9, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])

  // 退台段配置（替代 ExtrudeGeometry 合并，用 BoxGeometry 堆叠）
  const segments = useMemo(() => getSetbackSegments(style), [style])

  // 退台段的几何体和位置计算
  const setbackData = useMemo(() => {
    const result: { w: number; d: number; h: number; y: number }[] = []
    let currentY = 0
    for (const seg of segments) {
      const segH = height * seg.heightRatio
      result.push({
        w: width * seg.scaleW,
        d: depth * seg.scaleD,
        h: segH,
        y: currentY + segH / 2,
      })
      currentY += segH
    }
    return result
  }, [segments, width, depth, height])

  // 简化模式的单个 BoxGeometry
  const simplifiedGeo = useMemo(() => {
    if (!simplified) return null
    return new THREE.BoxGeometry(width, height, depth)
  }, [simplified, width, height, depth])

  // MeshPhysicalMaterial 建筑材质
  const buildingMaterial = useMemo(() => {
    return createBuildingMaterial(style, seed, {
      diffuseMap,
      roughnessMap,
      normalMap,
      metalnessMap,
    })
  }, [style, seed, diffuseMap, roughnessMap, normalMap, metalnessMap])

  // 缓存边框几何体
  const topEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.05, depth + 0.1)), [width, depth])
  const bottomEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1)), [width, depth])

  // 竖向霓虹边线几何体（以建筑中心为原点，范围 -height/2 到 height/2）
  const vertLineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array([
      -width / 2, -height / 2, -depth / 2, -width / 2, height / 2, -depth / 2,
      width / 2, -height / 2, -depth / 2, width / 2, height / 2, -depth / 2,
    ]), 3))
    return g
  }, [width, height, depth])

  // 天线高度
  const antennaHeight = useMemo(() => 1 + pseudoRandom(seed * 13) * 3, [seed])

  return (
    <group ref={groupRef} position={position}>
      {/* 建筑主体 — BoxGeometry 退台堆叠（可靠法线）或单个简化 Box */}
      {simplified ? (
        <mesh
          position={[0, height / 2, 0]}
          castShadow
          receiveShadow
          geometry={simplifiedGeo!}
          material={buildingMaterial}
        />
      ) : (
        setbackData.map((seg, i) => (
          <mesh
            key={`seg-${i}`}
            position={[0, seg.y, 0]}
            castShadow
            receiveShadow
            material={buildingMaterial}
          >
            <boxGeometry args={[seg.w, seg.h, seg.d]} />
          </mesh>
        ))
      )}

      {/* InstancedMesh 窗户系统（替代 PlaneGeometry 条带） */}
      <BuildingWindows
        width={width}
        depth={depth}
        height={height}
        seed={seed}
        style={style}
        simplified={simplified}
      />

      {/* 霓虹边框 */}
      <lineSegments position={[0, height / 2, 0]} geometry={vertLineGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.4} />
      </lineSegments>

      {/* 建筑细节附件（空调/管道/阳台/支架） */}
      <BuildingDetails
        width={width}
        depth={depth}
        height={height}
        seed={seed}
        style={style}
        simplified={simplified}
      />

      {/* 天线 */}
      {!simplified && (
        <>
          <mesh position={[0, height + antennaHeight / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, antennaHeight, 4]} />
            <meshStandardMaterial color="#3a3a5a" roughness={0.5} metalness={0.4} />
          </mesh>
          <AntennaLight position={[0, height + antennaHeight, 0]} color={neonColor} />
        </>
      )}
    </group>
  )
}

/* ───────── 天线闪烁灯 ───────── */

function AntennaLight({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 3 + position[0]) * 0.5
    }
  })
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.08, 6, 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
    </mesh>
  )
}

/* ───────── 城市高度分布算法 ───────── */

/**
 * 使用距离衰减函数控制建筑高度。
 * 中心区域（r<25）：40-80 单位
 * 中间区域（r25-50）：20-45 单位
 * 边缘区域（r>50）：10-25 单位
 */
function getBuildingHeight(radius: number, seed: number): number {
  const baseHeight = 6
  const maxExtraHeight = 28
  const falloffRadius = 80
  const power = 1.8
  const normalizedDist = Math.min(radius / falloffRadius, 1)
  const heightFactor = Math.pow(1 - normalizedDist, power)
  const randomFactor = 0.8 + pseudoRandom(seed) * 0.4
  return baseHeight + maxExtraHeight * heightFactor * randomFactor
}

/* ───────── 建筑风格分配 ───────── */

/**
 * 根据 seed 确定性分配建筑风格。
 * 比例：40% glass / 30% brick / 30% industrial
 */
function assignStyle(seed: number): BuildingStyle {
  const r = pseudoRandom(seed * 7 + 123)
  if (r < 0.4) return 'glass'
  if (r < 0.7) return 'brick'
  return 'industrial'
}

/* ───────── 生成建筑群布局 ───────── */

interface BuildingData {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
  style: BuildingStyle
  seed: number
  simplified?: boolean
}

export type { BuildingData }

export { generateBuildings }

function generateBuildings(_count: number, _mainBuildingRadius: number): BuildingData[] {
  const buildings: BuildingData[] = []
  let buildingIndex = 0

  // 近处环形建筑 — 5环（扩展至220+栋）
  const nearRings = [
    { count: 12, radiusMin: 8, radiusMax: 16, widthMin: 2, widthMax: 6 }, // 环1: 近距密集建筑
    { count: 15, radiusMin: 16, radiusMax: 26, widthMin: 3, widthMax: 7 }, // 环2
    { count: 20, radiusMin: 26, radiusMax: 40, widthMin: 3, widthMax: 8 }, // 环3
    { count: 15, radiusMin: 40, radiusMax: 58, widthMin: 4, widthMax: 10 }, // 环4: 天际线层
    { count: 15, radiusMin: 58, radiusMax: 75, widthMin: 5, widthMax: 12 }, // 环5: 远景层
  ]

  for (const ring of nearRings) {
    for (let i = 0; i < ring.count; i++) {
      const seed = buildingIndex * 37 + 1
      const angle = (i / ring.count) * Math.PI * 2 + (pseudoRandom(seed) - 0.5) * 0.4
      const radius = ring.radiusMin + pseudoRandom(seed + 1) * (ring.radiusMax - ring.radiusMin)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const width = ring.widthMin + pseudoRandom(seed + 2) * (ring.widthMax - ring.widthMin)
      const depth = 3 + pseudoRandom(seed + 3) * 5
      const style = assignStyle(seed)
      const neonColor = getStyleNeonColor(style, seed)
      const height = getBuildingHeight(radius, seed)

      buildings.push({
        position: [x, 0, z],
        width,
        depth,
        height,
        neonColor,
        style,
        seed,
      })
      buildingIndex++
    }
  }

  // 远处简化建筑 — 15栋
  for (let i = 0; i < 15; i++) {
    const seed = buildingIndex * 37 + 1
    const angle = (i / 15) * Math.PI * 2 + (pseudoRandom(seed) - 0.5) * 0.5
    const radius = 80 + pseudoRandom(seed + 1) * 40
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const width = 4 + pseudoRandom(seed + 2) * 4
    const depth = 3 + pseudoRandom(seed + 3) * 4
    const style = assignStyle(seed)
    const neonColor = getStyleNeonColor(style, seed)
    const height = getBuildingHeight(radius, seed)

    buildings.push({
      position: [x, 0, z],
      width,
      depth,
      height,
      neonColor,
      style,
      seed,
      simplified: true,
    })
    buildingIndex++
  }

  return buildings
}

/* ───────── 导出组件 ───────── */

export default function CyberpunkBuildings({ buildings: buildingsProp }: { buildings?: BuildingData[] } = {}) {
  const buildings = useMemo(() => buildingsProp || generateBuildings(20, 15), [buildingsProp])

  return (
    <group>
      {buildings.map((b, i) => (
        <CyberBuilding key={i} {...b} />
      ))}
    </group>
  )
}
