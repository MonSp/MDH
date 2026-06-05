import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { NeonGround } from '../cyberpunk'
import { BUILDING_W, BUILDING_D, BUILDING_H, FLOOR_H, PENTHOUSE_H, PENTHOUSE_Y, getFloorGradientColor } from './constants'

/* ───────── 楼层间隔线 ───────── */

function FloorLines() {
  const geo = useMemo(() => {
    const positions: number[] = []
    for (let i = 1; i < 5; i++) {
      const y = i * FLOOR_H
      const hw = BUILDING_W / 2, hd = BUILDING_D / 2
      positions.push(-hw, y, -hd, hw, y, -hd, hw, y, -hd, hw, y, hd,
        hw, y, hd, -hw, y, hd, -hw, y, hd, -hw, y, -hd)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [])

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#64d2ff" transparent opacity={0.6} />
    </lineSegments>
  )
}

/* ───────── 建筑主体 ───────── */

export function BuildingBody() {
  const boxGeo = useMemo(() => new THREE.BoxGeometry(BUILDING_W, BUILDING_H, BUILDING_D), [])
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a0a1a', roughness: 0.8, metalness: 0.2,
  }), [])

  return (
    <group position={[0, BUILDING_H / 2, 0]}>
      <mesh geometry={boxGeo} material={bodyMat} castShadow receiveShadow />
      <FloorLines />
    </group>
  )
}

/* ───────── 玻璃幕墙 InstancedMesh ───────── */

export function GlassCurtainWall() {
  const count = 24
  const frontRef = useRef<THREE.InstancedMesh>(null!)
  const backRef = useRef<THREE.InstancedMesh>(null!)
  const leftRef = useRef<THREE.InstancedMesh>(null!)
  const rightRef = useRef<THREE.InstancedMesh>(null!)

  const panelW = BUILDING_W / 3 - 0.15
  const panelWD = BUILDING_D / 3 - 0.15
  const panelH = FLOOR_H - 0.2
  const boxGeo = useMemo(() => new THREE.BoxGeometry(panelW, panelH, 0.05), [])
  const boxGeoD = useMemo(() => new THREE.BoxGeometry(panelWD, panelH, 0.05), [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    const refs = [frontRef, backRef, leftRef, rightRef]
    refs.forEach((ref) => {
      if (!ref.current) return
      for (let floor = 0; floor < 8; floor++) {
        const y = floor * FLOOR_H + FLOOR_H / 2
        for (let col = 0; col < 3; col++) {
          const idx = floor * 3 + col
          const xOrZ = (col - 1) * (BUILDING_W / 3)
          const xOrZD = (col - 1) * (BUILDING_D / 3)

          if (ref === frontRef || ref === backRef) {
            dummy.position.set(xOrZ, y, ref === frontRef ? BUILDING_D / 2 + 0.03 : -BUILDING_D / 2 - 0.03)
            dummy.rotation.set(0, 0, 0)
          } else {
            dummy.position.set(ref === rightRef ? BUILDING_W / 2 + 0.03 : -BUILDING_W / 2 - 0.03, y, xOrZD)
            dummy.rotation.set(0, Math.PI / 2, 0)
          }
          dummy.updateMatrix()
          ref.current.setMatrixAt(idx, dummy.matrix)

          color.set(getFloorGradientColor(floor))
          ref.current.setColorAt(idx, color)
        }
      }
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    })
  }, [dummy, color])

  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    transmission: 0.6,
    roughness: 0.12,
    thickness: 0.5,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  }), [])

  return (
    <group>
      <instancedMesh ref={frontRef} args={[boxGeo, glassMat, count]} />
      <instancedMesh ref={backRef} args={[boxGeo, glassMat, count]} />
      <instancedMesh ref={leftRef} args={[boxGeoD, glassMat, count]} />
      <instancedMesh ref={rightRef} args={[boxGeoD, glassMat, count]} />
      <lineSegments position={[0, BUILDING_H / 2, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={12}
            array={new Float32Array([
              -BUILDING_W/2, FLOOR_H*2, BUILDING_D/2, BUILDING_W/2, FLOOR_H*2, BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*4, BUILDING_D/2, BUILDING_W/2, FLOOR_H*4, BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*6, BUILDING_D/2, BUILDING_W/2, FLOOR_H*6, BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*2, -BUILDING_D/2, BUILDING_W/2, FLOOR_H*2, -BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*4, -BUILDING_D/2, BUILDING_W/2, FLOOR_H*4, -BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*6, -BUILDING_D/2, BUILDING_W/2, FLOOR_H*6, -BUILDING_D/2,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#64d2ff" transparent opacity={0.3} />
      </lineSegments>
    </group>
  )
}

/* ───────── CEO 顶层公寓 ───────── */

export function PenthouseFloor() {
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a1832', roughness: 0.6, metalness: 0.3,
  }), [])
  return (
    <mesh position={[0, BUILDING_H + 0.05, 0]} receiveShadow material={floorMat}>
      <boxGeometry args={[BUILDING_W + 0.5, 0.1, BUILDING_D + 0.5]} />
    </mesh>
  )
}

export function PenthouseWalls() {
  const hw = BUILDING_W / 2, hd = BUILDING_D / 2
  const wh = PENTHOUSE_H

  const walls = useMemo(() => [
    { pos: [0, PENTHOUSE_Y, hd + 0.02] as [number, number, number], size: [BUILDING_W, wh] as [number, number], rot: [0, 0, 0] as [number, number, number] },
    { pos: [0, PENTHOUSE_Y, -hd - 0.02] as [number, number, number], size: [BUILDING_W, wh] as [number, number], rot: [0, 0, 0] as [number, number, number] },
    { pos: [hw + 0.02, PENTHOUSE_Y, 0] as [number, number, number], size: [BUILDING_D, wh] as [number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] },
    { pos: [-hw - 0.02, PENTHOUSE_Y, 0] as [number, number, number], size: [BUILDING_D, wh] as [number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] },
  ], [])

  return (
    <group>
      {walls.map((w, i) => (
        <group key={i} position={w.pos} rotation={w.rot}>
          <mesh>
            <boxGeometry args={[w.size[0], w.size[1], 0.05]} />
            <meshPhysicalMaterial
              color="#88ccff"
              transmission={0.6}
              roughness={0.08}
              thickness={1.5}
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ───────── 霓虹边缘脉冲 ───────── */

export function NeonEdges() {
  const ref = useRef<THREE.LineSegments>(null!)

  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.LineBasicMaterial
      m.opacity = 0.4 + Math.sin(clock.elapsedTime * 1.5) * 0.3
    }
  })

  const geo = useMemo(() => {
    const hw = BUILDING_W / 2 + 0.05
    const hd = BUILDING_D / 2 + 0.05
    const h = BUILDING_H + 0.5
    const positions: number[] = []
    positions.push(-hw, -h / 2, -hd,  -hw, h / 2, -hd)
    positions.push(hw, -h / 2, -hd,   hw, h / 2, -hd)
    positions.push(-hw, -h / 2, hd,   -hw, h / 2, hd)
    positions.push(hw, -h / 2, hd,    hw, h / 2, hd)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [])

  return (
    <lineSegments ref={ref} geometry={geo} position={[0, BUILDING_H / 2, 0]}>
      <lineBasicMaterial color="#64d2ff" transparent opacity={0.6} />
    </lineSegments>
  )
}

/* ───────── 地面平台 ───────── */

export function Ground() {
  return <NeonGround />
}

/* ───────── 信号塔天线 ───────── */

export function Antenna({ activeDeptColor }: { activeDeptColor?: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  const targetColor = useRef(new THREE.Color('#64d2ff'))
  const flashBoost = useRef(0)

  useEffect(() => {
    if (activeDeptColor) {
      targetColor.current.set(activeDeptColor)
      flashBoost.current = 1
    }
  }, [activeDeptColor])

  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      const freq = 3 + flashBoost.current * 3
      m.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * freq) * 0.5
      m.color.lerp(targetColor.current, 0.05)
      m.emissive.lerp(targetColor.current, 0.05)
    }
    if (flashBoost.current > 0) {
      flashBoost.current = Math.max(0, flashBoost.current - 0.008)
    }
  })

  const topY = BUILDING_H + PENTHOUSE_H + 2
  return (
    <group position={[3.5, 0, -3]}>
      <mesh position={[0, topY, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 4, 6]} />
        <meshStandardMaterial color="#2a2a3a" />
      </mesh>
      <mesh ref={ref} position={[0, topY + 2, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#64d2ff" emissive="#64d2ff" emissiveIntensity={0.8} />
      </mesh>
    </group>
  )
}

/* ───────── 数据流粒子 ───────── */

export function DataFlowParticles({ totalIterations }: { totalIterations: number }) {
  const ref = useRef<THREE.Points>(null!)
  const count = 40 + totalIterations * 2

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (BUILDING_W - 2)
      pos[i * 3 + 1] = Math.random() * BUILDING_H
      pos[i * 3 + 2] = (Math.random() - 0.5) * (BUILDING_D - 2)
      const floor = Math.floor((pos[i * 3 + 1] / BUILDING_H) * 8)
      const c = new THREE.Color(getFloorGradientColor(floor))
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    return [pos, col]
  }, [count])

  useFrame((_, delta) => {
    if (ref.current) {
      const posAttr = ref.current.geometry.attributes.position as THREE.BufferAttribute
      const arr = posAttr.array as Float32Array
      for (let i = 0; i < count; i++) {
        arr[i * 3 + 1] += delta * (2 + Math.random())
        if (arr[i * 3 + 1] > BUILDING_H) {
          arr[i * 3 + 1] = 0
          arr[i * 3] = (Math.random() - 0.5) * (BUILDING_W - 2)
          arr[i * 3 + 2] = (Math.random() - 0.5) * (BUILDING_D - 2)
        }
      }
      posAttr.needsUpdate = true
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.08} vertexColors transparent opacity={0.6} sizeAttenuation />
    </points>
  )
}
