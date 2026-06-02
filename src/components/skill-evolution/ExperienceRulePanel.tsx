import React, { useState, useEffect } from 'react'
import { getAllRules, getPendingRules, approveRule, rejectRule } from '../../modules/experienceExtractor'
import type { ExperienceRule } from '../../modules/agentTypes'

interface Props {
  mode?: 'all' | 'pending'
}

const ruleTypeLabels: Record<string, { label: string; color: string }> = {
  success_pattern: { label: '成功模式', color: '#10b981' },
  failure_avoidance: { label: '避坑指南', color: '#f59e0b' },
  correction_tip: { label: '纠正提示', color: '#8b5cf6' },
}

const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
  pending_review: { label: '待审核', bg: '#fef3c7', text: '#92400e' },
  approved: { label: '已批准', bg: '#d1fae5', text: '#065f46' },
  rejected: { label: '已拒绝', bg: '#fee2e2', text: '#dc2626' },
}

export function ExperienceRulePanel({ mode = 'all' }: Props) {
  const [rules, setRules] = useState<ExperienceRule[]>([])
  const [filter, setFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>(mode === 'pending' ? 'pending_review' : 'all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)

  const loadRules = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = mode === 'pending' ? await getPendingRules() : await getAllRules()
      setRules(data)
    } catch (e: any) {
      setError(e.message || '加载规则失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
  }, [mode])

  const handleApprove = async (ruleId: string) => {
    setActingId(ruleId)
    try {
      await approveRule(ruleId)
      setRules((prev) =>
        prev.map((r) => r.rule_id === ruleId ? { ...r, status: 'approved' } : r)
      )
    } catch (e: any) {
      setError(e.message || '批准失败')
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async (ruleId: string) => {
    setActingId(ruleId)
    try {
      await rejectRule(ruleId, '不符合标准')
      setRules((prev) =>
        prev.map((r) => r.rule_id === ruleId ? { ...r, status: 'rejected' } : r)
      )
    } catch (e: any) {
      setError(e.message || '拒绝失败')
    } finally {
      setActingId(null)
    }
  }

  const filteredRules = filter === 'all' ? rules : rules.filter((r) => r.status === filter)

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN')
    } catch {
      return iso
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📋 经验规则管理</h3>
        <button
          onClick={loadRules}
          disabled={loading}
          style={{
            padding: '4px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          刷新
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {([
          { value: 'all', label: '全部' },
          { value: 'pending_review', label: '待审核' },
          { value: 'approved', label: '已批准' },
          { value: 'rejected', label: '已拒绝' },
        ] as const).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            style={{
              padding: '4px 12px',
              border: `1px solid ${filter === opt.value ? '#3b82f6' : '#d1d5db'}`,
              borderRadius: 14,
              background: filter === opt.value ? '#eff6ff' : '#fff',
              color: filter === opt.value ? '#1d4ed8' : '#374151',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 8, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>加载中...</div>
      ) : filteredRules.length === 0 ? (
        <div style={{ color: '#9ca3af', padding: 20, textAlign: 'center' }}>暂无规则</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredRules.map((rule) => {
            const isExpanded = expandedId === rule.rule_id
            const typeInfo = ruleTypeLabels[rule.rule_type] || { label: rule.rule_type, color: '#6b7280' }
            const statusInfo = statusLabels[rule.status] || { label: rule.status, bg: '#f3f4f6', text: '#374151' }

            return (
              <div
                key={rule.rule_id}
                style={{
                  padding: 10,
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  background: '#fff',
                  borderLeft: `4px solid ${typeInfo.color}`,
                }}
              >
                <div
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : rule.rule_id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 11,
                        background: `${typeInfo.color}15`,
                        color: typeInfo.color,
                        border: `1px solid ${typeInfo.color}30`,
                      }}>
                        {typeInfo.label}
                      </span>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 11,
                        background: statusInfo.bg,
                        color: statusInfo.text,
                      }}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      {formatDate(rule.created_at)}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    {rule.trigger_condition}
                  </div>

                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    → {rule.action}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                    {rule.note && (
                      <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                        <strong>备注:</strong> {rule.note}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
                      来源: {rule.source_task_type} / {rule.source_task_id.slice(0, 8)}...
                    </div>

                    {rule.keywords.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                        {rule.keywords.map((kw) => (
                          <span
                            key={kw}
                            style={{
                              padding: '1px 6px',
                              borderRadius: 3,
                              fontSize: 11,
                              background: '#f3f4f6',
                              color: '#374151',
                            }}
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {rule.status === 'pending_review' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleApprove(rule.rule_id)
                          }}
                          disabled={actingId === rule.rule_id}
                          style={{
                            padding: '3px 14px',
                            border: '1px solid #10b981',
                            borderRadius: 4,
                            background: '#ecfdf5',
                            color: '#065f46',
                            cursor: actingId === rule.rule_id ? 'wait' : 'pointer',
                            fontSize: 12,
                          }}
                        >
                          批准
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReject(rule.rule_id)
                          }}
                          disabled={actingId === rule.rule_id}
                          style={{
                            padding: '3px 14px',
                            border: '1px solid #ef4444',
                            borderRadius: 4,
                            background: '#fef2f2',
                            color: '#dc2626',
                            cursor: actingId === rule.rule_id ? 'wait' : 'pointer',
                            fontSize: 12,
                          }}
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
