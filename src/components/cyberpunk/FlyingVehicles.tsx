import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 飞行载具（飞行汽车 + 无人机） ───────── */

interface VehicleData {
  id: number
  type: 'car' | 'drone'
  radius: number       // 轨道半径
  height: number       // 飞行高度
  speed: number        // 飞行速度
  angleOffset: number  // 初始角度偏移
  color: string        // 尾焰颜色
  size: number         // 载具尺寸
}

function generateVehicles(count: number): VehicleData[] {
  const colors = ['#0a84ff', '#ff375f', '#bf5af2', '#ff9f0a', '#64d2ff', '#30d158']
  const vehicles: VehicleData[] = []

  for (let i = 0; i < count; i++) {
    const isCar = Math.random() > 0.4
    vehicles.push({
      id: i,
      type: isCar ? 'car' : 'drone',
      radius: 15 + Math.random() * 35,
      height: 12 + Math.random() * 25,
      speed: 0.15 + Math.random() * 0.35,
      angleOffset: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: isCar ? 0.3 + Math.random() * 0.3 : 0.15 + Math.random() * 0.15,
    })
  }
  return vehicles
}

/* 单个飞行载具 */
function FlyingVehicle({ data }: { data: VehicleData }) {
  const groupRef = useRef<THREE.Group>(null!)
  const trailRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime * data.speed + data.angleOffset
    const x = Math.cos(t) * data.radius
    const z = Math.sin(t) * data.radius
    groupRef.current.position.set(x, data.height, z)
    // 载具朝向飞行方向
    groupRef.current.rotation.y = -t + Math.PI / 2
    // 微微倾斜
    groupRef.current.rotation.z = Math.sin(t * 2) * 0.1

    // 尾焰脉冲
    if (trailRef.current) {
      const m = trailRef.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 8) * 0.4
      m.opacity = 0.3 + Math.sin(clock.elapsedTime * 6) * 0.15
    }
  })

  if (data.type === 'car') {
    return (
      <group ref={groupRef}>
        {/* 车身 */}
        <mesh castShadow>
          <boxGeometry args={[data.size * 2, data.size * 0.5, data.size]} />
          <meshStandardMaterial color="#1a1a30" roughness={0.4} metalness={0.6} />
        </mesh>
        {/* 挡风玻璃 */}
        <mesh position={[data.size * 0.4, data.size * 0.2, 0]}>
          <boxGeometry args={[data.size * 0.6, data.size * 0.3, data.size * 0.9]} />
          <meshPhysicalMaterial
            color="#4488cc"
            transmission={0.5}
            roughness={0.1}
            transparent
            opacity={0.4}
          />
        </mesh>
        {/* 尾灯 */}
        <mesh position={[-data.size, 0, 0]}>
          <boxGeometry args={[0.05, data.size * 0.3, data.size * 0.8]} />
          <meshStandardMaterial
            color={data.color}
            emissive={data.color}
            emissiveIntensity={1}
          />
        </mesh>
        {/* 尾焰 */}
        <mesh ref={trailRef} position={[-data.size - 0.3, 0, 0]}>
          <coneGeometry args={[data.size * 0.3, 0.6, 6]} />
          <meshStandardMaterial
            color={data.color}
            emissive={data.color}
            emissiveIntensity={0.8}
            transparent
            opacity={0.4}
          />
        </mesh>
        {/* 底部发光条 */}
        <mesh position={[0, -data.size * 0.3, 0]}>
          <boxGeometry args={[data.size * 1.8, 0.02, data.size * 0.3]} />
          <meshStandardMaterial
            color={data.color}
            emissive={data.color}
            emissiveIntensity={0.6}
            transparent
            opacity={0.5}
          />
        </mesh>
      </group>
    )
  }

  // 无人机
  return (
    <group ref={groupRef}>
      {/* 机身 */}
      <mesh castShadow>
        <cylinderGeometry args={[data.size, data.size, data.size * 0.4, 6]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.5} metalness={0.5} />
      </mesh>
      {/* 四个旋翼臂 */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz], i) => (
        <group key={i} position={[dx * data.size * 1.2, 0, dz * data.size * 1.2]}>
          <mesh>
            <cylinderGeometry args={[data.size * 0.4, data.size * 0.4, 0.02, 8]} />
            <meshStandardMaterial
              color={data.color}
              emissive={data.color}
              emissiveIntensity={0.5}
              transparent
              opacity={0.4}
            />
          </mesh>
        </group>
      ))}
      {/* 底部扫描灯 */}
      <mesh ref={trailRef} position={[0, -data.size * 0.3, 0]}>
        <coneGeometry args={[data.size * 0.6, 1, 8, 1, true]} />
        <meshStandardMaterial
          color={data.color}
          emissive={data.color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

/* ───────── 导出组件 ───────── */

export default function FlyingVehicles() {
  const vehicles = useMemo(() => generateVehicles(15), [])

  return (
    <group>
      {vehicles.map(v => (
        <FlyingVehicle key={v.id} data={v} />
      ))}
    </group>
  )
}
