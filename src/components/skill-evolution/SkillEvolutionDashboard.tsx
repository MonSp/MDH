import React, { useState } from 'react'
import { SkillRegistryPanel } from './SkillRegistryPanel'
import { ProjectListPanel } from './ProjectListPanel'
import { ExperienceRulePanel } from './ExperienceRulePanel'
import { RouteTablePanel } from './RouteTablePanel'

type TabKey = 'skills' | 'projects' | 'rules' | 'routes'

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'skills', label: '技能包', icon: '📦' },
  { key: 'projects', label: '项目', icon: '📁' },
  { key: 'rules', label: '经验规则', icon: '📋' },
  { key: 'routes', label: '路由表', icon: '🧭' },
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
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#fff',
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
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
    color: '#1d4ed8',
    borderBottomColor: '#3b82f6',
    background: '#fff',
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
}
