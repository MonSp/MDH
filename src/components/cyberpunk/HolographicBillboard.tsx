import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CityBuildingData } from './CyberpunkCityInstanced'

/* ───────── Canvas 动态全息广告牌 ─────────
 * 3 类广告牌：中文霓虹文字、英文/假名文字、几何发光图案
 * 使用 Canvas 生成 emissiveMap，PlaneGeometry 挂载
 */

/* ───────── 伪随机 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/* ───────── 广告牌数据 ───────── */

interface BillboardData {
  position: [number, number, number]
  rotation: [number, number, number]
  width: number
  height: number
  type: 'chinese' | 'latin' | 'geometric'
  seed: number
  color: string
  text?: string
}

/* ───────── Canvas 纹理生成 ───────── */

const CHINESE_TEXTS = [
  '赛博朋克', '未来科技', '数据洪流', '量子网络', '虚拟空间',
  '神经接口', '全息投影', '数字孪生', '元宇宙', '深度学习',
  '边缘计算', '脑机接口', '纳米科技', '仿生义体', '合成意识',
  '数字永生', '基因编辑', '超级智能', '信息矩阵', '量子通讯',
]

const LATIN_TEXTS = [
  'CYBER', 'NEON', 'NEXUS', 'MATRIX', 'SYNTH', 'FLUX',
  'VOID', 'DATA', 'SYNC', 'LINK', 'GRID', 'CORE',
  'NØVA', 'データ', 'システム', 'ネット', 'コード',
]

const NEON_COLORS = [
  '#00ffff', '#ff00ff', '#ffaa00', '#00ff88', '#ff4488',
  '#44aaff', '#ff6600', '#88ff00', '#aa44ff', '#ff2244',
]

function generateBillboardCanvas(
  type: 'chinese' | 'latin' | 'geometric',
  seed: number,
  color: string
): HTMLCanvasElement {
  const w = 256
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  // 背景：深色半透明
  ctx.fillStyle = 'rgba(5, 5, 20, 0.9)'
  ctx.fillRect(0, 0, w, h)

  // 解析颜色
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)

  if (type === 'chinese') {
    // 中文霓虹文字
    const text = CHINESE_TEXTS[Math.floor(rand(seed) * CHINESE_TEXTS.length)]
    ctx.font = 'bold 36px "Microsoft YaHei", "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 外发光
    ctx.shadowColor = color
    ctx.shadowBlur = 20
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`
    ctx.fillText(text, w / 2, h / 2)

    // 内发光层
    ctx.shadowBlur = 10
    ctx.fillStyle = `rgba(255, 255, 255, 0.6)`
    ctx.fillText(text, w / 2, h / 2)

    // 扫描线
    ctx.shadowBlur = 0
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.1 + rand(y) * 0.1})`
      ctx.fillRect(0, y, w, 1)
    }

    // 底部装饰线
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(20, h - 15)
    ctx.lineTo(w - 20, h - 15)
    ctx.stroke()
  } else if (type === 'latin') {
    // 英文/假名霓虹文字
    const text = LATIN_TEXTS[Math.floor(rand(seed) * LATIN_TEXTS.length)]
    ctx.font = 'bold 42px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 外发光
    ctx.shadowColor = color
    ctx.shadowBlur = 25
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`
    ctx.fillText(text, w / 2, h / 2)

    // 内发光
    ctx.shadowBlur = 12
    ctx.fillStyle = `rgba(255, 255, 255, 0.5)`
    ctx.fillText(text, w / 2, h / 2)

    // 边框
    ctx.shadowBlur = 0
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`
    ctx.lineWidth = 2
    ctx.strokeRect(8, 8, w - 16, h - 16)

    // 角落装饰
    const cornerSize = 12
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`
    ctx.fillRect(4, 4, cornerSize, 2)
    ctx.fillRect(4, 4, 2, cornerSize)
    ctx.fillRect(w - 4 - cornerSize, 4, cornerSize, 2)
    ctx.fillRect(w - 2, 4, 2, cornerSize)
    ctx.fillRect(4, h - 6, cornerSize, 2)
    ctx.fillRect(4, h - 4 - cornerSize, 2, cornerSize)
    ctx.fillRect(w - 4 - cornerSize, h - 6, cornerSize, 2)
    ctx.fillRect(w - 2, h - 4 - cornerSize, 2, cornerSize)
  } else {
    // 几何发光图案
    const patternType = Math.floor(rand(seed * 3) * 4)
    ctx.shadowColor = color
    ctx.shadowBlur = 15
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`
    ctx.lineWidth = 2

    if (patternType === 0) {
      // 同心圆
      for (let i = 3; i > 0; i--) {
        const radius = 15 + i * 12
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2)
        ctx.stroke()
      }
      // 中心点
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (patternType === 1) {
      // 三角形网格
      const size = 20
      for (let x = 0; x < w; x += size * 2) {
        for (let y = 0; y < h; y += size) {
          ctx.beginPath()
          ctx.moveTo(x, y + size)
          ctx.lineTo(x + size, y)
          ctx.lineTo(x + size * 2, y + size)
          ctx.closePath()
          ctx.stroke()
        }
      }
    } else if (patternType === 2) {
      // 波浪线
      for (let i = 0; i < 5; i++) {
        const yOff = 20 + i * 20
        ctx.beginPath()
        for (let x = 0; x < w; x += 2) {
          const y = yOff + Math.sin(x * 0.05 + i) * 8
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    } else {
      // 菱形图案
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`
      for (let i = 0; i < 6; i++) {
        const cx = 30 + i * 38
        const cy = h / 2
        ctx.beginPath()
        ctx.moveTo(cx, cy - 25)
        ctx.lineTo(cx + 20, cy)
        ctx.lineTo(cx, cy + 25)
        ctx.lineTo(cx - 20, cy)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }

    // 扫描线
    ctx.shadowBlur = 0
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = `rgba(0, 0, 0, 0.08)`
      ctx.fillRect(0, y, w, 1)
    }
  }

  return canvas
}

/* ───────── 生成广告牌布局数据 ───────── */

function generateBillboards(buildings: CityBuildingData[], maxBillboards: number): BillboardData[] {
  const billboards: BillboardData[] = []
  const types: ('chinese' | 'latin' | 'geometric')[] = ['chinese', 'latin', 'geometric']

  // 只为部分建筑生成广告牌，避免过于密集
  const step = Math.max(1, Math.floor(buildings.length / (maxBillboards / 2)))

  for (let i = 0; i < buildings.length; i += step) {
    if (billboards.length >= maxBillboards) break
    const b = buildings[i]
    const seed = b.seed

    // 每栋建筑 1-2 面广告牌
    const adCount = 1 + Math.floor(pseudoRandom(seed * 11) * 2)
    for (let ai = 0; ai < adCount; ai++) {
      const face = (i * 3 + ai * 7) % 4
      const type = types[(seed + ai) % 3]
      const color = NEON_COLORS[(seed + ai * 13) % NEON_COLORS.length]
      const offset = 0.15

      let x = b.position[0]
      let z = b.position[2]
      let rotY = 0

      if (face === 0) { x += b.width / 2 + offset; rotY = Math.PI / 2 }
      else if (face === 1) { x -= b.width / 2 + offset; rotY = -Math.PI / 2 }
      else if (face === 2) { z += b.depth / 2 + offset; rotY = Math.PI }
      else { z -= b.depth / 2 + offset; rotY = 0 }

      const yPos = 1.5 + pseudoRandom(seed + ai * 17) * Math.min(b.height * 0.7, 15)
      const bbWidth = 2 + pseudoRandom(seed + ai * 19) * 3
      const bbHeight = 1 + pseudoRandom(seed + ai * 23) * 1.5

      billboards.push({
        position: [x, yPos, z],
        rotation: [0, rotY, 0],
        width: bbWidth,
        height: bbHeight,
        type,
        seed: seed + ai * 31,
        color,
      })
    }
  }

  return billboards
}

/* ───────── 共享 Canvas 纹理缓存 ───────── */

const canvasTextureCache = new Map<string, THREE.CanvasTexture>()

function getBillboardTexture(type: 'chinese' | 'latin' | 'geometric', seed: number, color: string): THREE.CanvasTexture {
  const key = `${type}-${seed}-${color}`
  if (canvasTextureCache.has(key)) {
    return canvasTextureCache.get(key)!
  }
  const canvas = generateBillboardCanvas(type, seed, color)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  canvasTextureCache.set(key, tex)
  return tex
}

/* ───────── 单个广告牌组件 ───────── */

function Billboard({ data }: { data: BillboardData }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  const texture = useMemo(
    () => getBillboardTexture(data.type, data.seed, data.color),
    [data.type, data.seed, data.color]
  )

  useFrame(({ clock }) => {
    if (!glowRef.current) return
    const t = clock.elapsedTime
    const mat = glowRef.current.material as THREE.MeshBasicMaterial
    // 脉冲发光
    mat.opacity = 0.12 + Math.sin(t * 2 + data.seed) * 0.06
  })

  return (
    <group position={data.position} rotation={data.rotation}>
      {/* 广告牌面板 */}
      <mesh ref={meshRef}>
        <planeGeometry args={[data.width, data.height]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* 外发光层 */}
      <mesh ref={glowRef} position={[0, 0, -0.05]}>
        <planeGeometry args={[data.width + 1, data.height + 0.8]} />
        <meshBasicMaterial
          color={data.color}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/* ───────── 导出组件 ───────── */

export default function HolographicBillboard({
  buildings,
  maxBillboards = 300,
}: {
  buildings: CityBuildingData[]
  maxBillboards?: number
}) {
  const billboards = useMemo(
    () => generateBillboards(buildings, maxBillboards),
    [buildings, maxBillboards]
  )

  return (
    <group>
      {billboards.map((bb, i) => (
        <Billboard key={i} data={bb} />
      ))}
    </group>
  )
}
