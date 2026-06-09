import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'

/* ───────── 大型飞船组件 ───────── */

interface FreightShipProps {
  radius?: number
  height?: number
  speed?: number
  color?: string
  size?: number
}

export default function FreightShip({
  radius = 40,
  height = 25,
  speed = 0.04,
  color = '#0a84ff',
  size = 1.0
}: FreightShipProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const engineRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime * speed
    const x = Math.cos(t) * radius
    const z = Math.sin(t) * radius
    groupRef.current.position.set(x, height, z)
    // 飞船朝向飞行方向
    groupRef.current.rotation.y = -t + Math.PI / 2
    // 微微倾斜
    groupRef.current.rotation.z = Math.sin(t * 2) * 0.05

    // 引擎发光脉冲
    if (engineRef.current) {
      const m = engineRef.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 3) * 0.5
    }

    // 辉光效果
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial
      m.opacity = 0.2 + Math.sin(clock.elapsedTime * 2) * 0.1
    }
  })

  return (
    <group ref={groupRef} scale={[size, size, size]}>
      {/* 光迹拖尾 */}
      <Trail
        width={2.0}
        length={8}
        color={color}
        attenuation={(w) => w * w}
        trailLength={8}
      >
        <mesh>
          <sphereGeometry args={[0.01, 4, 4]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Trail>

      {/* 船身主体 - 拉长的六面体 */}
      <mesh castShadow>
        <boxGeometry args={[8, 2, 3]} />
        <meshStandardMaterial color="#2a2a45" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* 驾驶舱 - 前部球体 */}
      <mesh position={[4, 0.5, 0]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshPhysicalMaterial
          color="#4488ff"
          transmission={0.6}
          roughness={0.1}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* 左右引擎 - 尾部圆柱 */}
      <mesh position={[-3, 0, 1.5]}>
        <cylinderGeometry args={[0.5, 0.8, 2, 6]} />
        <meshStandardMaterial color="#1a1a30" />
      </mesh>
      <mesh position={[-3, 0, -1.5]}>
        <cylinderGeometry args={[0.5, 0.8, 2, 6]} />
        <meshStandardMaterial color="#1a1a30" />
      </mesh>

      {/* 引擎发光 */}
      <mesh ref={engineRef} position={[-4, 0, 1.5]}>
        <coneGeometry args={[0.6, 1.5, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh position={[-4, 0, -1.5]}>
        <coneGeometry args={[0.6, 1.5, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* 翼面 - 薄板 */}
      <mesh position={[0, 0, 2.5]} rotation={[0, 0, Math.PI / 6]}>
        <boxGeometry args={[4, 0.1, 2]} />
        <meshStandardMaterial color="#252540" />
      </mesh>
      <mesh position={[0, 0, -2.5]} rotation={[0, 0, -Math.PI / 6]}>
        <boxGeometry args={[4, 0.1, 2]} />
        <meshStandardMaterial color="#252540" />
      </mesh>

      {/* 尾翼 */}
      <mesh position={[-3.5, 1, 0]}>
        <boxGeometry args={[1, 2, 0.1]} />
        <meshStandardMaterial color="#252540" />
      </mesh>

      {/* 底部发光条 */}
      <mesh position={[0, -1.1, 0]}>
        <boxGeometry args={[7, 0.02, 2.5]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* 辉光效果 */}
      <mesh ref={glowRef} position={[0, 0, 0]}>
        <sphereGeometry args={[5, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={0.2}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 霓虹边框 */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={8}
            array={new Float32Array([
              -4, -1, -1.5,
              4, -1, -1.5,
              4, -1, -1.5,
              4, 1, -1.5,
              4, 1, -1.5,
              -4, 1, -1.5,
              -4, 1, -1.5,
              -4, -1, -1.5
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.6} />
      </lineSegments>
    </group>
  )
}
