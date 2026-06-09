import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 烟尘柱组件 ───────── */

interface SmokePlumeProps {
  position: [number, number, number]
  color?: string
  size?: number
  speed?: number
  opacity?: number
}

export default function SmokePlume({
  position,
  color = '#4a4a6a',
  size = 2,
  speed = 0.3,
  opacity = 0.08
}: SmokePlumeProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const meshRefs = useRef<THREE.Mesh[]>([])

  // 生成多个半透明团块
  const plumes = useMemo(() => {
    const result: {
      pos: [number, number, number]
      scale: number
      rotSpeed: number
      driftSpeed: [number, number, number]
    }[] = []

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      const r = size * 0.5
      result.push({
        pos: [
          Math.cos(angle) * r,
          Math.random() * size,
          Math.sin(angle) * r
        ],
        scale: size * (0.3 + Math.random() * 0.4),
        rotSpeed: (Math.random() - 0.5) * 0.5,
        driftSpeed: [
          (Math.random() - 0.5) * 0.2,
          0.1 + Math.random() * 0.2,
          (Math.random() - 0.5) * 0.2
        ]
      })
    }

    return result
  }, [size])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime

    // 整体缓慢漂移
    groupRef.current.position.x = position[0] + Math.sin(t * speed * 0.5) * 0.5
    groupRef.current.position.z = position[2] + Math.cos(t * speed * 0.3) * 0.5

    // 每个团块独立动画
    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const plume = plumes[i]

      // 位置漂移
      mesh.position.x = plume.pos[0] + Math.sin(t * plume.driftSpeed[0]) * 0.3
      mesh.position.y = plume.pos[1] + Math.sin(t * plume.driftSpeed[1]) * 0.5
      mesh.position.z = plume.pos[2] + Math.cos(t * plume.driftSpeed[2]) * 0.3

      // 旋转
      mesh.rotation.y += plume.rotSpeed * 0.01

      // 透明度脉冲
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.opacity = opacity * (0.7 + Math.sin(t * 0.5 + i) * 0.3)
    })
  })

  return (
    <group ref={groupRef} position={position}>
      {plumes.map((plume, i) => (
        <mesh
          key={i}
          ref={el => { if (el) meshRefs.current[i] = el }}
          position={plume.pos}
          scale={[plume.scale, plume.scale * 0.6, plume.scale]}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.2}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 中心发光核 */}
      <mesh position={[0, size * 0.5, 0]}>
        <sphereGeometry args={[size * 0.2, 8, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={opacity * 2}
        />
      </mesh>
    </group>
  )
}
