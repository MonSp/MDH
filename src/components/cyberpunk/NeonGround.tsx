import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 赛博朋克地面：霓虹道路 + 装饰环 ───────── */

const GRID_SIZE = 120
const ROAD_WIDTH = 0.6
const ROAD_COUNT = 4

export default function NeonGround() {
  const roadRef = useRef<THREE.InstancedMesh>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // 道路材质 + 几何体
  const roadGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const roadMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a84ff',
    emissive: '#0a84ff',
    emissiveIntensity: 1.0,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  }), [])

  // 初始化道路实例
  useEffect(() => {
    if (!roadRef.current) return
    const roads = [
      { size: [GRID_SIZE, ROAD_WIDTH], rotZ: 0 },
      { size: [ROAD_WIDTH, GRID_SIZE], rotZ: 0 },
      { size: [ROAD_WIDTH, GRID_SIZE * Math.SQRT2], rotZ: Math.PI / 4 },
      { size: [ROAD_WIDTH, GRID_SIZE * Math.SQRT2], rotZ: -Math.PI / 4 },
    ]
    roads.forEach((r, i) => {
      dummy.position.set(0, 0.01, 0)
      dummy.rotation.set(-Math.PI / 2, 0, r.rotZ)
      dummy.scale.set(r.size[0], r.size[1], 1)
      dummy.updateMatrix()
      roadRef.current.setMatrixAt(i, dummy.matrix)
    })
    roadRef.current.instanceMatrix.needsUpdate = true
  }, [dummy])

  // 中心扩散环呼吸动画
  useFrame(({ clock }) => {
    if (ringRef.current) {
      const m = ringRef.current.material as THREE.MeshStandardMaterial
      m.opacity = 0.25 + Math.sin(clock.elapsedTime * 0.8) * 0.15
    }
  })

  return (
    <group>
      {/* 主干道路 */}
      <instancedMesh ref={roadRef} args={[roadGeo, roadMat, ROAD_COUNT]} />

      {/* 中心扩散环 */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[8, 8.5, 64]} />
        <meshStandardMaterial
          color="#0a84ff"
          emissive="#0a84ff"
          emissiveIntensity={1.2}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 外圈装饰环 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[20, 20.3, 64]} />
        <meshStandardMaterial
          color="#bf5af2"
          emissive="#bf5af2"
          emissiveIntensity={0.8}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 额外装饰环 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[35, 35.3, 64]} />
        <meshStandardMaterial
          color="#ff375f"
          emissive="#ff375f"
          emissiveIntensity={0.5}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 内圈能量环 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[3, 3.4, 64]} />
        <meshStandardMaterial
          color="#30d158"
          emissive="#30d158"
          emissiveIntensity={1.5}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
