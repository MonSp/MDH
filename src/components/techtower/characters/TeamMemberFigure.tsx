import React, { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PersonFigure from './PersonFigure'

/* ───────── 团队成员小人（楼层标记上的迷你角色） ───────── */

export interface TeamMemberFigureProps {
  /** X 基础位置偏移 */
  x: number
  /** 部门/角色颜色 */
  color: string
  /** 动画延迟（用于错开各小人动作） */
  delay: number
}

export default function TeamMemberFigure({ x, color, delay }: TeamMemberFigureProps) {
  const ref = useRef<THREE.Group>(null!)
  const { camera } = useThree()
  const isNear = useRef(true)

  useFrame(({ clock }) => {
    if (ref.current) {
      const dist = camera.position.distanceTo(ref.current.position)
      isNear.current = dist < 40

      const t = clock.elapsedTime
      if (isNear.current) {
        ref.current.position.y = -0.5 + Math.sin(t * 2 + delay) * 0.03
        ref.current.position.x = x + Math.sin(t * 0.5 + delay) * 0.3
        ref.current.rotation.y = Math.sin(t * 0.5 + delay) > 0 ? 0.4 : -0.4
      } else {
        ref.current.position.y = -0.5
        ref.current.position.x = x
        ref.current.rotation.y = 0
      }

      const targetScale = isNear.current ? 1 : 0.3
      ref.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1)
    }
  })

  return (
    <group ref={ref} position={[x, -0.5, 0.08]}>
      <PersonFigure
        bodyColor={color}
        bodyRadius={0.05}
        bodyHeight={0.12}
        headRadius={0.05}
        headOffsetY={0.14}
        bodyRoughness={0.6}
      />
    </group>
  )
}
