import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'

/* ───────── 飞行载具（飞行汽车 + 无人机） ───────── */

interface VehicleData {
  id: number
  type: 'car' | 'drone' | 'transport'
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

  // 3层分层航道
  const lanes = [
    { minH: 8, maxH: 18, count: 40 },   // LowLane: 小型飞行汽车
    { minH: 18, maxH: 32, count: 35 },  // MidLane: 飞行汽车+无人机
    { minH: 32, maxH: 50, count: 25 },  // HighLane: 无人机+运输载具
  ]

  let vehicleId = 0

  // 为每层航道生成载具
  for (const lane of lanes) {
    for (let i = 0; i < lane.count; i++) {
      const isCar = lane.minH < 25 ? Math.random() > 0.3 : Math.random() > 0.6
      const height = lane.minH + Math.random() * (lane.maxH - lane.minH)
      const radius = 10 + Math.random() * 50

      vehicles.push({
        id: vehicleId++,
        type: isCar ? 'car' : 'drone',
        radius,
        height,
        speed: 0.15 + Math.random() * 0.35,
        angleOffset: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: isCar ? 0.3 + Math.random() * 0.3 : 0.15 + Math.random() * 0.15,
      })
    }
  }

  // 大型运输载具 - 5艘
  for (let i = 0; i < 5; i++) {
    vehicles.push({
      id: vehicleId++,
      type: 'transport',
      radius: 20 + Math.random() * 30,
      height: 15 + Math.random() * 30,
      speed: 0.06 + Math.random() * 0.09,
      angleOffset: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 0.7 + Math.random() * 0.2,
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

  if (data.type === 'car' || data.type === 'transport') {
    return (
      <group ref={groupRef} scale={data.type === 'transport' ? 2.5 : 1}>
        {/* 光迹拖尾 */}
        <Trail
          width={data.size * 1.5}
          length={6}
          color={data.color}
          attenuation={(w) => w * w}
          trailLength={6}
        >
          <mesh>
            <sphereGeometry args={[0.01, 4, 4]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </Trail>
        {/* 车身 */}
        <mesh castShadow>
          <boxGeometry args={[data.size * 2, data.size * 0.5, data.size]} />
          <meshStandardMaterial color="#2a2a48" roughness={0.3} metalness={0.7} />
        </mesh>
        {/* 挡风玻璃 */}
        <mesh position={[data.size * 0.4, data.size * 0.2, 0]}>
          <boxGeometry args={[data.size * 0.6, data.size * 0.3, data.size * 0.9]} />
          <meshPhysicalMaterial
            color="#55aaff"
            transmission={0.6}
            roughness={0.1}
            transparent
            opacity={0.5}
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
      {/* 光迹拖尾 */}
      <Trail
        width={data.size * 1.2}
        length={5}
        color={data.color}
        attenuation={(w) => w * w}
        trailLength={5}
      >
        <mesh>
          <sphereGeometry args={[0.01, 4, 4]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Trail>
      {/* 机身 */}
      <mesh castShadow>
        <cylinderGeometry args={[data.size, data.size, data.size * 0.4, 6]} />
        <meshStandardMaterial color="#2a2a45" roughness={0.4} metalness={0.6} />
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
  const vehicles = useMemo(() => generateVehicles(100), [])

  return (
    <group>
      {vehicles.map(v => (
        <FlyingVehicle key={v.id} data={v} />
      ))}
    </group>
  )
}
