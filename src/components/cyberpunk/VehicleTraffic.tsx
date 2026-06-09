import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 车辆光迹组件 ───────── */

interface VehicleTrafficProps {
  roadLength?: number
  roadWidth?: number
  particleCount?: number
  speed?: number
  direction?: 'east' | 'west' | 'north' | 'south'
  position?: [number, number, number]
}

export default function VehicleTraffic({
  roadLength = 60,
  roadWidth = 4,
  particleCount = 50,
  speed = 2.0,
  direction = 'east',
  position = [0, 0.15, 0]
}: VehicleTrafficProps) {
  const pointsRef = useRef<THREE.Points>(null!)

  const [positions, velocities, colors] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const vel = new Float32Array(particleCount)
    const col = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount; i++) {
      // 初始位置：沿道路分布
      const t = Math.random() * roadLength
      const offset = (Math.random() - 0.5) * roadWidth * 0.8

      if (direction === 'east' || direction === 'west') {
        pos[i * 3] = direction === 'east' ? t - roadLength / 2 : roadLength / 2 - t
        pos[i * 3 + 1] = 0
        pos[i * 3 + 2] = offset
      } else {
        pos[i * 3] = offset
        pos[i * 3 + 1] = 0
        pos[i * 3 + 2] = direction === 'north' ? t - roadLength / 2 : roadLength / 2 - t
      }

      // 速度
      vel[i] = (1.0 + Math.random() * 2.0) * speed

      // 颜色：红/白尾灯交替
      const isRed = Math.random() > 0.5
      if (isRed) {
        col[i * 3] = 1.0
        col[i * 3 + 1] = 0.1 + Math.random() * 0.2
        col[i * 3 + 2] = 0.1 + Math.random() * 0.1
      } else {
        col[i * 3] = 1.0
        col[i * 3 + 1] = 0.9 + Math.random() * 0.1
        col[i * 3 + 2] = 0.8 + Math.random() * 0.2
      }
    }

    return [pos, vel, col]
  }, [particleCount, roadLength, roadWidth, speed, direction])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array

    for (let i = 0; i < particleCount; i++) {
      // 沿道路方向移动
      if (direction === 'east' || direction === 'west') {
        const dir = direction === 'east' ? 1 : -1
        arr[i * 3] += velocities[i] * delta * dir

        // 重置超出范围的粒子
        if (direction === 'east' && arr[i * 3] > roadLength / 2) {
          arr[i * 3] = -roadLength / 2
        } else if (direction === 'west' && arr[i * 3] < -roadLength / 2) {
          arr[i * 3] = roadLength / 2
        }
      } else {
        const dir = direction === 'north' ? 1 : -1
        arr[i * 3 + 2] += velocities[i] * delta * dir

        // 重置超出范围的粒子
        if (direction === 'north' && arr[i * 3 + 2] > roadLength / 2) {
          arr[i * 3 + 2] = -roadLength / 2
        } else if (direction === 'south' && arr[i * 3 + 2] < -roadLength / 2) {
          arr[i * 3 + 2] = roadLength / 2
        }
      }
    }

    posAttr.needsUpdate = true
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
          <bufferAttribute
            attach="attributes-color"
            count={particleCount}
            array={colors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.15}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  )
}
