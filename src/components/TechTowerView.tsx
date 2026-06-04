import React, { useRef, useMemo, useState, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Text, Float } from '@react-three/drei'
import * as THREE from 'three'
import { AgentRole } from '../modules/agentTypes'

/* ───────── 类型 ───────── */

interface TeamMember { id: string; name: string; role: AgentRole; title: string; description: string }

interface ProjectDept {
  deptId: string; name: string; icon: string; color: string; accent: string
  desc: string; projectType: string; keywords: string[]; successRate: number; team: TeamMember[]
}

interface Project {
  id: string; name: string; description: string
  selectedDeptIds: string[]; status: 'planning' | 'active' | 'completed'
  createdAt: number; iterations: number
}

/* ───────── 预设部门 ───────── */

const DEFAULT_DEPTS: ProjectDept[] = [
  {
    deptId: 'dept-software', name: '软件产品部', icon: '💻', color: '#0a84ff', accent: '#64d2ff',
    desc: '全栈软件产品开发：从需求分析到部署上线', projectType: 'Web应用/小程序/API',
    keywords: ['React', 'Python', '数据库', 'Docker'], successRate: 0.88,
    team: [
      { id: 'pm-sw', name: '张浩然', role: AgentRole.Coordinator, title: '产品经理', description: '需求分析与项目管理' },
      { id: 'arch-sw', name: '林沐阳', role: AgentRole.Planner, title: '架构师', description: '系统设计与技术选型' },
      { id: 'fe-sw', name: '陈思远', role: AgentRole.Executor, title: '前端工程师', description: 'React/Vue 组件开发' },
      { id: 'be-sw', name: '王铭泽', role: AgentRole.Executor, title: '后端工程师', description: 'API/数据库/微服务' },
      { id: 'qa-sw', name: '郑雅琪', role: AgentRole.Reviewer, title: 'QA 工程师', description: '测试与质量保障' },
      { id: 'ops-sw', name: '杨启明', role: AgentRole.Monitor, title: 'DevOps', description: 'CI/CD 与部署运维' },
    ],
  },
  {
    deptId: 'dept-ai-movie', name: 'AI 影视部', icon: '🎬', color: '#ff375f', accent: '#ff6b8a',
    desc: 'AI 驱动的影视内容创作：从剧本到成片', projectType: '短视频/动画/广告片',
    keywords: ['剧本', '分镜', '图像生成', '视频生成'], successRate: 0.82,
    team: [
      { id: 'dir-mv', name: '周子轩', role: AgentRole.Coordinator, title: '导演', description: '创意把控与整体调度' },
      { id: 'write-mv', name: '钱文静', role: AgentRole.Planner, title: '编剧', description: '剧本创作与分镜设计' },
      { id: 'img-mv', name: '赵雪晴', role: AgentRole.Executor, title: '图像生成师', description: 'Stable Diffusion/Midjourney' },
      { id: 'vid-mv', name: '孙博文', role: AgentRole.Executor, title: '视频生成师', description: 'Runway/Pika 视频合成' },
      { id: 'edit-mv', name: '黄雨萱', role: AgentRole.Executor, title: '剪辑师', description: '剪辑/调色/特效' },
      { id: 'snd-mv', name: '韩志远', role: AgentRole.Reviewer, title: '音效师', description: '配乐/音效/混音' },
    ],
  },
  {
    deptId: 'dept-data', name: '数据智能部', icon: '📊', color: '#bf5af2', accent: '#d4a0ff',
    desc: '数据驱动的分析与 AI 项目', projectType: '数据分析/ML/BI报表',
    keywords: ['Python', 'ML', '可视化', 'ETL'], successRate: 0.85,
    team: [
      { id: 'lead-da', name: '沈梦溪', role: AgentRole.Coordinator, title: '数据负责人', description: '需求拆解与分析策略' },
      { id: 'eng-da', name: '陆子安', role: AgentRole.Executor, title: '数据工程师', description: '数据采集/清洗/ETL' },
      { id: 'ana-da', name: '李若涵', role: AgentRole.Executor, title: '分析师', description: '统计分析与洞察' },
      { id: 'ml-da', name: '唐雨桐', role: AgentRole.Executor, title: 'ML 工程师', description: '模型训练与部署' },
      { id: 'vis-da', name: '马思雨', role: AgentRole.Reviewer, title: '可视化工程师', description: '图表/报表/大屏' },
    ],
  },
  {
    deptId: 'dept-content', name: '内容创作部', icon: '✍️', color: '#ff9f0a', accent: '#ffb340',
    desc: '图文内容创作：从策划到发布', projectType: '公众号/博客/营销文案',
    keywords: ['写作', '排版', 'SEO', '社媒'], successRate: 0.90,
    team: [
      { id: 'lead-ct', name: '吴天宇', role: AgentRole.Coordinator, title: '内容总监', description: '选题策划与风格把控' },
      { id: 'write-ct', name: '宋子琪', role: AgentRole.Executor, title: '撰稿人', description: '深度文章与技术写作' },
      { id: 'edit-ct', name: '冯子豪', role: AgentRole.Reviewer, title: '编辑', description: '审校/润色/事实核查' },
      { id: 'design-ct', name: '许晨曦', role: AgentRole.Executor, title: '美术设计', description: '配图/封面/排版设计' },
    ],
  },
  {
    deptId: 'dept-ppt', name: '演示设计部', icon: '🎯', color: '#30d158', accent: '#5e9e6b',
    desc: '专业演示与设计：从内容梳理到视觉呈现', projectType: 'PPT/路演/汇报/培训',
    keywords: ['PPT', '设计', '图表', '动画'], successRate: 0.87,
    team: [
      { id: 'lead-ppt', name: '刘子墨', role: AgentRole.Coordinator, title: '项目负责人', description: '需求沟通与内容梳理' },
      { id: 'struct-ppt', name: '张浩然', role: AgentRole.Planner, title: '内容架构师', description: '逻辑结构与故事线' },
      { id: 'design-ppt', name: '赵雪晴', role: AgentRole.Executor, title: '视觉设计师', description: '版式/配色/图表设计' },
      { id: 'anim-ppt', name: '周子轩', role: AgentRole.Executor, title: '动画工程师', description: '转场/动画/交互效果' },
    ],
  },
]

/* ───────── 常量 ───────── */

const BUILDING_W = 10
const BUILDING_D = 8
const BUILDING_H = 28
const FLOOR_H = BUILDING_H / 8
const PENTHOUSE_H = 5
const PENTHOUSE_Y = BUILDING_H + PENTHOUSE_H / 2

const FLOOR_LABELS = [
  '技能训练场', '研发实验室', '数据中心', '创意工坊',
  '设计工场', '测试中心', '协作空间', '项目工作间',
]

const DEPT_COLORS = ['#0a84ff', '#ff375f', '#bf5af2', '#ff9f0a', '#30d158']

/* ───────── 辅助：玻璃材质 ───────── */

function useGlassMaterial(tint: string, transmission = 0.8) {
  return useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint),
    transmission,
    roughness: 0.05,
    thickness: 0.5,
    opacity: 0.3,
    transparent: true,
    side: THREE.DoubleSide,
  }), [tint, transmission])
}

function useEdgeLines(color: string) {
  return useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(color) }), [color])
}

/* ───────── 楼层间隔线 ───────── */

function FloorLines() {
  const geo = useMemo(() => {
    const positions: number[] = []
    for (let i = 1; i < 5; i++) {
      const y = i * FLOOR_H
      const hw = BUILDING_W / 2, hd = BUILDING_D / 2
      positions.push(-hw, y, -hd, hw, y, -hd, hw, y, -hd, hw, y, hd,
        hw, y, hd, -hw, y, hd, -hw, y, hd, -hw, y, -hd)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [])

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#64d2ff" transparent opacity={0.6} />
    </lineSegments>
  )
}

/* ───────── 建筑主体 ───────── */

function BuildingBody() {
  const boxGeo = useMemo(() => new THREE.BoxGeometry(BUILDING_W, BUILDING_H, BUILDING_D), [])
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a0a1a', roughness: 0.8, metalness: 0.2,
  }), [])

  return (
    <group position={[0, BUILDING_H / 2, 0]}>
      <mesh geometry={boxGeo} material={bodyMat} castShadow receiveShadow />
      <FloorLines />
    </group>
  )
}

/* ───────── 玻璃幕墙面板 ───────── */

function GlassCurtainWall() {
  const panels = useMemo(() => {
    const arr: { pos: [number, number, number]; size: [number, number]; face: 'front' | 'back' | 'left' | 'right' }[] = []
    for (let floor = 0; floor < 8; floor++) {
      const y = floor * FLOOR_H + FLOOR_H / 2
      for (let col = 0; col < 3; col++) {
        const pw = BUILDING_W / 3 - 0.15
        const ph = FLOOR_H - 0.2
        const xBase = (col - 1) * (BUILDING_W / 3)
        arr.push({ pos: [xBase, y, BUILDING_D / 2 + 0.03], size: [pw, ph], face: 'front' })
        arr.push({ pos: [xBase, y, -BUILDING_D / 2 - 0.03], size: [pw, ph], face: 'back' })
      }
      for (let col = 0; col < 3; col++) {
        const pw = BUILDING_D / 3 - 0.15
        const ph = FLOOR_H - 0.2
        const zBase = (col - 1) * (BUILDING_D / 3)
        arr.push({ pos: [BUILDING_W / 2 + 0.03, y, zBase], size: [pw, ph], face: 'right' })
        arr.push({ pos: [-BUILDING_W / 2 - 0.03, y, zBase], size: [pw, ph], face: 'left' })
      }
    }
    return arr
  }, [])

  return (
    <group>
      {panels.map((p, i) => (
        <GlassPanel key={i} position={p.pos} size={p.size} face={p.face} floor={Math.floor(i / 12)} />
      ))}
    </group>
  )
}

function GlassPanel({ position, size, face, floor }: {
  position: [number, number, number]; size: [number, number]; face: string; floor: number
}) {
  const mat = useGlassMaterial(DEPT_COLORS[floor % DEPT_COLORS.length], 0.75 + (floor % 3) * 0.05)
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0], size[1], 0.05)), [size])
  const edgeMat = useEdgeLines('#64d2ff')

  const rotation: [number, number, number] = useMemo(() => {
    if (face === 'right' || face === 'left') return [0, Math.PI / 2, 0]
    return [0, 0, 0]
  }, [face])

  return (
    <group position={position} rotation={rotation}>
      <mesh material={mat} castShadow>
        <boxGeometry args={[size[0], size[1], 0.05]} />
      </mesh>
      <lineSegments geometry={edgeGeo} material={edgeMat} />
    </group>
  )
}

/* ───────── CEO 顶层公寓 ───────── */

function PenthouseFloor() {
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a1832', roughness: 0.6, metalness: 0.3,
  }), [])
  return (
    <mesh position={[0, BUILDING_H + 0.05, 0]} receiveShadow material={floorMat}>
      <boxGeometry args={[BUILDING_W + 0.5, 0.1, BUILDING_D + 0.5]} />
    </mesh>
  )
}

function PenthouseWalls() {
  const hw = BUILDING_W / 2, hd = BUILDING_D / 2
  const wh = PENTHOUSE_H

  const walls = useMemo(() => [
    { pos: [0, PENTHOUSE_Y, hd + 0.02] as [number, number, number], size: [BUILDING_W, wh] as [number, number], rot: [0, 0, 0] as [number, number, number] },
    { pos: [0, PENTHOUSE_Y, -hd - 0.02] as [number, number, number], size: [BUILDING_W, wh] as [number, number], rot: [0, 0, 0] as [number, number, number] },
    { pos: [hw + 0.02, PENTHOUSE_Y, 0] as [number, number, number], size: [BUILDING_D, wh] as [number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] },
    { pos: [-hw - 0.02, PENTHOUSE_Y, 0] as [number, number, number], size: [BUILDING_D, wh] as [number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] },
  ], [])

  return (
    <group>
      {walls.map((w, i) => (
        <group key={i} position={w.pos} rotation={w.rot}>
          <mesh>
            <boxGeometry args={[w.size[0], w.size[1], 0.05]} />
            <meshPhysicalMaterial
              color="#88ccff"
              transmission={0.6}
              roughness={0.08}
              thickness={1.5}
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}



/* ───────── 家具 ───────── */

function Desk() {
  const topMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a1a0a', roughness: 0.7 }), [])
  const legMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1008', roughness: 0.8 }), [])

  const deskY = BUILDING_H + 1
  return (
    <group position={[0, deskY, 0]}>
      {/* 桌面 */}
      <mesh material={topMat} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.1, 1.2]} />
      </mesh>
      {/* 桌腿 */}
      {[[-1.1, -0.45, -0.5], [1.1, -0.45, -0.5], [-1.1, -0.45, 0.5], [1.1, -0.45, 0.5]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} material={legMat}>
          <boxGeometry args={[0.08, 0.8, 0.08]} />
        </mesh>
      ))}
    </group>
  )
}

function ComputerScreen() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * 2) * 0.3
    }
  })

  const screenY = BUILDING_H + 1.2
  return (
    <group position={[0, screenY, -0.2]}>
      {/* 屏幕 */}
      <mesh ref={ref} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.03]} />
        <meshStandardMaterial color="#64d2ff" emissive="#64d2ff" emissiveIntensity={0.8} />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, -0.3, 0.05]}>
        <boxGeometry args={[0.3, 0.1, 0.15]} />
        <meshStandardMaterial color="#1a1a2a" />
      </mesh>
    </group>
  )
}

function Chair() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a30', roughness: 0.6 }), [])
  const chairY = BUILDING_H + 1
  return (
    <group position={[0, chairY, 1]}>
      {/* 座面 */}
      <mesh material={mat} castShadow>
        <boxGeometry args={[0.6, 0.08, 0.6]} />
      </mesh>
      {/* 靠背 */}
      <mesh position={[0, 0.35, -0.27]} material={mat}>
        <boxGeometry args={[0.6, 0.65, 0.06]} />
      </mesh>
      {/* 椅腿 */}
      {[[-0.25, -0.35, -0.25], [0.25, -0.35, -0.25], [-0.25, -0.35, 0.25], [0.25, -0.35, 0.25]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <cylinderGeometry args={[0.02, 0.02, 0.65, 6]} />
          <meshStandardMaterial color="#0a0a15" />
        </mesh>
      ))}
    </group>
  )
}

function Minibar() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.4 + Math.sin(clock.elapsedTime * 1.5) * 0.2
    }
  })

  const barY = BUILDING_H + 1.6
  return (
    <group position={[-3.5, barY, -2.5]}>
      <mesh castShadow>
        <boxGeometry args={[0.8, 2.5, 0.5]} />
        <meshStandardMaterial color="#1a1020" roughness={0.5} />
      </mesh>
      <mesh ref={ref} position={[0, 0.2, 0.26]}>
        <boxGeometry args={[0.6, 0.3, 0.02]} />
        <meshStandardMaterial color="#bf5af2" emissive="#bf5af2" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

function Plant() {
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.2) * 0.05
    }
  })

  const plantY = BUILDING_H + 1.5
  return (
    <group position={[3.5, plantY, -2.8]}>
      {/* 花盆 */}
      <mesh castShadow>
        <coneGeometry args={[0.35, 0.6, 6]} />
        <meshStandardMaterial color="#6a4a30" roughness={0.8} />
      </mesh>
      {/* 树叶 */}
      <group ref={ref} position={[0, 0.8, 0]}>
        <mesh>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#2a6a2a" roughness={0.7} flatShading />
        </mesh>
        <mesh position={[0.3, 0.3, 0.2]}>
          <icosahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#3a8a3a" roughness={0.7} flatShading />
        </mesh>
      </group>
    </group>
  )
}

function CEOPerson() {
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = BUILDING_H + 1.7 + Math.sin(clock.elapsedTime * 1.5) * 0.03
    }
  })

  return (
    <group ref={ref} position={[0, BUILDING_H + 1.7, 0.7]}>
      {/* 身体 */}
      <mesh castShadow>
        <capsuleGeometry args={[0.2, 0.6, 8, 16]} />
        <meshStandardMaterial color="#1a1a30" roughness={0.6} />
      </mesh>
      {/* 头 */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#e8c4a0" roughness={0.8} />
      </mesh>
      {/* 领带 */}
      <mesh position={[0, 0.05, 0.2]}>
        <boxGeometry args={[0.06, 0.3, 0.02]} />
        <meshStandardMaterial color="#bf5af2" emissive="#bf5af2" emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

/* ───────── 全息AI助手 ───────── */

function HolographicAI() {
  const ref = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      ref.current.position.y = PENTHOUSE_Y + 2 + Math.sin(t * 1.2) * 0.4
      ref.current.rotation.y = t * 0.5
      ref.current.rotation.x = Math.sin(t * 0.8) * 0.2
    }
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.3
      glowRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.1)
    }
  })

  return (
    <group position={[2, 0, 0]}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.4, 1]} />
        <meshStandardMaterial
          color="#bf5af2"
          emissive="#bf5af2"
          emissiveIntensity={0.8}
          transparent
          opacity={0.6}
          wireframe
        />
      </mesh>
      <mesh ref={glowRef} position={[2, PENTHOUSE_Y + 2, 0]}>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshStandardMaterial
          color="#bf5af2"
          emissive="#bf5af2"
          emissiveIntensity={0.6}
          transparent
          opacity={0.15}
        />
      </mesh>
      <Float speed={2} floatIntensity={0.3}>
        <Text
          position={[2, PENTHOUSE_Y + 3, 0]}
          fontSize={0.3}
          color="#bf5af2"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          AI 助手
        </Text>
      </Float>
    </group>
  )
}

/* ───────── 霓虹边缘脉冲 ───────── */

function NeonEdges() {
  const ref = useRef<THREE.LineSegments>(null!)

  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.LineBasicMaterial
      m.opacity = 0.5 + Math.sin(clock.elapsedTime * 1.5) * 0.3
    }
  })

  const geo = useMemo(() => {
    // 只画 4 条竖向边线（大楼四角），不画顶/底水平矩形
    const hw = BUILDING_W / 2 + 0.05
    const hd = BUILDING_D / 2 + 0.05
    const h = BUILDING_H + 0.5
    const positions: number[] = []
    positions.push(-hw, -h / 2, -hd,  -hw, h / 2, -hd)
    positions.push(hw, -h / 2, -hd,   hw, h / 2, -hd)
    positions.push(-hw, -h / 2, hd,   -hw, h / 2, hd)
    positions.push(hw, -h / 2, hd,    hw, h / 2, hd)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [])

  return (
    <lineSegments
      ref={ref}
      geometry={geo}
      position={[0, BUILDING_H / 2, 0]}
    >
      <lineBasicMaterial color="#64d2ff" transparent opacity={0.6} />
    </lineSegments>
  )
}

/* ───────── 浮动标签 ───────── */

function FloorLabels() {
  return (
    <group>
      {FLOOR_LABELS.map((label, i) => (
        <Float key={i} speed={1.5} floatIntensity={0.3} rotationIntensity={0}>
          <Text
            position={[BUILDING_W / 2 + 1.5, i * FLOOR_H + FLOOR_H / 2, 0]}
            fontSize={0.4}
            color="#64d2ff"
            anchorX="left"
            anchorY="middle"
          >
            {label}
          </Text>
        </Float>
      ))}
    </group>
  )
}

function CEOTextLabel() {
  return (
    <Float speed={2} floatIntensity={0.5} rotationIntensity={0}>
      <Text
        position={[0, BUILDING_H + PENTHOUSE_H + 3, 0]}
        fontSize={0.7}
        color="#bf5af2"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        CEO PENTHOUSE
      </Text>
    </Float>
  )
}

/* ───────── 地面平台 ───────── */

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial color="#080810" roughness={1} metalness={0} />
    </mesh>
  )
}

/* ───────── 信号塔天线 ───────── */

function Antenna() {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * 3) * 0.5
    }
  })

  const topY = BUILDING_H + PENTHOUSE_H + 2
  return (
    <group position={[3.5, 0, -3]}>
      {/* 杆 */}
      <mesh position={[0, topY, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 4, 6]} />
        <meshStandardMaterial color="#2a2a3a" />
      </mesh>
      {/* 信号灯 */}
      <mesh ref={ref} position={[0, topY + 2, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#64d2ff" emissive="#64d2ff" emissiveIntensity={0.8} />
      </mesh>
    </group>
  )
}

/* ───────── 完整 3D 场景 ───────── */

function Scene() {
  const [hovering, setHovering] = useState(false)
  const onEnter = useCallback(() => setHovering(true), [])
  const onLeave = useCallback(() => setHovering(false), [])

  return (
    <>
      <ambientLight intensity={0.15} color="#1a1a3a" />
      <directionalLight
        position={[15, 30, 10]}
        intensity={0.8}
        color="#e0e0ff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <pointLight position={[0, 32, 0]} intensity={1.5} color="#bf5af2" distance={20} />
      <pointLight position={[0, 28, 5]} intensity={1} color="#64d2ff" distance={15} />
      <pointLight position={[0, 26, 0]} intensity={0.8} color="#ffb347" distance={10} />

      <OrbitControls
        target={[0, PENTHOUSE_Y, 0]}
        enablePan={hovering}
        enableRotate={!hovering}
        panSpeed={1.5}
        rotateSpeed={0.8}
        minDistance={10}
        maxDistance={60}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.1}
        mouseButtons={{
          LEFT: hovering ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
        }}
      />

      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />

      <Ground />
      <BuildingBody />
      <GlassCurtainWall />
      <NeonEdges />

      {/* 透明碰撞检测层：覆盖整栋楼+顶层公寓，鼠标悬停时切换为拖动模式 */}
      <mesh
        position={[0, (BUILDING_H + PENTHOUSE_H) / 2, 0]}
        onPointerOver={onEnter}
        onPointerOut={onLeave}
      >
        <boxGeometry args={[BUILDING_W + 1, BUILDING_H + PENTHOUSE_H + 2, BUILDING_D + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <PenthouseFloor />
      <PenthouseWalls />

      <Desk />
      <ComputerScreen />
      <Chair />
      <Minibar />
      <Plant />
      <CEOPerson />
      <HolographicAI />
      <Antenna />

      <FloorLabels />
      <CEOTextLabel />
    </>
  )
}

/* ───────── 按钮覆盖层 ───────── */

function OverlayButtons({ onStartMeeting, onBackToSingle }: {
  onStartMeeting: () => void; onBackToSingle: () => void
}) {
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 12, zIndex: 10,
    }}>
      <button onClick={onBackToSingle} style={{
        padding: '10px 20px',
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(191,90,242,0.4)',
        borderRadius: 10,
        color: '#8899b4',
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'inherit',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.2s',
      }}>
        ← 返回
      </button>
      <button onClick={onStartMeeting} style={{
        padding: '10px 24px',
        background: 'linear-gradient(135deg, rgba(191,90,242,0.8), rgba(94,92,230,0.8))',
        border: '1px solid rgba(191,90,242,0.6)',
        borderRadius: 10,
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: '0 0 20px rgba(191,90,242,0.3), 0 4px 16px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.2s',
      }}>
        🚀 启动AI会议
      </button>
    </div>
  )
}

/* ───────── 主组件 ───────── */

interface TechTowerViewProps {
  onStartMeeting: () => void
  onSendTask: (description: string) => void
  onBackToSingle: () => void
}

export default function TechTowerView({ onStartMeeting, onSendTask, onBackToSingle }: TechTowerViewProps) {
  void onSendTask
  void DEFAULT_DEPTS

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#050510' }}>
      <Canvas
        shadows
        camera={{ position: [30, 38, 30], fov: 40 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene />
      </Canvas>
      <OverlayButtons onStartMeeting={onStartMeeting} onBackToSingle={onBackToSingle} />
    </div>
  )
}
