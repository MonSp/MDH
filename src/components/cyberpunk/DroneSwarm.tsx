import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 无人机蜂群组件 ───────── */

interface DroneSwarmProps {
  count?: number
  radius?: number
  height?: number
  speed?: number
  color?: string
  size?: number
}

export default function DroneSwarm({
  count = 8,
  radius = 35,
  height = 30,
  speed = 0.08,
  color = '#64d2ff',
  size = 0.15
}: DroneSwarmProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const meshRef = useRef<THREE.InstancedMesh>(null!)

  // 生成蜂群成员的相对位置
  const offsets = useMemo(() => {
    const result: { x: number; y: number; z: number; angleOffset: number }[] = []
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const r = 1.5 + Math.random() * 1.5
      result.push({
        x: Math.cos(angle) * r,
        y: (Math.random() - 0.5) * 1.5,
        z: Math.sin(angle) * r,
        angleOffset: Math.random() * Math.PI * 2
      })
    }
    return result
  }, [count])

  // 初始化实例变换
  useMemo(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current
    const dummy = new THREE.Object3D()

    for (let i = 0; i < count; i++) {
      dummy.position.set(offsets[i].x, offsets[i].y, offsets[i].z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [count, offsets])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime * speed
    const x = Math.cos(t) * radius
    const z = Math.sin(t) * radius
    groupRef.current.position.set(x, height, z)
    // 蜂群朝向飞行方向
    groupRef.current.rotation.y = -t + Math.PI / 2

    // 更新每个无人机的相对位置（编队内微动）
    if (meshRef.current) {
      const dummy = new THREE.Object3D()
      for (let i = 0; i < count; i++) {
        const offset = offsets[i]
        const wobble = Math.sin(clock.elapsedTime * 2 + offset.angleOffset) * 0.2
        dummy.position.set(
          offset.x + wobble,
          offset.y + Math.sin(clock.elapsedTime * 1.5 + offset.angleOffset) * 0.15,
          offset.z + Math.cos(clock.elapsedTime * 1.8 + offset.angleOffset) * 0.2
        )
        dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, dummy.matrix)
      }
      meshRef.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group ref={groupRef}>
      {/* 使用 InstancedMesh 渲染蜂群 */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
        <cylinderGeometry args={[size, size, size * 0.4, 6]} />
        <meshStandardMaterial
          color="#2a2a45"
          roughness={0.4}
          metalness={0.6}
        />
      </instancedMesh>

      {/* 每个无人机的旋翼和灯光（简化版，使用单个发光球体） */}
      {offsets.map((offset, i) => (
        <group key={i} position={[offset.x, offset.y, offset.z]}>
          {/* 旋翼发光 */}
          <mesh position={[0, size * 0.3, 0]}>
            <cylinderGeometry args={[size * 0.6, size * 0.6, 0.01, 8]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.8}
              transparent
              opacity={0.4}
            />
          </mesh>

          {/* 底部扫描灯 */}
          <mesh position={[0, -size * 0.3, 0]}>
            <coneGeometry args={[size * 0.8, 0.5, 6, 1, true]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.3}
              transparent
              opacity={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      {/* 中心连接线 */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count * 2}
            array={new Float32Array(
              offsets.flatMap((o, i) => [
                0, 0, 0,
                o.x, o.y, o.z
              ])
            )}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.2} />
      </lineSegments>
    </group>
  )
}
