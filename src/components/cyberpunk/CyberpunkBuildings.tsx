import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 赛博朋克背景建筑群 ───────── */

interface BuildingProps {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  color: string
  neonColor: string
  windowDensity?: number
}

function CyberBuilding({ position, width, depth, height, color, neonColor, windowDensity = 0.6 }: BuildingProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const windowCount = Math.floor(width * height * windowDensity * 2)

  // 生成窗户位置（memoize 避免每次渲染重新随机）
  const windows = useMemo(() => {
    const result: { x: number; y: number; side: number; isNeon: boolean; size: [number, number] }[] = []
    const cols = Math.max(2, Math.floor(width * 1.5))
    const rows = Math.max(2, Math.floor(height * 0.8))
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = (col / (cols - 1) - 0.5) * (width - 0.3)
        const y = (row / (rows - 1)) * (height - 0.5) + 0.3
        if (Math.random() > 0.35) {
          const side = Math.floor(Math.random() * 4)
          const isNeon = Math.random() > 0.7
          const size: [number, number] = [0.15 + Math.random() * 0.1, 0.12 + Math.random() * 0.08]
          result.push({ x, y, side, isNeon, size })
        }
      }
    }
    return result.slice(0, windowCount)
  }, [width, height, windowCount])

  // 生成建筑顶部的天线/装饰（memoize）
  const antennaHeight = useMemo(() => 1 + Math.random() * 3, [])

  return (
    <group ref={groupRef} position={position}>
      {/* 建筑主体 */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.75} metalness={0.3} />
      </mesh>

      {/* 窗户发光层 */}
      {windows.map((w, i) => {
        const windowColor = w.isNeon ? neonColor : '#1a2a4a'
        const emissiveIntensity = w.isNeon ? 0.8 : 0.1
        let pos: [number, number, number]
        let rot: [number, number, number] = [0, 0, 0]
        const wSize: [number, number, number] = [w.size[0], w.size[1], 0.02]

        switch (w.side) {
          case 0: pos = [w.x, w.y, depth / 2 + 0.01]; break
          case 1: pos = [w.x, w.y, -depth / 2 - 0.01]; rot = [0, Math.PI, 0]; break
          case 2: pos = [-width / 2 - 0.01, w.y, w.x]; rot = [0, -Math.PI / 2, 0]; break
          default: pos = [width / 2 + 0.01, w.y, w.x]; rot = [0, Math.PI / 2, 0]; break
        }

        return (
          <mesh key={i} position={pos} rotation={rot}>
            <boxGeometry args={wSize} />
            <meshStandardMaterial
              color={windowColor}
              emissive={windowColor}
              emissiveIntensity={emissiveIntensity}
              transparent
              opacity={0.9}
            />
          </mesh>
        )
      })}

      {/* 顶部霓虹边框 */}
      <lineSegments position={[0, height, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width + 0.1, 0.05, depth + 0.1)]} />
        <lineBasicMaterial color={neonColor} transparent opacity={0.6} />
      </lineSegments>

      {/* 底部霓虹边框 */}
      <lineSegments position={[0, 0.05, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1)]} />
        <lineBasicMaterial color={neonColor} transparent opacity={0.3} />
      </lineSegments>

      {/* 竖向霓虹边线 */}
      <lineSegments position={[0, height / 2, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={8}
            array={new Float32Array([
              -width / 2, -height / 2, -depth / 2, -width / 2, height / 2, -depth / 2,
              width / 2, -height / 2, -depth / 2, width / 2, height / 2, -depth / 2,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={neonColor} transparent opacity={0.4} />
      </lineSegments>

      {/* 天线 */}
      <mesh position={[0, height + antennaHeight / 2, 0]}>
        <cylinderGeometry args={[0.03, 0.03, antennaHeight, 4]} />
        <meshStandardMaterial color="#2a2a3a" />
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
  color: string
  neonColor: string
}

function generateBuildings(count: number, mainBuildingRadius: number): BuildingData[] {
  const neonColors = ['#0a84ff', '#ff375f', '#bf5af2', '#ff9f0a', '#64d2ff', '#30d158']
  const bodyColors = ['#0a0a18', '#0c0c1e', '#080814', '#0e0e22', '#06060f']
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
      color: bodyColors[Math.floor(Math.random() * bodyColors.length)],
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
      color: bodyColors[Math.floor(Math.random() * bodyColors.length)],
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
