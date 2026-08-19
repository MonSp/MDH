/**
 * CeoChatPanel 常量
 */

import type { MeetingPhase, RoleInfo } from './ceo-types'

export const AGENT_NAMES: Record<string, string> = {
  'agent-ceo': 'CTO',
  'agent-coordinator': '项目经理',
  'agent-planner': '架构师',
  'agent-executor': '全栈开发',
  'agent-reviewer': 'QA工程师',
  'agent-monitor': 'DevOps',
}

export const AGENT_COLORS: Record<string, string> = {
  'agent-ceo': '#8b5cf6',
  'agent-coordinator': '#3b82f6',
  'agent-planner': '#10b981',
  'agent-executor': '#f59e0b',
  'agent-reviewer': '#ef4444',
  'agent-monitor': '#06b6d4',
}

export const PHASE_LABELS: Record<MeetingPhase, string> = {
  idle: '等待中',
  analyzing: '需求分析',
  planning: '项目规划',
  discussing: '团队讨论',
  assigning: '任务分派',
  executing: '代码执行',
  reviewing: '质量审查',
  summarizing: '生成报告',
  done: '已完成',
}

export const PHASE_ORDER: MeetingPhase[] = [
  'analyzing', 'planning', 'discussing', 'assigning', 'executing', 'reviewing', 'summarizing',
]

export const PRESET_ROLES: RoleInfo[] = [
  // 软件产品部
  { id: 'coordinator', name: '产品经理', description: '需求分析与项目管理', department: 'dept-software' },
  { id: 'planner', name: '架构师', description: '系统设计与技术选型', department: 'dept-software' },
  { id: 'executor', name: '全栈开发', description: '前后端代码实现', department: 'dept-software' },
  { id: 'reviewer', name: 'QA工程师', description: '测试与质量保障', department: 'dept-software' },
  { id: 'monitor', name: 'DevOps', description: 'CI/CD与部署运维', department: 'dept-software' },
  // AI影视部
  { id: 'director', name: '导演', description: '创意把控与整体调度', department: 'dept-ai-movie' },
  { id: 'screenwriter', name: '编剧', description: '剧本创作与分镜设计', department: 'dept-ai-movie' },
  { id: 'image_artist', name: '图像生成师', description: 'AI图像生成', department: 'dept-ai-movie' },
  { id: 'video_artist', name: '视频生成师', description: 'AI视频生成', department: 'dept-ai-movie' },
  // 数据智能部
  { id: 'data_lead', name: '数据负责人', description: '需求拆解与分析策略', department: 'dept-data' },
  { id: 'data_engineer', name: '数据工程师', description: '数据采集/清洗/ETL', department: 'dept-data' },
  { id: 'data_analyst', name: '数据分析师', description: '统计分析与洞察', department: 'dept-data' },
  // 内容创作部
  { id: 'content_director', name: '内容总监', description: '选题策划与风格把控', department: 'dept-content' },
  { id: 'content_writer', name: '撰稿人', description: '深度文章与技术写作', department: 'dept-content' },
  // 演示设计部
  { id: 'ppt_lead', name: '演示负责人', description: '需求沟通与内容梳理', department: 'dept-ppt' },
  { id: 'slide_designer', name: '视觉设计师', description: '版式/配色/图表设计', department: 'dept-ppt' },
]

export const DEPT_COLORS: Record<string, string> = {
  'dept-software': '#0a84ff',
  'dept-ai-movie': '#ff375f',
  'dept-data': '#bf5af2',
  'dept-content': '#ff9f0a',
  'dept-ppt': '#30d158',
}

export const DEPT_NAMES: Record<string, string> = {
  'dept-software': '💻 软件产品部',
  'dept-ai-movie': '🎬 AI影视部',
  'dept-data': '📊 数据智能部',
  'dept-content': '✍️ 内容创作部',
  'dept-ppt': '🎯 演示设计部',
}
