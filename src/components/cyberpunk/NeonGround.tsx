import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 赛博朋克地面：霓虹网格 + 道路 ───────── */

export default function NeonGround() {
  const gridSize = 120
  const divisions = 30

  // 霓虹网格线几何体
  const gridGeo = useMemo(() => {
    const positions: number[] = []
    const half = gridSize / 2
    const step = gridSize / divisions

    for (let i = 0; i <= divisions; i++) {
      const pos = -half + i * step
      // X 方向
      positions.push(-half, 0.02, pos, half, 0.02, pos)
      // Z 方向
      positions.push(pos, 0.02, -half, pos, 0.02, half)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [])

  // 主干道路（更亮的霓虹线）
  const roadGeo = useMemo(() => {
    const positions: number[] = []
    const half = gridSize / 2
    // 十字主干道
    positions.push(-half, 0.03, 0, half, 0.03, 0)
    positions.push(0, 0.03, -half, 0, 0.03, half)
    // 对角线
    positions.push(-half, 0.03, -half, half, 0.03, half)
    positions.push(-half, 0.03, half, half, 0.03, -half)

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [])

  // 圆形扩散环
  const ringRef = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ringRef.current) {
      const m = ringRef.current.material as THREE.MeshStandardMaterial
      m.opacity = 0.15 + Math.sin(clock.elapsedTime * 0.8) * 0.1
    }
  })

  return (
    <group>
      {/* 基础地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[gridSize, gridSize]} />
        <meshStandardMaterial color="#06060e" roughness={1} metalness={0.1} />
      </mesh>

      {/* 霓虹网格 */}
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial color="#0a1a3a" transparent opacity={0.3} />
      </lineSegments>

      {/* 主干道路 */}
      <lineSegments geometry={roadGeo}>
        <lineBasicMaterial color="#0a84ff" transparent opacity={0.5} />
      </lineSegments>

      {/* 中心扩散环 */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[8, 8.3, 64]} />
        <meshStandardMaterial
          color="#0a84ff"
          emissive="#0a84ff"
          emissiveIntensity={0.5}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 外圈装饰环 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[20, 20.15, 64]} />
        <meshStandardMaterial
          color="#bf5af2"
          emissive="#bf5af2"
          emissiveIntensity={0.3}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
