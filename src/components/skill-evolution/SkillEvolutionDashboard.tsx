import React, { useState, useEffect } from 'react'
import { SkillRegistryPanel } from './SkillRegistryPanel'
import { ProjectListPanel } from './ProjectListPanel'
import { ExperienceRulePanel } from './ExperienceRulePanel'
import { RouteTablePanel } from './RouteTablePanel'
import RoleConfigPanel from './RoleConfigPanel'
import AgentProfilePanel from './AgentProfilePanel'
import { SkillTreeView } from './SkillTreeView'
import CareerPathPanel from './CareerPathPanel'
import PerformanceDashboard from './PerformanceDashboard'
import FeedbackPanel from './FeedbackPanel'
import EvolutionTimelinePanel from './EvolutionTimelinePanel'
import RuleLineageView from './RuleLineageView'
import CapabilityRadarChart from './CapabilityRadarChart'
import EvolutionProofCard from './EvolutionProofCard'

type TabKey = 'skills' | 'projects' | 'rules' | 'routes' | 'roles' | 'career' | 'dashboard' | 'feedback' | 'timeline' | 'lineage' | 'radar' | 'proof'

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'skills', label: '技能包', icon: '📦' },
  { key: 'projects', label: '项目', icon: '📁' },
  { key: 'rules', label: '经验规则', icon: '📋' },
  { key: 'routes', label: '路由表', icon: '🧭' },
  { key: 'roles', label: '角色配置', icon: '👥' },
  { key: 'career', label: '职业发展', icon: '🚀' },
  { key: 'dashboard', label: '性能仪表盘', icon: '📊' },
  { key: 'feedback', label: '反馈', icon: '💬' },
  { key: 'timeline', label: '进化时间线', icon: '⏳' },
  { key: 'lineage', label: '规则链', icon: '🔗' },
  { key: 'radar', label: '能力雷达', icon: '🎯' },
  { key: 'proof', label: '进化验证', icon: '🏆' },
]

export default function SkillEvolutionDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('skills')
  const [lineageRuleId, setLineageRuleId] = useState('')
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.matchMedia('(max-width: 768px)').matches } catch { return false }
  })

  useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 768px)')
      const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } catch { /* test env */ }
  }, [])

  const tabBarStyle: React.CSSProperties = isMobile
    ? { ...styles.tabBar, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', padding: '0 4px', scrollbarWidth: 'none' as any, msOverflowStyle: 'none' as any }
    : styles.tabBar

  const tabStyle = (isActive: boolean): React.CSSProperties => isMobile
    ? { ...styles.tab, ...(isActive ? styles.tabActive : {}), padding: '6px 10px', fontSize: '12px', flexShrink: 0 }
    : { ...styles.tab, ...(isActive ? styles.tabActive : {}) }

  return (
    <div style={styles.container}>
      <div style={tabBarStyle}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={tabStyle(activeTab === tab.key)}
          >
            <span>{tab.icon}</span>
            <span>{isMobile ? '' : tab.label}</span>
          </button>
        ))}
      </div>
      <div style={{ ...styles.content, ...(isMobile ? { overflow: 'auto', WebkitOverflowScrolling: 'touch' } : {}) }}>
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
        {activeTab === 'timeline' && <EvolutionTimelinePanel />}
        {activeTab === 'lineage' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={lineageRuleId}
                onChange={e => setLineageRuleId(e.target.value)}
                placeholder="输入 rule_id 查看进化链"
                style={{ background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', flex: 1 }}
              />
            </div>
            {lineageRuleId ? (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <RuleLineageView rule_id={lineageRuleId} />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 13 }}>
                请输入 rule_id 以查看规则进化链
              </div>
            )}
          </div>
        )}
        {activeTab === 'radar' && <CapabilityRadarChart />}
        {activeTab === 'proof' && <EvolutionProofCard />}
      </div>
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
