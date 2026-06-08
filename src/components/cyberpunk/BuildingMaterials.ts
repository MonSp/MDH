import * as THREE from 'three'
import type { BuildingStyle } from './BuildingProfileGenerator'

/* ───────── 建筑风格材质参数集 ───────── */

interface BuildingMaterialParams {
  color: string
  metalness: number
  roughness: number
  clearcoat: number
  clearcoatRoughness: number
  envMapIntensity: number
  emissive: string
  emissiveIntensity: number
}

const BUILDING_MATERIALS: Record<BuildingStyle, BuildingMaterialParams> = {
  glass: {
    color: '#4a6a8a',
    metalness: 0.9,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.0,
    emissive: '#1a3a6a',
    emissiveIntensity: 0.05,
  },
  brick: {
    color: '#6a4a3a',
    metalness: 0.0,
    roughness: 0.85,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    envMapIntensity: 0.5,
    emissive: '#3a2a1a',
    emissiveIntensity: 0.03,
  },
  industrial: {
    color: '#3a3a4a',
    metalness: 0.6,
    roughness: 0.3,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.2,
    emissive: '#2a3a4a',
    emissiveIntensity: 0.04,
  },
}

/* ───────── 霓虹色映射 ───────── */

const STYLE_NEON_COLORS: Record<BuildingStyle, string[]> = {
  glass: ['#1a3a6a', '#2a4a6a', '#1a4a7a'],
  brick: ['#4a3a2a', '#3a2a1a', '#5a3a2a'],
  industrial: ['#2a3a4a', '#3a3a3a', '#2a4a3a'],
}

/* ───────── 材质工厂 ───────── */

/**
 * 创建 MeshPhysicalMaterial 建筑材质。
 * 使用现有程序化纹理（diffuseMap/roughnessMap/normalMap/metalnessMap）作为 map 参数。
 */
export function createBuildingMaterial(
  style: BuildingStyle,
  _seed: number,
  maps?: {
    diffuseMap?: THREE.Texture
    roughnessMap?: THREE.Texture
    normalMap?: THREE.Texture
    metalnessMap?: THREE.Texture
  }
): THREE.MeshPhysicalMaterial {
  const params = BUILDING_MATERIALS[style]

  return new THREE.MeshPhysicalMaterial({
    map: maps?.diffuseMap || null,
    roughnessMap: maps?.roughnessMap || null,
    normalMap: maps?.normalMap || null,
    normalScale: new THREE.Vector2(1.5, 1.5),
    metalnessMap: maps?.metalnessMap || null,
    color: params.color,
    metalness: params.metalness,
    roughness: params.roughness,
    clearcoat: params.clearcoat,
    clearcoatRoughness: params.clearcoatRoughness,
    envMapIntensity: params.envMapIntensity,
    emissive: params.emissive,
    emissiveIntensity: params.emissiveIntensity,
    side: THREE.DoubleSide, // ExtrudeGeometry front/back face 法线在 rotateX 后可能方向错误，DoubleSide 确保两面可见
  })
}

/**
 * 获取风格对应的霓虹色。
 */
export function getStyleNeonColor(style: BuildingStyle, seed: number): string {
  const colors = STYLE_NEON_COLORS[style]
  return colors[Math.floor(Math.abs(seed * 7)) % colors.length]
}

export { BUILDING_MATERIALS, STYLE_NEON_COLORS }
