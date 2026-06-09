/**
 * 路网数据结构管理模块
 * 负责生成和管理赛博朋克城市的路网数据
 */

// 路网配置接口
export interface RoadNetworkConfig {
  groundSize: number
  ringRadii: number[]
  radialCount: number
  roadWidth: number
  ringWidth: number
  radialWidth: number
}

// 路网段接口
export interface RoadSegment {
  position: [number, number, number]
  size: [number, number]
  rotation: number
  type: 'ring' | 'radial' | 'cross'
  isMain: boolean
}

// 路网数据接口
export interface RoadNetwork {
  config: RoadNetworkConfig
  segments: RoadSegment[]
  ringSegments: RoadSegment[]
  radialSegments: RoadSegment[]
  crossSegments: RoadSegment[]
}

// 默认路网配置
export const DEFAULT_ROAD_CONFIG: RoadNetworkConfig = {
  groundSize: 120,
  ringRadii: [22, 34, 48, 64, 82, 102],
  radialCount: 8,
  roadWidth: 4,
  ringWidth: 3.5,
  radialWidth: 3.0
}

/**
 * 创建路网数据结构
 * @param config 路网配置
 * @returns 路网数据
 */
export function createRoadNetwork(config: RoadNetworkConfig = DEFAULT_ROAD_CONFIG): RoadNetwork {
  const segments: RoadSegment[] = []
  const ringSegments: RoadSegment[] = []
  const radialSegments: RoadSegment[] = []
  const crossSegments: RoadSegment[] = []

  const roadY = 0.02
  const { groundSize, ringRadii, radialCount, roadWidth, ringWidth, radialWidth } = config

  // ═══ 2 条十字主干道 ═══
  const crossRoad1: RoadSegment = {
    position: [0, roadY, 0],
    size: [groundSize, roadWidth],
    rotation: 0,
    type: 'cross',
    isMain: true
  }
  const crossRoad2: RoadSegment = {
    position: [0, roadY, 0],
    size: [roadWidth, groundSize],
    rotation: 0,
    type: 'cross',
    isMain: true
  }
  segments.push(crossRoad1, crossRoad2)
  crossSegments.push(crossRoad1, crossRoad2)

  // ═══ 环形路 ═══
  for (const r of ringRadii) {
    const segmentsCount = Math.max(6, Math.floor((2 * Math.PI * r) / 15))
    const arcLen = (2 * Math.PI * r) / segmentsCount
    for (let i = 0; i < segmentsCount; i++) {
      const angle = (i / segmentsCount) * Math.PI * 2
      const cx = Math.cos(angle) * r
      const cz = Math.sin(angle) * r
      const segment: RoadSegment = {
        position: [cx, roadY, cz],
        size: [arcLen * 0.98, ringWidth],
        rotation: -(angle + Math.PI / 2),
        type: 'ring',
        isMain: false
      }
      segments.push(segment)
      ringSegments.push(segment)
    }
  }

  // ═══ 放射路 ═══
  for (let i = 0; i < radialCount; i++) {
    const angle = (i / radialCount) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    for (let ri = 0; ri < ringRadii.length - 1; ri++) {
      const rInner = ringRadii[ri] + 3
      const rOuter = ringRadii[ri + 1] - 3
      const rMid = (rInner + rOuter) / 2
      const segLen = rOuter - rInner
      if (segLen < 4) continue
      const segment: RoadSegment = {
        position: [cos * rMid, roadY, sin * rMid],
        size: [radialWidth, segLen],
        rotation: 3 * Math.PI / 2 - angle,
        type: 'radial',
        isMain: false
      }
      segments.push(segment)
      radialSegments.push(segment)
    }
  }

  return {
    config,
    segments,
    ringSegments,
    radialSegments,
    crossSegments
  }
}

/**
 * 检查点是否在环形路上
 * @param x x坐标
 * @param z z坐标
 * @param network 路网数据
 * @param margin 安全边距
 * @returns 是否在环形路上
 */
export function isOnRingRoad(x: number, z: number, network: RoadNetwork, margin: number = 0): boolean {
  const { ringRadii, ringWidth } = network.config
  const distance = Math.sqrt(x * x + z * z)
  
  for (const radius of ringRadii) {
    const distToRing = Math.abs(distance - radius)
    if (distToRing < (ringWidth / 2 + margin)) {
      return true
    }
  }
  return false
}

/**
 * 检查点是否在放射路上
 * @param x x坐标
 * @param z z坐标
 * @param network 路网数据
 * @param margin 安全边距
 * @returns 是否在放射路上
 */
export function isOnRadialRoad(x: number, z: number, network: RoadNetwork, margin: number = 0): boolean {
  const { radialCount, radialWidth, ringRadii } = network.config
  const angle = Math.atan2(z, x)
  const distance = Math.sqrt(x * x + z * z)
  
  // 检查是否在放射路的角度范围内
  const radialAngleStep = (2 * Math.PI) / radialCount
  for (let i = 0; i < radialCount; i++) {
    const radialAngle = i * radialAngleStep
    let angleDiff = Math.abs(angle - radialAngle)
    if (angleDiff > Math.PI) {
      angleDiff = 2 * Math.PI - angleDiff
    }
    
    // 角度容差（基于路宽和距离）
    const angleTolerance = Math.atan2(radialWidth / 2 + margin, distance)
    if (angleDiff < angleTolerance) {
      // 检查是否在放射路的径向范围内
      const rInner = ringRadii[0] - 3
      const rOuter = ringRadii[ringRadii.length - 1] + 3
      if (distance >= rInner && distance <= rOuter) {
        return true
      }
    }
  }
  return false
}

/**
 * 检查点是否在十字主干道上
 * @param x x坐标
 * @param z z坐标
 * @param network 路网数据
 * @param margin 安全边距
 * @returns 是否在十字主干道上
 */
export function isOnCrossRoad(x: number, z: number, network: RoadNetwork, margin: number = 0): boolean {
  const { roadWidth, groundSize } = network.config
  const halfWidth = roadWidth / 2 + margin
  const halfSize = groundSize / 2
  
  // 检查是否在东西向主干道上
  if (Math.abs(z) < halfWidth && Math.abs(x) < halfSize) {
    return true
  }
  
  // 检查是否在南北向主干道上
  if (Math.abs(x) < halfWidth && Math.abs(z) < halfSize) {
    return true
  }
  
  return false
}

/**
 * 检查点是否在任何路上
 * @param x x坐标
 * @param z z坐标
 * @param network 路网数据
 * @param margin 安全边距
 * @returns 是否在路上
 */
export function isOnRoad(x: number, z: number, network: RoadNetwork, margin: number = 0): boolean {
  return isOnRingRoad(x, z, network, margin) ||
         isOnRadialRoad(x, z, network, margin) ||
         isOnCrossRoad(x, z, network, margin)
}

/**
 * 计算点到最近路网的距离
 * @param x x坐标
 * @param z z坐标
 * @param network 路网数据
 * @returns 到最近路网的距离
 */
export function distanceToNearestRoad(x: number, z: number, network: RoadNetwork): number {
  const { ringRadii, ringWidth, radialCount, radialWidth, roadWidth } = network.config
  const distance = Math.sqrt(x * x + z * z)
  const angle = Math.atan2(z, x)
  
  let minDistance = Infinity
  
  // 检查到环形路的距离
  for (const radius of ringRadii) {
    const distToRing = Math.abs(distance - radius) - ringWidth / 2
    minDistance = Math.min(minDistance, Math.max(0, distToRing))
  }
  
  // 检查到放射路的距离
  const radialAngleStep = (2 * Math.PI) / radialCount
  for (let i = 0; i < radialCount; i++) {
    const radialAngle = i * radialAngleStep
    let angleDiff = Math.abs(angle - radialAngle)
    if (angleDiff > Math.PI) {
      angleDiff = 2 * Math.PI - angleDiff
    }
    
    const angleTolerance = Math.atan2(radialWidth / 2, distance)
    if (angleDiff < angleTolerance) {
      const rInner = ringRadii[0] - 3
      const rOuter = ringRadii[ringRadii.length - 1] + 3
      if (distance >= rInner && distance <= rOuter) {
        return 0
      }
    }
    
    // 计算到放射路边缘的距离
    const distToRadial = distance * Math.sin(angleDiff) - radialWidth / 2
    minDistance = Math.min(minDistance, Math.max(0, distToRadial))
  }
  
  // 检查到十字主干道的距离
  const halfWidth = roadWidth / 2
  const distToCrossX = Math.abs(z) - halfWidth
  const distToCrossZ = Math.abs(x) - halfWidth
  minDistance = Math.min(minDistance, Math.max(0, distToCrossX, distToCrossZ))
  
  return minDistance
}