import React, { useMemo, useState } from 'react'
import type { AuditEntryInfo } from '../modules/meetingProtocol'
import type { DecisionNode } from '../modules/negotiationEngine'

interface AuditTrailProps {
  auditEntries: AuditEntryInfo[]
  decisionNodes?: DecisionNode[]
  onFilterChange?: (filter: AuditFilter) => void
}

interface AuditFilter {
  agentId?: string
  operation?: string
  riskLevel?: string
  timeRange?: 'all' | '1h' | '24h' | '7d'
}

const riskLevelColors: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
}

const riskLevelLabels: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重风险',
}

const timeRangeLabels: Record<string, string> = {
  all: '全部',
  '1h': '最近1小时',
  '24h': '最近24小时',
  '7d': '最近7天',
}

export default function AuditTrail({ auditEntries, decisionNodes, onFilterChange }: AuditTrailProps) {
  const [filter, setFilter] = useState<AuditFilter>({ timeRange: 'all' })
  const [tab, setTab] = useState<'operations' | 'decisions'>('operations')

  const uniqueAgents = useMemo(() => {
    const agents = new Set(auditEntries.map(e => e.agentId))
    return Array.from(agents)
  }, [auditEntries])

  const uniqueOperations = useMemo(() => {
    const ops = new Set(auditEntries.map(e => e.operation))
    return Array.from(ops)
  }, [auditEntries])

  const filteredEntries = useMemo(() => {
    let entries = [...auditEntries]
    if (filter.agentId) entries = entries.filter(e => e.agentId === filter.agentId)
    if (filter.operation) entries = entries.filter(e => e.operation === filter.operation)
    if (filter.riskLevel) entries = entries.filter(e => e.riskLevel === filter.riskLevel)
    if (filter.timeRange && filter.timeRange !== 'all') {
      const now = Date.now()
      const ranges: Record<string, number> = { '1h': 3600000, '24h': 86400000, '7d': 604800000 }
      const cutoff = now - (ranges[filter.timeRange] || 0)
      entries = entries.filter(e => e.timestamp > cutoff)
    }
    return entries.sort((a, b) => b.timestamp - a.timestamp)
  }, [auditEntries, filter])

  const updateFilter = (updates: Partial<AuditFilter>) => {
    const newFilter = { ...filter, ...updates }
    setFilter(newFilter)
    onFilterChange?.(newFilter)
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const renderFilters = () => (
    <div style={styles.filters}>
      <div style={styles.filterGroup}>
        <span style={styles.filterLabel}>Agent</span>
        <select
          style={styles.select}
          value={filter.agentId || ''}
          onChange={e => updateFilter({ agentId: e.target.value || undefined })}
        >
          <option value="">全部</option>
          {uniqueAgents.map(id => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>

      <div style={styles.filterGroup}>
        <span style={styles.filterLabel}>操作类型</span>
        <select
          style={styles.select}
          value={filter.operation || ''}
          onChange={e => updateFilter({ operation: e.target.value || undefined })}
        >
          <option value="">全部</option>
          {uniqueOperations.map(op => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      </div>

      <div style={styles.filterGroup}>
        <span style={styles.filterLabel}>风险等级</span>
        <select
          style={styles.select}
          value={filter.riskLevel || ''}
          onChange={e => updateFilter({ riskLevel: e.target.value || undefined })}
        >
          <option value="">全部</option>
          {Object.entries(riskLevelLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div style={styles.filterGroup}>
        <span style={styles.filterLabel}>时间范围</span>
        <select
          style={styles.select}
          value={filter.timeRange || 'all'}
          onChange={e => updateFilter({ timeRange: e.target.value as AuditFilter['timeRange'] })}
        >
          {Object.entries(timeRangeLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderOperationLog = () => (
    <div style={styles.logList}>
      {filteredEntries.length === 0 ? (
        <div style={styles.emptyState}>暂无操作日志</div>
      ) : (
        filteredEntries.map(entry => {
          const riskColor = riskLevelColors[entry.riskLevel] || riskLevelColors.medium
          return (
            <div key={entry.id} style={styles.logEntry}>
              <div style={styles.logHeader}>
                <span style={styles.logTime}>{formatTime(entry.timestamp)}</span>
                <span style={styles.logAgent}>{entry.agentId}</span>
                <span style={{
                  ...styles.riskBadge,
                  background: `${riskColor}20`,
                  color: riskColor,
                  borderColor: `${riskColor}40`,
                }}>
                  {riskLevelLabels[entry.riskLevel] || entry.riskLevel}
                </span>
              </div>
              <div style={styles.logBody}>
                <span style={styles.logOperation}>{entry.operation}</span>
                <span style={styles.logTarget}>{entry.target}</span>
              </div>
              <div style={styles.logResult}>
                <span style={styles.resultLabel}>结果:</span>
                <span style={styles.resultValue}>{entry.result}</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  const renderDecisionNode = (node: DecisionNode, depth: number = 0) => {
    const isAccepted = node.decision === 'accepted'
    const decisionColor = isAccepted ? '#10b981' : '#ef4444'

    return (
      <div key={node.id} style={{ ...styles.decisionNode, marginLeft: `${depth * 20}px` }}>
        <div style={styles.decisionHeader}>
          <span style={{
            ...styles.decisionBadge,
            background: `${decisionColor}20`,
            color: decisionColor,
            borderColor: `${decisionColor}40`,
          }}>
            {isAccepted ? '✓ 已接受' : '✕ 已拒绝'}
          </span>
          <span style={styles.decisionTime}>{formatTime(node.timestamp)}</span>
        </div>

        <div style={styles.decisionContent}>
          <span style={styles.decisionLabel}>决策内容:</span>
          <span style={styles.decisionText}>{node.decision}</span>
        </div>

        {node.supporters.length > 0 && (
          <div style={styles.voteGroup}>
            <span style={{ ...styles.voteLabel, color: '#10b981' }}>支持者:</span>
            <div style={styles.voterList}>
              {node.supporters.map(id => (
                <span key={id} style={{ ...styles.voterTag, background: '#10b98120', color: '#10b981' }}>
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.opposers.length > 0 && (
          <div style={styles.voteGroup}>
            <span style={{ ...styles.voteLabel, color: '#ef4444' }}>反对者:</span>
            <div style={styles.voterList}>
              {node.opposers.map(id => (
                <span key={id} style={{ ...styles.voterTag, background: '#ef444420', color: '#ef4444' }}>
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.voteResult && (
          <div style={styles.voteResult}>
            <span style={styles.voteResultLabel}>投票结果:</span>
            <span style={styles.voteResultValue}>
              赞成 {node.voteResult.approveCount} / 反对 {node.voteResult.opposeCount}
            </span>
            {node.voteResult.strategy === 'weighted_vote' && (
              <span style={styles.voteResultValue}>
                (加权: {node.voteResult.weightedApprove.toFixed(1)} / {node.voteResult.weightedOppose.toFixed(1)})
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderDecisionChain = () => {
    const nodes = decisionNodes || []
    return (
      <div style={styles.decisionList}>
        {nodes.length === 0 ? (
          <div style={styles.emptyState}>暂无决策记录</div>
        ) : (
          nodes.map(node => renderDecisionNode(node))
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>审计追踪</h3>
        <span style={styles.count}>
          {tab === 'operations' ? `${filteredEntries.length} 条记录` : `${(decisionNodes || []).length} 个决策`}
        </span>
      </div>

      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(tab === 'operations' ? styles.activeTab : {}),
          }}
          onClick={() => setTab('operations')}
        >
          操作日志
        </button>
        <button
          style={{
            ...styles.tab,
            ...(tab === 'decisions' ? styles.activeTab : {}),
          }}
          onClick={() => setTab('decisions')}
        >
          决策链路
        </button>
      </div>

      {tab === 'operations' && renderFilters()}

      <div style={styles.content}>
        {tab === 'operations' ? renderOperationLog() : renderDecisionChain()}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    overflow: 'hidden',
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  count: {
    fontSize: '12px',
    color: '#6b7280',
  },
  tabs: {
    display: 'flex',
    padding: '0 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  tab: {
    padding: '12px 20px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#6b7280',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  activeTab: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6',
  },
  filters: {
    display: 'flex',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: '1 1 120px',
    minWidth: '120px',
  },
  filterLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  select: {
    padding: '8px 10px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#e2e8f0',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    fontSize: '12px',
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    maxHeight: '500px',
  },
  logList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  logEntry: {
    padding: '14px 20px',
    background: 'rgba(0, 0, 0, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  logHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logTime: {
    fontSize: '11px',
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  logAgent: {
    fontSize: '12px',
    color: '#3b82f6',
    fontWeight: 500,
  },
  riskBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid',
  },
  logBody: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logOperation: {
    fontSize: '13px',
    color: '#e2e8f0',
    fontWeight: 500,
  },
  logTarget: {
    fontSize: '12px',
    color: '#a0a0b0',
  },
  logResult: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  resultLabel: {
    fontSize: '11px',
    color: '#6b7280',
    fontWeight: 600,
  },
  resultValue: {
    fontSize: '12px',
    color: '#a0a0b0',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '13px',
  },
  decisionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px 20px',
  },
  decisionNode: {
    padding: '14px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  decisionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  decisionBadge: {
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid',
  },
  decisionTime: {
    fontSize: '11px',
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  decisionContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  decisionLabel: {
    fontSize: '11px',
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  decisionText: {
    fontSize: '13px',
    color: '#e2e8f0',
    lineHeight: 1.5,
  },
  voteGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  voteLabel: {
    fontSize: '11px',
    fontWeight: 600,
  },
  voterList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  voterTag: {
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: 500,
  },
  voteResult: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '6px',
  },
  voteResultLabel: {
    fontSize: '11px',
    color: '#6b7280',
    fontWeight: 600,
  },
  voteResultValue: {
    fontSize: '12px',
    color: '#a0a0b0',
  },
}
