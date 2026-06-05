import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import PersonFigure from './PersonFigure'
import { BUILDING_H } from '../constants'

/* ───────── CEO 角色（顶层公寓） ───────── */

export default function CEOCharacter() {
  const ref = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = BUILDING_H + 1.7 + Math.sin(clock.elapsedTime * 1.5) * 0.03
    }
  })

  return (
    <group ref={ref} position={[0, BUILDING_H + 1.7, 0.7]}>
      <PersonFigure
        bodyColor="#1a1a30"
        skinColor="#e8c4a0"
        bodyRadius={0.2}
        bodyHeight={0.6}
        headRadius={0.18}
        headOffsetY={0.55}
        accessories={[
          {
            position: [0, 0.05, 0.2],
            geometry: <boxGeometry args={[0.06, 0.3, 0.02]} />,
            color: '#bf5af2',
            emissive: true,
            emissiveIntensity: 0.3,
          },
        ]}
      />
    </group>
  )
}
