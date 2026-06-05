import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float, Text } from '@react-three/drei'
import * as THREE from 'three'
import { BUILDING_H, PENTHOUSE_Y } from './constants'

/* ───────── 家具 ───────── */

export function Desk() {
  const topMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a1a0a', roughness: 0.7 }), [])
  const legMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1008', roughness: 0.8 }), [])

  const deskY = BUILDING_H + 1
  return (
    <group position={[0, deskY, 0]}>
      <mesh material={topMat} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.1, 1.2]} />
      </mesh>
      {[[-1.1, -0.45, -0.5], [1.1, -0.45, -0.5], [-1.1, -0.45, 0.5], [1.1, -0.45, 0.5]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} material={legMat}>
          <boxGeometry args={[0.08, 0.8, 0.08]} />
        </mesh>
      ))}
    </group>
  )
}

export function ComputerScreen() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * 2) * 0.3
    }
  })

  const screenY = BUILDING_H + 1.2
  return (
    <group position={[0, screenY, -0.2]}>
      <mesh ref={ref} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.03]} />
        <meshStandardMaterial color="#64d2ff" emissive="#64d2ff" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, -0.3, 0.05]}>
        <boxGeometry args={[0.3, 0.1, 0.15]} />
        <meshStandardMaterial color="#1a1a2a" />
      </mesh>
    </group>
  )
}

export function Chair() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a30', roughness: 0.6 }), [])
  const chairY = BUILDING_H + 1
  return (
    <group position={[0, chairY, 1]}>
      <mesh material={mat} castShadow>
        <boxGeometry args={[0.6, 0.08, 0.6]} />
      </mesh>
      <mesh position={[0, 0.35, -0.27]} material={mat}>
        <boxGeometry args={[0.6, 0.65, 0.06]} />
      </mesh>
      {[[-0.25, -0.35, -0.25], [0.25, -0.35, -0.25], [-0.25, -0.35, 0.25], [0.25, -0.35, 0.25]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <cylinderGeometry args={[0.02, 0.02, 0.65, 6]} />
          <meshStandardMaterial color="#0a0a15" />
        </mesh>
      ))}
    </group>
  )
}

export function Minibar() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.4 + Math.sin(clock.elapsedTime * 1.5) * 0.2
    }
  })

  const barY = BUILDING_H + 1.6
  return (
    <group position={[-3.5, barY, -2.5]}>
      <mesh castShadow>
        <boxGeometry args={[0.8, 2.5, 0.5]} />
        <meshStandardMaterial color="#1a1020" roughness={0.5} />
      </mesh>
      <mesh ref={ref} position={[0, 0.2, 0.26]}>
        <boxGeometry args={[0.6, 0.3, 0.02]} />
        <meshStandardMaterial color="#bf5af2" emissive="#bf5af2" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

export function Plant() {
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.2) * 0.05
    }
  })

  const plantY = BUILDING_H + 1.5
  return (
    <group position={[3.5, plantY, -2.8]}>
      <mesh castShadow>
        <coneGeometry args={[0.35, 0.6, 6]} />
        <meshStandardMaterial color="#6a4a30" roughness={0.8} />
      </mesh>
      <group ref={ref} position={[0, 0.8, 0]}>
        <mesh>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#2a6a2a" roughness={0.7} flatShading />
        </mesh>
        <mesh position={[0.3, 0.3, 0.2]}>
          <icosahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#3a8a3a" roughness={0.7} flatShading />
        </mesh>
      </group>
    </group>
  )
}

export function CEOPerson() {
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = BUILDING_H + 1.7 + Math.sin(clock.elapsedTime * 1.5) * 0.03
    }
  })

  return (
    <group ref={ref} position={[0, BUILDING_H + 1.7, 0.7]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.2, 0.6, 8, 16]} />
        <meshStandardMaterial color="#1a1a30" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#e8c4a0" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.05, 0.2]}>
        <boxGeometry args={[0.06, 0.3, 0.02]} />
        <meshStandardMaterial color="#bf5af2" emissive="#bf5af2" emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

/* ───────── 全息AI助手 ───────── */

export function HolographicAI({ activeDeptColor }: { activeDeptColor?: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const targetColor = useRef(new THREE.Color('#bf5af2'))
  const spinBoost = useRef(0)

  useEffect(() => {
    if (activeDeptColor) {
      targetColor.current.set(activeDeptColor)
      spinBoost.current = 1
    }
  }, [activeDeptColor])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      ref.current.position.y = PENTHOUSE_Y + 2 + Math.sin(t * 1.2) * 0.4
      ref.current.rotation.y = t * (0.5 + spinBoost.current)
      ref.current.rotation.x = Math.sin(t * 0.8) * 0.2
      const mat = ref.current.material as THREE.MeshStandardMaterial
      mat.color.lerp(targetColor.current, 0.03)
      mat.emissive.lerp(targetColor.current, 0.03)
    }
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.3
      glowRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.1)
      m.color.lerp(targetColor.current, 0.03)
      m.emissive.lerp(targetColor.current, 0.03)
    }
    if (spinBoost.current > 0) {
      spinBoost.current = Math.max(0, spinBoost.current - 0.005)
    }
  })

  return (
    <group position={[2, 0, 0]}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.4, 1]} />
        <meshStandardMaterial color="#bf5af2" emissive="#bf5af2" emissiveIntensity={0.8} transparent opacity={0.6} wireframe />
      </mesh>
      <mesh ref={glowRef} position={[2, PENTHOUSE_Y + 2, 0]}>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshStandardMaterial color="#bf5af2" emissive="#bf5af2" emissiveIntensity={0.6} transparent opacity={0.15} />
      </mesh>
      <Float speed={2} floatIntensity={0.3}>
        <Text position={[2, PENTHOUSE_Y + 3, 0]} fontSize={0.3} color="#bf5af2" anchorX="center" anchorY="middle">
          AI 助手
        </Text>
      </Float>
    </group>
  )
}
