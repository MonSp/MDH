import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 蒸汽喷口组件 ───────── */

interface SteamVentProps {
  position: [number, number, number]
  color?: string
  particleCount?: number
  speed?: number
  height?: number
}

export default function SteamVent({
  position,
  color = '#ffffff',
  particleCount = 50,
  speed = 1.0,
  height = 3
}: SteamVentProps) {
  const pointsRef = useRef<THREE.Points>(null!)
  const materialRef = useRef<THREE.PointsMaterial>(null!)

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const vel = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      // 初始位置：在喷口附近随机分布
      pos[i * 3] = (Math.random() - 0.5) * 0.5
      pos[i * 3 + 1] = Math.random() * height
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5
      // 初始速度
      vel[i] = 0.5 + Math.random() * 1.5
    }

    return [pos, vel]
  }, [particleCount, height])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array

    for (let i = 0; i < particleCount; i++) {
      // 向上移动
      arr[i * 3 + 1] += velocities[i] * delta * speed

      // 向外扩散
      arr[i * 3] += (Math.random() - 0.5) * 0.1 * delta
      arr[i * 3 + 2] += (Math.random() - 0.5) * 0.1 * delta

      // 重置超出高度的粒子
      if (arr[i * 3 + 1] > height) {
        arr[i * 3] = (Math.random() - 0.5) * 0.5
        arr[i * 3 + 1] = 0
        arr[i * 3 + 2] = (Math.random() - 0.5) * 0.5
      }
    }

    posAttr.needsUpdate = true

    // 材质透明度脉冲
    if (materialRef.current) {
      materialRef.current.opacity = 0.3 + Math.sin(Date.now() * 0.002) * 0.1
    }
  })

  return (
    <group position={position}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particleCount}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          size={0.15}
          color={color}
          transparent
          opacity={0.3}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* 喷口发光 */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.2, 8]} />
        <meshStandardMaterial
          color="#88aacc"
          emissive="#88aacc"
          emissiveIntensity={0.5}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* 喷口基座 */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.4, 0.5, 0.3, 8]} />
        <meshStandardMaterial color="#3a3a5a" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  )
}
