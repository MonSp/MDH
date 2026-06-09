import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 街道摊贩组件 ───────── */

interface StreetVendorProps {
  position: [number, number, number]
  color?: string
  size?: number
  steamParticleCount?: number
}

export default function StreetVendor({
  position,
  color = '#ff9f0a',
  size = 0.5,
  steamParticleCount = 30
}: StreetVendorProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const steamRef = useRef<THREE.Points>(null!)

  // 蒸汽粒子
  const [steamPositions, steamVelocities] = useMemo(() => {
    const pos = new Float32Array(steamParticleCount * 3)
    const vel = new Float32Array(steamParticleCount)

    for (let i = 0; i < steamParticleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * size * 0.5
      pos[i * 3 + 1] = Math.random() * size * 2
      pos[i * 3 + 2] = (Math.random() - 0.5) * size * 0.5
      vel[i] = 0.3 + Math.random() * 0.5
    }

    return [pos, vel]
  }, [steamParticleCount, size])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime

    // 发光脉冲
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 1.5 + Math.sin(t * 2) * 0.5
      m.opacity = 0.6 + Math.sin(t * 2.5) * 0.2
    }

    // 蒸汽粒子动画
    if (steamRef.current) {
      const posAttr = steamRef.current.geometry.attributes.position as THREE.BufferAttribute
      const arr = posAttr.array as Float32Array

      for (let i = 0; i < steamParticleCount; i++) {
        // 向上移动
        arr[i * 3 + 1] += steamVelocities[i] * 0.016

        // 向外扩散
        arr[i * 3] += (Math.random() - 0.5) * 0.02
        arr[i * 3 + 2] += (Math.random() - 0.5) * 0.02

        // 重置超出高度的粒子
        if (arr[i * 3 + 1] > size * 2) {
          arr[i * 3] = (Math.random() - 0.5) * size * 0.5
          arr[i * 3 + 1] = 0
          arr[i * 3 + 2] = (Math.random() - 0.5) * size * 0.5
        }
      }

      posAttr.needsUpdate = true
    }
  })

  return (
    <group ref={groupRef} position={position}>
      {/* 摊贩发光点 */}
      <mesh ref={glowRef} position={[0, size * 0.5, 0]}>
        <boxGeometry args={[size, size * 0.8, size]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* 摊贩基座 */}
      <mesh position={[0, size * 0.1, 0]}>
        <boxGeometry args={[size * 1.2, size * 0.2, size * 1.2]} />
        <meshStandardMaterial color="#3a3a5a" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* 蒸汽粒子 */}
      <points ref={steamRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={steamParticleCount}
            array={steamPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          color="#ffffff"
          transparent
          opacity={0.4}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* 底部发光环 */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 0.4, size * 0.6, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.0}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
