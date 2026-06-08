import * as THREE from 'three'

/* ───────── 建筑风格类型 ───────── */

export type BuildingStyle = 'glass' | 'brick' | 'industrial'

/* ───────── 伪随机 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/* ───────── 退台段定义 ───────── */

export interface SetbackSegment {
  scaleW: number  // 宽度缩放（相对于原始 width）
  scaleD: number  // 深度缩放（相对于原始 depth）
  heightRatio: number  // 高度占比（0-1）
}

/**
 * 根据建筑风格返回退台段配置。
 * 每个元素定义一个退台层的宽度/深度缩放和高度占比。
 */
export function getSetbackSegments(style: BuildingStyle): SetbackSegment[] {
  if (style === 'glass') {
    return [
      { scaleW: 1.0, scaleD: 1.0, heightRatio: 0.7 },
      { scaleW: 0.88, scaleD: 0.88, heightRatio: 0.25 },
      { scaleW: 0.55, scaleD: 0.55, heightRatio: 0.05 },
    ]
  }
  if (style === 'brick') {
    return [
      { scaleW: 1.0, scaleD: 1.0, heightRatio: 0.35 },
      { scaleW: 0.85, scaleD: 0.85, heightRatio: 0.25 },
      { scaleW: 0.7, scaleD: 0.7, heightRatio: 0.22 },
      { scaleW: 0.5, scaleD: 0.5, heightRatio: 0.18 },
    ]
  }
  // industrial
  return [
    { scaleW: 1.0, scaleD: 1.0, heightRatio: 0.6 },
    { scaleW: 0.85, scaleD: 0.85, heightRatio: 0.3 },
    { scaleW: 0.6, scaleD: 0.6, heightRatio: 0.1 },
  ]
}
