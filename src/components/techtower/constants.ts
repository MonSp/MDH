import { AgentRole } from '../../modules/agentTypes'
import type { ProjectDept, Project, TeamMember, CameraTarget } from './types'

/* ───────── 预设部门 ───────── */

export const DEFAULT_DEPTS: ProjectDept[] = [
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

export const DEFAULT_PROJECTS: Project[] = [
  { id: 'proj-1', name: '智能客服系统', description: '基于 LLM 的多轮对话客服，支持知识库检索', selectedDeptIds: ['dept-software'], status: 'active', createdAt: Date.now() - 86400000 * 7, iterations: 12 },
  { id: 'proj-2', name: '品牌宣传片', description: 'AI 驱动的品牌宣传片，从脚本到成片', selectedDeptIds: ['dept-ai-movie'], status: 'active', createdAt: Date.now() - 86400000 * 3, iterations: 5 },
  { id: 'proj-3', name: '销售数据大屏', description: '实时销售数据可视化，集成多数据源', selectedDeptIds: ['dept-data', 'dept-software'], status: 'planning', createdAt: Date.now() - 86400000, iterations: 2 },
  { id: 'proj-4', name: '技术博客矩阵', description: '技术团队博客内容矩阵运营', selectedDeptIds: ['dept-content'], status: 'active', createdAt: Date.now() - 86400000 * 14, iterations: 28 },
  { id: 'proj-5', name: '融资路演PPT', description: 'A轮融资路演演示材料', selectedDeptIds: ['dept-ppt', 'dept-data'], status: 'completed', createdAt: Date.now() - 86400000 * 30, iterations: 8 },
]

/* ───────── 建筑尺寸常量 ───────── */

export const BUILDING_W = 10
export const BUILDING_D = 8
export const BUILDING_H = 28
export const FLOOR_H = BUILDING_H / 8
export const PENTHOUSE_H = 5
export const PENTHOUSE_Y = BUILDING_H + PENTHOUSE_H / 2

export const FLOOR_LABELS = [
  '技能训练场', '研发实验室', '数据中心', '创意工坊',
  '设计工场', '测试中心', '协作空间', '项目工作间',
]

export const DEPT_COLORS = ['#0a84ff', '#ff375f', '#bf5af2', '#ff9f0a', '#30d158']

/* ───────── 辅助函数 ───────── */

export function getFloorGradientColor(floor: number): string {
  const colors = [
    '#0a84ff', '#1a6aff', '#2a50ff',
    '#5e56e0', '#7b59b6', '#9b59b6',
    '#ff9f0a', '#ffb340',
  ]
  return colors[Math.min(floor, colors.length - 1)]
}

/* ───────── 面板常量 ───────── */

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: '#30d158' },
  completed: { label: '已完成', color: '#bf5af2' },
  planning: { label: '规划中', color: '#0a84ff' },
}

export const ALL_AGENTS: TeamMember[] = DEFAULT_DEPTS.flatMap(d => d.team)

/* ───────── 视角书签 ───────── */

export const VIEW_PRESETS: { label: string; pos: [number, number, number]; target: [number, number, number] }[] = [
  { label: '正面', pos: [20, 20, 25], target: [0, 14, 0] },
  { label: '右侧', pos: [30, 20, 0], target: [0, 14, 0] },
  { label: 'CEO', pos: [8, 36, 10], target: [0, 30, 0] },
  { label: '全景', pos: [55, 45, 55], target: [0, 10, 0] },
]
