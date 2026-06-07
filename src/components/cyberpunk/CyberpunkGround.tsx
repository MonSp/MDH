import React, { useMemo } from 'react'
import * as THREE from 'three'

/* ───────── 赛博朋克城市地面系统 ───────── */

const GROUND_SIZE = 120
const PLAZA_RADIUS = 15
const ROAD_WIDTH = 4
const SIDEWALK_WIDTH = 2.5

/* ───────── 地面材质定义 ───────── */

// 基础地面材质 - 深蓝色背景
const baseGroundMaterial = new THREE.MeshStandardMaterial({
  color: '#1e1e35',
  roughness: 0.85,
  metalness: 0.15,
  emissive: '#0a0a20',
  emissiveIntensity: 0.2,
})

// 广场地面材质 - 亮紫色调，金属质感
const plazaMaterial = new THREE.MeshStandardMaterial({
  color: '#3d3d6a',
  roughness: 0.3,
  metalness: 0.7,
  emissive: '#202050',
  emissiveIntensity: 0.5,
})

// 马路材质 - 深色沥青，带微弱蓝光
const roadMaterial = new THREE.MeshStandardMaterial({
  color: '#1a1a30',
  roughness: 0.8,
  metalness: 0.15,
  emissive: '#0a0a1a',
  emissiveIntensity: 0.15,
})

// 人行道材质 - 浅紫灰色
const sidewalkMaterial = new THREE.MeshStandardMaterial({
  color: '#4a4a6a',
  roughness: 0.6,
  metalness: 0.3,
  emissive: '#1a1a30',
  emissiveIntensity: 0.3,
})

// 草坪材质 - 带发光的青绿色
const grassMaterial = new THREE.MeshStandardMaterial({
  color: '#154530',
  roughness: 0.85,
  metalness: 0.05,
  emissive: '#0d3520',
  emissiveIntensity: 0.6,
})

// 霓虹道路线材质 - 亮青色
const neonLineMaterial = new THREE.MeshStandardMaterial({
  color: '#00eeff',
  emissive: '#00ccff',
  emissiveIntensity: 2.5,
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
      {/* 基础地面 */}
      <GroundPlane position={[0, 0, 0]} size={[GROUND_SIZE, GROUND_SIZE]} material={baseGroundMaterial} />

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