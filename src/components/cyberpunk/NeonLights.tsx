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
      m.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * pulseSpeed) * 0.4
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

  return (
    <mesh ref={ref}>
      <tubeGeometry args={[curve, 20, radius, 6, false]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={1}
        transparent
        opacity={0.8}
      />
    </mesh>
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
  ], [])

  return (
    <group>
      {tubes.map((tube, i) => (
        <NeonTube key={i} {...tube} />
      ))}
    </group>
  )
}
