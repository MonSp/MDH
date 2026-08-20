import * as THREE from 'three'
import type { BuildingStyle } from './BuildingProfileGenerator'

/* ───────── 程序化纹理生成 ───────── */

export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function generateProceduralTexture(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  if (type === 'rust') {
    ctx.fillStyle = '#5a3a28'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 120; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const r = rand(i * 3 + 2) * 20 + 5
      ctx.fillStyle = `rgba(${160 + rand(i * 7) * 70}, ${80 + rand(i * 11) * 50}, ${20 + rand(i * 13) * 30}, ${0.3 + rand(i * 17) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 60; i++) {
      const x = rand(i * 103) * 256, y = rand(i * 107) * 256
      const r = rand(i * 109) * 10 + 3
      ctx.fillStyle = `rgba(${190 + rand(i * 113) * 50}, ${70 + rand(i * 127) * 40}, ${10 + rand(i * 131) * 15}, ${0.35 + rand(i * 137) * 0.35})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = `rgba(30, 15, 8, ${0.2 + rand(i * 23) * 0.3})`
      ctx.lineWidth = rand(i * 29) * 2.5 + 0.5
      ctx.beginPath()
      ctx.moveTo(rand(i * 31) * 256, rand(i * 37) * 256)
      ctx.lineTo(rand(i * 41) * 256, rand(i * 43) * 256)
      ctx.stroke()
    }
    for (let i = 0; i < 8; i++) {
      const sx = rand(i * 91) * 256
      ctx.fillStyle = `rgba(25, 18, 12, ${0.15 + rand(i * 97) * 0.2})`
      ctx.fillRect(sx, 0, 2 + rand(i * 101) * 4, 256)
    }
  } else if (type === 'concrete') {
    ctx.fillStyle = '#6a6a7a'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 4000; i++) {
      const x = rand(i * 3) * 256, y = rand(i * 3 + 1) * 256
      const brightness = rand(i * 5) * 80 - 40
      const r = 70 + brightness, g = 70 + brightness, b = 85 + brightness
      ctx.fillStyle = `rgba(${Math.max(0, r)}, ${Math.max(0, g)}, ${Math.max(0, b)}, 0.18)`
      ctx.fillRect(x, y, rand(i * 7) * 5 + 1, rand(i * 11) * 5 + 1)
    }
    for (let x = 64; x < 256; x += 64) {
      ctx.strokeStyle = `rgba(15, 15, 25, 0.6)`
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke()
    }
    for (let y = 128; y < 256; y += 128) {
      ctx.strokeStyle = `rgba(15, 15, 25, 0.45)`
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
    }
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
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(20, 20, 30, ${0.12 + rand(i * 67) * 0.18})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 71) * 256, rand(i * 73) * 256, rand(i * 79) * 25 + 8, rand(i * 83) * 35 + 10, rand(i * 89) * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(40, 55, 35, ${0.1 + rand(i * 143) * 0.12})`
      ctx.beginPath()
      ctx.ellipse(rand(i * 149) * 256, rand(i * 151) * 256, rand(i * 157) * 18 + 6, rand(i * 163) * 22 + 8, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#2a2a40'
    ctx.fillRect(0, 0, 256, 256)
    const panelSize = 64
    for (let x = 0; x < 256; x += panelSize) {
      for (let y = 0; y < 256; y += panelSize) {
        const brightness = rand(x * 13 + y * 17) * 30
        ctx.fillStyle = `rgba(${50 + brightness}, ${50 + brightness}, ${70 + brightness}, 0.85)`
        ctx.fillRect(x + 2, y + 2, panelSize - 4, panelSize - 4)
        ctx.fillStyle = `rgba(120, 120, 140, 0.7)`
        ctx.beginPath(); ctx.arc(x + 6, y + 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 6, y + panelSize - 6, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x + panelSize - 6, y + panelSize - 6, 2.5, 0, Math.PI * 2); ctx.fill()
      }
    }
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

export function generateNormalMap(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  const heightData = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0
      if (type === 'rust') {
        h = rand(x * 3 + y * 5) * 0.6
        for (let i = 0; i < 30; i++) {
          const dx = x - rand(i * 7) * size, dy = y - rand(i * 11) * size
          const dist = Math.sqrt(dx * dx + dy * dy)
          h += Math.max(0, 1 - dist / (rand(i * 13) * 30 + 10)) * (0.2 + rand(i * 17) * 0.3)
        }
      } else if (type === 'concrete') {
        h = rand(x * 2 + y * 3) * 0.3
        if (x % 64 < 3 || x % 64 > 61) h += 0.5
        if (y % 128 < 2 || y % 128 > 126) h += 0.4
        for (let i = 0; i < 3; i++) {
          const cx = rand(i * 31) * size, cy = rand(i * 37) * size
          const dist = Math.abs((x - cx) * rand(i * 41) - (y - cy) * rand(i * 43))
          h += Math.max(0, 1 - dist / 4) * 0.6
        }
      } else {
        const panelSize = 64
        const lx = x % panelSize, ly = y % panelSize
        const edgeDist = Math.min(lx, ly, panelSize - lx, panelSize - ly)
        h = edgeDist < 3 ? 0.8 : 0.1 + rand(x * 5 + y * 7) * 0.1
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

export function generateMetalnessMap(seed: number, type: 'rust' | 'concrete' | 'metal'): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  if (type === 'rust') {
    for (let i = 0; i < 80; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const r = rand(i * 5) * 15 + 5
      const edgeFactor = Math.min(x, y, size - x, size - y) < 30 ? 200 : 100
      const brightness = edgeFactor + rand(i * 7) * 55
      ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${0.3 + rand(i * 11) * 0.4})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  } else if (type === 'concrete') {
    for (let i = 0; i < 10; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const brightness = 20 + rand(i * 5) * 30
      ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.3)`
      ctx.beginPath(); ctx.arc(x, y, 3 + rand(i * 7) * 4, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    const panelSize = 64
    for (let px = 0; px < size; px += panelSize) {
      for (let py = 0; py < size; py += panelSize) {
        const brightness = 200 + rand(px * 13 + py * 17) * 55
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`
        ctx.fillRect(px + 3, py + 3, panelSize - 6, panelSize - 6)
      }
    }
  }

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

/* ───────── 风格到纹理类型映射 ───────── */

export function styleToTextureType(style: BuildingStyle): 'rust' | 'concrete' | 'metal' {
  if (style === 'glass') return 'metal'
  if (style === 'brick') return 'concrete'
  return 'rust' // industrial
}
