import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 程序化纹理生成 ───────── */

function generateProceduralTexture(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // 基于seed的伪随机
  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  if (type === 'rust') {
    // 铁锈纹理：深棕色基底 + 锈斑
    ctx.fillStyle = '#2a1a10'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 200; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const r = rand(i * 3 + 2) * 8 + 2
      ctx.fillStyle = `rgba(${120 + rand(i * 7) * 80}, ${50 + rand(i * 11) * 40}, ${10 + rand(i * 13) * 20}, ${0.3 + rand(i * 17) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // 添加划痕
    for (let i = 0; i < 15; i++) {
      ctx.strokeStyle = `rgba(60, 40, 20, ${0.1 + rand(i * 23) * 0.2})`
      ctx.lineWidth = rand(i * 29) * 2
      ctx.beginPath()
      ctx.moveTo(rand(i * 31) * 256, rand(i * 37) * 256)
      ctx.lineTo(rand(i * 41) * 256, rand(i * 43) * 256)
      ctx.stroke()
    }
  } else if (type === 'concrete') {
    // 混凝土纹理：灰色基底 + 噪点
    ctx.fillStyle = '#3a3a4a'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 3000; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const brightness = rand(i * 5) * 40 - 20
      ctx.fillStyle = `rgba(${58 + brightness}, ${58 + brightness}, ${74 + brightness}, 0.15)`
      ctx.fillRect(x, y, rand(i * 7) * 4 + 1, rand(i * 11) * 4 + 1)
    }
    // 面板接缝 — 竖向（每64px一条暗线）
    for (let x = 64; x < 256; x += 64) {
      ctx.strokeStyle = `rgba(12, 12, 20, 0.35)`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 256)
      ctx.stroke()
    }
    // 面板接缝 — 水平（每128px一条暗线）
    for (let y = 128; y < 256; y += 128) {
      ctx.strokeStyle = `rgba(12, 12, 20, 0.25)`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(256, y)
      ctx.stroke()
    }
    // 裂缝
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(20, 20, 30, ${0.2 + rand(i * 19) * 0.3})`
      ctx.lineWidth = 0.5 + rand(i * 23)
      ctx.beginPath()
      let px = rand(i * 31) * 256, py = rand(i * 37) * 256
      ctx.moveTo(px, py)
      for (let j = 0; j < 4; j++) {
        px += rand(i * 41 + j * 43) * 40 - 20
        py += rand(i * 47 + j * 53) * 40
        ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    // 污渍/水痕
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(15, 15, 25, ${0.1 + rand(i * 67) * 0.15})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 71) * 256, rand(i * 73) * 256, rand(i * 79) * 15 + 5, rand(i * 83) * 25 + 8, rand(i * 89) * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // 金属面板纹理：深色基底 + 面板线
    ctx.fillStyle = '#1a1a2a'
    ctx.fillRect(0, 0, 256, 256)
    // 面板网格
    const panelSize = 64
    for (let x = 0; x < 256; x += panelSize) {
      for (let y = 0; y < 256; y += panelSize) {
        const brightness = rand(x * 13 + y * 17) * 15
        ctx.fillStyle = `rgba(${26 + brightness}, ${26 + brightness}, ${42 + brightness}, 0.8)`
        ctx.fillRect(x + 2, y + 2, panelSize - 4, panelSize - 4)
        // 铆钉
        ctx.fillStyle = `rgba(80, 80, 100, 0.5)`
        ctx.beginPath(); ctx.arc(x + 6, y + 6, 2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + 6, 2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 6, y + panelSize - 6, 2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + panelSize - 6, 2, 0, Math.PI * 2); ctx.fill()
      }
    }
    // 污渍
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(10, 10, 20, ${0.1 + rand(i * 59) * 0.15})`
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

/* ───────── 赛博朋克背景建筑群（玻璃幕墙） ───────── */

interface BuildingProps {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
}

function CyberBuilding({ position, width, depth, height, neonColor }: BuildingProps) {
  const groupRef = useRef<THREE.Group>(null!)

  // 程序化纹理
  const textureType = useMemo(() => {
    const types: ('rust' | 'concrete' | 'metal')[] = ['rust', 'concrete', 'metal']
    return types[Math.floor(Math.abs(position[0] * 7 + position[2] * 13)) % 3]
  }, [position])
  const diffuseMap = useMemo(() => {
    const tex = generateProceduralTexture(position[0] + position[2] * 100, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [textureType, width])
  const roughnessMap = useMemo(() => {
    const tex = generateProceduralTexture(position[0] * 3 + position[2] * 7, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [textureType, width])

  // 建筑几何复杂度 — 退台结构
  const mainHeight = height * 0.75
  const setbackHeight = height * 0.25
  const setbackWidth = width * 0.8
  const setbackDepth = depth * 0.8
  const topWidth = width * 0.5
  const topDepth = depth * 0.5
  const topHeight = height * 0.08

  // 缓存边框几何体
  const topEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.05, depth + 0.1)), [width, depth])
  const bottomEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1)), [width, depth])
  const midEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.15, 0.08, depth + 0.15)), [width, depth])

  // 竖向霓虹边线几何体
  const vertLineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array([
      -width / 2, -height / 2, -depth / 2, -width / 2, height / 2, -depth / 2,
      width / 2, -height / 2, -depth / 2, width / 2, height / 2, -depth / 2,
    ]), 3))
    return g
  }, [width, height, depth])

  // 天线高度
  const antennaHeight = useMemo(() => 1 + Math.random() * 3, [])

  // 楼层分隔线几何体
  const floorLineGeo = useMemo(() => {
    const positions: number[] = []
    const floorH = Math.max(2, height / 6)
    const floors = Math.floor(height / floorH)
    for (let i = 1; i < floors; i++) {
      const y = -height / 2 + i * floorH
      const hw = width / 2, hd = depth / 2
      // 前面
      positions.push(-hw, y, hd, hw, y, hd)
      // 后面
      positions.push(-hw, y, -hd, hw, y, -hd)
      // 左面
      positions.push(-hw, y, -hd, -hw, y, hd)
      // 右面
      positions.push(hw, y, -hd, hw, y, hd)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [width, height, depth])

  return (
    <group ref={groupRef} position={position}>
      {/* 建筑主体（下半部分） */}
      <mesh position={[0, mainHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, mainHeight, depth]} />
        <meshStandardMaterial
          map={diffuseMap}
          roughnessMap={roughnessMap}
          color="#1a1a30"
          metalness={0.5}
          roughness={0.6}
          emissive={neonColor}
          emissiveIntensity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 退台（上半部分收窄） */}
      <mesh position={[0, mainHeight + setbackHeight / 2, 0]} castShadow>
        <boxGeometry args={[setbackWidth, setbackHeight, setbackDepth]} />
        <meshStandardMaterial
          map={diffuseMap}
          color="#1a1a30"
          metalness={0.5}
          roughness={0.5}
          emissive={neonColor}
          emissiveIntensity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 顶部结构（天台设备） */}
      <mesh position={[0, mainHeight + setbackHeight + topHeight / 2, 0]}>
        <boxGeometry args={[topWidth, topHeight, topDepth]} />
        <meshStandardMaterial color="#0a0a1a" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* 每层发光窗户条带 */}
      {Array.from({ length: Math.floor(mainHeight / 2.5) }, (_, i) => {
        const y = 1.5 + i * 2.5
        const isWarm = (Math.floor(position[0] * 3 + i * 7) % 2) === 0
        const windowColor = isWarm ? '#ffaa44' : '#4488ff'
        const intensity = 1.5 + (Math.abs(position[0] + i) % 3) * 0.3
        return (
          <group key={`win-${i}`}>
            {/* 正面窗户 */}
            <mesh position={[0, y, depth / 2 + 0.03]}>
              <planeGeometry args={[width - 0.4, 0.6]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.8}
              />
            </mesh>
            {/* 背面窗户 */}
            <mesh position={[0, y, -depth / 2 - 0.03]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[width - 0.4, 0.6]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.8}
              />
            </mesh>
            {/* 左面窗户 */}
            <mesh position={[-width / 2 - 0.03, y, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[depth - 0.4, 0.6]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.8}
              />
            </mesh>
            {/* 右面窗户 */}
            <mesh position={[width / 2 + 0.03, y, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[depth - 0.4, 0.6]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.8}
              />
            </mesh>
          </group>
        )
      })}

      {/* 楼层分隔线 */}
      <lineSegments position={[0, height / 2, 0]} geometry={floorLineGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.4} />
      </lineSegments>

      {/* 顶部霓虹边框 */}
      <lineSegments position={[0, height, 0]} geometry={topEdgeGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.9} />
      </lineSegments>

      {/* 底部霓虹边框 */}
      <lineSegments position={[0, 0.05, 0]} geometry={bottomEdgeGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.6} />
      </lineSegments>

      {/* 竖向霓虹边线 */}
      <lineSegments position={[0, height / 2, 0]} geometry={vertLineGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.7} />
      </lineSegments>

      {/* 中间横向装饰带 */}
      <lineSegments position={[0, height * 0.5, 0]} geometry={midEdgeGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.5} />
      </lineSegments>

      {/* 建筑装饰细节 — 管道/空调/排气口 */}
      {Array.from({ length: 2 + Math.floor(Math.abs(position[0] * 3 + position[2] * 7) % 4) }, (_, i) => {
        const seed = Math.abs(position[0] * 13 + position[2] * 17 + i * 31)
        const face = Math.floor(seed) % 4
        const yOffset = 2 + (seed * 7 % 1) * (mainHeight - 4)
        const detailType = Math.floor(seed * 3) % 3
        let x = 0, z = 0, rotY = 0
        if (face === 0) { x = width / 2 + 0.15; rotY = Math.PI / 2 }
        else if (face === 1) { x = -width / 2 - 0.15; rotY = -Math.PI / 2 }
        else if (face === 2) { z = depth / 2 + 0.15; rotY = Math.PI }
        else { z = -depth / 2 - 0.15; rotY = 0 }

        if (detailType === 0) {
          // 管道
          return (
            <mesh key={`pipe-${i}`} position={[x, yOffset, z]} rotation={[0, rotY, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 1.5 + (seed % 1) * 1.5, 6]} />
              <meshStandardMaterial color="#3a3a4a" roughness={0.6} metalness={0.5} />
            </mesh>
          )
        } else if (detailType === 1) {
          // 空调外机
          return (
            <mesh key={`ac-${i}`} position={[x, yOffset, z]} rotation={[0, rotY, 0]}>
              <boxGeometry args={[0.6, 0.4, 0.3]} />
              <meshStandardMaterial color="#2a2a3a" roughness={0.5} metalness={0.4} />
            </mesh>
          )
        } else {
          // 排气口
          return (
            <mesh key={`vent-${i}`} position={[x, yOffset, z]} rotation={[Math.PI / 2, rotY, 0]}>
              <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
              <meshStandardMaterial color="#252535" roughness={0.7} metalness={0.3} />
            </mesh>
          )
        }
      })}

      {/* 天线 */}
      <mesh position={[0, height + antennaHeight / 2, 0]}>
        <cylinderGeometry args={[0.03, 0.03, antennaHeight, 4]} />
        <meshStandardMaterial color="#3a3a5a" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* 天线信号灯 */}
      <AntennaLight position={[0, height + antennaHeight, 0]} color={neonColor} />
    </group>
  )
}

/* 天线闪烁灯 */
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
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
    </mesh>
  )
}

/* ───────── 生成建筑群布局 ───────── */

interface BuildingData {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
}

export type { BuildingData }

export { generateBuildings }

function generateBuildings(count: number, mainBuildingRadius: number): BuildingData[] {
  const neonColors = ['#0a84ff', '#ff375f', '#bf5af2', '#ff9f0a', '#64d2ff', '#30d158']
  const buildings: BuildingData[] = []

  // 以主建筑为中心，在周围生成环形分布的建筑
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
    const radius = mainBuildingRadius + 8 + Math.random() * 25
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const height = 8 + Math.random() * 30
    const width = 3 + Math.random() * 6
    const depth = 3 + Math.random() * 5

    buildings.push({
      position: [x, 0, z],
      width,
      depth,
      height,
      neonColor: neonColors[Math.floor(Math.random() * neonColors.length)],
    })
  }

  // 添加一些更远的超高层建筑（城市天际线）
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3
    const radius = 40 + Math.random() * 20
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius

    buildings.push({
      position: [x, 0, z],
      width: 5 + Math.random() * 8,
      depth: 4 + Math.random() * 6,
      height: 25 + Math.random() * 35,
      neonColor: neonColors[Math.floor(Math.random() * neonColors.length)],
    })
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
