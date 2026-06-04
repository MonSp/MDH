import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Text, Float, Billboard, Html } from '@react-three/drei'
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

/* ───────── 默认项目 ───────── */

const DEFAULT_PROJECTS: Project[] = [
  { id: 'proj-1', name: '智能客服系统', description: '基于 LLM 的多轮对话客服，支持知识库检索', selectedDeptIds: ['dept-software'], status: 'active', createdAt: Date.now() - 86400000 * 7, iterations: 12 },
  { id: 'proj-2', name: '品牌宣传片', description: 'AI 驱动的品牌宣传片，从脚本到成片', selectedDeptIds: ['dept-ai-movie'], status: 'active', createdAt: Date.now() - 86400000 * 3, iterations: 5 },
  { id: 'proj-3', name: '销售数据大屏', description: '实时销售数据可视化，集成多数据源', selectedDeptIds: ['dept-data', 'dept-software'], status: 'planning', createdAt: Date.now() - 86400000, iterations: 2 },
  { id: 'proj-4', name: '技术博客矩阵', description: '技术团队博客内容矩阵运营', selectedDeptIds: ['dept-content'], status: 'active', createdAt: Date.now() - 86400000 * 14, iterations: 28 },
  { id: 'proj-5', name: '融资路演PPT', description: 'A轮融资路演演示材料', selectedDeptIds: ['dept-ppt', 'dept-data'], status: 'completed', createdAt: Date.now() - 86400000 * 30, iterations: 8 },
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

function getFloorGradientColor(floor: number): string {
  // 底层(0-2) → 科技蓝，中层(3-5) → 紫蓝，顶层(6-7) → 暖金
  const colors = [
    '#0a84ff', '#1a6aff', '#2a50ff',  // 0-2: 科技蓝渐变
    '#5e56e0', '#7b59b6', '#9b59b6',  // 3-5: 紫蓝过渡
    '#ff9f0a', '#ffb340',              // 6-7: 暖金琥珀
  ]
  return colors[Math.min(floor, colors.length - 1)]
}

/* ───────── 辅助：玻璃材质 ───────── */

function useGlassMaterial(tint: string, transmission = 0.6) {
  return useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint),
    transmission,
    roughness: 0.12,
    thickness: 0.5,
    opacity: 0.3,
    transparent: true,
    side: THREE.DoubleSide,
  }), [tint, transmission])
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

/* ───────── 玻璃幕墙 InstancedMesh ───────── */

function GlassCurtainWall() {
  const count = 24 // 8 floors × 3 columns
  const frontRef = useRef<THREE.InstancedMesh>(null!)
  const backRef = useRef<THREE.InstancedMesh>(null!)
  const leftRef = useRef<THREE.InstancedMesh>(null!)
  const rightRef = useRef<THREE.InstancedMesh>(null!)

  const panelW = BUILDING_W / 3 - 0.15
  const panelWD = BUILDING_D / 3 - 0.15
  const panelH = FLOOR_H - 0.2
  const boxGeo = useMemo(() => new THREE.BoxGeometry(panelW, panelH, 0.05), [])
  const boxGeoD = useMemo(() => new THREE.BoxGeometry(panelWD, panelH, 0.05), [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    const refs = [frontRef, backRef, leftRef, rightRef]
    refs.forEach((ref) => {
      if (!ref.current) return
      for (let floor = 0; floor < 8; floor++) {
        const y = floor * FLOOR_H + FLOOR_H / 2
        for (let col = 0; col < 3; col++) {
          const idx = floor * 3 + col
          const xOrZ = (col - 1) * (BUILDING_W / 3)
          const xOrZD = (col - 1) * (BUILDING_D / 3)
          
          if (ref === frontRef || ref === backRef) {
            dummy.position.set(xOrZ, y, ref === frontRef ? BUILDING_D / 2 + 0.03 : -BUILDING_D / 2 - 0.03)
            dummy.rotation.set(0, 0, 0)
          } else {
            dummy.position.set(ref === rightRef ? BUILDING_W / 2 + 0.03 : -BUILDING_W / 2 - 0.03, y, xOrZD)
            dummy.rotation.set(0, Math.PI / 2, 0)
          }
          dummy.updateMatrix()
          ref.current.setMatrixAt(idx, dummy.matrix)
          
          color.set(getFloorGradientColor(floor))
          ref.current.setColorAt(idx, color)
        }
      }
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    })
  }, [dummy, color])

  const glassMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    transmission: 0.6,
    roughness: 0.12,
    thickness: 0.5,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  }), [])

  return (
    <group>
      <instancedMesh ref={frontRef} args={[boxGeo, glassMat, count]} />
      <instancedMesh ref={backRef} args={[boxGeo, glassMat, count]} />
      <instancedMesh ref={leftRef} args={[boxGeoD, glassMat, count]} />
      <instancedMesh ref={rightRef} args={[boxGeoD, glassMat, count]} />
      {/* 边缘线 - 使用统一的线段而非每块单独的边缘 */}
      <lineSegments position={[0, BUILDING_H / 2, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={20}
            array={new Float32Array([
              // 水平楼层线 (4条 × 4顶点)
              -BUILDING_W/2, FLOOR_H*2, BUILDING_D/2, BUILDING_W/2, FLOOR_H*2, BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*4, BUILDING_D/2, BUILDING_W/2, FLOOR_H*4, BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*6, BUILDING_D/2, BUILDING_W/2, FLOOR_H*6, BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*2, -BUILDING_D/2, BUILDING_W/2, FLOOR_H*2, -BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*4, -BUILDING_D/2, BUILDING_W/2, FLOOR_H*4, -BUILDING_D/2,
              -BUILDING_W/2, FLOOR_H*6, -BUILDING_D/2, BUILDING_W/2, FLOOR_H*6, -BUILDING_D/2,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#64d2ff" transparent opacity={0.3} />
      </lineSegments>
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

function HolographicAI({ activeDeptColor }: { activeDeptColor?: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const targetColor = useRef(new THREE.Color('#bf5af2'))
  const spinBoost = useRef(0)

  useEffect(() => {
    if (activeDeptColor) {
      targetColor.current.set(activeDeptColor)
      spinBoost.current = 1
    }
  }, [activeDeptColor])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      ref.current.position.y = PENTHOUSE_Y + 2 + Math.sin(t * 1.2) * 0.4
      ref.current.rotation.y = t * (0.5 + spinBoost.current)
      ref.current.rotation.x = Math.sin(t * 0.8) * 0.2
      const mat = ref.current.material as THREE.MeshStandardMaterial
      mat.color.lerp(targetColor.current, 0.03)
      mat.emissive.lerp(targetColor.current, 0.03)
    }
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.3
      glowRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.1)
      m.color.lerp(targetColor.current, 0.03)
      m.emissive.lerp(targetColor.current, 0.03)
    }
    // spinBoost 衰减
    if (spinBoost.current > 0) {
      spinBoost.current = Math.max(0, spinBoost.current - 0.005)
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
      m.opacity = 0.4 + Math.sin(clock.elapsedTime * 1.5) * 0.3
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

/* ───────── 呼吸光晕 ───────── */

function BreathingRing({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.15
      ref.current.scale.set(s, s, 1)
      const m = ref.current.material as THREE.MeshStandardMaterial
      m.opacity = 0.2 + Math.sin(clock.elapsedTime * 3) * 0.15
    }
  })
  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[1.5, 1.8, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ───────── 可点击楼层标记 ───────── */

function FloorClickMarker({
  position, rotation, label, sublabel, color, onClick, onFocus, index, width, children, faceType,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  label: string
  sublabel: string
  color: string
  onClick: () => void
  onFocus?: (worldPos: [number, number, number]) => void
  index: number
  width?: number
  children?: React.ReactNode
  faceType?: 'front' | 'right'
  previewContent?: React.ReactNode
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = hovered
        ? 1.0 + Math.sin(clock.elapsedTime * 4) * 0.3
        : 0.3 + Math.sin(clock.elapsedTime * 1.5 + index * 0.7) * 0.15
      mat.opacity = hovered ? 0.4 : 0.15
    }
  })

  const isSide = Math.abs(rotation[1]) > 0.1
  const panelW = width ?? (isSide ? BUILDING_D * 0.82 : BUILDING_W * 0.82)

  return (
    <group position={position} rotation={rotation}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); onFocus?.(position) }}
        tabIndex={0}
        aria-label={`${label} - ${sublabel}`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClick(); onFocus?.(position) } }}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <boxGeometry args={[panelW, FLOOR_H - 0.3, 0.06]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={faceType === 'right' ? 0.15 : 0.3}
          transparent
          opacity={faceType === 'right' ? 0.1 : 0.15}
          wireframe={faceType === 'right'}
          roughness={faceType === 'front' ? 0.15 : 0.8}
        />
      </mesh>
      <Text position={[0, 0.3, 0.06]} fontSize={0.2} color={hovered ? '#ffffff' : color} anchorX="center" anchorY="middle" maxWidth={panelW - 0.3}>
        {label}
      </Text>
      <Text position={[0, 0.08, 0.06]} fontSize={0.11} color={hovered ? '#aaccdd' : '#556677'} anchorX="center" anchorY="middle" maxWidth={panelW - 0.3}>
        {sublabel}
      </Text>
      {children}
      {hovered && previewContent && (
        <Html position={[panelW / 2 + 0.5, 0.3, 0.1]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(10,10,30,0.92)',
            border: '1px solid rgba(100,210,255,0.2)',
            borderRadius: 8,
            padding: '8px 12px',
            minWidth: 160,
            backdropFilter: 'blur(10px)',
            whiteSpace: 'nowrap',
          }}>
            {previewContent}
          </div>
        </Html>
      )}
      {hovered && <BreathingRing position={[0, 0, 0.03]} color={color} />}
    </group>
  )
}

/* ───────── 动态小人 ───────── */

function TeamFigure({ x, color, delay }: { x: number; color: string; delay: number }) {
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
      <mesh castShadow>
        <capsuleGeometry args={[0.05, 0.12, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#e8c4a0" roughness={0.8} />
      </mesh>
    </group>
  )
}

/* ───────── 前面：项目工作间 ───────── */

function FrontFaceProjects({ projects, onSelect, onFocusFloor }: {
  projects: Project[]; onSelect: (p: Project) => void; onFocusFloor?: (pos: [number, number, number]) => void
}) {
  const COLS = 3
  const GAP = 0.15
  const ITEM_W = (BUILDING_W - GAP * (COLS + 1)) / COLS

  return (
    <group>
      {projects.slice(0, 12).map((proj, i) => {
        const floor = Math.floor(i / COLS)
        const col = i % COLS
        const x = (col - (COLS - 1) / 2) * (ITEM_W + GAP)
        const y = floor * FLOOR_H + FLOOR_H / 2
        const dept = DEFAULT_DEPTS.find(d => proj.selectedDeptIds.includes(d.deptId))
        const statusMap: Record<string, { label: string; color: string }> = {
          active: { label: '进行中', color: '#30d158' },
          completed: { label: '已完成', color: '#bf5af2' },
          planning: { label: '规划中', color: '#0a84ff' },
        }
        const st = statusMap[proj.status] ?? statusMap.planning
        const figureCount = dept ? Math.min(dept.team.length, 4) : 2

        return (
          <FloorClickMarker
            key={proj.id}
            position={[x, y, BUILDING_D / 2 + 0.06]}
            rotation={[0, 0, 0]}
            label={proj.name}
            sublabel={`${dept?.icon ?? '📋'} ${dept?.name ?? '未分配'} · ${st.label}`}
            color={st.color}
            onClick={() => onSelect(proj)}
            onFocus={onFocusFloor}
            index={i}
            width={ITEM_W}
            faceType="front"
            previewContent={
              <div>
                <div style={{ color: '#e0e8f0', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{proj.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ width: proj.status === 'completed' ? '100%' : proj.status === 'active' ? '60%' : '20%', height: '100%', background: st.color, borderRadius: 2 }} />
                  </div>
                  <span style={{ color: st.color, fontSize: 10 }}>{st.label}</span>
                </div>
                <div style={{ color: '#667', fontSize: 10 }}>{dept?.icon} {dept?.name}</div>
              </div>
            }
          >
            {Array.from({ length: figureCount }, (_, j) => (
              <TeamFigure key={j} x={(j - (figureCount - 1) / 2) * 0.4} color={dept?.color ?? '#64d2ff'} delay={j * 1.3} />
            ))}
          </FloorClickMarker>
        )
      })}
    </group>
  )
}

/* ───────── 右面：部门与团队 ───────── */

function RightFaceDepts({ depts, customTeams, onSelectDept, onSelectTeam, onCreateTeam, onFocusFloor }: {
  depts: ProjectDept[]
  customTeams: { id: string; name: string; members: TeamMember[] }[]
  onSelectDept: (d: ProjectDept) => void
  onSelectTeam: (t: { id: string; name: string; members: TeamMember[] }) => void
  onCreateTeam: () => void
  onFocusFloor?: (pos: [number, number, number]) => void
}) {
  const COLS = 3
  const GAP = 0.12
  const ITEM_W = (BUILDING_D - GAP * (COLS + 1)) / COLS

  const items: { label: string; sublabel: string; color: string; onClick: () => void; figureCount: number }[] = []

  depts.forEach((d) => {
    items.push({
      label: `${d.icon} ${d.name}`,
      sublabel: `${d.team.length}人 · ${d.projectType}`,
      color: d.color,
      onClick: () => onSelectDept(d),
      figureCount: Math.min(d.team.length, 4),
    })
  })
  customTeams.forEach((t) => {
    items.push({
      label: `👥 ${t.name}`,
      sublabel: `${t.members.length}人 · 自定义团队`,
      color: '#64d2ff',
      onClick: () => onSelectTeam(t),
      figureCount: Math.min(t.members.length, 4),
    })
  })
  items.push({
    label: '+ 创建新团队',
    sublabel: '组建你的自定义团队',
    color: '#ff9f0a',
    onClick: onCreateTeam,
    figureCount: 0,
  })

  return (
    <group>
      {items.slice(0, 12).map((item, i) => {
        const floor = Math.floor(i / COLS)
        const col = i % COLS
        const z = (col - (COLS - 1) / 2) * (ITEM_W + GAP)
        const y = floor * FLOOR_H + FLOOR_H / 2
        return (
          <FloorClickMarker
            key={i}
            position={[BUILDING_W / 2 + 0.06, y, z]}
            rotation={[0, Math.PI / 2, 0]}
            label={item.label}
            sublabel={item.sublabel}
            color={item.color}
            onClick={item.onClick}
            onFocus={onFocusFloor}
            index={i}
            width={ITEM_W}
            faceType="right"
            previewContent={
              <div>
                <div style={{ color: '#e0e8f0', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                <div style={{ color: '#667', fontSize: 10 }}>{item.sublabel}</div>
              </div>
            }
          >
            {Array.from({ length: item.figureCount }, (_, j) => (
              <TeamFigure key={j} x={(j - (item.figureCount - 1) / 2) * 0.4} color={item.color} delay={j * 1.1} />
            ))}
          </FloorClickMarker>
        )
      })}
    </group>
  )
}

/* ───────── 浮动标签 ───────── */

function FloorLabels() {
  return (
    <group>
      {FLOOR_LABELS.map((label, i) => (
        <Billboard key={i} follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[BUILDING_W / 2 + 1.5, i * FLOOR_H + FLOOR_H / 2, 0]}
            fontSize={0.4}
            color="#64d2ff"
            anchorX="left"
            anchorY="middle"
          >
            {label}
          </Text>
        </Billboard>
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

function Antenna({ activeDeptColor }: { activeDeptColor?: string }) {
  const ref = useRef<THREE.Mesh>(null!)
  const targetColor = useRef(new THREE.Color('#64d2ff'))
  const flashBoost = useRef(0)

  useEffect(() => {
    if (activeDeptColor) {
      targetColor.current.set(activeDeptColor)
      flashBoost.current = 1
    }
  }, [activeDeptColor])

  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshStandardMaterial
      const freq = 3 + flashBoost.current * 3
      m.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * freq) * 0.5
      m.color.lerp(targetColor.current, 0.05)
      m.emissive.lerp(targetColor.current, 0.05)
    }
    if (flashBoost.current > 0) {
      flashBoost.current = Math.max(0, flashBoost.current - 0.008)
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

/* ───────── 侧边详情面板 ───────── */

interface PanelProject { type: 'project'; data: Project }
interface PanelDept { type: 'dept'; data: ProjectDept }
interface PanelTeam { type: 'team'; data: { id: string; name: string; members: TeamMember[] } }
interface PanelCreate { type: 'create-team' }
type PanelState = PanelProject | PanelDept | PanelTeam | PanelCreate | null

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: '#30d158' },
  completed: { label: '已完成', color: '#bf5af2' },
  planning: { label: '规划中', color: '#0a84ff' },
}

const ALL_AGENTS: TeamMember[] = DEFAULT_DEPTS.flatMap(d => d.team)

function SidePanel({ panel, onClose, onCreateTeam, onCreateProject, isMobile, depts }: {
  panel: PanelState
  onClose: () => void
  onCreateTeam: (name: string, memberIds: string[]) => void
  onCreateProject: (deptId: string) => void
  isMobile?: boolean
  depts?: ProjectDept[]
}) {
  const [teamName, setTeamName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const deptList = depts ?? DEFAULT_DEPTS

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (panel) {
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    }
  }, [panel, onClose])

  if (!panel) return null

  const toggleMember = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    ...(isMobile
      ? { bottom: 0, left: 0, right: 0, width: '100%', height: '50%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }
      : { top: 0, right: 0, width: 360, height: '100%' }
    ),
    background: 'linear-gradient(180deg, rgba(10,10,30,0.94), rgba(5,5,20,0.97))',
    borderLeft: isMobile ? 'none' : '1px solid',
    borderTop: isMobile ? '1px solid' : 'none',
    borderImage: 'linear-gradient(180deg, #bf5af2, #5e56e0) 1',
    backdropFilter: 'blur(20px)', zIndex: 20, overflowY: 'auto',
    padding: isMobile ? '8px 20px 20px' : '24px 20px',
    color: '#c8d6e5', fontFamily: 'inherit',
    boxShadow: isMobile ? '0 -8px 32px rgba(0,0,0,0.5)' : '-8px 0 32px rgba(0,0,0,0.5)',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(100,210,255,0.1)',
  }

  const closeBtn: React.CSSProperties = {
    background: 'none', border: 'none', color: '#667', fontSize: 20,
    cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
  }

  const badge = (text: string, color: string): React.CSSProperties => {
    let animation = ''
    if (text === '进行中') animation = 'status-slide 2s ease-in-out infinite'
    else if (text === '规划中') animation = 'status-dash 1.5s ease-in-out infinite'
    else if (text === '已完成') animation = 'none'
    return {
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, color, background: `${color}20`,
      border: text === '规划中' ? `1px dashed ${color}60` : `1px solid ${color}40`,
      animation,
    }
  }

  const memberRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 8, marginBottom: 4,
    background: 'rgba(255,255,255,0.03)', fontSize: 13,
  }

  const btn = (color: string): React.CSSProperties => ({
    width: '100%', padding: '10px 0', borderRadius: 8,
    background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
    border: `1px solid ${color}60`, color: '#fff', fontWeight: 700,
    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12,
  })

  const avatarCircle: React.CSSProperties = {
    width: 44, height: 44, borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(100,210,255,0.2), rgba(191,90,242,0.2))',
    border: '1px solid rgba(100,210,255,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, color: '#e0e8f0', fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.2s',
    flexShrink: 0,
  }

  const scrollRow: React.CSSProperties = {
    display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
    scrollbarWidth: 'thin', scrollbarColor: 'rgba(100,210,255,0.2) transparent',
  }

  const renderProject = (proj: Project) => {
    const st = STATUS_MAP[proj.status]
    const depts = DEFAULT_DEPTS.filter(d => proj.selectedDeptIds.includes(d.deptId))
    return (
      <>
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>项目工作间</span>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{proj.name}</h2>
        <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px', lineHeight: 1.6 }}>{proj.description}</p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={badge(st.label, st.color)}>
            {st.label === '已完成' && <span style={{ marginRight: 4 }}>✓</span>}
            {st.label}
            {st.label === '进行中' && (
              <span style={{
                display: 'inline-block', width: 4, height: 4, borderRadius: '50%',
                background: st.color, marginLeft: 6,
                animation: 'status-slide 2s ease-in-out infinite',
              }} />
            )}
          </span>
          <span style={{ fontSize: 12, color: '#667' }}>{proj.iterations} 轮迭代</span>
        </div>
        {depts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#667', marginBottom: 8 }}>参与部门</div>
            {depts.map(d => (
              <div key={d.deptId} style={{ ...memberRow, cursor: 'pointer' }} onClick={() => onCreateProject(d.deptId)}>
                <span>{d.icon}</span>
                <span style={{ color: d.color, fontWeight: 600 }}>{d.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#556' }}>{d.team.length}人</span>
              </div>
            ))}
          </div>
        )}
        <button style={btn('#64d2ff')} onClick={onClose}>进入工作间</button>
      </>
    )
  }

  const renderDept = (dept: ProjectDept) => (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>{dept.icon} {dept.name}</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px', lineHeight: 1.6 }}>{dept.desc}</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={badge(dept.color, dept.color)}>{dept.projectType}</span>
        <span style={{ fontSize: 12, color: '#667' }}>成功率 {Math.round(dept.successRate * 100)}%</span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 8 }}>团队成员</div>
        <div className="member-scroll" style={scrollRow}>
          {dept.team.map(m => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 60 }}>
              <div style={{ ...avatarCircle, borderColor: dept.color + '60' }}>
                {m.name.charAt(0)}
              </div>
              <div style={{ fontSize: 11, color: '#d0dce8', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div style={{ fontSize: 9, color: '#667', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.title}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 6 }}>技术标签</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dept.keywords.map(k => (
            <span key={k} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.06)', color: '#8899aa' }}>{k}</span>
          ))}
        </div>
      </div>
      <button style={btn(dept.color)} onClick={() => onCreateProject(dept.deptId)}>创建项目</button>
    </>
  )

  const renderTeam = (team: { id: string; name: string; members: TeamMember[] }) => (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>👥 {team.name}</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '0 0 16px' }}>自定义团队 · {team.members.length} 名成员</p>
      <div style={{ marginBottom: 16 }}>
        <div className="member-scroll" style={scrollRow}>
          {team.members.map(m => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 60 }}>
              <div style={avatarCircle}>
                {m.name.charAt(0)}
              </div>
              <div style={{ fontSize: 11, color: '#d0dce8', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div style={{ fontSize: 9, color: '#667', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.title}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  const renderCreateTeam = () => (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>创建新团队</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 6 }}>团队名称</div>
        <input
          value={teamName}
          onChange={e => setTeamName(e.target.value)}
          placeholder="输入团队名称..."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(100,210,255,0.2)',
            color: '#e0e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#667', marginBottom: 12 }}>选择成员（点击头像添加）</div>
        {deptList.map(dept => (
          <div key={dept.deptId} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>{dept.icon}</span>
              <span style={{ fontSize: 11, color: dept.color, fontWeight: 600 }}>{dept.name}</span>
            </div>
            <div className="dept-grid">
              {dept.team.map(agent => {
                const picked = selectedIds.includes(agent.id)
                return (
                  <div
                    key={agent.id}
                    className={`agent-card ${picked ? 'selected' : ''}`}
                    onClick={() => toggleMember(agent.id)}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: picked
                        ? `linear-gradient(135deg, ${dept.color}40, ${dept.color}20)`
                        : 'rgba(255,255,255,0.05)',
                      border: picked ? `2px solid ${dept.color}` : '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: picked ? '#fff' : '#8899aa',
                      transition: 'all 0.2s',
                    }}>
                      {picked ? '✓' : agent.name.charAt(0)}
                    </div>
                    <div style={{ fontSize: 10, color: picked ? '#e0e8f0' : '#667', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: 9, color: '#556', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {agent.title}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button
        style={btn('#ff9f0a')}
        onClick={() => {
          if (teamName.trim() && selectedIds.length > 0) {
            onCreateTeam(teamName.trim(), selectedIds)
            setTeamName('')
            setSelectedIds([])
          }
        }}
      >
        创建团队 ({selectedIds.length} 人)
      </button>
    </>
  )

  return (
    <>
      <style>{`
        .side-panel-scroll::-webkit-scrollbar { width: 4px; }
        .side-panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .side-panel-scroll::-webkit-scrollbar-thumb { background: rgba(100,210,255,0.2); border-radius: 2px; }
        .side-panel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100,210,255,0.35); }
        .member-scroll::-webkit-scrollbar { height: 3px; }
        .member-scroll::-webkit-scrollbar-track { background: transparent; }
        .member-scroll::-webkit-scrollbar-thumb { background: rgba(100,210,255,0.2); border-radius: 2px; }
        @keyframes status-slide { 0%,100%{transform:translateX(-6px)} 50%{transform:translateX(6px)} }
        @keyframes status-dash { 0%,100%{border-color:rgba(10,132,255,0.3)} 50%{border-color:rgba(10,132,255,0.8)} }
        @keyframes status-float { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-12px)} }
        .dept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:12px}
        .dept-header{font-size:11px;color:#64d2ff;margin-bottom:6px;font-weight:600}
        .agent-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:8px;cursor:pointer;transition:all 0.2s;background:rgba(255,255,255,0.02);border:1px solid transparent}
        .agent-card:hover{background:rgba(100,210,255,0.08);border-color:rgba(100,210,255,0.15)}
        .agent-card.selected{background:rgba(100,210,255,0.12);border-color:rgba(100,210,255,0.3)}
      `}</style>
      <div style={panelStyle} className="side-panel-scroll">
        {isMobile && (
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: 'rgba(100,210,255,0.3)',
            margin: '0 auto 12px',
          }} />
        )}
        {panel.type === 'project' && renderProject(panel.data)}
        {panel.type === 'dept' && renderDept(panel.data)}
        {panel.type === 'team' && renderTeam(panel.data)}
        {panel.type === 'create-team' && renderCreateTeam()}
      </div>
    </>
  )
}

/* ───────── 数据流粒子 ───────── */

function DataFlowParticles({ totalIterations }: { totalIterations: number }) {
  const ref = useRef<THREE.Points>(null!)
  const count = 40 + totalIterations * 2

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (BUILDING_W - 2)
      pos[i * 3 + 1] = Math.random() * BUILDING_H
      pos[i * 3 + 2] = (Math.random() - 0.5) * (BUILDING_D - 2)
      const floor = Math.floor((pos[i * 3 + 1] / BUILDING_H) * 8)
      const c = new THREE.Color(getFloorGradientColor(floor))
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    return [pos, col]
  }, [count])

  useFrame((_, delta) => {
    if (ref.current) {
      const posAttr = ref.current.geometry.attributes.position as THREE.BufferAttribute
      const arr = posAttr.array as Float32Array
      for (let i = 0; i < count; i++) {
        arr[i * 3 + 1] += delta * (2 + Math.random())
        if (arr[i * 3 + 1] > BUILDING_H) {
          arr[i * 3 + 1] = 0
          arr[i * 3] = (Math.random() - 0.5) * (BUILDING_W - 2)
          arr[i * 3 + 2] = (Math.random() - 0.5) * (BUILDING_D - 2)
        }
      }
      posAttr.needsUpdate = true
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.08} vertexColors transparent opacity={0.6} sizeAttenuation />
    </points>
  )
}

/* ───────── 完整 3D 场景 ───────── */

function Scene({ projects, customTeams, onSelectProject, onSelectDept, onSelectTeam, onCreateTeam, cameraNav, onFocusFloor, activeDeptColor }: {
  projects: Project[]
  customTeams: { id: string; name: string; members: TeamMember[] }[]
  onSelectProject: (p: Project) => void
  onSelectDept: (d: ProjectDept) => void
  onSelectTeam: (t: { id: string; name: string; members: TeamMember[] }) => void
  onCreateTeam: () => void
  cameraNav?: { pos: [number, number, number]; target: [number, number, number] } | null
  onFocusFloor?: (pos: [number, number, number]) => void
  activeDeptColor?: string
}) {
  const [hovering, setHovering] = useState(false)
  const onEnter = useCallback(() => setHovering(true), [])
  const onLeave = useCallback(() => setHovering(false), [])

  const cameraRef = useRef<THREE.Camera>(null!)
  const navPosRef = useRef(new THREE.Vector3(30, 38, 30))
  const navTargetRef = useRef(new THREE.Vector3(0, PENTHOUSE_Y, 0))

  useFrame(({ camera }, delta) => {
    if (cameraNav) {
      navPosRef.current.set(...cameraNav.pos)
      navTargetRef.current.set(...cameraNav.target)
    }
    camera.position.lerp(navPosRef.current, Math.min(delta * 2, 0.05))
  })

  const totalIterations = projects.reduce((sum, p) => sum + p.iterations, 0)

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
      <pointLight position={[0, 32, 0]} intensity={1.2} color="#bf5af2" distance={20} />
      <pointLight position={[0, 28, 5]} intensity={0.8} color="#64d2ff" distance={15} />

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
      <DataFlowParticles totalIterations={totalIterations} />
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
      <HolographicAI activeDeptColor={activeDeptColor} />
      <Antenna activeDeptColor={activeDeptColor} />

      <FrontFaceProjects projects={projects} onSelect={onSelectProject} onFocusFloor={onFocusFloor} />
      <RightFaceDepts depts={DEFAULT_DEPTS} customTeams={customTeams} onSelectDept={onSelectDept} onSelectTeam={onSelectTeam} onCreateTeam={onCreateTeam} onFocusFloor={onFocusFloor} />

      <FloorLabels />
      <CEOTextLabel />
    </>
  )
}

/* ───────── 视角书签 ───────── */

const VIEW_PRESETS = [
  { label: '正面', pos: [20, 20, 25] as [number, number, number], target: [0, 14, 0] as [number, number, number] },
  { label: '右侧', pos: [30, 20, 0] as [number, number, number], target: [0, 14, 0] as [number, number, number] },
  { label: 'CEO', pos: [8, 36, 10] as [number, number, number], target: [0, 30, 0] as [number, number, number] },
]

function ViewBookmarks({ onNavigate }: { onNavigate: (pos: [number, number, number], target: [number, number, number]) => void }) {
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16,
      display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10,
    }}>
      {VIEW_PRESETS.map((v) => (
        <button
          key={v.label}
          onClick={() => onNavigate(v.pos, v.target)}
          style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(100,210,255,0.2)',
            color: '#64d2ff', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', backdropFilter: 'blur(8px)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(100,210,255,0.6)'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(100,210,255,0.2)'; e.currentTarget.style.background = 'rgba(0,0,0,0.5)' }}
        >
          {v.label}
        </button>
      ))}
    </div>
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

  const [projects] = useState<Project[]>(DEFAULT_PROJECTS)
  const [customTeams, setCustomTeams] = useState<{ id: string; name: string; members: TeamMember[] }[]>([])
  const [panel, setPanel] = useState<PanelState>(null)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const [cameraNav, setCameraNav] = useState<{ pos: [number, number, number]; target: [number, number, number] } | null>(null)
  const handleNavigate = useCallback((pos: [number, number, number], target: [number, number, number]) => {
    setCameraNav({ pos, target })
  }, [])

  const handleFocusFloor = useCallback((pos: [number, number, number]) => {
    setCameraNav({ pos: [pos[0], pos[1], pos[2] + 15], target: pos })
  }, [])

  const handleSelectProject = useCallback((p: Project) => setPanel({ type: 'project', data: p }), [])
  const handleSelectDept = useCallback((d: ProjectDept) => setPanel({ type: 'dept', data: d }), [])
  const handleSelectTeam = useCallback((t: { id: string; name: string; members: TeamMember[] }) => setPanel({ type: 'team', data: t }), [])
  const handleCreateTeam = useCallback(() => setPanel({ type: 'create-team' }), [])
  const handleClose = useCallback(() => setPanel(null), [])

  const activeDeptColor = panel?.type === 'dept' ? panel.data.color : undefined

  const handleDoCreateTeam = useCallback((name: string, memberIds: string[]) => {
    const members = ALL_AGENTS.filter(a => memberIds.includes(a.id))
    setCustomTeams(prev => [...prev, { id: `team-${Date.now()}`, name, members }])
    setPanel(null)
  }, [])

  const handleCreateProject = useCallback((_deptId: string) => {
    setPanel(null)
    onSendTask('创建新项目')
  }, [onSendTask])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#050510', display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
      <Canvas
        shadows
        camera={{ position: [30, 38, 30], fov: 40 }}
        style={{ width: '100%', height: isMobile ? '60%' : '100%' }}
      >
        <Scene
          projects={projects}
          customTeams={customTeams}
          onSelectProject={handleSelectProject}
          onSelectDept={handleSelectDept}
          onSelectTeam={handleSelectTeam}
          onCreateTeam={handleCreateTeam}
          cameraNav={cameraNav}
          onFocusFloor={handleFocusFloor}
          activeDeptColor={activeDeptColor}
        />
      </Canvas>

      {/* 面板标题提示 */}
      {!panel && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 24, zIndex: 10,
        }}>
          <div style={{
            padding: '8px 18px', borderRadius: 8,
            background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.25)',
            color: '#30d158', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(10px)',
          }}>
            正面 → 项目工作间
          </div>
          <div style={{
            padding: '8px 18px', borderRadius: 8,
            background: 'rgba(10,132,255,0.12)', border: '1px solid rgba(10,132,255,0.25)',
            color: '#0a84ff', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(10px)',
          }}>
            右侧 → 部门与团队
          </div>
        </div>
      )}

      <ViewBookmarks onNavigate={handleNavigate} />
      <SidePanel panel={panel} onClose={handleClose} onCreateTeam={handleDoCreateTeam} onCreateProject={handleCreateProject} isMobile={isMobile} depts={DEFAULT_DEPTS} />
      <OverlayButtons onStartMeeting={onStartMeeting} onBackToSingle={onBackToSingle} />
    </div>
  )
}
