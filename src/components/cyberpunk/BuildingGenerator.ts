/**
 * 建筑生成器模块
 * 负责基于路网数据生成建筑布局，确保建筑避让路网
 */

import { 
  RoadNetwork, 
  isOnRoad, 
  distanceToNearestRoad,
  DEFAULT_ROAD_CONFIG 
} from './RoadNetworkManager'
import { createRoadNetwork } from './RoadNetworkManager'
import type { BuildingStyle } from './BuildingProfileGenerator'
import { getStyleNeonColor } from './BuildingMaterials'

// 建筑数据接口
export interface BuildingData {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
  style: BuildingStyle
  seed: number
  simplified?: boolean
}

// 建筑配置接口
export interface BuildingConfig {
  roadNetwork: RoadNetwork
  safetyMargin: number
  nearRings: RingConfig[]
  farRings: RingConfig[]
}

// 环形配置接口
export interface RingConfig {
  count: number
  radiusMin: number
  radiusMax: number
  widthMin: number
  widthMax: number
}

// 默认建筑配置
export const DEFAULT_BUILDING_CONFIG: Omit<BuildingConfig, 'roadNetwork'> = {
  safetyMargin: 5,
  nearRings: [
    { count: 12, radiusMin: 8, radiusMax: 16, widthMin: 2, widthMax: 6 },
    { count: 15, radiusMin: 16, radiusMax: 26, widthMin: 3, widthMax: 7 },
    { count: 20, radiusMin: 26, radiusMax: 40, widthMin: 3, widthMax: 8 },
    { count: 15, radiusMin: 40, radiusMax: 58, widthMin: 4, widthMax: 10 },
    { count: 15, radiusMin: 58, radiusMax: 75, widthMin: 5, widthMax: 12 }
  ],
  farRings: [
    { count: 15, radiusMin: 80, radiusMax: 120, widthMin: 4, widthMax: 8 }
  ]
}

/**
 * 伪随机数生成器
 * @param seed 种子
 * @returns 0-1之间的随机数
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * 根据距离计算建筑高度
 * @param radius 到中心的距离
 * @param seed 随机种子
 * @returns 建筑高度
 */
function getBuildingHeight(radius: number, seed: number): number {
  const baseHeight = 6
  const maxExtraHeight = 28
  const falloffRadius = 80
  const power = 1.8
  const normalizedDist = Math.min(radius / falloffRadius, 1)
  const heightFactor = Math.pow(1 - normalizedDist, power)
  const randomFactor = 0.8 + pseudoRandom(seed) * 0.4
  return baseHeight + maxExtraHeight * heightFactor * randomFactor
}

/**
 * 根据seed确定性分配建筑风格
 * @param seed 随机种子
 * @returns 建筑风格
 */
function assignStyle(seed: number): BuildingStyle {
  const r = pseudoRandom(seed * 7 + 123)
  if (r < 0.4) return 'glass'
  if (r < 0.7) return 'brick'
  return 'industrial'
}

/**
 * 检查建筑位置是否有效（不与路网冲突）
 * @param x x坐标
 * @param z z坐标
 * @param buildingWidth 建筑宽度
 * @param buildingDepth 建筑深度
 * @param config 建筑配置
 * @returns 位置是否有效
 */
export function isPositionValid(
  x: number, 
  z: number, 
  buildingWidth: number, 
  buildingDepth: number, 
  config: BuildingConfig
): boolean {
  const { roadNetwork, safetyMargin } = config
  
  // 计算建筑的对角线距离，用于更精确的碰撞检测
  const buildingRadius = Math.sqrt(buildingWidth * buildingWidth + buildingDepth * buildingDepth) / 2
  
  // 检查建筑中心是否在道路上
  if (isOnRoad(x, z, roadNetwork, safetyMargin + buildingRadius)) {
    return false
  }
  
  // 检查建筑的四个角是否在道路上
  const halfWidth = buildingWidth / 2
  const halfDepth = buildingDepth / 2
  const corners = [
    [x - halfWidth, z - halfDepth],
    [x + halfWidth, z - halfDepth],
    [x - halfWidth, z + halfDepth],
    [x + halfWidth, z + halfDepth]
  ]
  
  for (const [cx, cz] of corners) {
    if (isOnRoad(cx, cz, roadNetwork, safetyMargin)) {
      return false
    }
  }
  
  return true
}

/**
 * 生成建筑布局
 * @param config 建筑配置
 * @returns 建筑数据数组
 */
export function generateBuildings(config: BuildingConfig): BuildingData[] {
  const buildings: BuildingData[] = []
  let buildingIndex = 0
  
  const { roadNetwork, nearRings, farRings } = config
  
  // 生成近处环形建筑
  for (const ring of nearRings) {
    let attempts = 0
    const maxAttempts = ring.count * 3 // 最大尝试次数
    
    for (let i = 0; i < ring.count && attempts < maxAttempts; i++) {
      attempts++
      const seed = buildingIndex * 37 + 1
      const angle = (i / ring.count) * Math.PI * 2 + (pseudoRandom(seed) - 0.5) * 0.4
      const radius = ring.radiusMin + pseudoRandom(seed + 1) * (ring.radiusMax - ring.radiusMin)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const width = ring.widthMin + pseudoRandom(seed + 2) * (ring.widthMax - ring.widthMin)
      const depth = 3 + pseudoRandom(seed + 3) * 5
      const style = assignStyle(seed)
      const neonColor = getStyleNeonColor(style, seed)
      const height = getBuildingHeight(radius, seed)
      
      // 检查位置是否有效
      if (isPositionValid(x, z, width, depth, config)) {
        buildings.push({
          position: [x, 0, z],
          width,
          depth,
          height,
          neonColor,
          style,
          seed
        })
        buildingIndex++
      }
    }
  }
  
  // 生成远处简化建筑
  for (const ring of farRings) {
    let attempts = 0
    const maxAttempts = ring.count * 3
    
    for (let i = 0; i < ring.count && attempts < maxAttempts; i++) {
      attempts++
      const seed = buildingIndex * 37 + 1
      const angle = (i / ring.count) * Math.PI * 2 + (pseudoRandom(seed) - 0.5) * 0.5
      const radius = ring.radiusMin + pseudoRandom(seed + 1) * (ring.radiusMax - ring.radiusMin)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const width = ring.widthMin + pseudoRandom(seed + 2) * (ring.widthMax - ring.widthMin)
      const depth = 3 + pseudoRandom(seed + 3) * 4
      const style = assignStyle(seed)
      const neonColor = getStyleNeonColor(style, seed)
      const height = getBuildingHeight(radius, seed)
      
      // 检查位置是否有效
      if (isPositionValid(x, z, width, depth, config)) {
        buildings.push({
          position: [x, 0, z],
          width,
          depth,
          height,
          neonColor,
          style,
          seed,
          simplified: true
        })
        buildingIndex++
      }
    }
  }
  
  return buildings
}

/**
 * 创建完整的建筑配置
 * @param roadNetwork 路网数据
 * @param safetyMargin 安全边距
 * @returns 建筑配置
 */
export function createBuildingConfig(
  roadNetwork: RoadNetwork,
  safetyMargin: number = 5
): BuildingConfig {
  return {
    roadNetwork,
    safetyMargin,
    ...DEFAULT_BUILDING_CONFIG
  }
}

/**
 * 生成完整的城市布局（路网 + 建筑）
 * @param roadNetworkConfig 路网配置
 * @param safetyMargin 建筑安全边距
 * @returns 包含路网和建筑数据的对象
 */
export function generateCityLayout(
  roadNetworkConfig = DEFAULT_ROAD_CONFIG,
  safetyMargin: number = 5
) {
  // 先生成路网
  const roadNetwork = createRoadNetwork(roadNetworkConfig)
  
  // 再生成建筑（基于路网）
  const buildingConfig = createBuildingConfig(roadNetwork, safetyMargin)
  const buildings = generateBuildings(buildingConfig)
  
  return {
    roadNetwork,
    buildings,
    buildingConfig
  }
}