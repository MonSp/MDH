import React, { useState } from 'react'
import { SkillRegistryPanel } from './SkillRegistryPanel'
import { ProjectListPanel } from './ProjectListPanel'
import { ExperienceRulePanel } from './ExperienceRulePanel'
import { RouteTablePanel } from './RouteTablePanel'
import RoleConfigPanel from './RoleConfigPanel'
import AgentProfilePanel from './AgentProfilePanel'
import { SkillTreeView } from './SkillTreeView'
import CareerPathPanel from './CareerPathPanel'
import PerformanceDashboard from './PerformanceDashboard'
import EvolutionToast from './EvolutionToast'
import FeedbackPanel from './FeedbackPanel'

type TabKey = 'skills' | 'projects' | 'rules' | 'routes' | 'roles' | 'career' | 'dashboard' | 'feedback'

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'skills', label: '技能包', icon: '📦' },
  { key: 'projects', label: '项目', icon: '📁' },
  { key: 'rules', label: '经验规则', icon: '📋' },
  { key: 'routes', label: '路由表', icon: '🧭' },
  { key: 'roles', label: '角色配置', icon: '👥' },
  { key: 'career', label: '职业发展', icon: '🚀' },
  { key: 'dashboard', label: '性能仪表盘', icon: '📊' },
  { key: 'feedback', label: '反馈', icon: '💬' },
]

export default function SkillEvolutionDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('skills')

  return (
    <div style={styles.container}>
      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div style={styles.content}>
        {activeTab === 'skills' && <SkillRegistryPanel />}
        {activeTab === 'projects' && <ProjectListPanel />}
        {activeTab === 'rules' && <ExperienceRulePanel />}
        {activeTab === 'routes' && <RouteTablePanel />}
        {activeTab === 'roles' && <RoleConfigPanel />}
        {activeTab === 'career' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CareerPathPanel />
            <div style={{ flex: 1, borderTop: '1px solid rgba(255,255,255,0.06)', minHeight: 0, overflow: 'auto' }}>
              <SkillTreeView />
            </div>
          </div>
        )}
        {activeTab === 'dashboard' && <PerformanceDashboard />}
        {activeTab === 'feedback' && <FeedbackPanel />}
      </div>
      <EvolutionToast />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'rgba(0,0,0,0.2)',
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#e2e8f0',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(0,0,0,0.15)',
    padding: '0 8px',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 14px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: '#6b7280',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    color: '#a78bfa',
    borderBottomColor: '#8b5cf6',
    background: 'rgba(139,92,246,0.08)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
}
