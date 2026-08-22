import React, { useState, useEffect } from 'react'

interface DashboardData {
  agents: {
    total: number; total_xp: number
    by_stage: Record<string, number>; by_department: Record<string, number>
    top_agents: { agent_id: string; name: string; department: string; career_stage: string; total_xp: number; max_skill_level: number; active_skills: number }[]
  }
  rules: {
    total: number; by_status: Record<string, number>; avg_effectiveness: number
    high_performers: number; low_performers: number; share_recommendations: number
    top_rules: { rule_id: string; trigger: string; score: number; usage: number }[]
  }
  routing: {
    departments: number
    depts: { dept_id: string; dept_name: string; success_rate: number; total_tasks: number; skill_level_boost: number }[]
  }
  costs: {
    total_calls: number; total_cost_usd: number; total_tokens_in: number; total_tokens_out: number
    by_role: Record<string, { calls: number; cost_usd: number; tokens: number }>
  }
  knowledge_flow: {
    total_flows: number; unique_mentors: number; unique_mentees: number
    recent_flows: { from_agent: string; to_agent: string; rule_ids: string[]; timestamp: string }[]
  }
}

const STAGE_COLORS: Record<string, string> = {
  junior: '#6b7280', mid: '#3b82f6', senior: '#a855f7', lead: '#f59e0b',
}

export default function PerformanceDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'overview' | 'agents' | 'rules' | 'routing' | 'costs' | 'flow'>('overview')

  useEffect(() => {
    setLoading(true)
    fetch('/api/dashboard/performance')
      .then(r => r.json())
      .then(res => { if (res.success) setData(res.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={s.center}>加载中...</div>
  if (!data) return <div style={s.center}>无数据</div>

  const sections = [
    { key: 'overview', label: '总览', icon: '📊' },
    { key: 'agents', label: 'Agent', icon: '👤' },
    { key: 'rules', label: '规则', icon: '📋' },
    { key: 'routing', label: '路由', icon: '🧭' },
    { key: 'costs', label: '成本', icon: '💰' },
    { key: 'flow', label: '知识流', icon: '🔗' },
  ] as const

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>全局性能仪表盘</span>
        <span style={s.subtitle}>数字员工运营全景</span>
      </div>

      <div style={s.tabRow}>
        {sections.map(sec => (
          <button key={sec.key} style={{ ...s.tab, ...(section === sec.key ? s.tabActive : {}) }}
            onClick={() => setSection(sec.key)}>
            {sec.icon} {sec.label}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {section === 'overview' && <OverviewSection data={data} />}
        {section === 'agents' && <AgentsSection data={data.agents} />}
        {section === 'rules' && <RulesSection data={data.rules} />}
        {section === 'routing' && <RoutingSection data={data.routing} />}
        {section === 'costs' && <CostsSection data={data.costs} />}
        {section === 'flow' && <FlowSection data={data.knowledge_flow} />}
      </div>
    </div>
  )
}

function OverviewSection({ data }: { data: DashboardData }) {
  const cards = [
    { label: 'Agent 总数', value: data.agents.total, color: '#3b82f6' },
    { label: '总 XP', value: data.agents.total_xp, color: '#a855f7' },
    { label: '经验规则', value: data.rules.total, color: '#10b981' },
    { label: '平均有效性', value: `${(data.rules.avg_effectiveness * 100).toFixed(0)}%`, color: data.rules.avg_effectiveness >= 0.7 ? '#10b981' : '#f59e0b' },
    { label: 'LLM 调用', value: data.costs.total_calls, color: '#f59e0b' },
    { label: 'LLM 成本', value: `$${data.costs.total_cost_usd.toFixed(4)}`, color: '#ef4444' },
    { label: '知识流动', value: data.knowledge_flow.total_flows, color: '#8b5cf6' },
    { label: '高分规则', value: data.rules.high_performers, color: '#10b981' },
  ]

  return (
    <div>
      <div style={s.cardGrid}>
        {cards.map((c, i) => (
          <div key={i} style={s.metricCard}>
            <div style={{ ...s.metricValue, color: c.color }}>{c.value}</div>
            <div style={s.metricLabel}>{c.label}</div>
          </div>
        ))}
      </div>

      {data.routing.depts.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>部门路由效率</div>
          {data.routing.depts.map(d => (
            <div key={d.dept_id} style={s.barRow}>
              <span style={s.barLabel}>{d.dept_name}</span>
              <div style={s.barOuter}>
                <div style={{ ...s.barInner, width: `${d.success_rate * 100}%`, background: d.success_rate >= 0.7 ? '#10b981' : d.success_rate >= 0.4 ? '#f59e0b' : '#ef4444' }} />
              </div>
              <span style={s.barValue}>{(d.success_rate * 100).toFixed(0)}%</span>
              <span style={s.barMeta}>{d.total_tasks} 任务</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentsSection({ data }: { data: DashboardData['agents'] }) {
  return (
    <div>
      <div style={s.cardGrid}>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{data.total}</div>
          <div style={s.metricLabel}>总 Agent 数</div>
        </div>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{data.total_xp}</div>
          <div style={s.metricLabel}>总 XP</div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>按阶段分布</div>
        <div style={s.tagRow}>
          {Object.entries(data.by_stage).map(([stage, count]) => (
            <span key={stage} style={{ ...s.tag, color: STAGE_COLORS[stage] || '#6b7280', borderColor: (STAGE_COLORS[stage] || '#6b7280') + '40' }}>
              {stage}: {count}
            </span>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Top Agent（按 XP）</div>
        {data.top_agents.map((a, i) => (
          <div key={a.agent_id} style={s.agentRow}>
            <span style={s.rank}>#{i + 1}</span>
            <span style={s.agentName}>{a.name}</span>
            <span style={s.agentDept}>{a.department}</span>
            <span style={{ ...s.stageTag, color: STAGE_COLORS[a.career_stage] || '#6b7280' }}>{a.career_stage}</span>
            <span style={s.xpBadge}>{a.total_xp} XP</span>
            <span style={s.skillCount}>{a.active_skills} 技能</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RulesSection({ data }: { data: DashboardData['rules'] }) {
  return (
    <div>
      <div style={s.cardGrid}>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{data.total}</div>
          <div style={s.metricLabel}>总规则数</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ ...s.metricValue, color: data.avg_effectiveness >= 0.7 ? '#10b981' : '#f59e0b' }}>
            {(data.avg_effectiveness * 100).toFixed(0)}%
          </div>
          <div style={s.metricLabel}>平均有效性</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ ...s.metricValue, color: '#10b981' }}>{data.high_performers}</div>
          <div style={s.metricLabel}>高分规则</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ ...s.metricValue, color: '#ef4444' }}>{data.low_performers}</div>
          <div style={s.metricLabel}>低分规则</div>
        </div>
      </div>

      {data.top_rules.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>高分规则 Top 5</div>
          {data.top_rules.map((r, i) => (
            <div key={r.rule_id} style={s.ruleRow}>
              <span style={s.rank}>#{i + 1}</span>
              <span style={s.ruleTrigger}>{r.trigger}</span>
              <span style={{ ...s.scoreBadge, color: '#10b981' }}>★{(r.score * 100).toFixed(0)}%</span>
              <span style={s.usageCount}>{r.usage} 次</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RoutingSection({ data }: { data: DashboardData['routing'] }) {
  return (
    <div>
      <div style={s.section}>
        <div style={s.sectionTitle}>部门路由效率（{data.departments} 个部门）</div>
        {data.depts.map(d => (
          <div key={d.dept_id} style={s.deptRow}>
            <span style={s.deptName}>{d.dept_name}</span>
            <div style={s.barOuter}>
              <div style={{ ...s.barInner, width: `${d.success_rate * 100}%`, background: d.success_rate >= 0.7 ? '#10b981' : d.success_rate >= 0.4 ? '#f59e0b' : '#ef4444' }} />
            </div>
            <span style={s.barValue}>{(d.success_rate * 100).toFixed(0)}%</span>
            <span style={s.barMeta}>{d.total_tasks} 任务</span>
            {d.skill_level_boost > 0 && (
              <span style={s.boostBadge}>+{(d.skill_level_boost * 100).toFixed(0)}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CostsSection({ data }: { data: DashboardData['costs'] }) {
  return (
    <div>
      <div style={s.cardGrid}>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{data.total_calls}</div>
          <div style={s.metricLabel}>总调用次数</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ ...s.metricValue, color: '#ef4444' }}>${data.total_cost_usd.toFixed(4)}</div>
          <div style={s.metricLabel}>总成本</div>
        </div>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{(data.total_tokens_in + data.total_tokens_out).toLocaleString()}</div>
          <div style={s.metricLabel}>总 Token</div>
        </div>
      </div>

      {Object.keys(data.by_role).length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>按角色分摊</div>
          {Object.entries(data.by_role).sort((a, b) => b[1].cost_usd - a[1].cost_usd).map(([role, stats]) => (
            <div key={role} style={s.costRow}>
              <span style={s.costRole}>{role}</span>
              <span style={s.costCalls}>{stats.calls} 次</span>
              <span style={s.costAmount}>${stats.cost_usd.toFixed(4)}</span>
              <span style={s.costTokens}>{stats.tokens.toLocaleString()} tokens</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FlowSection({ data }: { data: DashboardData['knowledge_flow'] }) {
  return (
    <div>
      <div style={s.cardGrid}>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{data.total_flows}</div>
          <div style={s.metricLabel}>总知识流动</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ ...s.metricValue, color: '#10b981' }}>{data.unique_mentors}</div>
          <div style={s.metricLabel}>Mentor 数</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ ...s.metricValue, color: '#3b82f6' }}>{data.unique_mentees}</div>
          <div style={s.metricLabel}>Mentee 数</div>
        </div>
      </div>

      {data.recent_flows.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>最近知识流动</div>
          {data.recent_flows.map((f, i) => (
            <div key={i} style={s.flowRow}>
              <span style={s.flowFrom}>{f.from_agent}</span>
              <span style={s.flowArrow}>→</span>
              <span style={s.flowTo}>{f.to_agent}</span>
              <span style={s.flowRules}>{f.rule_ids?.length || 0} 规则</span>
              <span style={s.flowTime}>{f.timestamp?.slice(0, 16)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif", color: '#e2e8f0', overflow: 'auto' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' },
  header: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' },
  title: { fontSize: 16, fontWeight: 700, color: '#a78bfa' },
  subtitle: { fontSize: 11, color: '#6b7280', marginLeft: 10 },
  tabRow: { display: 'flex', gap: 2, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' as const },
  tab: { padding: '5px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  tabActive: { background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.5)', color: '#c4b5fd' },
  body: { padding: 16 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 },
  metricCard: { background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' as const },
  metricValue: { fontSize: 22, fontWeight: 700, color: '#e2e8f0' },
  metricLabel: { fontSize: 10, color: '#6b7280', marginTop: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 },
  tagRow: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  tag: { padding: '3px 10px', borderRadius: 10, fontSize: 11, border: '1px solid' },
  barRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  barLabel: { width: 80, fontSize: 12, color: '#d1d5db', flexShrink: 0 },
  barOuter: { flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' },
  barInner: { height: '100%', borderRadius: 4, transition: 'width 0.3s' },
  barValue: { fontSize: 12, fontWeight: 600, color: '#e2e8f0', width: 40, textAlign: 'right' as const },
  barMeta: { fontSize: 10, color: '#6b7280', width: 60 },
  agentRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  rank: { fontSize: 11, color: '#6b7280', width: 24 },
  agentName: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', flex: 1 },
  agentDept: { fontSize: 10, color: '#6b7280' },
  stageTag: { padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 },
  xpBadge: { fontSize: 12, fontWeight: 600, color: '#f59e0b' },
  skillCount: { fontSize: 10, color: '#6b7280' },
  ruleRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  ruleTrigger: { fontSize: 12, color: '#d1d5db', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  scoreBadge: { fontSize: 12, fontWeight: 600 },
  usageCount: { fontSize: 10, color: '#6b7280' },
  deptRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  deptName: { width: 80, fontSize: 12, color: '#d1d5db', flexShrink: 0 },
  boostBadge: { fontSize: 10, color: '#a855f7', fontWeight: 600 },
  costRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  costRole: { fontSize: 12, color: '#d1d5db', flex: 1 },
  costCalls: { fontSize: 11, color: '#6b7280' },
  costAmount: { fontSize: 12, fontWeight: 600, color: '#ef4444' },
  costTokens: { fontSize: 10, color: '#6b7280' },
  flowRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  flowFrom: { fontSize: 12, color: '#10b981', fontWeight: 600 },
  flowArrow: { fontSize: 12, color: '#6b7280' },
  flowTo: { fontSize: 12, color: '#3b82f6', fontWeight: 600 },
  flowRules: { fontSize: 10, color: '#6b7280' },
  flowTime: { fontSize: 10, color: '#4b5563' },
}
