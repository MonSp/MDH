import * as THREE from 'three'

/* ───────── PBR 纹理加载系统 ─────────
 * 从 public/textures/ 加载 ambientCG CC0 PBR 贴图
 * 加载失败时 fallback 到 Canvas 程序化纹理
 */

export interface PBRTextureSet {
  color: THREE.Texture | null
  roughness: THREE.Texture | null
  normal: THREE.Texture | null
  metalness: THREE.Texture | null
}

export type TextureType = 'concrete' | 'rustMetal' | 'dirtyGlass'

/* ───────── 贴图路径配置 ───────── */

interface TexturePaths {
  color?: string
  roughness?: string
  normal?: string
  metalness?: string
}

// ambientCG CC0 贴图 ID（均经 API 验证存在）
// 混凝土：Concrete048  https://ambientcg.com/view?id=Concrete048
// 锈蚀金属：Metal053C   https://ambientcg.com/view?id=Metal053C
// 脏污玻璃幕墙：Facade009 https://ambientcg.com/view?id=Facade009
const TEXTURE_PATHS: Record<TextureType, TexturePaths> = {
  concrete: {
    color: '/textures/Concrete048_Color.jpg',
    roughness: '/textures/Concrete048_Roughness.jpg',
    normal: '/textures/Concrete048_NormalGL.jpg',
  },
  rustMetal: {
    color: '/textures/Metal053C_Color.jpg',
    roughness: '/textures/Metal053C_Roughness.jpg',
    normal: '/textures/Metal053C_NormalGL.jpg',
    metalness: '/textures/Metal053C_Metalness.jpg',
  },
  dirtyGlass: {
    color: '/textures/Facade009_Color.jpg',
    roughness: '/textures/Facade009_Roughness.jpg',
    normal: '/textures/Facade009_NormalGL.jpg',
  },
}

/* ───────── 伪随机 ───────── */

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/* ───────── Canvas 程序化纹理生成（Fallback） ───────── */

function generateFallbackColor(type: TextureType, seed: number): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  if (type === 'concrete') {
    ctx.fillStyle = '#5a5a6a'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 3000; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const b = rand(i * 5) * 60 - 30
      ctx.fillStyle = `rgba(${70 + b}, ${70 + b}, ${85 + b}, 0.15)`
      ctx.fillRect(x, y, rand(i * 7) * 4 + 1, rand(i * 11) * 4 + 1)
    }
    for (let x = 64; x < size; x += 64) {
      ctx.strokeStyle = 'rgba(15,15,25,0.5)'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
    }
  } else if (type === 'rustMetal') {
    ctx.fillStyle = '#4a3020'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 100; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      const r = rand(i * 5) * 18 + 4
      ctx.fillStyle = `rgba(${150 + rand(i * 7) * 80}, ${70 + rand(i * 11) * 50}, ${15 + rand(i * 13) * 25}, 0.3)`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    ctx.fillStyle = '#2a3a5a'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 80; i++) {
      const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
      ctx.fillStyle = `rgba(${40 + rand(i * 5) * 40}, ${60 + rand(i * 7) * 40}, ${90 + rand(i * 9) * 40}, 0.2)`
      ctx.beginPath(); ctx.arc(x, y, rand(i * 11) * 15 + 3, 0, Math.PI * 2); ctx.fill()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function generateFallbackRoughness(type: TextureType, seed: number): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  const base = type === 'concrete' ? 180 : type === 'rustMetal' ? 120 : 40
  ctx.fillStyle = `rgb(${base},${base},${base})`
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 500; i++) {
    const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
    const v = base + rand(i * 5) * 60 - 30
    ctx.fillStyle = `rgba(${v},${v},${v},0.15)`
    ctx.fillRect(x, y, 3, 3)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function generateFallbackNormal(seed: number): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  const imageData = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      imageData.data[idx] = 128 + Math.round((rand(x * 3 + y * 5) - 0.5) * 30)
      imageData.data[idx + 1] = 128 + Math.round((rand(x * 7 + y * 11) - 0.5) * 30)
      imageData.data[idx + 2] = 255
      imageData.data[idx + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function generateFallbackMetalness(seed: number): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rand = (s: number) => {
    const x = Math.sin(s * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  ctx.fillStyle = '#888888'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 200; i++) {
    const x = rand(i * 3) * size, y = rand(i * 3 + 1) * size
    const v = 100 + rand(i * 5) * 155
    ctx.fillStyle = `rgba(${v},${v},${v},0.3)`
    ctx.beginPath(); ctx.arc(x, y, rand(i * 7) * 8 + 2, 0, Math.PI * 2); ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/* ───────── 纹理加载器 ───────── */

const textureLoader = new THREE.TextureLoader()
const textureCache = new Map<string, THREE.Texture | null>()

function loadTexture(url: string): Promise<THREE.Texture | null> {
  if (textureCache.has(url)) {
    return Promise.resolve(textureCache.get(url) ?? null)
  }
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        textureCache.set(url, tex)
        resolve(tex)
      },
      undefined,
      () => {
        console.warn(`[PBRTextureLoader] 贴图加载失败: ${url}，使用 fallback`)
        textureCache.set(url, null)
        resolve(null)
      }
    )
  })
}

/* ───────── 导出：加载一组 PBR 纹理 ───────── */

export async function loadPBRTextures(type: TextureType, seed: number): Promise<PBRTextureSet> {
  const paths = TEXTURE_PATHS[type]

  const [color, roughness, normal, metalness] = await Promise.all([
    paths.color ? loadTexture(paths.color) : Promise.resolve(null),
    paths.roughness ? loadTexture(paths.roughness) : Promise.resolve(null),
    paths.normal ? loadTexture(paths.normal) : Promise.resolve(null),
    paths.metalness ? loadTexture(paths.metalness) : Promise.resolve(null),
  ])

  const result = {
    color: color || generateFallbackColor(type, seed),
    roughness: roughness || generateFallbackRoughness(type, seed),
    normal: normal || generateFallbackNormal(seed),
    metalness: metalness || generateFallbackMetalness(seed),
  }
  return result
}

/* ───────── 导出：同步获取 Fallback 材质（用于初始渲染） ───────── */

export function createFallbackMaterial(type: TextureType, seed: number): THREE.MeshStandardMaterial {
  const baseColors: Record<TextureType, string> = {
    concrete: '#5a5a6a',
    rustMetal: '#4a3020',
    dirtyGlass: '#2a3a5a',
  }
  const metalness: Record<TextureType, number> = {
    concrete: 0.0,
    rustMetal: 0.6,
    dirtyGlass: 0.9,
  }
  const roughness: Record<TextureType, number> = {
    concrete: 0.85,
    rustMetal: 0.35,
    dirtyGlass: 0.05,
  }

  return new THREE.MeshStandardMaterial({
    color: baseColors[type],
    metalness: metalness[type],
    roughness: roughness[type],
    map: generateFallbackColor(type, seed),
    roughnessMap: generateFallbackRoughness(type, seed),
    normalMap: generateFallbackNormal(seed),
    normalScale: new THREE.Vector2(1.5, 1.5),
    envMapIntensity: type === 'dirtyGlass' ? 2.0 : 1.0,
  })
}
