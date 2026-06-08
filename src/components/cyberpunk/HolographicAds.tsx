import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { BuildingData } from './CyberpunkBuildings'

/* ───────── 全息广告牌 / 霓虹招牌 ───────── */

interface AdData {
  id: number
  position: [number, number, number]
  rotation: [number, number, number]
  text: string
  color: string
  width: number
  height: number
  type: 'billboard' | 'sign' | 'hologram'
}

function generateAdsNearBuildings(buildings: BuildingData[]): AdData[] {
  const adTexts = [
    { text: 'AI', color: '#0a84ff' },
    { text: 'NEURAL', color: '#bf5af2' },
    { text: 'CYBER', color: '#ff375f' },
    { text: 'DATA', color: '#30d158' },
    { text: 'SYNC', color: '#ff9f0a' },
    { text: 'LINK', color: '#64d2ff' },
    { text: '量子网络', color: '#bf5af2' },
    { text: '虚拟空间', color: '#0a84ff' },
    { text: '神经接口', color: '#ff375f' },
    { text: '数据洪流', color: '#30d158' },
    { text: 'NEXUS', color: '#64d2ff' },
    { text: 'MATRIX', color: '#ff9f0a' },
  ]

  const ads: AdData[] = []
  const types: AdData['type'][] = ['billboard', 'sign', 'hologram']
  let adId = 0

  // 为每栋建筑分配0-2个广告牌，紧贴建筑立面
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi]
    const adCount = Math.floor(bi * 7.3) % 3 // 0, 1, or 2 ads per building
    for (let ai = 0; ai < adCount; ai++) {
      const ad = adTexts[adId % adTexts.length]
      // 选择建筑的4个面之一
      const face = (bi * 3 + ai * 7) % 4
      const yPos = 2 + (ai * b.height * 0.4) + (bi * 1.7) % (b.height * 0.5)
      let x = b.position[0], z = b.position[2]
      let rotY = 0
      const offset = 0.1 // 贴建筑表面的偏移
      if (face === 0) { x += b.width / 2 + offset; rotY = Math.PI / 2 }
      else if (face === 1) { x -= b.width / 2 + offset; rotY = -Math.PI / 2 }
      else if (face === 2) { z += b.depth / 2 + offset; rotY = Math.PI }
      else { z -= b.depth / 2 + offset; rotY = 0 }

      ads.push({
        id: adId++,
        position: [x, yPos, z],
        rotation: [0, rotY, 0],
        text: ad.text,
        color: ad.color,
        width: 1.5 + (bi * 0.3) % 2.5,
        height: 0.6 + (bi * 0.17) % 1.0,
        type: types[(bi + ai) % 3],
      })
    }
  }
  return ads
}

/* 霓虹边框 */
function NeonBorder({ width, height, color }: { width: number; height: number; color: string }) {
  const geo = useMemo(() => {
    const hw = width / 2, hh = height / 2
    const positions: number[] = []
    // 矩形四边
    positions.push(-hw, -hh, 0, hw, -hh, 0)
    positions.push(hw, -hh, 0, hw, hh, 0)
    positions.push(hw, hh, 0, -hw, hh, 0)
    positions.push(-hw, hh, 0, -hw, -hh, 0)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [width, height])

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={0.8} />
    </lineSegments>
  )
}

/* 单个广告牌 */
function HolographicAd({ data }: { data: AdData }) {
  const groupRef = useRef<THREE.Group>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime

    // 广告牌微微晃动
    if (data.type === 'hologram') {
      groupRef.current.position.y = data.position[1] + Math.sin(t * 1.5) * 0.3
    }

    // 辉光脉冲
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.5 + Math.sin(t * 2 + data.id) * 0.3
      m.opacity = 0.15 + Math.sin(t * 2.5 + data.id) * 0.08
    }
  })

  return (
    <group ref={groupRef} position={data.position} rotation={data.rotation}>
      {/* 背景板 */}
      <mesh>
        <planeGeometry args={[data.width, data.height]} />
        <meshStandardMaterial
          color="#151530"
          transparent
          opacity={data.type === 'hologram' ? 0.15 : 0.7}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 文字 */}
      <Text
        position={[0, 0, 0.02]}
        fontSize={data.height * 0.5}
        color={data.color}
        anchorX="center"
        anchorY="middle"
        font={undefined}
      >
        {data.text}
      </Text>

      {/* 霓虹边框 */}
      {data.type !== 'hologram' && (
        <NeonBorder width={data.width} height={data.height} color={data.color} />
      )}

      {/* 辉光背景 */}
      <mesh ref={glowRef} position={[0, 0, -0.02]}>
        <planeGeometry args={[data.width + 0.8, data.height + 0.8]} />
        <meshStandardMaterial
          color={data.color}
          emissive={data.color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 全息扫描线（仅全息类型） */}
      {data.type === 'hologram' && (
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[data.width, 0.02]} />
          <meshStandardMaterial
            color={data.color}
            emissive={data.color}
            emissiveIntensity={1}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {/* 支架（仅标牌类型） */}
      {data.type === 'sign' && (
        <mesh position={[0, -data.height / 2 - 0.5, -0.1]}>
          <cylinderGeometry args={[0.03, 0.03, 1, 4]} />
          <meshStandardMaterial color="#3a3a5a" roughness={0.5} metalness={0.4} />
        </mesh>
      )}
    </group>
  )
}

/* ───────── 导出组件 ───────── */

export default function HolographicAds({ buildings }: { buildings: BuildingData[] }) {
  const ads = useMemo(() => generateAdsNearBuildings(buildings), [buildings])

  return (
    <group>
      {ads.map(ad => (
        <HolographicAd key={ad.id} data={ad} />
      ))}
    </group>
  )
}
