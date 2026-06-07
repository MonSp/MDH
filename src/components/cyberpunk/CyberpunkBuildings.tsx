import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

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
      {/* 玻璃幕墙主体 */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshPhysicalMaterial
          color={neonColor}
          metalness={0.9}
          roughness={0.05}
          reflectivity={1}
          clearcoat={1}
          clearcoatRoughness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

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

export default function CyberpunkBuildings() {
  const buildings = useMemo(() => generateBuildings(20, 15), [])

  return (
    <group>
      {buildings.map((b, i) => (
        <CyberBuilding key={i} {...b} />
      ))}
    </group>
  )
}
