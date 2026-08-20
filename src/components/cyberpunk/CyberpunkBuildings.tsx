import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSetbackSegments } from './BuildingProfileGenerator'
import type { BuildingStyle } from './BuildingProfileGenerator'
import { createBuildingMaterial } from './BuildingMaterials'
import BuildingDetails from './BuildingDetails'
import BuildingWindows from './BuildingWindows'
import { generateCityLayout } from './BuildingGenerator'
import type { BuildingData } from './BuildingGenerator'
import { pseudoRandom, generateProceduralTexture, generateNormalMap, generateMetalnessMap, styleToTextureType } from './BuildingTextures'

/* ───────── 赛博朋克背景建筑（ExtrudeGeometry + MeshPhysicalMaterial + InstancedMesh 窗户） ───────── */

interface BuildingProps {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
  style: BuildingStyle
  seed: number
  simplified?: boolean
}

function CyberBuilding({ position, width, depth, height, neonColor, style, seed, simplified }: BuildingProps) {
  const groupRef = useRef<THREE.Group>(null!)

  const textureType = useMemo(() => styleToTextureType(style), [style])

  // 程序化纹理（保留，作为 MeshPhysicalMaterial 的 map）
  const diffuseMap = useMemo(() => {
    const tex = generateProceduralTexture(seed, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])
  const roughnessMap = useMemo(() => {
    const tex = generateProceduralTexture(seed * 3, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])
  const normalMap = useMemo(() => {
    const tex = generateNormalMap(seed * 5, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])
  const metalnessMap = useMemo(() => {
    const tex = generateMetalnessMap(seed * 9, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [seed, textureType, width])

  // 退台段配置（替代 ExtrudeGeometry 合并，用 BoxGeometry 堆叠）
  const segments = useMemo(() => getSetbackSegments(style), [style])

  // 退台段的几何体和位置计算
  const setbackData = useMemo(() => {
    const result: { w: number; d: number; h: number; y: number }[] = []
    let currentY = 0
    for (const seg of segments) {
      const segH = height * seg.heightRatio
      result.push({
        w: width * seg.scaleW,
        d: depth * seg.scaleD,
        h: segH,
        y: currentY + segH / 2,
      })
      currentY += segH
    }
    return result
  }, [segments, width, depth, height])

  // 简化模式的单个 BoxGeometry
  const simplifiedGeo = useMemo(() => {
    if (!simplified) return null
    return new THREE.BoxGeometry(width, height, depth)
  }, [simplified, width, height, depth])

  // MeshPhysicalMaterial 建筑材质
  const buildingMaterial = useMemo(() => {
    return createBuildingMaterial(style, seed, {
      diffuseMap,
      roughnessMap,
      normalMap,
      metalnessMap,
    })
  }, [style, seed, diffuseMap, roughnessMap, normalMap, metalnessMap])

  // 缓存边框几何体
  const topEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.05, depth + 0.1)), [width, depth])
  const bottomEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1)), [width, depth])

  // 竖向霓虹边线几何体（以建筑中心为原点，范围 -height/2 到 height/2）
  const vertLineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array([
      -width / 2, -height / 2, -depth / 2, -width / 2, height / 2, -depth / 2,
      width / 2, -height / 2, -depth / 2, width / 2, height / 2, -depth / 2,
    ]), 3))
    return g
  }, [width, height, depth])

  // 天线高度
  const antennaHeight = useMemo(() => 1 + pseudoRandom(seed * 13) * 3, [seed])

  return (
    <group ref={groupRef} position={position}>
      {/* 建筑主体 — BoxGeometry 退台堆叠（可靠法线）或单个简化 Box */}
      {simplified ? (
        <mesh
          position={[0, height / 2, 0]}
          castShadow
          receiveShadow
          geometry={simplifiedGeo!}
          material={buildingMaterial}
        />
      ) : (
        setbackData.map((seg, i) => (
          <mesh
            key={`seg-${i}`}
            position={[0, seg.y, 0]}
            castShadow
            receiveShadow
            material={buildingMaterial}
          >
            <boxGeometry args={[seg.w, seg.h, seg.d]} />
          </mesh>
        ))
      )}

      {/* InstancedMesh 窗户系统（替代 PlaneGeometry 条带） */}
      <BuildingWindows
        width={width}
        depth={depth}
        height={height}
        seed={seed}
        style={style}
        simplified={simplified}
      />

      {/* 霓虹边框 */}
      <lineSegments position={[0, height / 2, 0]} geometry={vertLineGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.4} />
      </lineSegments>

      {/* 建筑细节附件（空调/管道/阳台/支架） */}
      <BuildingDetails
        width={width}
        depth={depth}
        height={height}
        seed={seed}
        style={style}
        simplified={simplified}
      />

      {/* 天线 */}
      {!simplified && (
        <>
          <mesh position={[0, height + antennaHeight / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, antennaHeight, 4]} />
            <meshStandardMaterial color="#3a3a5a" roughness={0.5} metalness={0.4} />
          </mesh>
          <AntennaLight position={[0, height + antennaHeight, 0]} color={neonColor} />
        </>
      )}
    </group>
  )
}

/* ───────── 天线闪烁灯 ───────── */

function AntennaLight({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 3 + position[0]) * 0.5
    }
  })
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.08, 6, 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
    </mesh>
  )
}

/* ───────── 生成建筑群布局 ───────── */

export type { BuildingData }

// 使用新的BuildingGenerator模块生成建筑
export { generateBuildings }

function generateBuildings(_count: number, _mainBuildingRadius: number): BuildingData[] {
  const { buildings } = generateCityLayout()
  return buildings
}

/* ───────── 导出组件 ───────── */

export default function CyberpunkBuildings({ buildings: buildingsProp }: { buildings?: BuildingData[] } = {}) {
  const buildings = useMemo(() => buildingsProp || generateBuildings(20, 15), [buildingsProp])

  return (
    <group>
      {buildings.map((b, i) => (
        <CyberBuilding key={i} {...b} />
      ))}
    </group>
  )
}
