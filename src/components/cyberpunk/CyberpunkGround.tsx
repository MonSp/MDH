import React, { useMemo } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'

/* ───────── 赛博朋克城市地面系统 ───────── */

const GROUND_SIZE = 120
const PLAZA_RADIUS = 15
const ROAD_WIDTH = 4
const SIDEWALK_WIDTH = 2.5

/* ───────── 程序化沥青纹理生成 ───────── */

function generateAsphaltTexture(seed: number): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  // 深灰沥青基底
  ctx.fillStyle = '#1a1a28'
  ctx.fillRect(0, 0, size, size)

  // 颗粒噪点
  for (let i = 0; i < 5000; i++) {
    const x = rand(i * 3) * size
    const y = rand(i * 3 + 1) * size
    const brightness = rand(i * 5) * 30 - 15
    ctx.fillStyle = `rgba(${26 + brightness}, ${26 + brightness}, ${40 + brightness}, 0.2)`
    ctx.fillRect(x, y, rand(i * 7) * 3 + 1, rand(i * 11) * 3 + 1)
  }

  // 裂缝
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(10, 10, 18, ${0.4 + rand(i * 19) * 0.3})`
    ctx.lineWidth = 0.5 + rand(i * 23) * 1.5
    ctx.beginPath()
    let px = rand(i * 31) * size, py = rand(i * 37) * size
    ctx.moveTo(px, py)
    for (let j = 0; j < 5; j++) {
      px += rand(i * 41 + j * 43) * 60 - 30
      py += rand(i * 47 + j * 53) * 60
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  // 污渍/油渍
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(8, 8, 15, ${0.15 + rand(i * 59) * 0.2})`
    ctx.beginPath()
    ctx.ellipse(rand(i * 61) * size, rand(i * 67) * size, rand(i * 71) * 25 + 10, rand(i * 73) * 20 + 8, rand(i * 79) * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // 水渍反射高光
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = `rgba(40, 50, 80, ${0.08 + rand(i * 83) * 0.1})`
    ctx.beginPath()
    ctx.ellipse(rand(i * 89) * size, rand(i * 97) * size, rand(i * 101) * 40 + 15, rand(i * 103) * 30 + 10, rand(i * 107) * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4, 4)
  return texture
}

// 共享沥青纹理
const asphaltDiffuse = generateAsphaltTexture(42)

/* ───────── 地面材质定义 ───────── */

// 基础地面材质 - 深蓝色背景 + 沥青纹理
const baseGroundMaterial = new THREE.MeshStandardMaterial({
  map: asphaltDiffuse,
  color: '#2a2a4a',
  roughness: 0.85,
  metalness: 0.15,
  emissive: '#151530',
  emissiveIntensity: 0.5,
})

// 广场地面材质 - 亮紫色调，金属质感
const plazaMaterial = new THREE.MeshStandardMaterial({
  color: '#3d3d6a',
  roughness: 0.3,
  metalness: 0.7,
  emissive: '#202050',
  emissiveIntensity: 0.7,
})

// 马路材质 - 深色沥青，带微弱蓝光
const roadMaterial = new THREE.MeshStandardMaterial({
  color: '#252540',
  roughness: 0.8,
  metalness: 0.15,
  emissive: '#121225',
  emissiveIntensity: 0.4,
})

// 人行道材质 - 浅紫灰色
const sidewalkMaterial = new THREE.MeshStandardMaterial({
  color: '#5a5a7a',
  roughness: 0.6,
  metalness: 0.3,
  emissive: '#1a1a30',
  emissiveIntensity: 0.5,
})

// 草坪材质 - 带发光的青绿色
const grassMaterial = new THREE.MeshStandardMaterial({
  color: '#154530',
  roughness: 0.85,
  metalness: 0.05,
  emissive: '#104028',
  emissiveIntensity: 0.8,
})

// 霓虹道路线材质 - 亮青色
const neonLineMaterial = new THREE.MeshStandardMaterial({
  color: '#00eeff',
  emissive: '#00ccff',
  emissiveIntensity: 3.0,
  roughness: 0.15,
  metalness: 0.85,
})

/* ───────── 创建平铺在地面的矩形 ───────── */

function GroundPlane({
  position,
  size,
  rotation = 0,
  material,
}: {
  position: [number, number, number]
  size: [number, number]
  rotation?: number
  material: THREE.Material
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, rotation, 0]} material={material}>
      <planeGeometry args={size} />
    </mesh>
  )
}

/* ───────── 广场组件 ───────── */

function Plaza() {
  return (
    <group>
      {/* 中心广场 - 圆形 */}
      <GroundPlane position={[0, 0.02, 0]} size={[PLAZA_RADIUS * 2, PLAZA_RADIUS * 2]} material={plazaMaterial} />

      {/* 广场中心装饰环 - 紫色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[5, 6, 64]} />
        <meshStandardMaterial
          color="#cc66ff"
          emissive="#bf5af2"
          emissiveIntensity={2.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 广场内圈装饰 - 绿色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[2, 2.8, 64]} />
        <meshStandardMaterial
          color="#44ee77"
          emissive="#30d158"
          emissiveIntensity={2.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 广场外圈装饰 - 青色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[10, 11, 64]} />
        <meshStandardMaterial
          color="#00ddff"
          emissive="#00ccff"
          emissiveIntensity={1.8}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

/* ───────── 马路组件 ───────── */

function Roads() {
  const roads = useMemo(() => {
    const result = []

    // 东西向主干道
    result.push({
      position: [0, 0.01, PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2] as [number, number, number],
      size: [GROUND_SIZE, ROAD_WIDTH] as [number, number],
      rotation: 0,
    })
    result.push({
      position: [0, 0.01, -(PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2)] as [number, number, number],
      size: [GROUND_SIZE, ROAD_WIDTH] as [number, number],
      rotation: 0,
    })

    // 南北向主干道
    result.push({
      position: [PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2, 0.01, 0] as [number, number, number],
      size: [ROAD_WIDTH, GROUND_SIZE] as [number, number],
      rotation: 0,
    })
    result.push({
      position: [-(PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2), 0.01, 0] as [number, number, number],
      size: [ROAD_WIDTH, GROUND_SIZE] as [number, number],
      rotation: 0,
    })

    return result
  }, [])

  return (
    <group>
      {roads.map((road, i) => (
        <GroundPlane
          key={i}
          position={road.position}
          size={road.size}
          rotation={road.rotation}
          material={roadMaterial}
        />
      ))}
    </group>
  )
}

/* ───────── 人行道组件 ───────── */

function Sidewalks() {
  const sidewalks = useMemo(() => {
    const result = []

    // 广场周围的矩形人行道
    const offset = PLAZA_RADIUS + SIDEWALK_WIDTH / 2

    // 上下人行道
    result.push({
      position: [0, 0.015, offset] as [number, number, number],
      size: [PLAZA_RADIUS * 2 + SIDEWALK_WIDTH * 2, SIDEWALK_WIDTH] as [number, number],
    })
    result.push({
      position: [0, 0.015, -offset] as [number, number, number],
      size: [PLAZA_RADIUS * 2 + SIDEWALK_WIDTH * 2, SIDEWALK_WIDTH] as [number, number],
    })

    // 左右人行道
    result.push({
      position: [offset, 0.015, 0] as [number, number, number],
      size: [SIDEWALK_WIDTH, PLAZA_RADIUS * 2] as [number, number],
    })
    result.push({
      position: [-offset, 0.015, 0] as [number, number, number],
      size: [SIDEWALK_WIDTH, PLAZA_RADIUS * 2] as [number, number],
    })

    return result
  }, [])

  return (
    <group>
      {sidewalks.map((sw, i) => (
        <GroundPlane
          key={i}
          position={sw.position}
          size={sw.size}
          material={sidewalkMaterial}
        />
      ))}
    </group>
  )
}

/* ───────── 草坪/绿化带组件 ───────── */

function GrassAreas() {
  const grassAreas = useMemo(() => {
    const result = []
    const start = PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH + 1
    const size = (GROUND_SIZE / 2 - start)

    // 四个象限的草坪
    const positions: [number, number, number][] = [
      [start + size / 2, 0.012, start + size / 2],
      [-(start + size / 2), 0.012, start + size / 2],
      [start + size / 2, 0.012, -(start + size / 2)],
      [-(start + size / 2), 0.012, -(start + size / 2)],
    ]

    positions.forEach(pos => {
      result.push({
        position: pos,
        size: [size - 2, size - 2] as [number, number],
      })
    })

    return result
  }, [])

  return (
    <group>
      {grassAreas.map((grass, i) => (
        <GroundPlane
          key={i}
          position={grass.position}
          size={grass.size}
          material={grassMaterial}
        />
      ))}
    </group>
  )
}

/* ───────── 霓虹道路线组件 ───────── */

function NeonRoadLines() {
  const lines = useMemo(() => {
    const result = []
    const roadCenter = PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2
    const lineWidth = 0.15

    // 东西向道路中心线
    result.push({
      position: [0, 0.025, roadCenter] as [number, number, number],
      size: [GROUND_SIZE, lineWidth] as [number, number],
    })
    result.push({
      position: [0, 0.025, -roadCenter] as [number, number, number],
      size: [GROUND_SIZE, lineWidth] as [number, number],
    })

    // 南北向道路中心线
    result.push({
      position: [roadCenter, 0.025, 0] as [number, number, number],
      size: [lineWidth, GROUND_SIZE] as [number, number],
    })
    result.push({
      position: [-roadCenter, 0.025, 0] as [number, number, number],
      size: [lineWidth, GROUND_SIZE] as [number, number],
    })

    return result
  }, [])

  return (
    <group>
      {lines.map((line, i) => (
        <GroundPlane
          key={i}
          position={line.position}
          size={line.size}
          material={neonLineMaterial}
        />
      ))}
    </group>
  )
}

/* ───────── 外圈装饰组件 ───────── */

function OuterDecorations() {
  return (
    <group>
      {/* 第一圈装饰 - 红色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[38, 38.8, 64]} />
        <meshStandardMaterial
          color="#ff4466"
          emissive="#ff375f"
          emissiveIntensity={1.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 第二圈装饰 - 橙色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[48, 48.8, 64]} />
        <meshStandardMaterial
          color="#ffaa22"
          emissive="#ff9f0a"
          emissiveIntensity={1.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 第三圈装饰 - 青色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[56, 56.8, 64]} />
        <meshStandardMaterial
          color="#88ddff"
          emissive="#64d2ff"
          emissiveIntensity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

/* ───────── 主地面组件 ───────── */

export default function CyberpunkGround() {
  return (
    <group>
      {/* 基础地面 — 湿润反射效果 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <MeshReflectorMaterial
          blur={[300, 100]}
          resolution={1024}
          mixBlur={10}
          mixStrength={60}
          roughness={0.2}
          depthScale={1.2}
          color="#151528"
          metalness={0.7}
        />
      </mesh>

      {/* 功能区域 */}
      <Plaza />
      <Roads />
      <Sidewalks />
      <GrassAreas />
      <NeonRoadLines />
      <OuterDecorations />
    </group>
  )
}