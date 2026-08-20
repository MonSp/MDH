import React, { useMemo, useEffect } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { loadPBRTextures } from './PBRTextureLoader'
import RoadsFlat, { roadMaterial } from './RoadsFlat'
import NeonLinesFlat from './NeonLinesFlat'
import {
  GROUND_SIZE, PLAZA_RADIUS, ROAD_WIDTH, SIDEWALK_WIDTH,
  sidewalkMaterial, plazaMaterial, grassMaterial, curbMaterial, neonLineMaterial,
} from './CyberpunkGround.materials'

/* ───────── 赛博朋克城市地面系统 ───────── */

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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[5, 6, 64]} />
        <meshStandardMaterial
          color="#cc66ff"
          emissive="#bf5af2"
          emissiveIntensity={2.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 广场内圈装饰 - 绿色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[2, 2.8, 64]} />
        <meshStandardMaterial
          color="#44ee77"
          emissive="#30d158"
          emissiveIntensity={2.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 广场外圈装饰 - 青色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
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

/* ───────── 马路组件（放射+环形路网） ───────── */
// 路面几何体由 RoadsFlat 组件负责（直接计算地面顶点，保证贴地）

/* ───────── 路缘石组件（主干道两侧） ───────── */

function Curbs() {
  const curbH = 0.04
  const curbW = 0.15
  const curbBaseY = 0.025
  const offset = ROAD_WIDTH / 2 + curbW / 2

  const curbs = useMemo(() => {
    const result: { position: [number, number, number]; size: [number, number, number] }[] = []
    // 东西主干道两侧
    result.push({ position: [0, curbBaseY + curbH / 2, offset], size: [GROUND_SIZE, curbH, curbW] })
    result.push({ position: [0, curbBaseY + curbH / 2, -offset], size: [GROUND_SIZE, curbH, curbW] })
    // 南北主干道两侧
    result.push({ position: [offset, curbBaseY + curbH / 2, 0], size: [curbW, curbH, GROUND_SIZE] })
    result.push({ position: [-offset, curbBaseY + curbH / 2, 0], size: [curbW, curbH, GROUND_SIZE] })
    return result
  }, [])

  return (
    <group>
      {curbs.map((c, i) => (
        <mesh key={i} position={c.position} material={curbMaterial}>
          <boxGeometry args={c.size} />
        </mesh>
      ))}
    </group>
  )
}

/* ───────── 人行道组件 ───────── */

function Sidewalks() {
  const sidewalks = useMemo(() => {
    const result = []

    // 人行道略高于路面（y=0.03 vs 路面 y=0.005）
    const offset = PLAZA_RADIUS + SIDEWALK_WIDTH / 2

    // 上下人行道
    result.push({
      position: [0, 0.04, offset] as [number, number, number],
      size: [PLAZA_RADIUS * 2 + SIDEWALK_WIDTH * 2, SIDEWALK_WIDTH] as [number, number],
    })
    result.push({
      position: [0, 0.04, -offset] as [number, number, number],
      size: [PLAZA_RADIUS * 2 + SIDEWALK_WIDTH * 2, SIDEWALK_WIDTH] as [number, number],
    })

    // 左右人行道
    result.push({
      position: [offset, 0.04, 0] as [number, number, number],
      size: [SIDEWALK_WIDTH, PLAZA_RADIUS * 2] as [number, number],
    })
    result.push({
      position: [-offset, 0.04, 0] as [number, number, number],
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
      [start + size / 2, 0.01, start + size / 2],
      [-(start + size / 2), 0.01, start + size / 2],
      [start + size / 2, 0.01, -(start + size / 2)],
      [-(start + size / 2), 0.01, -(start + size / 2)],
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
    const result: { position: [number, number, number]; size: [number, number]; rotation: number; color: string }[] = []
    const lineY = 0.035
    const lineWidth = 0.12
    const roadCenter = PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2

    // ═══ 主干道中心线（青色）═══
    result.push({ position: [0, lineY, roadCenter], size: [GROUND_SIZE, lineWidth], rotation: 0, color: '#00eeff' })
    result.push({ position: [0, lineY, -roadCenter], size: [GROUND_SIZE, lineWidth], rotation: 0, color: '#00eeff' })
    result.push({ position: [roadCenter, lineY, 0], size: [lineWidth, GROUND_SIZE], rotation: 0, color: '#00eeff' })
    result.push({ position: [-roadCenter, lineY, 0], size: [lineWidth, GROUND_SIZE], rotation: 0, color: '#00eeff' })

    // ═══ 环形路边线（多色霓虹）═══
    const ringRadii = [22, 34, 48, 64, 82, 102]
    const ringColors = ['#ff00aa', '#00ddff', '#44ff88', '#ff6600', '#aa44ff', '#ffaa00']
    for (let ri = 0; ri < ringRadii.length; ri++) {
      const r = ringRadii[ri]
      const segments = Math.max(6, Math.floor((2 * Math.PI * r) / 15))
      const arcLen = (2 * Math.PI * r) / segments
      const color = ringColors[ri % ringColors.length]
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        const cx = Math.cos(angle) * r
        const cz = Math.sin(angle) * r
        result.push({
          position: [cx, lineY, cz],
          size: [arcLen * 0.98, lineWidth],
          rotation: -(angle + Math.PI / 2),
          color,
        })
      }
    }

    // ═══ 放射路边线（粉色）═══
    const numRadials = 8
    for (let i = 0; i < numRadials; i++) {
      const angle = (i / numRadials) * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (let ri = 0; ri < ringRadii.length - 1; ri++) {
        const rInner = ringRadii[ri] + 3
        const rOuter = ringRadii[ri + 1] - 3
        const rMid = (rInner + rOuter) / 2
        const segLen = rOuter - rInner
        if (segLen < 4) continue
        result.push({
          position: [cos * rMid, lineY, sin * rMid],
          size: [lineWidth, segLen],
          rotation: 3 * Math.PI / 2 - angle,
          color: '#ff66cc',
        })
      }
    }

    return result
  }, [])

  return (
    <group>
      {lines.map((line, i) => (
        <mesh
          key={i}
          position={line.position}
          rotation={[-Math.PI / 2, line.rotation, 0]}
        >
          <planeGeometry args={line.size} />
          <meshStandardMaterial
            color={line.color}
            emissive={line.color}
            emissiveIntensity={3.5}
            roughness={0.1}
            metalness={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ───────── 外圈装饰组件 ───────── */

function OuterDecorations() {
  return (
    <group>
      {/* 第一圈装饰 - 红色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[38, 38.8, 64]} />
        <meshStandardMaterial
          color="#ff4466"
          emissive="#ff375f"
          emissiveIntensity={1.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 第二圈装饰 - 橙色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[48, 48.8, 64]} />
        <meshStandardMaterial
          color="#ffaa22"
          emissive="#ff9f0a"
          emissiveIntensity={1.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 第三圈装饰 - 青色 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
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

/* ───────── 霓虹水坑/反光叠层 ───────── */

function NeonPuddles() {
  const puddles = useMemo(() => {
    const result: { position: [number, number, number]; size: [number, number]; color: string; intensity: number }[] = []
    const rand = (s: number) => {
      const x = Math.sin(s * 127.1 + 311.7) * 43758.5453
      return x - Math.floor(x)
    }

    // 在道路上随机放置水坑
    const neonColors = ['#ff00aa', '#00ddff', '#44ff88', '#ff6600', '#aa44ff', '#ffaa00']
    const roadOffset = PLAZA_RADIUS + SIDEWALK_WIDTH + ROAD_WIDTH / 2

    for (let i = 0; i < 40; i++) {
      const seed = i * 41 + 7
      const isEastWest = rand(seed) > 0.5
      const roadSign = rand(seed + 1) > 0.5 ? 1 : -1
      const roadPos = roadSign * roadOffset

      let x: number, z: number
      if (isEastWest) {
        x = (rand(seed + 2) - 0.5) * GROUND_SIZE * 0.8
        z = roadPos + (rand(seed + 3) - 0.5) * ROAD_WIDTH * 0.6
      } else {
        x = roadPos + (rand(seed + 3) - 0.5) * ROAD_WIDTH * 0.6
        z = (rand(seed + 2) - 0.5) * GROUND_SIZE * 0.8
      }

      const w = 1 + rand(seed + 4) * 3
      const h = 0.5 + rand(seed + 5) * 2
      const color = neonColors[Math.floor(rand(seed + 6) * neonColors.length)]
      const intensity = 0.15 + rand(seed + 7) * 0.25

      result.push({ position: [x, 0.012, z], size: [w, h], color, intensity })
    }

    // 在建筑间空地也放一些
    for (let i = 0; i < 20; i++) {
      const seed = i * 53 + 200
      const angle = rand(seed) * Math.PI * 2
      const radius = 25 + rand(seed + 1) * 80
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const w = 1.5 + rand(seed + 2) * 4
      const h = 1 + rand(seed + 3) * 3
      const color = neonColors[Math.floor(rand(seed + 4) * neonColors.length)]
      const intensity = 0.1 + rand(seed + 5) * 0.2

      result.push({ position: [x, 0.012, z], size: [w, h], color, intensity })
    }

    return result
  }, [])

  return (
    <group>
      {puddles.map((p, i) => (
        <mesh key={i} position={p.position} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={p.size} />
          <meshStandardMaterial
            color={p.color}
            emissive={p.color}
            emissiveIntensity={p.intensity}
            transparent
            opacity={0.25}
            roughness={0.05}
            metalness={0.9}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ───────── 主地面组件 ───────── */

export default function CyberpunkGround({ showNeonLines = true }: { showNeonLines?: boolean }) {
  // 异步加载 PBR 贴图，应用到马路和人行道材质
  useEffect(() => {
    let cancelled = false

    // 主干道使用带标线的路面贴图
    loadPBRTextures('roadMarked', 1000).then(set => {
      if (cancelled) return
      if (set.color) {
        set.color.wrapS = THREE.RepeatWrapping
        set.color.wrapT = THREE.RepeatWrapping
        set.color.repeat.set(8, 8)
      }
      if (set.roughness) {
        set.roughness.wrapS = THREE.RepeatWrapping
        set.roughness.wrapT = THREE.RepeatWrapping
        set.roughness.repeat.set(8, 8)
      }
      if (set.normal) {
        set.normal.wrapS = THREE.RepeatWrapping
        set.normal.wrapT = THREE.RepeatWrapping
        set.normal.repeat.set(8, 8)
      }
      roadMaterial.map = set.color
      roadMaterial.roughnessMap = set.roughness
      roadMaterial.normalMap = set.normal
      roadMaterial.normalScale = new THREE.Vector2(1.5, 1.5)
      roadMaterial.roughness = 0.35
      roadMaterial.metalness = 0.25
      // 提高亮度确保俯视可见
      roadMaterial.color.set('#5a5a75')
      roadMaterial.emissive.set('#2a2a45')
      roadMaterial.emissiveIntensity = 0.9
      roadMaterial.needsUpdate = true
    })

    // 人行道使用混凝土贴图
    loadPBRTextures('concrete', 2000).then(set => {
      if (cancelled) return
      if (set.color) {
        set.color.wrapS = THREE.RepeatWrapping
        set.color.wrapT = THREE.RepeatWrapping
        set.color.repeat.set(6, 6)
      }
      if (set.roughness) {
        set.roughness.wrapS = THREE.RepeatWrapping
        set.roughness.wrapT = THREE.RepeatWrapping
        set.roughness.repeat.set(6, 6)
      }
      if (set.normal) {
        set.normal.wrapS = THREE.RepeatWrapping
        set.normal.wrapT = THREE.RepeatWrapping
        set.normal.repeat.set(6, 6)
      }
      sidewalkMaterial.map = set.color
      sidewalkMaterial.roughnessMap = set.roughness
      sidewalkMaterial.normalMap = set.normal
      sidewalkMaterial.normalScale = new THREE.Vector2(1.2, 1.2)
      sidewalkMaterial.needsUpdate = true
    })

    // 广场使用水磨石贴图
    loadPBRTextures('terrazzo', 3000).then(set => {
      if (cancelled) return
      if (set.color) {
        set.color.wrapS = THREE.RepeatWrapping
        set.color.wrapT = THREE.RepeatWrapping
        set.color.repeat.set(4, 4)
      }
      if (set.roughness) {
        set.roughness.wrapS = THREE.RepeatWrapping
        set.roughness.wrapT = THREE.RepeatWrapping
        set.roughness.repeat.set(4, 4)
      }
      if (set.normal) {
        set.normal.wrapS = THREE.RepeatWrapping
        set.normal.wrapT = THREE.RepeatWrapping
        set.normal.repeat.set(4, 4)
      }
      plazaMaterial.map = set.color
      plazaMaterial.roughnessMap = set.roughness
      plazaMaterial.normalMap = set.normal
      plazaMaterial.normalScale = new THREE.Vector2(1.0, 1.0)
      plazaMaterial.needsUpdate = true
    })

    return () => { cancelled = true }
  }, [])

  return (
    <group>
      {/* 基础地面 — 潮湿霓虹反射 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <MeshReflectorMaterial
          blur={[400, 400]}
          resolution={1024}
          mixBlur={6}
          mixStrength={80}
          roughness={0.35}
          depthScale={1.2}
          color="#111122"
          metalness={0.3}
        />
      </mesh>

      {/* 功能区域 */}
      <Plaza />
      <RoadsFlat />
      <Curbs />
      <Sidewalks />
      <GrassAreas />
      <OuterDecorations />

      {/* 霓虹线（可开关） */}
      {showNeonLines && <NeonLinesFlat />}
      {showNeonLines && <NeonPuddles />}
    </group>
  )
}