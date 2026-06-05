import { AgentRole } from '../../modules/agentTypes'

/* ───────── 核心类型 ───────── */

export interface TeamMember {
  id: string
  name: string
  role: AgentRole
  title: string
  description: string
}

export interface ProjectDept {
  deptId: string
  name: string
  icon: string
  color: string
  accent: string
  desc: string
  projectType: string
  keywords: string[]
  successRate: number
  team: TeamMember[]
}

export interface Project {
  id: string
  name: string
  description: string
  selectedDeptIds: string[]
  status: 'planning' | 'active' | 'completed'
  createdAt: number
  iterations: number
}

export type CustomTeam = { id: string; name: string; members: TeamMember[] }

/* ───────── 面板状态 ───────── */

export interface PanelProject { type: 'project'; data: Project }
export interface PanelDept { type: 'dept'; data: ProjectDept }
export interface PanelTeam { type: 'team'; data: CustomTeam }
export interface PanelCreate { type: 'create-team' }
export type PanelState = PanelProject | PanelDept | PanelTeam | PanelCreate | null

/* ───────── 相机导航 ───────── */

export type CameraTarget = { pos: [number, number, number]; target: [number, number, number] }
