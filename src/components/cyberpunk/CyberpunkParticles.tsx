import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 赛博朋克多层粒子系统 ─────────
 * 低层：暖黄色粒子沿街道流动，模拟车流
 * 中层：红色/蓝色粒子缓慢移动，模拟飞行器尾迹
 * 高层：白色细小粒子缓缓飘落，模拟灰尘/数据碎屑
 * 所有粒子使用 BufferGeometry，动态更新复用同一几何体
 */

/* ───────── 伪随机 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/* ───────── Canvas 粒子纹理 ───────── */

function generateParticleTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`)
  gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.6)`)
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  return tex
}

/* ───────── 低层车流粒子 ───────── */

function StreetTrafficParticles({ count = 500 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null!)
  const velocities = useRef<Float32Array>(new Float32Array(count * 3))

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const seed = i * 13 + 42
      // 分布在街道上（y 接近地面）
      const angle = pseudoRandom(seed) * Math.PI * 2
      const radius = 5 + pseudoRandom(seed + 1) * 50
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = 0.1 + pseudoRandom(seed + 2) * 0.4
      positions[i * 3 + 2] = Math.sin(angle) * radius

      // 暖黄色调变化
      colors[i * 3] = 1.0
      colors[i * 3 + 1] = 0.6 + pseudoRandom(seed + 3) * 0.3
      colors[i * 3 + 2] = 0.1 + pseudoRandom(seed + 4) * 0.2

      sizes[i] = 0.3 + pseudoRandom(seed + 5) * 0.4

      // 速度（沿切线方向流动）
      const speed = 0.02 + pseudoRandom(seed + 6) * 0.03
      const tangent = angle + Math.PI / 2
      velocities.current[i * 3] = Math.cos(tangent) * speed
      velocities.current[i * 3 + 1] = 0
      velocities.current[i * 3 + 2] = Math.sin(tangent) * speed
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const mat = new THREE.PointsMaterial({
      size: 0.4,
      map: generateParticleTexture(255, 170, 60),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    })

    return { geometry: geo, material: mat }
  }, [count])

  useFrame(() => {
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array

    for (let i = 0; i < count; i++) {
      arr[i * 3] += velocities.current[i * 3]
      arr[i * 3 + 2] += velocities.current[i * 3 + 2]

      // 超出范围后回绕
      const dist = Math.sqrt(arr[i * 3] ** 2 + arr[i * 3 + 2] ** 2)
      if (dist > 60 || dist < 3) {
        const seed = i * 17 + Date.now() * 0.001
        const angle = pseudoRandom(seed) * Math.PI * 2
        const radius = 5 + pseudoRandom(seed + 1) * 10
        arr[i * 3] = Math.cos(angle) * radius
        arr[i * 3 + 2] = Math.sin(angle) * radius
      }
    }
    pos.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}

/* ───────── 中层飞行器尾迹粒子 ───────── */

function FlyingTrailParticles({ count = 200 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null!)

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const seed = i * 23 + 99
      const angle = pseudoRandom(seed) * Math.PI * 2
      const radius = 10 + pseudoRandom(seed + 1) * 70
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = 8 + pseudoRandom(seed + 2) * 17
      positions[i * 3 + 2] = Math.sin(angle) * radius

      // 红/蓝双色
      if (pseudoRandom(seed + 3) > 0.5) {
        colors[i * 3] = 1.0
        colors[i * 3 + 1] = 0.1 + pseudoRandom(seed + 4) * 0.2
        colors[i * 3 + 2] = 0.2 + pseudoRandom(seed + 5) * 0.2
      } else {
        colors[i * 3] = 0.1 + pseudoRandom(seed + 4) * 0.2
        colors[i * 3 + 1] = 0.3 + pseudoRandom(seed + 5) * 0.3
        colors[i * 3 + 2] = 1.0
      }

      sizes[i] = 0.2 + pseudoRandom(seed + 6) * 0.3
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const mat = new THREE.PointsMaterial({
      size: 0.3,
      map: generateParticleTexture(255, 255, 255),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    })

    return { geometry: geo, material: mat }
  }, [count])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const t = clock.elapsedTime

    for (let i = 0; i < count; i++) {
      // 缓慢漂移
      arr[i * 3] += Math.sin(t * 0.3 + i * 0.1) * 0.005
      arr[i * 3 + 1] += Math.sin(t * 0.2 + i * 0.15) * 0.003
      arr[i * 3 + 2] += Math.cos(t * 0.25 + i * 0.12) * 0.005

      // 高度回绕
      if (arr[i * 3 + 1] > 30) arr[i * 3 + 1] = 8
      if (arr[i * 3 + 1] < 6) arr[i * 3 + 1] = 25
    }
    pos.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}

/* ───────── 高层灰尘/数据碎屑粒子 ───────── */

function DustParticles({ count = 800 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null!)

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const seed = i * 31 + 200
      positions[i * 3] = (pseudoRandom(seed) - 0.5) * 160
      positions[i * 3 + 1] = 15 + pseudoRandom(seed + 1) * 35
      positions[i * 3 + 2] = (pseudoRandom(seed + 2) - 0.5) * 160
      sizes[i] = 0.05 + pseudoRandom(seed + 3) * 0.15
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      map: generateParticleTexture(200, 200, 220),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    return { geometry: geo, material: mat }
  }, [count])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const t = clock.elapsedTime

    for (let i = 0; i < count; i++) {
      // 缓缓飘落
      arr[i * 3 + 1] -= 0.003 + Math.sin(i * 0.1) * 0.001
      // 轻微水平漂移
      arr[i * 3] += Math.sin(t * 0.1 + i * 0.05) * 0.002
      arr[i * 3 + 2] += Math.cos(t * 0.08 + i * 0.07) * 0.002

      // 落到低处后回绕到高处
      if (arr[i * 3 + 1] < 10) {
        arr[i * 3 + 1] = 45 + pseudoRandom(i * 41 + t) * 5
        arr[i * 3] = (pseudoRandom(i * 43 + t) - 0.5) * 160
        arr[i * 3 + 2] = (pseudoRandom(i * 47 + t) - 0.5) * 160
      }
    }
    pos.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}

/* ───────── 导出组件 ───────── */

export default function CyberpunkParticles({
  trafficCount = 500,
  trailCount = 200,
  dustCount = 800,
}: {
  trafficCount?: number
  trailCount?: number
  dustCount?: number
}) {
  return (
    <group>
      <StreetTrafficParticles count={trafficCount} />
      <FlyingTrailParticles count={trailCount} />
      <DustParticles count={dustCount} />
    </group>
  )
}
