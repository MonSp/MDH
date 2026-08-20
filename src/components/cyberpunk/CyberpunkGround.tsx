import React, { useEffect } from 'react'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { loadPBRTextures } from './PBRTextureLoader'
import RoadsFlat, { roadMaterial } from './RoadsFlat'
import NeonLinesFlat from './NeonLinesFlat'
import { GROUND_SIZE, sidewalkMaterial, plazaMaterial } from './CyberpunkGround.materials'
import {
  Plaza, Curbs, Sidewalks, GrassAreas, OuterDecorations,
  NeonRoadLines, NeonPuddles,
} from './CyberpunkGround.components'

/* ───────── 赛博朋克城市地面系统 ───────── */

export default function CyberpunkGround({ showNeonLines = true }: { showNeonLines?: boolean }) {
  // 异步加载 PBR 贴图，应用到马路和人行道材质
  useEffect(() => {
    let cancelled = false

    // 主干道使用带标线的路面贴图
    loadPBRTextures('roadMarked', 1000).then(set => {
      if (cancelled) return
      if (set.color) {
        set.color.wrapS = THREE.RepeatWrapping
        set.color.wrapT = THREE.RepeatWrapping
        set.color.repeat.set(8, 8)
      }
      if (set.roughness) {
        set.roughness.wrapS = THREE.RepeatWrapping
        set.roughness.wrapT = THREE.RepeatWrapping
        set.roughness.repeat.set(8, 8)
      }
      if (set.normal) {
        set.normal.wrapS = THREE.RepeatWrapping
        set.normal.wrapT = THREE.RepeatWrapping
        set.normal.repeat.set(8, 8)
      }
      roadMaterial.map = set.color
      roadMaterial.roughnessMap = set.roughness
      roadMaterial.normalMap = set.normal
      roadMaterial.normalScale = new THREE.Vector2(1.5, 1.5)
      roadMaterial.roughness = 0.35
      roadMaterial.metalness = 0.25
      // 提高亮度确保俯视可见
      roadMaterial.color.set('#5a5a75')
      roadMaterial.emissive.set('#2a2a45')
      roadMaterial.emissiveIntensity = 0.9
      roadMaterial.needsUpdate = true
    })

    // 人行道使用混凝土贴图
    loadPBRTextures('concrete', 2000).then(set => {
      if (cancelled) return
      if (set.color) {
        set.color.wrapS = THREE.RepeatWrapping
        set.color.wrapT = THREE.RepeatWrapping
        set.color.repeat.set(6, 6)
      }
      if (set.roughness) {
        set.roughness.wrapS = THREE.RepeatWrapping
        set.roughness.wrapT = THREE.RepeatWrapping
        set.roughness.repeat.set(6, 6)
      }
      if (set.normal) {
        set.normal.wrapS = THREE.RepeatWrapping
        set.normal.wrapT = THREE.RepeatWrapping
        set.normal.repeat.set(6, 6)
      }
      sidewalkMaterial.map = set.color
      sidewalkMaterial.roughnessMap = set.roughness
      sidewalkMaterial.normalMap = set.normal
      sidewalkMaterial.normalScale = new THREE.Vector2(1.2, 1.2)
      sidewalkMaterial.needsUpdate = true
    })

    // 广场使用水磨石贴图
    loadPBRTextures('terrazzo', 3000).then(set => {
      if (cancelled) return
      if (set.color) {
        set.color.wrapS = THREE.RepeatWrapping
        set.color.wrapT = THREE.RepeatWrapping
        set.color.repeat.set(4, 4)
      }
      if (set.roughness) {
        set.roughness.wrapS = THREE.RepeatWrapping
        set.roughness.wrapT = THREE.RepeatWrapping
        set.roughness.repeat.set(4, 4)
      }
      if (set.normal) {
        set.normal.wrapS = THREE.RepeatWrapping
        set.normal.wrapT = THREE.RepeatWrapping
        set.normal.repeat.set(4, 4)
      }
      plazaMaterial.map = set.color
      plazaMaterial.roughnessMap = set.roughness
      plazaMaterial.normalMap = set.normal
      plazaMaterial.normalScale = new THREE.Vector2(1.0, 1.0)
      plazaMaterial.needsUpdate = true
    })

    return () => { cancelled = true }
  }, [])

  return (
    <group>
      {/* 基础地面 — 潮湿霓虹反射 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <MeshReflectorMaterial
          blur={[400, 400]}
          resolution={1024}
          mixBlur={6}
          mixStrength={80}
          roughness={0.35}
          depthScale={1.2}
          color="#111122"
          metalness={0.3}
        />
      </mesh>

      {/* 功能区域 */}
      <Plaza />
      <RoadsFlat />
      <Curbs />
      <Sidewalks />
      <GrassAreas />
      <OuterDecorations />

      {/* 霓虹线（可开关） */}
      {showNeonLines && <NeonLinesFlat />}
      {showNeonLines && <NeonPuddles />}
    </group>
  )
}