import React, { useMemo, useState, useEffect } from 'react'
import { DEFAULT_ROLE_PROFILES, AgentRole } from '../../modules/agentTypes'
import RoleAvatar from '../RoleAvatar'
import type { TeamAgent, ProjectDetail } from './types'
import { WORKSTATIONS } from './constants'
import { getAgentPosition, isMeetingView } from './utils'
import { styles } from './OfficeScene.styles'
import TeamTab from './office-scene/TeamTab'
import TasksTab from './office-scene/TasksTab'
import FilesTab from './office-scene/FilesTab'
import SkillsTab from './office-scene/SkillsTab'

interface OfficeSceneProps {
  agents: TeamAgent[]
  viewState: string
  onStartMeeting: () => void
  projectName?: string
  projectId?: string
  projectDetail?: ProjectDetail | null
}

export default function OfficeScene({ agents, viewState, onStartMeeting, projectName, projectId, projectDetail }: OfficeSceneProps) {
  const isMeeting = isMeetingView(viewState)
  const [activeTab, setActiveTab] = useState<'team' | 'tasks' | 'files' | 'skills'>('team')
  const [selectedAgent, setSelectedAgent] = useState<TeamAgent | null>(null)
  const [experienceRules, setExperienceRules] = useState<Array<{ rule_id: string; trigger_condition: string; action: string; status: string; keywords: string[]; effectiveness_score?: number; usage_count?: number }>>([])

  // 获取经验规则
  useEffect(() => {
    fetch('/api/experience/rules')
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setExperienceRules(data.data)
        }
      })
      .catch(err => console.error('加载经验规则失败:', err))
  }, [])

  // 默认团队配置（按项目分类）
  const defaultTeams: Record<string, Array<{ name: string; role: AgentRole }>> = {
    '软件开发': [
      { name: '产品经理', role: 'coordinator' as AgentRole },
      { name: '架构师', role: 'planner' as AgentRole },
      { name: '全栈开发', role: 'executor' as AgentRole },
      { name: 'QA工程师', role: 'reviewer' as AgentRole },
    ],
    '物流系统': [
      { name: '产品经理', role: 'coordinator' as AgentRole },
      { name: '架构师', role: 'planner' as AgentRole },
      { name: '后端开发', role: 'executor' as AgentRole },
      { name: '前端开发', role: 'executor' as AgentRole },
    ],
    '数据分析': [
      { name: '数据负责人', role: 'coordinator' as AgentRole },
      { name: '数据工程师', role: 'executor' as AgentRole },
      { name: '数据分析师', role: 'planner' as AgentRole },
    ],
    '内容创作': [
      { name: '内容总监', role: 'coordinator' as AgentRole },
      { name: '撰稿人', role: 'executor' as AgentRole },
    ],
    'default': [
      { name: '项目经理', role: 'coordinator' as AgentRole },
      { name: '开发工程师', role: 'executor' as AgentRole },
    ],
  }

  // 合并实时agents和项目历史员工数据
  const teamMembers = agents.length > 0 ? agents : (projectDetail?.employees || []).length > 0
    ? (projectDetail?.employees || []).map((emp, idx) => ({
        id: emp.employee_id || emp.agent_id,
        name: emp.agent_id?.replace('agent-', '') || `员工${idx + 1}`,
        role: (emp.agent_id?.includes('planner') ? 'planner' :
               emp.agent_id?.includes('executor') ? 'executor' :
               emp.agent_id?.includes('reviewer') ? 'reviewer' :
               emp.agent_id?.includes('monitor') ? 'monitor' : 'executor') as AgentRole,
        status: emp.status as 'idle' | 'working' | 'meeting' | 'wandering',
        currentTask: null,
        workstationId: WORKSTATIONS[idx % WORKSTATIONS.length]?.id || '',
      }))
    : (defaultTeams[projectDetail?.category || ''] || defaultTeams['default']).map((member, idx) => ({
        id: `default-${idx}`,
        name: member.name,
        role: member.role,
        status: 'idle' as const,
        currentTask: null,
        workstationId: WORKSTATIONS[idx % WORKSTATIONS.length]?.id || '',
      }))

  return (
    <div style={styles.container}>
      {/* 左侧：工位布局 */}
      <div style={styles.leftPanel}>
        <div style={styles.officeScene}>
          {/* 背景网格 */}
          <div style={styles.gridFloor} />
          <div style={styles.neonGlow} />

          {/* 标题 */}
          <div style={styles.officeTitle}>
            <span style={styles.officeTitleText}>
              <span style={styles.titleIcon}>⚡</span>
              {projectName || 'Tech Lab'}
            </span>
            {!isMeeting && (
              <span style={styles.officeTitleHint}>团队工位分布</span>
            )}
          </div>

          {/* 工作站 */}
          {WORKSTATIONS.map(ws => {
            const agent = teamMembers.find(a => a.workstationId === ws.id)
            const profile = agent ? (DEFAULT_ROLE_PROFILES[agent.role] || { emoji: '👤', themeColor: '#6b7280' }) : null
            return (
              <div
                key={ws.id}
                style={{
                  ...styles.workstation,
                  left: `${ws.x}%`,
                  top: `${ws.y}%`,
                  borderColor: profile ? profile.themeColor + '50' : 'rgba(255,255,255,0.08)',
                  boxShadow: profile
                    ? `0 0 20px ${profile.themeColor}15, inset 0 0 15px ${profile.themeColor}08`
                    : 'none',
                }}
              >
                <div style={{
                  ...styles.screenGlow,
                  background: profile
                    ? `radial-gradient(ellipse at center, ${profile.themeColor}20 0%, transparent 70%)`
                    : 'none',
                }} />
                <div style={styles.wsIcon}>{profile ? profile.emoji : '💻'}</div>
                <div style={{ ...styles.wsLabel, color: profile ? profile.themeColor : '#4a5575' }}>
                  {ws.id.replace('ws-', '#')}
                </div>
                {agent && agent.status !== 'meeting' && (
                  <div style={styles.wsAgentName}>{agent.name.split('-')[0]}</div>
                )}
                {agent && agent.status === 'idle' && (
                  <div style={{
                    position: 'absolute', bottom: 4, right: 4,
                    width: 4, height: 4, borderRadius: '50%',
                    background: '#30d158',
                    animation: 'breathe 3s ease-in-out infinite',
                  }} />
                )}
              </div>
            )
          })}

          {/* 会议桌 */}
          <div style={{ ...styles.meetingTable, ...(isMeeting ? styles.meetingTableActive : {}) }}>
            <div style={styles.tableInner}>
              <span style={styles.tableIcon}>🤝</span>
              <span style={styles.tableLabel}>会议桌</span>
            </div>
          </div>

          {/* 智能体 */}
          {teamMembers.map(agent => {
            const pos = getAgentPosition(agent, teamMembers, viewState)
            const profile = DEFAULT_ROLE_PROFILES[agent.role] || { emoji: '👤', themeColor: '#6b7280', personality: '' }
            return (
              <div
                key={agent.id}
                style={{
                  ...styles.agentEntity,
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transition: 'left 2s ease, top 2s ease',
                }}
              >
                <div style={{
                  position: 'absolute', inset: -8, borderRadius: '50%',
                  background: `radial-gradient(circle, ${profile.themeColor}10 0%, transparent 70%)`,
                  animation: agent.status === 'working' ? 'agent-glow-pulse 2s ease-in-out infinite' : 'none',
                }} />
                <div style={{
                  ...styles.agentAvatar,
                  borderColor: profile.themeColor,
                  boxShadow: agent.status === 'working'
                    ? `0 0 16px ${profile.themeColor}80, 0 0 32px ${profile.themeColor}30`
                    : `0 0 6px ${profile.themeColor}20`,
                }}>
                  <RoleAvatar
                    role={agent.role}
                    size={48}
                    status={agent.status === 'working' ? 'busy' : agent.status === 'meeting' ? 'waiting' : 'idle'}
                  />
                </div>
                {!isMeeting && (
                  <div style={{ ...styles.agentLabel, borderColor: profile.themeColor + '40', background: `${profile.themeColor}15` }}>
                    <span style={{ color: profile.themeColor, fontWeight: 700 }}>{agent.name.split('-')[0]}</span>
                  </div>
                )}
                {agent.status === 'working' && <div style={styles.workingIndicator}>⚡</div>}
              </div>
            )
          })}

          {/* 召集会议按钮 */}
          {!isMeeting && viewState === 'office' && (
            <div style={styles.officeControls}>
              <button style={styles.startMeetingBtn} onClick={onStartMeeting}>
                <span style={styles.btnIcon}>🚀</span>
                <span>召集团队会议</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：项目信息面板 */}
      {!isMeeting && (
        <div style={styles.rightPanel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelTitle}>📊 项目信息</div>
          </div>

          {/* 标签页 */}
          <div style={styles.tabBar}>
            {([['team', '👥 团队'], ['tasks', '📋 任务'], ['files', '📄 文件'], ['skills', '🧬 技能']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{ ...styles.tabBtn, ...(activeTab === key ? styles.tabBtnActive : {}) }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={styles.tabContent}>
            {activeTab === 'team' && (
              <TeamTab
                teamMembers={teamMembers}
                selectedAgent={selectedAgent}
                onSelectAgent={setSelectedAgent}
                projectDetail={projectDetail}
                projectId={projectId}
              />
            )}
            {activeTab === 'tasks' && (
              <TasksTab projectDetail={projectDetail} />
            )}
            {activeTab === 'files' && (
              <FilesTab projectDetail={projectDetail} />
            )}
            {activeTab === 'skills' && (
              <SkillsTab projectDetail={projectDetail} experienceRules={experienceRules} />
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes breathe { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
        @keyframes agent-glow-pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
      `}</style>
    </div>
  )
}
