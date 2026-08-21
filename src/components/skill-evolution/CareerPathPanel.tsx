import React, { useState, useEffect } from 'react'
import { listDepartments, getAgentProfile } from '../../modules/careerDevelopment'
import type { DepartmentCareerPath, AgentProfile, SkillProgress } from '../../modules/careerDevelopment.types'

const STAGE_COLORS: Record<string, string> = {
  junior: '#6b7280',
  mid: '#3b82f6',
  senior: '#a855f7',
  lead: '#f59e0b',
}

const DEPT_ICONS: Record<string, string> = {
  'dept-software': '💻', 'dept-content': '✍️', 'dept-ppt': '📊',
  'dept-design': '🎨', 'dept-data': '📈', 'dept-video': '🎬',
  'dept-ai-movie': '🤖', 'dept-marketing': '📣', 'dept-sales': '💰',
  'dept-product': '📋',
}

export default function CareerPathPanel() {
  const [departments, setDepartments] = useState<DepartmentCareerPath[]>([])
  const [selectedDept, setSelectedDept] = useState<DepartmentCareerPath | null>(null)
  const [agentId, setAgentId] = useState('agent-executor')
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    listDepartments().then(setDepartments).catch(() => {})
  }, [])

  useEffect(() => {
    if (!agentId) return
    setLoading(true)
    getAgentProfile(agentId)
      .then(p => { setProfile(p) })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [agentId])

  const currentStage = profile?.career_stage || 'junior'
  const profileDept = profile?.department || ''

  // 部门详情视图
  if (selectedDept) {
    return (
      <div style={s.container}>
        <div style={s.detailHeader}>
          <button style={s.backBtn} onClick={() => setSelectedDept(null)}>← 返回</button>
          <span style={s.deptTitle}>{DEPT_ICONS[selectedDept.department] || '🏢'} {selectedDept.name}</span>
          <span style={s.deptId}>{selectedDept.department}</span>
          {profileDept === selectedDept.department && profile && (
            <div style={s.profileSummary}>
              <span style={s.profileName}>{profile.name}</span>
              <span style={{ ...s.stageChip, background: STAGE_COLORS[currentStage] || '#6b7280' }}>{currentStage}</span>
              <span style={s.xpText}>{profile.total_xp} XP</span>
            </div>
          )}
        </div>

        <div style={s.timeline}>
          {selectedDept.stages.map((stage, i) => {
            const isActive = profileDept === selectedDept.department
            const isCurrent = isActive && stage.stage === currentStage
            const stageIdx = selectedDept.stages.findIndex(s => s.stage === currentStage)
            const isPast = isActive && i < stageIdx
            const isFuture = isActive && i > stageIdx || !isActive
            return (
              <div key={stage.stage} style={s.timelineItem}>
                {i > 0 && (
                  <div style={{
                    ...s.connector,
                    background: isPast ? '#10b981' : 'rgba(255,255,255,0.1)',
                  }} />
                )}
                <div style={{
                  ...s.node,
                  background: isCurrent ? (STAGE_COLORS[stage.stage] || '#6b7280') : isPast ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.05)',
                  borderColor: isCurrent ? '#fff' : isPast ? '#10b981' : 'rgba(255,255,255,0.15)',
                  transform: isCurrent ? 'scale(1.15)' : 'none',
                }}>
                  <span style={s.nodeIcon}>{isPast ? '✓' : isCurrent ? '●' : (i + 1)}</span>
                </div>
                <div style={{
                  ...s.card,
                  borderColor: isCurrent ? (STAGE_COLORS[stage.stage] || '#6b7280') : 'rgba(255,255,255,0.06)',
                  opacity: isFuture && isActive ? 0.6 : 1,
                }}>
                  <div style={s.cardHeader}>
                    <span style={{ ...s.cardTitle, color: isCurrent ? '#e2e8f0' : '#9ca3af' }}>{stage.title}</span>
                    <span style={{ ...s.stageTag, color: STAGE_COLORS[stage.stage] || '#6b7280' }}>{stage.stage}</span>
                  </div>
                  {stage.requirements ? (
                    <div style={s.reqList}>
                      {stage.requirements.min_mid_skills != null && (
                        <ReqItem label={`至少 ${stage.requirements.min_mid_skills} 个技能达到中级`} met={false} />
                      )}
                      {stage.requirements.min_senior_skills != null && (
                        <ReqItem label={`至少 ${stage.requirements.min_senior_skills} 个技能达到高级`} met={false} />
                      )}
                      {stage.requirements.required_skills && Object.entries(stage.requirements.required_skills).map(([skill, lvl]) => {
                        const sp = profile?.skill_progress?.[skill]
                        const met = !!sp && sp.level >= (lvl as number)
                        return (
                          <ReqItem
                            key={skill}
                            label={`${skill} ≥ Lv.${lvl}`}
                            met={met}
                            detail={sp ? `当前 Lv.${sp.level}` : undefined}
                          />
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
      </div>
    )
  }

  // 部门网格视图
  return (
    <div style={s.container}>
      <div style={s.gridHeader}>
        <span style={s.gridTitle}>部门职业路径</span>
        <div style={s.agentInput}>
          <label style={s.filterLabel}>Agent</label>
          <input style={s.filterInput} value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="agent ID" />
          {loading && <span style={s.loadingDot}>●</span>}
        </div>
      </div>
      <div style={s.grid}>
        {departments.map(d => {
          const isMyDept = profileDept === d.department
          return (
            <div
              key={d.department}
              style={{ ...s.gridCard, borderColor: isMyDept ? '#8b5cf6' : 'rgba(255,255,255,0.06)' }}
              onClick={() => setSelectedDept(d)}
            >
              <div style={s.gridCardTop}>
                <span style={s.gridCardIcon}>{DEPT_ICONS[d.department] || '🏢'}</span>
                <div style={s.gridCardInfo}>
                  <span style={s.gridCardName}>{d.name}</span>
                  <span style={s.gridCardId}>{d.department}</span>
                </div>
                {isMyDept && <span style={s.myDeptBadge}>当前</span>}
              </div>
              <div style={s.gridCardStages}>
                {d.stages.map((st, i) => (
                  <React.Fragment key={st.stage}>
                    {i > 0 && <span style={s.gridArrow}>→</span>}
                    <span style={{
                      ...s.gridStageTag,
                      color: STAGE_COLORS[st.stage] || '#6b7280',
                      background: isMyDept && st.stage === currentStage
                        ? `${STAGE_COLORS[st.stage]}22` : 'transparent',
                      borderColor: isMyDept && st.stage === currentStage
                        ? STAGE_COLORS[st.stage] : 'transparent',
                    }}>{st.title}</span>
                  </React.Fragment>
                ))}
              </div>
              <div style={s.gridCardFooter}>
                <span style={s.gridCardStagesCount}>{d.stages.length} 个阶段</span>
                <span style={s.gridCardArrow}>→</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReqItem({ label, met, detail }: { label: string; met: boolean; detail?: string }) {
  return (
    <div style={s.reqItem}>
      <span style={{ ...s.reqDot, background: met ? '#10b981' : '#ef4444' }} />
      <span style={{ color: met ? '#10b981' : '#ef4444' }}>{label}</span>
      {detail && <span style={s.reqProgress}> ({detail})</span>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: 12, fontFamily: "'Noto Sans SC', sans-serif", overflow: 'auto' },
  // Grid view
  gridHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  gridTitle: { fontSize: 15, fontWeight: 700, color: '#e2e8f0' },
  agentInput: { display: 'flex', alignItems: 'center', gap: 6 },
  filterLabel: { fontSize: 10, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase' as const },
  filterInput: { padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', width: 140 },
  loadingDot: { color: '#8b5cf6', fontSize: 8, animation: 'pulse 1s infinite' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, flex: 1 },
  gridCard: { background: 'rgba(0,0,0,0.25)', border: '1px solid', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s' },
  gridCardTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  gridCardIcon: { fontSize: 24 },
  gridCardInfo: { display: 'flex', flexDirection: 'column' as const, flex: 1 },
  gridCardName: { fontSize: 13, fontWeight: 700, color: '#e2e8f0' },
  gridCardId: { fontSize: 10, color: '#6b7280', fontFamily: 'monospace' },
  myDeptBadge: { padding: '2px 8px', borderRadius: 8, background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 10, fontWeight: 600 },
  gridCardStages: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 2, marginBottom: 8 },
  gridArrow: { fontSize: 10, color: '#4b5563' },
  gridStageTag: { fontSize: 10, padding: '1px 6px', borderRadius: 4, border: '1px solid' },
  gridCardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  gridCardStagesCount: { fontSize: 10, color: '#6b7280' },
  gridCardArrow: { fontSize: 12, color: '#6b7280' },
  // Detail view
  detailHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' as const },
  backBtn: { padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  deptTitle: { fontSize: 15, fontWeight: 700, color: '#e2e8f0' },
  deptId: { fontSize: 10, color: '#6b7280', fontFamily: 'monospace' },
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
}
