import React from 'react'
import { DEFAULT_ROLE_PROFILES } from '../../../modules/agentTypes'
import type { TeamAgent, ProjectDetail } from '../types'
import { styles } from '../OfficeScene.styles'

interface TeamTabProps {
  teamMembers: TeamAgent[]
  selectedAgent: TeamAgent | null
  onSelectAgent: (agent: TeamAgent | null) => void
  projectDetail?: ProjectDetail | null
  projectId?: string
}

export default function TeamTab({ teamMembers, selectedAgent, onSelectAgent, projectDetail, projectId }: TeamTabProps) {
  return (
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
                onClick={() => onSelectAgent(isSelected ? null : agent)}
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
  )
}
