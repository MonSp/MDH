import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 赛博朋克雨滴粒子系统 ───────── */

export default function CyberRain() {
  const count = 800
  const ref = useRef<THREE.Points>(null!)

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80       // x: 分布范围
      pos[i * 3 + 1] = Math.random() * 50            // y: 初始高度
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80    // z: 分布范围
      vel[i] = 15 + Math.random() * 15               // 下落速度
    }

    return [pos, vel]
  }, [])

  useFrame((_, delta) => {
    if (!ref.current) return
    const posAttr = ref.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array

    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= velocities[i] * delta
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 40 + Math.random() * 10
        arr[i * 3] = (Math.random() - 0.5) * 80
        arr[i * 3 + 2] = (Math.random() - 0.5) * 80
      }
    }

    posAttr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#66aaee"
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
