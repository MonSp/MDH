import React, { useMemo, useState, useEffect } from 'react'
import { DEFAULT_ROLE_PROFILES, AgentRole } from '../../modules/agentTypes'
import RoleAvatar from '../RoleAvatar'
import type { TeamAgent } from './types'
import { WORKSTATIONS, MEETING_TABLE } from './constants'
import { getAgentPosition, isMeetingView } from './utils'

interface SubTask {
  subtask_id: string
  description: string
  status: string
  agent_id: string
  created_at: number
  completed_at: number
}

interface ProjectTask {
  task_id: string
  description: string
  status: string
  created_at: number
  completed_at: number
  meeting_id: string
  subtasks: SubTask[]
}

interface ProjectDetail {
  project_id: string
  name: string
  status: string
  brief: Record<string, unknown>
  created_at: string
  category: string
  tasks: ProjectTask[]
  employees: Array<{ employee_id: string; agent_id: string; skill_id: string; status: string }>
  skill_packages: Array<{ skill_id: string; name: string }>
  execution_logs: Array<Record<string, unknown>>
}

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
  const [experienceRules, setExperienceRules] = useState<Array<{ rule_id: string; trigger_condition: string; action: string; status: string; keywords: string[] }>>([])

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
              <div>
                <div style={styles.sectionTitle}>团队成员 ({teamMembers.length})</div>
                {teamMembers.length === 0 ? (
                  <div style={styles.emptyState}>暂无团队成员数据</div>
                ) : (
                  teamMembers.map(agent => {
                    const profile = DEFAULT_ROLE_PROFILES[agent.role] || { emoji: '👤', personality: '未知角色', themeColor: '#6b7280' }
                    const isSelected = selectedAgent?.id === agent.id
                    return (
                      <div key={agent.id}>
                        <div
                          style={{ ...styles.teamMember, ...(isSelected ? styles.teamMemberSelected : {}) }}
                          onClick={() => setSelectedAgent(isSelected ? null : agent)}
                        >
                          <span style={styles.memberEmoji}>{profile.emoji}</span>
                          <div style={styles.memberInfo}>
                            <div style={styles.memberName}>{agent.name.split('-')[0]}</div>
                            <div style={{ ...styles.memberStatus, color: agent.status === 'working' ? '#10b981' : agent.status === 'meeting' ? '#3b82f6' : '#6b7280' }}>
                              {agent.status === 'working' ? '工作中' : agent.status === 'meeting' ? '会议中' : '空闲'}
                            </div>
                          </div>
                          <span style={styles.expandIcon}>{isSelected ? '▼' : '▶'}</span>
                        </div>
                        {isSelected && (
                          <div style={styles.agentDetail}>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>角色</span>
                              <span style={styles.detailValue}>{profile.emoji} {agent.role}</span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>描述</span>
                              <span style={styles.detailValue}>{profile.personality}</span>
                            </div>
                            <div style={styles.detailRow}>
                              <span style={styles.detailLabel}>状态</span>
                              <span style={{ ...styles.detailValue, color: agent.status === 'working' ? '#10b981' : agent.status === 'meeting' ? '#3b82f6' : '#6b7280' }}>
                                {agent.status === 'working' ? '⚡ 执行任务中' : agent.status === 'meeting' ? '🤝 会议中' : '💤 空闲'}
                              </span>
                            </div>
                            {agent.currentTask && (
                              <div style={styles.detailRow}>
                                <span style={styles.detailLabel}>当前任务</span>
                                <span style={styles.detailValue}>{agent.currentTask}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}

                <div style={{ ...styles.sectionTitle, marginTop: 16 }}>项目状态</div>
                <div style={styles.statusItem}>
                  <span style={styles.statusLabel}>项目ID</span>
                  <span style={styles.statusValue}>{projectId?.slice(0, 8) || '-'}...</span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.statusLabel}>状态</span>
                  <span style={{ ...styles.statusValue, color: projectDetail?.status === 'running' ? '#10b981' : projectDetail?.status === 'archived' ? '#8b5cf6' : '#f59e0b' }}>
                    {projectDetail?.status === 'running' ? '运行中' : projectDetail?.status === 'archived' ? '已归档' : projectDetail?.status || '未知'}
                  </span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.statusLabel}>团队人数</span>
                  <span style={styles.statusValue}>{teamMembers.length} 人</span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.statusLabel}>技能包</span>
                  <span style={styles.statusValue}>{projectDetail?.skill_packages?.length || 0} 个</span>
                </div>
                <div style={styles.statusItem}>
                  <span style={styles.statusLabel}>执行日志</span>
                  <span style={styles.statusValue}>{projectDetail?.execution_logs?.length || 0} 条</span>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div>
                <div style={styles.sectionTitle}>任务列表 ({projectDetail?.tasks?.length || 0})</div>
                {projectDetail?.tasks && projectDetail.tasks.length > 0 ? (
                  projectDetail.tasks
                    .sort((a, b) => b.created_at - a.created_at)
                    .map((task) => {
                      const statusMap: Record<string, { icon: string; color: string; label: string }> = {
                        completed: { icon: '✅', color: '#10b981', label: '已完成' },
                        executing: { icon: '⚡', color: '#f59e0b', label: '执行中' },
                        pending: { icon: '⏳', color: '#6b7280', label: '待处理' },
                        failed: { icon: '❌', color: '#ef4444', label: '失败' },
                      }
                      const st = statusMap[task.status] || statusMap.pending
                      const timeStr = task.created_at > 0
                        ? new Date(task.created_at * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : ''
                      const completedSubtasks = task.subtasks?.filter(s => s.status === 'completed').length || 0
                      const totalSubtasks = task.subtasks?.length || 0

                      return (
                        <div key={task.task_id} style={styles.taskItem}>
                          <div style={styles.taskMain}>
                            <span style={{ fontSize: 14 }}>{st.icon}</span>
                            <div style={styles.taskInfo}>
                              <div style={styles.taskDesc}>{task.description}</div>
                              <div style={styles.taskMeta}>
                                {timeStr && <span>{timeStr}</span>}
                                {totalSubtasks > 0 && <span> · 子任务 {completedSubtasks}/{totalSubtasks}</span>}
                              </div>
                            </div>
                            <span style={{ ...styles.taskStatus, color: st.color }}>{st.label}</span>
                          </div>
                          {/* 子任务列表 */}
                          {task.subtasks && task.subtasks.length > 0 && (
                            <div style={styles.subtaskList}>
                              {task.subtasks.map((subtask) => {
                                const subst = statusMap[subtask.status] || statusMap.pending
                                return (
                                  <div key={subtask.subtask_id} style={styles.subtaskItem}>
                                    <span style={{ fontSize: 12, width: 16, textAlign: 'center' as const }}>{subst.icon}</span>
                                    <div style={styles.subtaskDesc}>{subtask.description}</div>
                                    <span style={{
                                      fontSize: 9,
                                      fontWeight: 600,
                                      color: subst.color,
                                      padding: '2px 6px',
                                      borderRadius: '8px',
                                      background: `${subst.color}15`,
                                      flexShrink: 0,
                                    }}>{subst.label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })
                ) : (
                  <div style={styles.emptyState}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                    <div style={{ marginBottom: 4 }}>暂无任务记录</div>
                    <div style={{ fontSize: 11, color: '#4b5563' }}>通过CEO对话发起任务后，将在这里显示</div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div>
                <div style={styles.sectionTitle}>项目文件</div>
                {projectDetail?.execution_logs && projectDetail.execution_logs.length > 0 ? (
                  projectDetail.execution_logs
                    .filter(log => log.type === 'file_write' || log.type === 'iteration')
                    .slice(0, 10)
                    .map((log, i) => (
                      <div key={i} style={styles.fileItem}>
                        <span style={styles.fileIcon}>📄</span>
                        <div style={styles.fileInfo}>
                          <div style={styles.fileName}>{String(log.file || log.task_id || '未知文件')}</div>
                          <div style={styles.fileMeta}>{String(log.type)}</div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div style={styles.emptyState}>暂无文件记录</div>
                )}
              </div>
            )}

            {activeTab === 'skills' && (
              <div>
                <div style={styles.sectionTitle}>技能包</div>
                {projectDetail?.skill_packages && projectDetail.skill_packages.length > 0 ? (
                  projectDetail.skill_packages.map((sp, i) => (
                    <div key={i} style={styles.skillItem}>
                      <span style={styles.skillIcon}>📦</span>
                      <div style={styles.skillInfo}>
                        <div style={styles.skillName}>{sp.name}</div>
                        <div style={styles.skillMeta}>{sp.skill_id}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={styles.emptyState}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
                    <div style={{ marginBottom: 4 }}>暂无技能包</div>
                    <div style={{ fontSize: 11, color: '#4b5563' }}>项目完成后，经验规则将自动提取为技能包</div>
                  </div>
                )}

                <div style={{ ...styles.sectionTitle, marginTop: 16 }}>经验规则 ({experienceRules.length})</div>
                {experienceRules.length > 0 ? (
                  experienceRules.slice(0, 10).map((rule, i) => (
                    <div key={rule.rule_id || i} style={styles.ruleItem}>
                      <div style={styles.ruleHeader}>
                        <span style={{
                          ...styles.ruleTypeTag,
                          background: rule.status === 'approved' ? 'rgba(16,185,129,0.15)' :
                                     rule.status === 'pending_review' ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.15)',
                          color: rule.status === 'approved' ? '#10b981' :
                                 rule.status === 'pending_review' ? '#f59e0b' : '#6b7280',
                        }}>
                          {rule.status === 'approved' ? '已采纳' : rule.status === 'pending_review' ? '待审核' : rule.status}
                        </span>
                      </div>
                      <div style={styles.ruleAction}>{rule.action}</div>
                      {rule.keywords && rule.keywords.length > 0 && (
                        <div style={styles.ruleKeywords}>
                          {rule.keywords.slice(0, 3).map((kw, j) => (
                            <span key={j} style={styles.keywordTag}>{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={styles.emptyState}>暂无经验规则</div>
                )}
              </div>
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
  },
  leftPanel: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  rightPanel: {
    width: '280px',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  panelHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  panelTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  tabBtn: {
    flex: 1,
    padding: '8px 4px',
    background: 'transparent',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    color: '#6b7280',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  tabBtnActive: {
    color: '#a78bfa',
    borderBottomColor: '#8b5cf6',
    background: 'rgba(139,92,246,0.05)',
  },
  tabContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#8b5cf6',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  teamMember: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    borderRadius: '6px',
    marginBottom: '4px',
    background: 'rgba(255,255,255,0.03)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.06)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  teamMemberSelected: {
    background: 'rgba(139,92,246,0.1)',
    borderColor: 'rgba(139,92,246,0.3)',
  },
  memberEmoji: {
    fontSize: '20px',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  memberStatus: {
    fontSize: '11px',
    marginTop: '2px',
  },
  expandIcon: {
    fontSize: '10px',
    color: '#6b7280',
    marginLeft: 'auto',
  },
  agentDetail: {
    margin: '0 0 8px 8px',
    padding: '8px 12px',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '6px',
    border: '1px solid rgba(139,92,246,0.15)',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  detailLabel: {
    fontSize: '11px',
    color: '#6b7280',
  },
  detailValue: {
    fontSize: '11px',
    color: '#e2e8f0',
    textAlign: 'right' as const,
    maxWidth: '60%',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '13px',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    borderRadius: '6px',
    marginBottom: '4px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  fileIcon: {
    fontSize: '16px',
  },
  fileInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  fileName: {
    fontSize: '12px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileMeta: {
    fontSize: '10px',
    color: '#6b7280',
  },
  skillItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    borderRadius: '6px',
    marginBottom: '4px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  skillIcon: {
    fontSize: '16px',
  },
  skillInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  skillName: {
    fontSize: '12px',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  skillMeta: {
    fontSize: '10px',
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  taskItem: {
    padding: '10px 12px',
    marginBottom: '6px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.03)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  taskMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  taskInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  taskDesc: {
    fontSize: '12px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: '2px',
  },
  taskMeta: {
    fontSize: '10px',
    color: '#6b7280',
  },
  taskStatus: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  subtaskList: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'rgba(255,255,255,0.04)',
    marginLeft: '22px',
  },
  subtaskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    marginBottom: '4px',
    borderRadius: '6px',
    background: 'rgba(0,0,0,0.2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.04)',
  },
  subtaskDesc: {
    flex: 1,
    fontSize: '11px',
    color: '#d1d5db',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  ruleItem: {
    padding: '10px 12px',
    marginBottom: '6px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  ruleHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  ruleTypeTag: {
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600,
  },
  ruleAction: {
    fontSize: '12px',
    color: '#e2e8f0',
    lineHeight: 1.5,
    marginBottom: '6px',
  },
  ruleKeywords: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  keywordTag: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    background: 'rgba(139,92,246,0.1)',
    color: '#a78bfa',
    border: '1px solid rgba(139,92,246,0.2)',
  },
  officeScene: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a2a 100%)',
  },
  gridFloor: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(rgba(139,92,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.03) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
  },
  neonGlow: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.08) 0%, transparent 60%)',
  },
  officeTitle: {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    zIndex: 10,
  },
  officeTitleText: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '16px',
    fontWeight: 700,
    color: '#e2e8f0',
    textShadow: '0 0 20px rgba(139,92,246,0.5)',
  },
  titleIcon: {
    fontSize: '20px',
  },
  officeTitleHint: {
    fontSize: '11px',
    color: '#6b7280',
  },
  workstation: {
    position: 'absolute',
    width: '64px',
    height: '56px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    transform: 'translate(-50%, -50%)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.3s ease',
    cursor: 'default',
    overflow: 'hidden',
  },
  screenGlow: {
    position: 'absolute',
    inset: -10,
    borderRadius: '16px',
    pointerEvents: 'none',
  },
  wsIcon: {
    fontSize: '18px',
    position: 'relative',
    zIndex: 1,
  },
  wsLabel: {
    fontSize: '9px',
    fontWeight: 600,
    fontFamily: 'monospace',
    position: 'relative',
    zIndex: 1,
  },
  wsAgentName: {
    fontSize: '8px',
    color: '#9ca3af',
    position: 'absolute',
    bottom: '4px',
    left: '50%',
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap' as const,
  },
  meetingTable: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: '2px solid rgba(139,92,246,0.3)',
    background: 'rgba(139,92,246,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.5s ease',
  },
  meetingTableActive: {
    borderColor: 'rgba(139,92,246,0.6)',
    background: 'rgba(139,92,246,0.15)',
    boxShadow: '0 0 40px rgba(139,92,246,0.2)',
  },
  tableInner: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  tableIcon: {
    fontSize: '20px',
  },
  tableLabel: {
    fontSize: '10px',
    color: '#8b5cf6',
    fontWeight: 600,
  },
  agentEntity: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    zIndex: 20,
  },
  agentAvatar: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.3s ease',
  },
  agentLabel: {
    padding: '2px 8px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '10px',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    backdropFilter: 'blur(8px)',
  },
  workingIndicator: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    fontSize: '14px',
    animation: 'agent-glow-pulse 1.5s ease-in-out infinite',
  },
  officeControls: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 30,
  },
  startMeetingBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 24px',
    borderRadius: '12px',
    border: '1px solid rgba(139,92,246,0.5)',
    background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.3))',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 0 20px rgba(139,92,246,0.3)',
    transition: 'all 0.2s ease',
  },
  btnIcon: {
    fontSize: '16px',
  },
}
