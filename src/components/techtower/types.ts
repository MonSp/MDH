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

/* ───────── 角色配置类型 ───────── */

export interface RoleConfig {
  name: string
  description: string
  department?: string
  team_role?: string
  permissions: {
    tools: string[]
    dangerous_tools: string[]
  }
  skills: string[]
  prompt_template: string
}

export interface ToolInfo {
  name: string
  description: string
  category: string
  dangerous: boolean
}

export interface SkillInfo {
  name: string
  description: string
  category?: string
  methodology?: string
  practices?: string[]
  workflow?: Record<string, string>
  required_tools: string[]
}

/* ───────── 表单与结果类型 ───────── */

export interface EditRoleForm {
  name: string
  description: string
  permissions?: {
    tools?: string[]
    dangerous_tools?: string[]
  }
  skills?: string[]
  prompt_template?: string
}

export interface ImportSkillForm {
  id: string
  name: string
  description: string
  category: string
  methodology: string
  practices: string[]
  workflow: Record<string, string>
  required_tools: string[]
}

export interface ImportToolForm {
  id: string
  name: string
  description: string
  category: string
  dangerous: boolean
}

export interface GenerateSkillResult {
  id?: string
  name?: string
  description?: string
  category?: string
  methodology?: string
  practices?: string[]
  workflow?: Record<string, string>
  required_tools?: string[]
}

/* ───────── 面板状态 ───────── */

export interface PanelProject { type: 'project'; data: Project }
export interface PanelDept { type: 'dept'; data: ProjectDept }
export interface PanelTeam { type: 'team'; data: CustomTeam }
export interface PanelCreate { type: 'create-team' }
export interface PanelRoles { type: 'roles' }
export interface PanelSkills { type: 'skills' }
export interface PanelTools { type: 'tools' }
export type PanelState = PanelProject | PanelDept | PanelTeam | PanelCreate | PanelRoles | PanelSkills | PanelTools | null

/* ───────── 相机导航 ───────── */

export type CameraTarget = { pos: [number, number, number]; target: [number, number, number] }
