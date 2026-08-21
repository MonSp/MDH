import React, { useState, useEffect } from 'react'
import { listDepartments, getAgentProfile } from '../../modules/careerDevelopment'
import type { DepartmentCareerPath, CareerPathStage, AgentProfile, SkillProgress } from '../../modules/careerDevelopment.types'

const STAGE_COLORS: Record<string, string> = {
  junior: '#6b7280',
  mid: '#3b82f6',
  senior: '#a855f7',
  lead: '#f59e0b',
}

export default function CareerPathPanel() {
  const [departments, setDepartments] = useState<DepartmentCareerPath[]>([])
  const [selectedDept, setSelectedDept] = useState<string>('')
  const [agentId, setAgentId] = useState('agent-executor')
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    listDepartments().then(depts => {
      setDepartments(depts)
      if (depts.length > 0 && !selectedDept) setSelectedDept(depts[0].department)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!agentId) return
    setLoading(true)
    getAgentProfile(agentId)
      .then(p => { setProfile(p); if (p.department) setSelectedDept(p.department) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId])

  const dept = departments.find(d => d.department === selectedDept)
  const currentStage = profile?.career_stage || 'junior'

  return (
    <div style={s.container}>
      {/* 筛选栏 */}
      <div style={s.filterRow}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Agent</label>
          <input
            style={s.filterInput}
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            placeholder="agent ID"
          />
        </div>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>部门</label>
          <select
            style={s.filterSelect}
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
          >
            {departments.map(d => (
              <option key={d.department} value={d.department}>{d.name} ({d.department})</option>
            ))}
          </select>
        </div>
        {profile && (
          <div style={s.profileSummary}>
            <span style={s.profileName}>{profile.name}</span>
            <span style={{ ...s.stageChip, background: STAGE_COLORS[currentStage] || '#6b7280' }}>{currentStage}</span>
            <span style={s.xpText}>{profile.total_xp} XP</span>
          </div>
        )}
      </div>

      {/* 职业路径时间线 */}
      {dept ? (
        <div style={s.timeline}>
          {dept.stages.map((stage, i) => {
            const isCurrent = stage.stage === currentStage
            const stageIdx = dept!.stages.findIndex(s => s.stage === currentStage)
            const isPast = i < stageIdx
            const isFuture = i > stageIdx
            return (
              <div key={stage.stage} style={s.timelineItem}>
                {/* 连接线 */}
                {i > 0 && (
                  <div style={{
                    ...s.connector,
                    background: isPast ? (STAGE_COLORS[stage.stage] || '#6b7280') : 'rgba(255,255,255,0.1)',
                  }} />
                )}
                {/* 节点 */}
                <div style={{
                  ...s.node,
                  background: isCurrent ? (STAGE_COLORS[stage.stage] || '#6b7280') : isPast ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.05)',
                  borderColor: isCurrent ? '#fff' : isPast ? '#10b981' : 'rgba(255,255,255,0.15)',
                  transform: isCurrent ? 'scale(1.15)' : 'none',
                }}>
                  <span style={s.nodeIcon}>{isPast ? '✓' : isCurrent ? '●' : (i + 1)}</span>
                </div>
                {/* 信息卡片 */}
                <div style={{
                  ...s.card,
                  borderColor: isCurrent ? (STAGE_COLORS[stage.stage] || '#6b7280') : 'rgba(255,255,255,0.06)',
                  opacity: isFuture ? 0.6 : 1,
                }}>
                  <div style={s.cardHeader}>
                    <span style={{ ...s.cardTitle, color: isCurrent ? '#e2e8f0' : '#9ca3af' }}>{stage.title}</span>
                    <span style={{ ...s.stageTag, color: STAGE_COLORS[stage.stage] || '#6b7280' }}>{stage.stage}</span>
                  </div>
                  {stage.requirements ? (
                    <div style={s.reqList}>
                      {stage.requirements.min_mid_skills != null && (
                        <div style={s.reqItem}>
                          <span style={s.reqDot} />
                          至少 <b>{stage.requirements.min_mid_skills}</b> 个技能达到中级
                        </div>
                      )}
                      {stage.requirements.min_senior_skills != null && (
                        <div style={s.reqItem}>
                          <span style={s.reqDot} />
                          至少 <b>{stage.requirements.min_senior_skills}</b> 个技能达到高级
                        </div>
                      )}
                      {stage.requirements.required_skills && Object.entries(stage.requirements.required_skills).map(([skill, lvl]) => {
                        const sp: SkillProgress | undefined = profile?.skill_progress?.[skill]
                        const met = sp && sp.level >= (lvl as number)
                        return (
                          <div key={skill} style={s.reqItem}>
                            <span style={{ ...s.reqDot, background: met ? '#10b981' : '#ef4444' }} />
                            <span style={{ color: met ? '#10b981' : '#ef4444' }}>{skill}</span>
                            {' '}达到 Lv.{lvl}
                            {sp && <span style={s.reqProgress}> (当前 Lv.{sp.level})</span>}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={s.noReq}>无特殊要求</div>
                  )}
                  {isCurrent && <div style={s.currentBadge}>当前阶段</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={s.empty}>选择一个部门查看职业路径</div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: 12, fontFamily: "'Noto Sans SC', sans-serif" },
  filterRow: { display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' as const },
  filterGroup: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  filterLabel: { fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  filterInput: { padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', width: 140 },
  filterSelect: { padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', minWidth: 180 },
  profileSummary: { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  profileName: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  stageChip: { padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff' },
  xpText: { fontSize: 12, color: '#f59e0b', fontWeight: 600 },
  timeline: { display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto' as const, padding: '16px 0', flex: 1 },
  timelineItem: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', minWidth: 200, flex: 1, position: 'relative' as const },
  connector: { position: 'absolute' as const, top: 20, left: -20, width: 40, height: 3, borderRadius: 2 },
  node: { width: 40, height: 40, borderRadius: '50%', border: '3px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, transition: 'all 0.2s', zIndex: 1 },
  nodeIcon: { fontSize: 14, fontWeight: 700, color: '#fff' },
  card: { background: 'rgba(0,0,0,0.25)', border: '2px solid', borderRadius: 10, padding: '12px 14px', width: '100%', maxWidth: 220 },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 13, fontWeight: 700 },
  stageTag: { fontSize: 10, fontWeight: 600, fontFamily: 'monospace' },
  reqList: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  reqItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#d1d5db' },
  reqDot: { width: 6, height: 6, borderRadius: '50%', background: '#6b7280', flexShrink: 0 },
  reqProgress: { color: '#6b7280', fontSize: 10 },
  noReq: { fontSize: 11, color: '#6b7280', fontStyle: 'italic' },
  currentBadge: { marginTop: 8, padding: '3px 10px', borderRadius: 10, background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 10, fontWeight: 600, textAlign: 'center' as const },
  empty: { padding: 40, textAlign: 'center' as const, color: '#6b7280', fontSize: 13 },
}
