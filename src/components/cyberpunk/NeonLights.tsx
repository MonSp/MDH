import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 霓虹灯管装饰 ───────── */

interface NeonTubeProps {
  points: [number, number, number][]
  color: string
  radius?: number
  pulseSpeed?: number
}

function NeonTube({ points, color, radius = 0.04, pulseSpeed = 2 }: NeonTubeProps) {
  const ref = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * pulseSpeed) * 0.6
    }
  })

  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3(
      points.map(p => new THREE.Vector3(...p)),
      false,
      'catmullrom',
      0.5
    )
  }, [points])

  // 灯管中点位置，用于放置伴随pointLight
  const midPoint = useMemo(() => curve.getPoint(0.5), [curve])

  return (
    <group>
      <mesh ref={ref}>
        <tubeGeometry args={[curve, 20, radius, 6, false]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* 伴随点光源，照亮灯管周围 */}
      <pointLight
        position={midPoint}
        color={color}
        intensity={0.8}
        distance={6}
        decay={2}
      />
    </group>
  )
}

/* ───────── 地面霓虹灯管布局 ───────── */

export default function NeonLights() {
  const tubes = useMemo(() => [
    // 建筑周围的L型灯管
    { points: [[-8, 0.1, 8], [-8, 3, 8], [-8, 3, -2]] as [number, number, number][], color: '#ff375f', pulseSpeed: 1.5 },
    { points: [[8, 0.1, -8], [8, 4, -8], [8, 4, 2]] as [number, number, number][], color: '#0a84ff', pulseSpeed: 2.0 },
    { points: [[-12, 0.1, 0], [-12, 2, 0], [-12, 2, -8]] as [number, number, number][], color: '#bf5af2', pulseSpeed: 1.8 },
    { points: [[12, 0.1, 5], [12, 3.5, 5], [12, 3.5, -5]] as [number, number, number][], color: '#ff9f0a', pulseSpeed: 2.5 },
    // 地面装饰线
    { points: [[-15, 0.05, 3], [-6, 0.05, 3], [-6, 0.05, -3]] as [number, number, number][], color: '#64d2ff', pulseSpeed: 1.2 },
    { points: [[15, 0.05, -3], [6, 0.05, -3], [6, 0.05, 3]] as [number, number, number][], color: '#30d158', pulseSpeed: 1.6 },
    // 高处连接线
    { points: [[-6, 15, -10], [0, 20, -5], [6, 15, -10]] as [number, number, number][], color: '#ff375f', pulseSpeed: 0.8 },
    { points: [[-10, 12, 6], [0, 18, 3], [10, 12, 6]] as [number, number, number][], color: '#bf5af2', pulseSpeed: 1.0 },
    // 额外的地面霓虹装饰
    { points: [[-18, 0.05, -12], [-10, 0.05, -12], [-10, 0.05, -6]] as [number, number, number][], color: '#ff9f0a', pulseSpeed: 1.4 },
    { points: [[18, 0.05, 12], [10, 0.05, 12], [10, 0.05, 6]] as [number, number, number][], color: '#0a84ff', pulseSpeed: 2.2 },
    // 中层环绕灯管
    { points: [[-5, 8, 12], [5, 8, 12], [5, 8, 8], [-5, 8, 8]] as [number, number, number][], color: '#64d2ff', pulseSpeed: 1.0 },
    { points: [[-14, 6, -6], [-14, 6, 6], [-8, 6, 6]] as [number, number, number][], color: '#30d158', pulseSpeed: 1.8 },
    // 竖向霓虹柱
    { points: [[-20, 0.1, 0], [-20, 8, 0]] as [number, number, number][], color: '#bf5af2', pulseSpeed: 2.0 },
    { points: [[20, 0.1, 0], [20, 8, 0]] as [number, number, number][], color: '#ff375f', pulseSpeed: 2.0 },
    { points: [[0, 0.1, -18], [0, 6, -18]] as [number, number, number][], color: '#ff9f0a', pulseSpeed: 1.5 },
    { points: [[0, 0.1, 18], [0, 6, 18]] as [number, number, number][], color: '#0a84ff', pulseSpeed: 1.5 },
  ], [])

  return (
    <group>
      {tubes.map((tube, i) => (
        <NeonTube key={i} {...tube} />
      ))}
    </group>
  )
}
