/**
 * CyberpunkGround 材质和纹理定义
 */

import * as THREE from 'three'

export const GROUND_SIZE = 120
export const PLAZA_RADIUS = 15
export const ROAD_WIDTH = 4
export const SIDEWALK_WIDTH = 2.5

/* ───────── 程序化沥青纹理生成 ───────── */

function generateAsphaltTexture(seed: number): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  ctx.fillStyle = '#1a1a28'
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 5000; i++) {
    const x = rand(i * 3) * size
    const y = rand(i * 3 + 1) * size
    const brightness = rand(i * 5) * 30 - 15
    ctx.fillStyle = `rgba(${26 + brightness}, ${26 + brightness}, ${40 + brightness}, 0.2)`
    ctx.fillRect(x, y, rand(i * 7) * 3 + 1, rand(i * 11) * 3 + 1)
  }

  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(10, 10, 18, ${0.4 + rand(i * 19) * 0.3})`
    ctx.lineWidth = 0.5 + rand(i * 23) * 1.5
    ctx.beginPath()
    let px = rand(i * 31) * size, py = rand(i * 37) * size
    ctx.moveTo(px, py)
    for (let j = 0; j < 6; j++) {
      px += (rand(i * 41 + j * 43) - 0.5) * 120
      py += (rand(i * 47 + j * 53) - 0.5) * 120
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  for (let i = 0; i < 200; i++) {
    const x = rand(i * 61) * size
    const y = rand(i * 67) * size
    const r = rand(i * 71) * 2 + 0.5
    ctx.fillStyle = `rgba(30, 30, 45, ${rand(i * 73) * 0.15})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4, 4)
  return texture
}

export const asphaltDiffuse = generateAsphaltTexture(42)

/* ───────── 地面材质定义 ───────── */

export const sidewalkMaterial = new THREE.MeshStandardMaterial({
  color: '#555570',
  roughness: 0.6,
  metalness: 0.15,
  emissive: '#1a1a35',
  emissiveIntensity: 0.6,
})

export const baseGroundMaterial = new THREE.MeshStandardMaterial({
  map: asphaltDiffuse,
  color: '#2a2a4a',
  roughness: 0.85,
  metalness: 0.15,
  emissive: '#151530',
  emissiveIntensity: 0.5,
})

export const plazaMaterial = new THREE.MeshStandardMaterial({
  color: '#3d3d6a',
  roughness: 0.3,
  metalness: 0.7,
  emissive: '#202050',
  emissiveIntensity: 0.7,
})

export const grassMaterial = new THREE.MeshStandardMaterial({
  color: '#0a3020',
  roughness: 0.9,
  metalness: 0.02,
  emissive: '#082818',
  emissiveIntensity: 0.6,
})

export const curbMaterial = new THREE.MeshStandardMaterial({
  color: '#6a6a80',
  roughness: 0.4,
  metalness: 0.3,
  emissive: '#2a2a40',
  emissiveIntensity: 0.5,
})

export const neonLineMaterial = new THREE.MeshStandardMaterial({
  color: '#00eeff',
  emissive: '#00ccff',
  emissiveIntensity: 3.0,
  roughness: 0.15,
  metalness: 0.85,
})
