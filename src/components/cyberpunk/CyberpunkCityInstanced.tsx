import React, { useRef, useMemo, useEffect, useState } from 'react'
import * as THREE from 'three'
import { loadPBRTextures, createFallbackMaterial } from './PBRTextureLoader'
import type { PBRTextureSet, TextureType } from './PBRTextureLoader'

/* ───────── 赛博朋克城市 InstancedMesh 建筑系统 ─────────
 * 500+ 栋建筑，3 种材质（混凝土/锈蚀金属/脏污玻璃）
 * 两段式退台（底部宽 + 顶部窄）
 * 共 6 个 InstancedMesh（3 材质 x 2 段）
 */

/* ───────── 伪随机 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/* ───────── 建筑布局数据 ───────── */

export interface CityBuildingData {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  materialType: 0 | 1 | 2 // 0=concrete, 1=rustMetal, 2=dirtyGlass
  seed: number
}

/* ───────── 城市布局生成 ───────── */

export function generateCityLayout(count: number): CityBuildingData[] {
  const buildings: CityBuildingData[] = []

  // 7 环同心圆布局（一环留空给科技大厦，二环低密度低高度）
  const rings = [
    // 一环留空：不放建筑（科技大厦周围 6~20 单位）
    { count: 8,  rMin: 20, rMax: 28, wMin: 1.2, wMax: 2.5, heightMul: 0.3 },  // 二环：稀疏矮建筑
    { count: 45, rMin: 28, rMax: 40, wMin: 2.5, wMax: 6,   heightMul: 1.0 },  // 三环
    { count: 60, rMin: 40, rMax: 54, wMin: 3,   wMax: 7,   heightMul: 1.0 },  // 四环
    { count: 70, rMin: 54, rMax: 70, wMin: 3,   wMax: 8,   heightMul: 1.0 },  // 五环
    { count: 80, rMin: 70, rMax: 88, wMin: 3.5, wMax: 9,   heightMul: 1.0 },  // 六环
    { count: 90, rMin: 88, rMax: 108, wMin: 4,  wMax: 10,  heightMul: 1.0 },  // 七环
    { count: 147,rMin: 108,rMax: 135, wMin: 4,  wMax: 11,  heightMul: 1.0 },  // 八环：远景密集
  ]

  let idx = 0
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const seed = idx * 37 + 1
      const angle = (i / ring.count) * Math.PI * 2 + (pseudoRandom(seed) - 0.5) * 0.5
      const radius = ring.rMin + pseudoRandom(seed + 1) * (ring.rMax - ring.rMin)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const width = ring.wMin + pseudoRandom(seed + 2) * (ring.wMax - ring.wMin)
      const depth = 2 + pseudoRandom(seed + 3) * 4

      // 高度衰减函数（乘以环的高度系数）
      const baseHeight = 4
      const maxExtra = 30
      const falloff = 135
      const normDist = Math.min(radius / falloff, 1)
      const heightFactor = Math.pow(1 - normDist, 1.6)
      const heightMul: number = (ring as { heightMul?: number }).heightMul ?? 1.0
      const height = (baseHeight + maxExtra * heightFactor * (0.7 + pseudoRandom(seed + 4) * 0.6)) * heightMul

      // 材质分配：40% 混凝土 / 30% 锈蚀金属 / 30% 脏污玻璃
      const mr = pseudoRandom(seed * 7 + 123)
      const materialType: 0 | 1 | 2 = mr < 0.4 ? 0 : mr < 0.7 ? 1 : 2

      buildings.push({ position: [x, 0, z], width, depth, height, materialType, seed })
      idx++
    }
  }

  return buildings
}

/* ───────── 材质类型映射 ───────── */

const MATERIAL_TYPES: TextureType[] = ['concrete', 'rustMetal', 'dirtyGlass']

/* ───────── 单个 InstancedMesh 组（一种材质的底部或顶部段） ───────── */

function InstancedBuildingGroup({
  buildings,
  materialType,
  segment, // 'bottom' | 'top'
  textureSet,
}: {
  buildings: CityBuildingData[]
  materialType: number
  segment: 'bottom' | 'top'
  textureSet: PBRTextureSet
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)

  const filtered = useMemo(() => {
    return buildings.filter(b => b.materialType === materialType)
  }, [buildings, materialType])

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

  // 创建稳定的材质实例，通过 useEffect 更新贴图
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: materialType === 0 ? '#5a5a6a' : materialType === 1 ? '#4a3020' : '#2a3a5a',
      metalness: materialType === 0 ? 0.0 : materialType === 1 ? 0.6 : 0.9,
      roughness: materialType === 0 ? 0.85 : materialType === 1 ? 0.35 : 0.05,
      envMapIntensity: materialType === 2 ? 2.0 : 1.0,
      transparent: false,
      side: THREE.DoubleSide,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialType])

  // 当纹理更新时，同步到已有材质（不重建 instancedMesh）
  useEffect(() => {
    material.map = textureSet.color
    material.roughnessMap = textureSet.roughness
    material.normalMap = textureSet.normal
    material.normalScale = new THREE.Vector2(1.5, 1.5)
    material.metalnessMap = textureSet.metalness
    material.needsUpdate = true
  }, [textureSet, material])

  useEffect(() => {
    if (!meshRef.current || filtered.length === 0) return

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()

    for (let i = 0; i < filtered.length; i++) {
      const b = filtered[i]
      const bottomRatio = 0.65
      const topRatio = 0.35

      if (segment === 'bottom') {
        const segH = b.height * bottomRatio
        position.set(b.position[0], segH / 2, b.position[2])
        scale.set(b.width, segH, b.depth)
      } else {
        const bottomH = b.height * bottomRatio
        const segH = b.height * topRatio
        const topW = b.width * 0.7 // 退台收窄
        const topD = b.depth * 0.75
        position.set(b.position[0], bottomH + segH / 2, b.position[2])
        scale.set(topW, segH, topD)
      }

      matrix.compose(position, quaternion, scale)
      meshRef.current.setMatrixAt(i, matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    meshRef.current.count = filtered.length
  }, [filtered, segment])

  if (filtered.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, filtered.length]}
      castShadow
      receiveShadow
    />
  )
}

/* ───────── 导出组件 ───────── */

export default function CyberpunkCityInstanced({ count = 500 }: { count?: number }) {
  const buildings = useMemo(() => generateCityLayout(count), [count])

  const [textureSets, setTextureSets] = useState<PBRTextureSet[]>(() => {
    const sets = MATERIAL_TYPES.map((type, i) => ({
      color: createFallbackMaterial(type, i * 100).map,
      roughness: createFallbackMaterial(type, i * 100 + 1).roughnessMap || null,
      normal: createFallbackMaterial(type, i * 100 + 2).normalMap || null,
      metalness: null,
    }))
    return sets
  })

  // 异步加载 PBR 贴图，加载完成后替换 fallback
  useEffect(() => {
    let cancelled = false
    Promise.all(
      MATERIAL_TYPES.map((type, i) => loadPBRTextures(type, i * 100))
    ).then(sets => {
      if (!cancelled) {
        setTextureSets(sets)
      }
    })
    return () => { cancelled = true }
  }, [])

  return (
    <group>
      {MATERIAL_TYPES.map((_, matIdx) => (
        <React.Fragment key={matIdx}>
          <InstancedBuildingGroup
            buildings={buildings}
            materialType={matIdx}
            segment="bottom"
            textureSet={textureSets[matIdx]}
          />
          <InstancedBuildingGroup
            buildings={buildings}
            materialType={matIdx}
            segment="top"
            textureSet={textureSets[matIdx]}
          />
        </React.Fragment>
      ))}
    </group>
  )
}

export { MATERIAL_TYPES }
