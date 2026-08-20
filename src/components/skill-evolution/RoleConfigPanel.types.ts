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
  required_tools: string[]
}

// 部门配置
export const DEPT_MAP: Record<string, { icon: string; name: string; color: string }> = {
  'dept-software': { icon: '💻', name: '软件产品部', color: '#0a84ff' },
  'dept-ai-movie': { icon: '🎬', name: 'AI影视部', color: '#ff375f' },
  'dept-data': { icon: '📊', name: '数据智能部', color: '#bf5af2' },
  'dept-content': { icon: '✍️', name: '内容创作部', color: '#ff9f0a' },
  'dept-ppt': { icon: '🎯', name: '演示设计部', color: '#30d158' },
}
