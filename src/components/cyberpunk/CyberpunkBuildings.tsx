import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 程序化纹理生成 ───────── */

function generateProceduralTexture(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // 基于seed的伪随机
  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  if (type === 'rust') {
    // 铁锈纹理：暖棕色基底 + 鲜明锈斑
    ctx.fillStyle = '#5a3a28'
    ctx.fillRect(0, 0, 256, 256)
    // 底层大面积锈蚀
    for (let i = 0; i < 120; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const r = rand(i * 3 + 2) * 20 + 5
      ctx.fillStyle = `rgba(${160 + rand(i * 7) * 70}, ${80 + rand(i * 11) * 50}, ${20 + rand(i * 13) * 30}, ${0.3 + rand(i * 17) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // 鲜亮锈斑（高饱和度橙红）
    for (let i = 0; i < 60; i++) {
      const x = rand(i * 103) * 256, y = rand(i * 107) * 256
      const r = rand(i * 109) * 10 + 3
      ctx.fillStyle = `rgba(${190 + rand(i * 113) * 50}, ${70 + rand(i * 127) * 40}, ${10 + rand(i * 131) * 15}, ${0.35 + rand(i * 137) * 0.35})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // 深色划痕（对比度）
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = `rgba(30, 15, 8, ${0.2 + rand(i * 23) * 0.3})`
      ctx.lineWidth = rand(i * 29) * 2.5 + 0.5
      ctx.beginPath()
      ctx.moveTo(rand(i * 31) * 256, rand(i * 37) * 256)
      ctx.lineTo(rand(i * 41) * 256, rand(i * 43) * 256)
      ctx.stroke()
    }
    // 水痕（暗色长条）
    for (let i = 0; i < 8; i++) {
      const sx = rand(i * 91) * 256
      ctx.fillStyle = `rgba(25, 18, 12, ${0.15 + rand(i * 97) * 0.2})`
      ctx.fillRect(sx, 0, 2 + rand(i * 101) * 4, 256)
    }
  } else if (type === 'concrete') {
    // 混凝土纹理：中灰色基底 + 高对比噪点 + 污渍
    ctx.fillStyle = '#6a6a7a'
    ctx.fillRect(0, 0, 256, 256)
    // 大面积噪点（明暗交替）
    for (let i = 0; i < 4000; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const brightness = rand(i * 5) * 80 - 40
      const r = 70 + brightness, g = 70 + brightness, b = 85 + brightness
      ctx.fillStyle = `rgba(${Math.max(0, r)}, ${Math.max(0, g)}, ${Math.max(0, b)}, 0.18)`
      ctx.fillRect(x, y, rand(i * 7) * 5 + 1, rand(i * 11) * 5 + 1)
    }
    // 面板接缝 — 竖向深色线
    for (let x = 64; x < 256; x += 64) {
      ctx.strokeStyle = `rgba(15, 15, 25, 0.6)`
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke()
    }
    // 面板接缝 — 水平
    for (let y = 128; y < 256; y += 128) {
      ctx.strokeStyle = `rgba(15, 15, 25, 0.45)`
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
    }
    // 裂缝（深色锯齿线）
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(12, 12, 20, ${0.35 + rand(i * 19) * 0.35})`
      ctx.lineWidth = 0.5 + rand(i * 23) * 1.5
      ctx.beginPath()
      let px = rand(i * 31) * 256, py = rand(i * 37) * 256
      ctx.moveTo(px, py)
      for (let j = 0; j < 5; j++) {
        px += rand(i * 41 + j * 43) * 50 - 25
        py += rand(i * 47 + j * 53) * 50
        ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    // 大面积污渍/水痕
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(20, 20, 30, ${0.12 + rand(i * 67) * 0.18})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 71) * 256, rand(i * 73) * 256, rand(i * 79) * 25 + 8, rand(i * 83) * 35 + 10, rand(i * 89) * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    // 霉斑（绿灰色）
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(40, 55, 35, ${0.1 + rand(i * 143) * 0.12})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 149) * 256, rand(i * 151) * 256, rand(i * 157) * 18 + 6, rand(i * 163) * 22 + 8, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // 金属面板纹理：深色基底 + 高对比面板线 + 锈迹
    ctx.fillStyle = '#2a2a40'
    ctx.fillRect(0, 0, 256, 256)
    // 面板网格（更亮的面板色）
    const panelSize = 64
    for (let x = 0; x < 256; x += panelSize) {
      for (let y = 0; y < 256; y += panelSize) {
        const brightness = rand(x * 13 + y * 17) * 30
        ctx.fillStyle = `rgba(${50 + brightness}, ${50 + brightness}, ${70 + brightness}, 0.85)`
        ctx.fillRect(x + 2, y + 2, panelSize - 4, panelSize - 4)
        // 铆钉（亮银色）
        ctx.fillStyle = `rgba(120, 120, 140, 0.7)`
        ctx.beginPath(); ctx.arc(x + 6, y + 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 6, y + panelSize - 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + panelSize - 6, 2.5, 0, Math.PI * 2); ctx.fill()
      }
    }
    // 边缘锈迹（暖色）
    for (let i = 0; i < 15; i++) {
      const edge = Math.floor(rand(i * 83) * 4)
      let x = 0, y = 0
      if (edge === 0) { x = rand(i * 89) * 256; y = rand(i * 91) * 20 }
      else if (edge === 1) { x = rand(i * 89) * 256; y = 236 + rand(i * 91) * 20 }
      else if (edge === 2) { x = rand(i * 91) * 20; y = rand(i * 89) * 256 }
      else { x = 236 + rand(i * 91) * 20; y = rand(i * 89) * 256 }
      ctx.fillStyle = `rgba(${140 + rand(i * 97) * 60}, ${60 + rand(i * 101) * 30}, ${15 + rand(i * 103) * 10}, ${0.2 + rand(i * 107) * 0.2})`
      ctx.beginPath(); ctx.arc(x, y, 8 + rand(i * 109) * 12, 0, Math.PI * 2); ctx.fill()
    }
    // 污渍
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(15, 15, 25, ${0.12 + rand(i * 59) * 0.15})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 61) * 256, rand(i * 67) * 256, rand(i * 71) * 20 + 5, rand(i * 73) * 30 + 5, rand(i * 79) * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/* ───────── 程序化法线贴图生成（Sobel 推导） ───────── */

function generateNormalMap(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  // 1. 生成灰度 height map
  const heightData = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0
      if (type === 'rust') {
        // 锈斑凹凸 — 大幅度噪点
        h = rand(x * 3 + y * 5) * 0.6
        // 锈斑团块
        for (let i = 0; i < 30; i++) {
          const dx = x - rand(i * 7) * size, dy = y - rand(i * 11) * size
          const dist = Math.sqrt(dx * dx + dy * dy)
          h += Math.max(0, 1 - dist / (rand(i * 13) * 30 + 10)) * (0.2 + rand(i * 17) * 0.3)
        }
      } else if (type === 'concrete') {
        // 砖缝为主 — 低频 + 接缝锐利边缘
        h = rand(x * 2 + y * 3) * 0.3
        // 竖向接缝
        if (x % 64 < 3 || x % 64 > 61) h += 0.5
        // 水平接缝
        if (y % 128 < 2 || y % 128 > 126) h += 0.4
        // 裂缝
        for (let i = 0; i < 3; i++) {
          const cx = rand(i * 31) * size, cy = rand(i * 37) * size
          const dist = Math.abs((x - cx) * rand(i * 41) - (y - cy) * rand(i * 43))
          h += Math.max(0, 1 - dist / 4) * 0.6
        }
      } else {
        // 面板边缘 — 锐利梯形
        const panelSize = 64
        const lx = x % panelSize, ly = y % panelSize
        const edgeDist = Math.min(lx, ly, panelSize - lx, panelSize - ly)
        h = edgeDist < 3 ? 0.8 : 0.1 + rand(x * 5 + y * 7) * 0.1
        // 铆钉凸起
        for (let px = 0; px < size; px += panelSize) {
          for (let py = 0; py < size; py += panelSize) {
            for (const [rx, ry] of [[px + 6, py + 6], [px + panelSize - 6, py + 6], [px + 6, py + panelSize - 6], [px + panelSize - 6, py + panelSize - 6]]) {
              const dist = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2)
              if (dist < 4) h = Math.max(h, 1 - dist / 4)
            }
          }
        }
      }
      heightData[y * size + x] = Math.min(1, h)
    }
  }

  // 2. Sobel 卷积推导法线
  const normalScale = type === 'rust' ? 3.0 : type === 'concrete' ? 2.0 : 4.0
  const imageData = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size
      const ym = (y - 1 + size) % size, yp = (y + 1) % size
      const gx = (heightData[y * size + xp] - heightData[y * size + xm]) * normalScale
      const gy = (heightData[yp * size + x] - heightData[ym * size + x]) * normalScale
      const len = Math.sqrt(gx * gx + gy * gy + 1)
      const nx = -gx / len, ny = -gy / len, nz = 1 / len
      const idx = (y * size + x) * 4
      imageData.data[idx] = Math.round((nx * 0.5 + 0.5) * 255)
      imageData.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      imageData.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      imageData.data[idx + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/* ───────── 程序化金属度贴图生成 ───────── */

function generateMetalnessMap(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  // 黑色基底（全零金属度）
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  if (type === 'rust') {
    // 锈蚀暴露底层金属 — 边缘区域更亮
    for (let i = 0; i < 80; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const r = rand(i * 5) * 15 + 5
      // 边缘区域高金属度
      const edgeFactor = Math.min(x, y, size - x, size - y) < 30 ? 200 : 100
      const brightness = edgeFactor + rand(i * 7) * 55
      ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${0.3 + rand(i * 11) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  } else if (type === 'concrete') {
    // 几乎全黑 — 仅钢筋露出点有微弱亮度
    for (let i = 0; i < 10; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const brightness = 20 + rand(i * 5) * 30
      ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.3)`
      ctx.beginPath(); ctx.arc(x, y, 3 + rand(i * 7) * 4, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    // 金属面板 — 面板区域高金属度，接缝处黑色
    const panelSize = 64
    for (let px = 0; px < size; px += panelSize) {
      for (let py = 0; py < size; py += panelSize) {
        const brightness = 200 + rand(px * 13 + py * 17) * 55
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`
        ctx.fillRect(px + 3, py + 3, panelSize - 6, panelSize - 6)
      }
    }
  }

  // 微观噪点
  for (let i = 0; i < 500; i++) {
    const x = rand(i * 3 + 100) * size, y = rand(i * 3 + 101) * size
    const brightness = rand(i * 5 + 102) * 40
    ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.1)`
    ctx.fillRect(x, y, 2, 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/* ───────── 赛博朋克背景建筑群（玻璃幕墙） ───────── */

interface BuildingProps {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
  simplified?: boolean
}

function CyberBuilding({ position, width, depth, height, neonColor, simplified }: BuildingProps) {
  const groupRef = useRef<THREE.Group>(null!)

  // 程序化纹理
  const textureType = useMemo(() => {
    const types: ('rust' | 'concrete' | 'metal')[] = ['rust', 'concrete', 'metal']
    return types[Math.floor(Math.abs(position[0] * 7 + position[2] * 13)) % 3]
  }, [position])
  const diffuseMap = useMemo(() => {
    const tex = generateProceduralTexture(position[0] + position[2] * 100, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [textureType, width])
  const roughnessMap = useMemo(() => {
    const tex = generateProceduralTexture(position[0] * 3 + position[2] * 7, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [textureType, width])
  const normalMap = useMemo(() => {
    const tex = generateNormalMap(position[0] * 5 + position[2] * 11, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [textureType, width])
  const metalnessMap = useMemo(() => {
    const tex = generateMetalnessMap(position[0] * 9 + position[2] * 15, textureType)
    tex.repeat.set(width > 6 ? 2 : 1, 2)
    return tex
  }, [textureType, width])

  // 建筑几何复杂度 — 退台结构
  const mainHeight = height * 0.75
  const setbackHeight = height * 0.25
  const setbackWidth = width * 0.8
  const setbackDepth = depth * 0.8
  const topWidth = width * 0.5
  const topDepth = depth * 0.5
  const topHeight = height * 0.08

  // 缓存边框几何体
  const topEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.05, depth + 0.1)), [width, depth])
  const bottomEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1)), [width, depth])
  const midEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.15, 0.08, depth + 0.15)), [width, depth])

  // 竖向霓虹边线几何体
  const vertLineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array([
      -width / 2, -height / 2, -depth / 2, -width / 2, height / 2, -depth / 2,
      width / 2, -height / 2, -depth / 2, width / 2, height / 2, -depth / 2,
    ]), 3))
    return g
  }, [width, height, depth])

  // 天线高度
  const antennaHeight = useMemo(() => 1 + Math.random() * 3, [])

  // 楼层分隔线几何体
  const floorLineGeo = useMemo(() => {
    const positions: number[] = []
    const floorH = Math.max(2, height / 6)
    const floors = Math.floor(height / floorH)
    for (let i = 1; i < floors; i++) {
      const y = -height / 2 + i * floorH
      const hw = width / 2, hd = depth / 2
      // 前面
      positions.push(-hw, y, hd, hw, y, hd)
      // 后面
      positions.push(-hw, y, -hd, hw, y, -hd)
      // 左面
      positions.push(-hw, y, -hd, -hw, y, hd)
      // 右面
      positions.push(hw, y, -hd, hw, y, hd)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [width, height, depth])

  // 根据材质类型设置不同的金属度和粗糙度，增强材质区分度
  const materialParams = useMemo(() => {
    if (textureType === 'rust') {
      return { metalness: 0.3, roughness: 0.8 } // 锈蚀材质：低金属度，高粗糙度
    } else if (textureType === 'concrete') {
      return { metalness: 0.1, roughness: 0.9 } // 混凝土材质：极低金属度，极高粗糙度
    } else {
      return { metalness: 0.6, roughness: 0.4 } // 金属材质：高金属度，低粗糙度
    }
  }, [textureType])

  return (
    <group ref={groupRef} position={position}>
      {/* 建筑主体（下半部分） */}
      <mesh position={[0, mainHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, mainHeight, depth]} />
        <meshStandardMaterial
          map={diffuseMap}
          roughnessMap={roughnessMap}
          normalMap={normalMap}
          normalScale={new THREE.Vector2(1.5, 1.5)}
          metalnessMap={metalnessMap}
          color="#b0b0c0"
          metalness={materialParams.metalness}
          roughness={materialParams.roughness}
          emissive={neonColor}
          emissiveIntensity={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 退台（上半部分收窄） */}
      {!simplified && (
        <>
          <mesh position={[0, mainHeight + setbackHeight / 2, 0]} castShadow>
            <boxGeometry args={[setbackWidth, setbackHeight, setbackDepth]} />
            <meshStandardMaterial
              map={diffuseMap}
              normalMap={normalMap}
              normalScale={new THREE.Vector2(1.5, 1.5)}
              metalnessMap={metalnessMap}
              color="#b0b0c0"
              metalness={materialParams.metalness}
              roughness={materialParams.roughness * 0.9} // 退台比主体稍光滑
              emissive={neonColor}
              emissiveIntensity={0.15}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* 顶部结构（天台设备） */}
          <mesh position={[0, mainHeight + setbackHeight + topHeight / 2, 0]}>
            <boxGeometry args={[topWidth, topHeight, topDepth]} />
            <meshStandardMaterial color="#0a0a1a" metalness={0.3} roughness={0.7} emissive={neonColor} emissiveIntensity={0.1} />
          </mesh>
        </>
      )}

      {/* 每层发光窗户条带 */}
      {Array.from({ length: Math.floor(mainHeight / 2.5) }, (_, i) => {
        const y = 1.5 + i * 2.5
        const isWarm = (Math.floor(position[0] * 3 + i * 7) % 2) === 0
        const windowColor = isWarm ? '#ffaa44' : '#4488ff'
        const intensity = 1.5 + (Math.abs(position[0] + i) % 3) * 0.5
        return (
          <group key={`win-${i}`}>
            {/* 正面窗户 */}
            <mesh position={[0, y, depth / 2 + 0.03]}>
              <planeGeometry args={[width - 0.4, 0.15]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.7}
              />
            </mesh>
            {/* 背面窗户 */}
            <mesh position={[0, y, -depth / 2 - 0.03]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[width - 0.4, 0.15]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.7}
              />
            </mesh>
            {/* 左面窗户 */}
            <mesh position={[-width / 2 - 0.03, y, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[depth - 0.4, 0.15]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.7}
              />
            </mesh>
            {/* 右面窗户 */}
            <mesh position={[width / 2 + 0.03, y, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[depth - 0.4, 0.15]} />
              <meshStandardMaterial
                color={windowColor}
                emissive={windowColor}
                emissiveIntensity={intensity}
                transparent
                opacity={0.7}
              />
            </mesh>
          </group>
        )
      })}

      {/* 楼层分隔线 */}
      {!simplified && (
        <lineSegments position={[0, height / 2, 0]} geometry={floorLineGeo}>
          <lineBasicMaterial color={neonColor} transparent opacity={0.15} />
        </lineSegments>
      )}

      {/* 顶部霓虹边框 */}
      <lineSegments position={[0, height, 0]} geometry={topEdgeGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.5} />
      </lineSegments>

      {/* 底部霓虹边框 */}
      <lineSegments position={[0, 0.05, 0]} geometry={bottomEdgeGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.3} />
      </lineSegments>

      {/* 竖向霓虹边线 */}
      <lineSegments position={[0, height / 2, 0]} geometry={vertLineGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.4} />
      </lineSegments>

      {/* 中间横向装饰带 */}
      <lineSegments position={[0, height * 0.5, 0]} geometry={midEdgeGeo}>
        <lineBasicMaterial color={neonColor} transparent opacity={0.25} />
      </lineSegments>

      {/* 建筑装饰细节 — 管道/空调/排气口 */}
      {!simplified && Array.from({ length: 2 + Math.floor(Math.abs(position[0] * 3 + position[2] * 7) % 4) }, (_, i) => {
        const seed = Math.abs(position[0] * 13 + position[2] * 17 + i * 31)
        const face = Math.floor(seed) % 4
        const yOffset = 2 + (seed * 7 % 1) * (mainHeight - 4)
        const detailType = Math.floor(seed * 3) % 3
        let x = 0, z = 0, rotY = 0
        if (face === 0) { x = width / 2 + 0.15; rotY = Math.PI / 2 }
        else if (face === 1) { x = -width / 2 - 0.15; rotY = -Math.PI / 2 }
        else if (face === 2) { z = depth / 2 + 0.15; rotY = Math.PI }
        else { z = -depth / 2 - 0.15; rotY = 0 }

        if (detailType === 0) {
          // 管道
          return (
            <mesh key={`pipe-${i}`} position={[x, yOffset, z]} rotation={[0, rotY, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 1.5 + (seed % 1) * 1.5, 6]} />
              <meshStandardMaterial color="#3a3a4a" roughness={0.6} metalness={0.5} />
            </mesh>
          )
        } else if (detailType === 1) {
          // 空调外机
          return (
            <mesh key={`ac-${i}`} position={[x, yOffset, z]} rotation={[0, rotY, 0]}>
              <boxGeometry args={[0.6, 0.4, 0.3]} />
              <meshStandardMaterial color="#2a2a3a" roughness={0.5} metalness={0.4} />
            </mesh>
          )
        } else {
          // 排气口
          return (
            <mesh key={`vent-${i}`} position={[x, yOffset, z]} rotation={[Math.PI / 2, rotY, 0]}>
              <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
              <meshStandardMaterial color="#252535" roughness={0.7} metalness={0.3} />
            </mesh>
          )
        }
      })}

      {/* 天线 */}
      {!simplified && (
        <>
          <mesh position={[0, height + antennaHeight / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.03, antennaHeight, 4]} />
            <meshStandardMaterial color="#3a3a5a" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* 天线信号灯 */}
          <AntennaLight position={[0, height + antennaHeight, 0]} color={neonColor} />
        </>
      )}
    </group>
  )
}

/* 天线闪烁灯 */
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

interface BuildingData {
  position: [number, number, number]
  width: number
  depth: number
  height: number
  neonColor: string
  simplified?: boolean
}

export type { BuildingData }

export { generateBuildings }

function generateBuildings(_count: number, _mainBuildingRadius: number): BuildingData[] {
  // 使用更暗、更统一的霓虹色，避免五颜六色
  const neonColors = ['#1a3a6a', '#3a2a4a', '#2a4a3a', '#4a3a2a', '#2a3a4a', '#3a3a3a']
  const buildings: BuildingData[] = []

  // 近处环形建筑 — 3环
  const nearRings = [
    { count: 8, radiusMin: 18, radiusMax: 28, heightMin: 12, heightMax: 32, widthMin: 3, widthMax: 8 },
    { count: 12, radiusMin: 28, radiusMax: 42, heightMin: 10, heightMax: 38, widthMin: 3, widthMax: 9 },
    { count: 15, radiusMin: 42, radiusMax: 58, heightMin: 8, heightMax: 35, widthMin: 4, widthMax: 10 },
  ]

  for (const ring of nearRings) {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
      const radius = ring.radiusMin + Math.random() * (ring.radiusMax - ring.radiusMin)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const height = ring.heightMin + Math.random() * (ring.heightMax - ring.heightMin)
      const width = ring.widthMin + Math.random() * (ring.widthMax - ring.widthMin)
      const depth = 3 + Math.random() * 5

      buildings.push({
        position: [x, 0, z],
        width,
        depth,
        height,
        neonColor: neonColors[Math.floor(Math.random() * neonColors.length)],
      })
    }
  }

  // 天际线层 — 2层
  const skylineLayers = [
    { count: 10, radiusMin: 45, radiusMax: 65, heightMin: 40, heightMax: 60, widthMin: 5, widthMax: 12 },
    { count: 10, radiusMin: 55, radiusMax: 75, heightMin: 60, heightMax: 80, widthMin: 6, widthMax: 14 },
  ]

  for (const layer of skylineLayers) {
    for (let i = 0; i < layer.count; i++) {
      const angle = (i / layer.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
      const radius = layer.radiusMin + Math.random() * (layer.radiusMax - layer.radiusMin)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const height = layer.heightMin + Math.random() * (layer.heightMax - layer.heightMin)
      const width = layer.widthMin + Math.random() * (layer.widthMax - layer.widthMin)
      const depth = 4 + Math.random() * 6

      buildings.push({
        position: [x, 0, z],
        width,
        depth,
        height,
        neonColor: neonColors[Math.floor(Math.random() * neonColors.length)],
      })
    }
  }

  // 远处简化建筑
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
    const radius = 80 + Math.random() * 40
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const height = 20 + Math.random() * 20
    const width = 4 + Math.random() * 4
    const depth = 3 + Math.random() * 4

    buildings.push({
      position: [x, 0, z],
      width,
      depth,
      height,
      neonColor: neonColors[Math.floor(Math.random() * neonColors.length)],
      simplified: true,
    })
  }

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
