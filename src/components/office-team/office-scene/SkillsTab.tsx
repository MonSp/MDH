import React from 'react'
import type { ProjectDetail } from '../types'
import { styles } from '../OfficeScene.styles'

interface ExperienceRule {
  rule_id: string
  trigger_condition: string
  action: string
  status: string
  keywords: string[]
  effectiveness_score?: number
  usage_count?: number
}

interface SkillsTabProps {
  projectDetail?: ProjectDetail | null
  experienceRules: ExperienceRule[]
}

export default function SkillsTab({ projectDetail, experienceRules }: SkillsTabProps) {
  return (
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
            <div style={styles.ruleAction}>
              {rule.action}
              {(rule.usage_count ?? 0) > 0 && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                  color: (rule.effectiveness_score ?? 0) >= 0.7 ? '#10b981' : (rule.effectiveness_score ?? 0) >= 0.4 ? '#f59e0b' : '#ef4444',
                }}>
                  ★{((rule.effectiveness_score ?? 0) * 100).toFixed(0)}%
                </span>
              )}
            </div>
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
  )
}
