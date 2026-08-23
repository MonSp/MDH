import React, { useRef, useMemo } from 'react'
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
  /** agent 状态 */
  status?: 'idle' | 'working' | 'meeting' | 'wandering' | 'speaking' | 'done'
  /** 当前执行的工具名 */
  currentTool?: string
  /** artifact 数量 */
  artifactCount?: number
}

/** 状态 → 颜色映射 */
const STATUS_COLORS: Record<string, string> = {
  idle: '#4a9eff',
  working: '#ff9500',
  meeting: '#4a9eff',
  speaking: '#34c759',
  done: '#34c759',
  wandering: '#8e8e93',
}

export default function TeamMemberFigure({ x, color, delay, status, currentTool, artifactCount }: TeamMemberFigureProps) {
  const ref = useRef<THREE.Group>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()
  const isNear = useRef(true)

  const statusColor = useMemo(() => STATUS_COLORS[status || 'idle'] || color, [status, color])
  const isWorking = status === 'working' || status === 'speaking'

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

      // 状态光晕动画
      if (glowRef.current) {
        const mat = glowRef.current.material as THREE.MeshBasicMaterial
        if (isWorking) {
          // 工作中：脉冲效果
          const pulse = 0.5 + Math.sin(t * 4 + delay) * 0.5
          mat.opacity = 0.2 + pulse * 0.3
          glowRef.current.scale.setScalar(1.2 + pulse * 0.3)
        } else if (status === 'done') {
          // 完成：常亮绿色
          mat.opacity = 0.25
          glowRef.current.scale.setScalar(1.15)
        } else {
          // 静态：微弱光晕
          mat.opacity = 0.1
          glowRef.current.scale.setScalar(1.0)
        }
      }
    }
  })

  return (
    <group ref={ref} position={[x, -0.5, 0.08]}>
      {/* 状态光晕 */}
      <mesh ref={glowRef} position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <PersonFigure
        bodyColor={statusColor}
        bodyRadius={0.05}
        bodyHeight={0.12}
        headRadius={0.05}
        headOffsetY={0.14}
        bodyRoughness={0.6}
      />
    </group>
  )
}
