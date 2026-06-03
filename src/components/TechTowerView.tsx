import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { getRouteTable } from '../modules/dynamicRouter'
import RoleAvatar from './RoleAvatar'
import { AgentRole } from '../modules/agentTypes'

/* ───────── 类型 ───────── */

interface TeamMember {
  id: string
  name: string
  role: AgentRole
  title: string
  description: string
}

interface ProjectDept {
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

/* ───────── 预设部门：每个部门 = 一个完整项目团队 ───────── */

const DEFAULT_DEPTS: ProjectDept[] = [
  {
    deptId: 'dept-software', name: '软件产品部', icon: '💻', color: '#0a84ff', accent: '#64d2ff',
    desc: '全栈软件产品开发：从需求分析到部署上线的完整团队',
    projectType: 'Web应用/小程序/API服务',
    keywords: ['React', 'Python', '数据库', 'Docker'], successRate: 0.88,
    team: [
      { id: 'pm-sw', name: '张浩然', role: AgentRole.Coordinator, title: '产品经理', description: '需求分析与项目管理' },
      { id: 'design-sw', name: '林沐阳', role: AgentRole.Planner, title: '架构师', description: '系统设计与技术选型' },
      { id: 'fe-sw', name: '陈思远', role: AgentRole.Executor, title: '前端工程师', description: 'React/Vue 组件开发' },
      { id: 'be-sw', name: '王铭泽', role: AgentRole.Executor, title: '后端工程师', description: 'API/数据库/微服务' },
      { id: 'qa-sw', name: '郑雅琪', role: AgentRole.Reviewer, title: 'QA 工程师', description: '测试与质量保障' },
      { id: 'ops-sw', name: '杨启明', role: AgentRole.Monitor, title: 'DevOps', description: 'CI/CD 与部署运维' },
    ],
  },
  {
    deptId: 'dept-ai-movie', name: 'AI 影视部', icon: '🎬', color: '#ff375f', accent: '#ff6b8a',
    desc: 'AI 驱动的影视内容创作：从剧本到成片的全流程团队',
    projectType: '短视频/动画/广告片',
    keywords: ['剧本', '分镜', '图像生成', '视频生成'], successRate: 0.82,
    team: [
      { id: 'dir-mv', name: '周子轩', role: AgentRole.Coordinator, title: '导演', description: '创意把控与整体调度' },
      { id: 'write-mv', name: '钱文静', role: AgentRole.Planner, title: '编剧', description: '剧本创作与分镜设计' },
      { id: 'img-mv', name: '赵雪晴', role: AgentRole.Executor, title: '图像生成师', description: 'Stable Diffusion/Midjourney 出图' },
      { id: 'vid-mv', name: '孙博文', role: AgentRole.Executor, title: '视频生成师', description: 'Runway/Pika 视频合成' },
      { id: 'edit-mv', name: '黄雨萱', role: AgentRole.Executor, title: '剪辑师', description: '剪辑/调色/特效' },
      { id: 'snd-mv', name: '韩志远', role: AgentRole.Reviewer, title: '音效师', description: '配乐/音效/混音' },
    ],
  },
  {
    deptId: 'dept-data', name: '数据智能部', icon: '📊', color: '#bf5af2', accent: '#d4a0ff',
    desc: '数据驱动的分析与 AI 项目：从数据采集到模型部署',
    projectType: '数据分析/机器学习/BI报表',
    keywords: ['Python', 'ML', '数据可视化', 'ETL'], successRate: 0.85,
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
    desc: '图文内容创作：从策划到发布的完整内容生产团队',
    projectType: '公众号/博客/技术文档/营销文案',
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
    desc: '专业演示与设计：从内容梳理到视觉呈现的一站式团队',
    projectType: '商业PPT/路演/汇报/培训',
    keywords: ['PPT', '设计', '数据图表', '动画'], successRate: 0.87,
    team: [
      { id: 'lead-ppt', name: '刘子墨', role: AgentRole.Coordinator, title: '项目负责人', description: '需求沟通与内容梳理' },
      { id: 'struct-ppt', name: '张浩然', role: AgentRole.Planner, title: '内容架构师', description: '逻辑结构与故事线' },
      { id: 'design-ppt', name: '赵雪晴', role: AgentRole.Executor, title: '视觉设计师', description: '版式/配色/图表设计' },
      { id: 'anim-ppt', name: '周子轩', role: AgentRole.Executor, title: '动画工程师', description: '转场/动画/交互效果' },
    ],
  },
]

/* ───────── 浮动粒子 ───────── */
const CODE_SYMS = ['01', '{}', '[]', '</>', 'fn', '&&', '=>', '##', '<<', '>>']

function FloatingBits() {
  const bits = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    id: i, text: CODE_SYMS[i % CODE_SYMS.length],
    left: `${(i * 5.6) % 100}%`, delay: `${(i * 0.7) % 8}s`,
    dur: `${8 + (i % 5) * 2}s`, size: 7 + (i % 3) * 2,
  })), [])
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {bits.map(b => (
        <span key={b.id} style={{
          position: 'absolute', left: b.left, bottom: '-20px',
          fontSize: b.size, fontFamily: "'JetBrains Mono',monospace",
          color: '#8b5cf6', opacity: 0.05,
          animation: `rise ${b.dur} linear ${b.delay} infinite`,
        }}>{b.text}</span>
      ))}
      <style>{`@keyframes rise{0%{transform:translateY(0);opacity:0}10%{opacity:.07}90%{opacity:.03}100%{transform:translateY(-100vh);opacity:0}}`}</style>
    </div>
  )
}

/* ───────── 电梯 ───────── */
function Elevator({ total, active }: { total: number; active: number }) {
  return (
    <div style={elS.shaft}>
      <div style={elS.track}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{
            ...elS.dot,
            background: i === active ? '#bf5af2' : 'rgba(255,255,255,0.08)',
            boxShadow: i === active ? '0 0 8px #bf5af2' : 'none',
          }} />
        ))}
      </div>
      <div style={{ ...elS.car, top: `${(active / Math.max(total - 1, 1)) * 100}%` }}>▲</div>
    </div>
  )
}
const elS: Record<string, React.CSSProperties> = {
  shaft: { position: 'absolute', left: 6, top: 0, bottom: 0, width: 20, display: 'flex', alignItems: 'center', zIndex: 5 },
  track: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '8px 0', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: '50%', transition: 'all 0.4s' },
  car: { position: 'absolute', left: 2, width: 16, height: 16, borderRadius: 3, background: 'rgba(191,90,242,0.2)', border: '1px solid rgba(191,90,242,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bf5af2', fontSize: 9, transition: 'top 0.6s cubic-bezier(0.4,0,0.2,1)' },
}

/* ───────── 成员徽章 ───────── */
function MemberBadge({ m, color }: { m: TeamMember; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 7px 3px 4px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <RoleAvatar role={m.role} size={20} status="idle" animate={false} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#c8d0e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
        <span style={{ fontSize: 9, color: color, fontWeight: 500, whiteSpace: 'nowrap' }}>{m.title}</span>
      </div>
    </div>
  )
}

/* ───────── 部门楼层 ───────── */
function DeptFloor({
  dept, index, total, expanded, onToggle, onEnter, hovered, onHover,
}: {
  dept: ProjectDept; index: number; total: number
  expanded: boolean; onToggle: () => void; onEnter: () => void
  hovered: boolean; onHover: (v: boolean) => void
}) {
  const floor = total - index
  const pct = Math.round(dept.successRate * 100)

  return (
    <div
      style={{
        ...dfS.card, borderLeftColor: dept.color,
        background: expanded ? `linear-gradient(135deg,${dept.color}10,transparent 50%)` : hovered ? `linear-gradient(135deg,${dept.color}08,transparent 50%)` : 'rgba(255,255,255,0.015)',
        transform: hovered ? 'translateX(3px)' : 'none',
      }}
      onClick={onToggle}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div style={{ ...dfS.floor, color: dept.color }}>{floor}F</div>
      <div style={dfS.body}>
        <div style={dfS.head}>
          <span style={{ fontSize: 18 }}>{dept.icon}</span>
          <span style={{ ...dfS.name, color: expanded || hovered ? dept.color : '#e2e8f0' }}>{dept.name}</span>
          <span style={dfS.teamCount}>{dept.team.length} 人</span>
          <div style={dfS.kwRow}>
            {dept.keywords.map(k => <span key={k} style={{ ...dfS.kw, borderColor: dept.color + '30', color: dept.accent }}>{k}</span>)}
          </div>
          <span style={{ ...dfS.rate, color: pct >= 90 ? '#30d158' : pct >= 85 ? '#ff9f0a' : '#ff375f' }}>{pct}%</span>
        </div>

        {expanded && (
          <div style={dfS.expanded}>
            <div style={dfS.desc}>{dept.desc}</div>
            <div style={{ fontSize: 11, color: dept.accent, fontWeight: 500 }}>📦 典型项目: {dept.projectType}</div>

            {/* 团队成员网格 */}
            <div style={dfS.teamLabel}>
              <span style={{ color: dept.color }}>●</span> 项目团队 · {dept.team.length} 个角色
            </div>
            <div style={dfS.teamGrid}>
              {dept.team.map(m => <MemberBadge key={m.id} m={m} color={dept.color} />)}
            </div>

            <div style={dfS.barRow}>
              <div style={dfS.barBg}><div style={{ ...dfS.barFill, width: `${pct}%`, background: `linear-gradient(90deg,${dept.color},${dept.accent})` }} /></div>
              <span style={dfS.barLabel}>项目成功率</span>
            </div>

            <button
              style={{ ...dfS.enterBtn, background: `linear-gradient(135deg,${dept.color},${dept.accent})` }}
              onClick={e => { e.stopPropagation(); onEnter() }}
            >
              🚀 进入部门 · 启动项目
            </button>
          </div>
        )}
      </div>

      <div style={dfS.wins}>
        {[0, 1, 2].map(i => <div key={i} style={{ ...dfS.win, background: expanded || hovered ? dept.color + '30' : 'rgba(255,255,255,0.03)' }} />)}
      </div>
    </div>
  )
}

const dfS: Record<string, React.CSSProperties> = {
  card: { display: 'flex', alignItems: 'stretch', borderLeft: '3px solid', borderRadius: '0 12px 12px 0', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' },
  floor: { width: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 800, opacity: 0.6, borderRight: '1px solid rgba(255,255,255,0.03)' },
  body: { flex: 1, padding: '10px 14px', minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  name: { fontSize: 14, fontWeight: 700, transition: 'color 0.2s' },
  teamCount: { fontSize: 10, color: '#6b7280', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 },
  kwRow: { display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' as const },
  kw: { fontSize: 9, padding: '1px 5px', borderRadius: 4, border: '1px solid', fontWeight: 600 },
  rate: { fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 800, flexShrink: 0 },
  expanded: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 },
  desc: { fontSize: 12, color: '#8899b4', lineHeight: 1.5 },
  teamLabel: { fontSize: 11, fontWeight: 600, color: '#8899b4', display: 'flex', alignItems: 'center', gap: 4 },
  teamGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 5 },
  barRow: { display: 'flex', alignItems: 'center', gap: 8 },
  barBg: { flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, transition: 'width 0.6s' },
  barLabel: { fontSize: 10, color: '#4a5575', flexShrink: 0 },
  enterBtn: { alignSelf: 'flex-start', padding: '8px 18px', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.5, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' },
  wins: { display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', padding: '0 10px', flexShrink: 0 },
  win: { width: 10, height: 10, borderRadius: 2, transition: 'all 0.3s' },
}

/* ───────── 屋顶办公室 ───────── */
function RooftopOffice({ value, onChange, onSubmit, busy }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <div style={rtS.wrap}>
      <div style={rtS.antenna}>
        <div style={rtS.pole} />
        <div style={rtS.ball}>📡</div>
        {[0, 1, 2].map(i => <div key={i} style={{ ...rtS.wave, animationDelay: `${i * 0.4}s` }} />)}
      </div>
      <div style={rtS.office}>
        <div style={rtS.header}>
          <span style={rtS.badge}>顶层 · CEO 办公室</span>
          <span style={rtS.title}>你的指挥中心</span>
          <span style={rtS.sub}>描述你的项目需求 → CEO 分析意图 → 自动组建最佳团队</span>
        </div>
        <div style={rtS.row}>
          <input
            style={rtS.input}
            placeholder="描述你的项目，例如: 帮我做一个AI生成的猫咪动画短片 或 开发一个Todo应用"
            value={value} onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && value.trim() && onSubmit()}
          />
          <button style={{ ...rtS.btn, opacity: value.trim() && !busy ? 1 : 0.4 }} disabled={!value.trim() || busy} onClick={onSubmit}>
            {busy ? '⏳' : '🚀'}
          </button>
        </div>
        <div style={rtS.hints}>
          <span style={rtS.hint}>💡 试试: "帮我做一个AI猫咪动画短片" · "开发一个React全栈应用" · "做一份年度数据报告"</span>
        </div>
      </div>
    </div>
  )
}

const rtS: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative', marginBottom: 16 },
  antenna: { position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  pole: { width: 2, height: 22, background: 'linear-gradient(to bottom, #bf5af2, transparent)' },
  ball: { width: 18, height: 18, borderRadius: '50%', background: 'radial-gradient(circle,#bf5af2,#5e5ce6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, boxShadow: '0 0 14px #bf5af280' },
  wave: { position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', width: 28, height: 28, borderRadius: '50%', border: '1px solid #bf5af240', animation: 'sig 2s ease-out infinite' },
  office: { background: 'linear-gradient(135deg,rgba(191,90,242,0.1),rgba(94,92,230,0.06))', border: '1.5px solid rgba(191,90,242,0.22)', borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(8px)' },
  header: { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12 },
  badge: { alignSelf: 'flex-start', padding: '2px 10px', background: 'linear-gradient(135deg,#bf5af2,#5e5ce6)', borderRadius: 6, fontSize: 10, fontWeight: 800, color: 'white', letterSpacing: 2 },
  title: { fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginTop: 4 },
  sub: { fontSize: 11, color: '#6b7280' },
  row: { display: 'flex', gap: 8 },
  input: { flex: 1, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(191,90,242,0.18)', borderRadius: 10, color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  btn: { padding: '10px 18px', background: 'linear-gradient(135deg,#bf5af2,#5e5ce6)', border: 'none', borderRadius: 10, color: 'white', fontSize: 16, cursor: 'pointer', fontWeight: 700 },
  hints: { marginTop: 8 },
  hint: { fontSize: 11, color: '#4a5575' },
}

/* ───────── 主组件 ───────── */

interface TechTowerViewProps {
  onStartMeeting: () => void
  onSendTask: (description: string) => void
  onBackToSingle: () => void
}

export default function TechTowerView({ onStartMeeting, onSendTask, onBackToSingle }: TechTowerViewProps) {
  const [depts, setDepts] = useState<ProjectDept[]>(DEFAULT_DEPTS)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getRouteTable().then(data => {
      if (data.length > 0) {
        const mapped = data.sort((a, b) => b.priority - a.priority).map((r, i): ProjectDept => {
          const def = DEFAULT_DEPTS[i] ?? DEFAULT_DEPTS[0]
          return {
            deptId: r.dept_id, name: r.dept_name,
            icon: def.icon, color: def.color, accent: def.accent,
            desc: r.capability_desc, projectType: def.projectType,
            keywords: r.capability_keywords.slice(0, 4),
            successRate: r.success_rate, team: def.team,
          }
        })
        setDepts(mapped)
      }
    }).catch(() => {})
  }, [])

  const handleSubmit = useCallback(() => {
    if (!taskInput.trim() || busy) return
    setBusy(true)
    onSendTask(taskInput.trim())
    setTaskInput('')
    setTimeout(() => setBusy(false), 1500)
  }, [taskInput, busy, onSendTask])

  const totalAgents = depts.reduce((n, d) => n + d.team.length, 0)

  return (
    <div style={s.root}>
      <div style={s.bg} /><FloatingBits />

      <div style={s.topBar}>
        <button style={s.backBtn} onClick={onBackToSingle}>← 返回</button>
        <div style={s.title}><span style={{ fontSize: 18 }}>🏢</span><span>AI 科技大厦</span></div>
        <span style={s.count}>{depts.length} 个项目部门 · {totalAgents} 名智能体</span>
      </div>

      <div style={s.scroll}>
        <div style={s.building}>
          <Elevator total={depts.length + 1} active={expandedIdx !== null ? expandedIdx : depts.length} />

          <div style={{ paddingLeft: 32 }}>
            <RooftopOffice value={taskInput} onChange={setTaskInput} onSubmit={handleSubmit} busy={busy} />
          </div>

          <div style={s.sep}>
            <div style={s.sepLine} /><span style={s.sepText}>▼ 项目部门 · 点击查看团队 ▼</span><div style={s.sepLine} />
          </div>

          <div style={{ paddingLeft: 32, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {depts.map((dept, i) => (
              <DeptFloor key={dept.deptId} dept={dept} index={i} total={depts.length}
                expanded={expandedIdx === i} hovered={hoveredIdx === i}
                onHover={v => setHoveredIdx(v ? i : null)}
                onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                onEnter={onStartMeeting}
              />
            ))}
          </div>

          <div style={s.footer}>
            <div style={s.footerLine} />
            <span style={s.footerText}>🏗️ AI 科技大厦 · 项目制智能体团队协作</span>
          </div>
        </div>
      </div>

      <style>{`@keyframes sig{0%{transform:translateX(-50%) scale(.5);opacity:.8}100%{transform:translateX(-50%) scale(2.5);opacity:0}}`}</style>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#08080f', color: '#e2e8f0', fontFamily: "'Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif", overflow: 'hidden' },
  bg: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 30% at 50% 20%,rgba(191,90,242,.06),transparent),radial-gradient(ellipse 40% 40% at 20% 80%,rgba(10,132,255,.04),transparent)', pointerEvents: 'none' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'rgba(0,0,0,.4)', borderBottom: '1px solid rgba(255,255,255,.06)', backdropFilter: 'blur(10px)', zIndex: 10, flexShrink: 0 },
  backBtn: { padding: '5px 12px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#8899b4', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  title: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, letterSpacing: 2 },
  count: { fontSize: 11, color: '#4a5575', padding: '2px 10px', borderRadius: 10, background: 'rgba(255,255,255,.04)' },
  scroll: { flex: 1, overflow: 'auto', padding: 20, display: 'flex', justifyContent: 'center' },
  building: { width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column' },
  sep: { display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 8px 32px' },
  sepLine: { flex: 1, height: 1, background: 'rgba(255,255,255,.06)' },
  sepText: { fontSize: 10, color: '#4a5575', letterSpacing: 2, flexShrink: 0 },
  footer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 16, paddingLeft: 32 },
  footerLine: { width: '100%', height: 2, background: 'linear-gradient(90deg,transparent,rgba(191,90,242,.15),transparent)' },
  footerText: { fontSize: 10, color: '#3a3a50', letterSpacing: 2 },
}
