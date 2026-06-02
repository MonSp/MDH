import React from 'react'
import type { TeamAgent, ChatMessage, Task } from './types'
import { ROLE_EMOJI } from './constants'

interface MeetingLogPanelProps {
  agents: TeamAgent[]
  messages: ChatMessage[]
  tasks: Task[]
  viewState: string
}

export default function MeetingLogPanel({ agents, messages, tasks, viewState }: MeetingLogPanelProps) {
  const getAgentById = (id?: string) => agents.find(a => a.id === id)

  const feedbackCount = messages.filter(m => (m as any)._msgSubtype === 'feedback').length
  const routingCount = messages.filter(m => (m as any)._msgSubtype === 'routing').length
  const iterationCount = messages.filter(m => (m as any)._msgSubtype === 'iteration').length
  const agentsWithSkill = agents.filter(a => a.skillName).length

  return (
    <div style={{
      ...styles.logPanel,
      ...(viewState === 'transitioning-to-office' ? styles.logPanelEntering : {}),
      ...(viewState === 'office' ? styles.logPanelActive : {}),
    }}>
      <div style={styles.logHeader}>
        <h3 style={styles.logTitle}>📜 会议日志</h3>
        <span style={styles.logCount}>{messages.length} 条记录</span>
      </div>

      {/* 技能进化统计摘要 */}
      {(feedbackCount > 0 || routingCount > 0 || agentsWithSkill > 0) && (
        <div style={styles.evolutionSummary}>
          <div style={styles.evolutionSummaryTitle}>🧬 技能进化</div>
          <div style={styles.evolutionStats}>
            {routingCount > 0 && (
              <span style={styles.evolutionStat}>
                <span style={{ ...styles.evolutionStatDot, background: '#3b82f6' }} />
                路由 {routingCount}
              </span>
            )}
            {feedbackCount > 0 && (
              <span style={styles.evolutionStat}>
                <span style={{ ...styles.evolutionStatDot, background: '#f59e0b' }} />
                验收 {feedbackCount}
              </span>
            )}
            {iterationCount > 0 && (
              <span style={styles.evolutionStat}>
                <span style={{ ...styles.evolutionStatDot, background: '#8b5cf6' }} />
                迭代 {iterationCount}
              </span>
            )}
            {agentsWithSkill > 0 && (
              <span style={styles.evolutionStat}>
                <span style={{ ...styles.evolutionStatDot, background: '#10b981' }} />
                技能 {agentsWithSkill}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={styles.logMessages}>
        {messages.slice(-10).map((msg, index) => {
          const agent = getAgentById(msg.agentId)
          const subtype = (msg as any)._msgSubtype as string | undefined
          const isRouting = subtype === 'routing'
          const isFeedback = subtype === 'feedback'
          const isIteration = subtype === 'iteration'
          const isExperience = subtype === 'experience'

          return (
            <div key={index} style={{
              ...styles.logItem,
              ...(isRouting ? styles.logItemRouting : {}),
              ...(isFeedback ? styles.logItemFeedback : {}),
            }}>
              <span style={styles.logSender}>
                {msg.role === 'boss' ? '👔' :
                 isRouting ? '🧭' :
                 isFeedback ? '✅' :
                 isIteration ? '🔄' :
                 isExperience ? '🧪' :
                 ROLE_EMOJI[agent?.role || 'planner']}
              </span>
              <span style={styles.logText}>{msg.content}</span>
              {(msg as any)._stance && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 4px',
                  borderRadius: '4px',
                  background: (msg as any)._stance === 'support' ? 'rgba(16, 185, 129, 0.2)' :
                              (msg as any)._stance === 'oppose' ? 'rgba(239, 68, 68, 0.2)' :
                              'rgba(255, 255, 255, 0.1)',
                  color: (msg as any)._stance === 'support' ? '#10b981' :
                         (msg as any)._stance === 'oppose' ? '#ef4444' : '#9ca3af',
                  marginLeft: '4px',
                  flexShrink: 0,
                }}>
                  {(msg as any)._stance === 'support' ? '👍' :
                   (msg as any)._stance === 'oppose' ? '👎' :
                   (msg as any)._stance === 'modify' ? '✏️' : '➖'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {tasks.length > 0 && (
        <div style={styles.taskSummary}>
          <h4 style={styles.taskSummaryTitle}>📋 任务状态</h4>
          {tasks.map(task => {
            const agent = getAgentById(task.agentId)
            const hasIteration = !!task.iterationStatus
            return (
              <div key={task.id} style={styles.taskSummaryItem}>
                <span style={styles.taskSummaryAgent}>{agent?.name?.split('-')[0]}</span>
                <span style={styles.taskSummaryDesc}>{task.description}</span>
                {hasIteration && (
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 4px',
                    borderRadius: '4px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    color: '#7c3aed',
                    flexShrink: 0,
                  }}>
                    {task.iterationStatus!.current_iteration}/{task.iterationStatus!.max_iterations}
                  </span>
                )}
                <span style={{
                  ...styles.taskSummaryStatus,
                  color: task.status === 'completed' ? '#10b981' :
                         task.status === 'revision_required' ? '#f59e0b' :
                         task.status === 'executing' ? '#f59e0b' : '#6b7280',
                }}>
                  {task.status === 'completed' ? '✅' :
                   task.status === 'revision_required' ? '⚠️' :
                   task.status === 'executing' ? '⚡' : '⏳'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* 技能挂载信息 */}
      {agentsWithSkill > 0 && (
        <div style={styles.taskSummary}>
          <h4 style={styles.taskSummaryTitle}>🧩 技能挂载</h4>
          {agents.filter(a => a.skillName).map(agent => (
            <div key={agent.id} style={styles.taskSummaryItem}>
              <span style={styles.taskSummaryAgent}>{agent.name.split('-')[0]}</span>
              <span style={{
                padding: '1px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#065f46',
              }}>
                {agent.skillName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  logPanel: {
    width: '300px',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(0, 0, 0, 0.3)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: 0,
    transform: 'translateX(20px)',
  },
  logPanelEntering: {
    opacity: 0,
    transform: 'translateX(20px)',
  },
  logPanelActive: {
    opacity: 1,
    transform: 'translateX(0)',
  },
  logHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
  },
  logTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  logCount: {
    fontSize: '11px',
    color: '#6b7280',
  },
  logMessages: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  logItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '6px 8px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
  },
  logSender: {
    fontSize: '12px',
    flexShrink: 0,
  },
  logText: {
    fontSize: '11px',
    color: '#a0a0b0',
    lineHeight: 1.4,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  taskSummary: {
    padding: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  taskSummaryTitle: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: 600,
    color: '#8899b4',
  },
  taskSummaryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 0',
    fontSize: '11px',
  },
  taskSummaryAgent: {
    color: '#6b7280',
    flexShrink: 0,
  },
  taskSummaryDesc: {
    flex: 1,
    color: '#a0a0b0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  taskSummaryStatus: {
    flexShrink: 0,
  },
  evolutionSummary: {
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(139, 92, 246, 0.05)',
  },
  evolutionSummaryTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#a78bfa',
    marginBottom: '4px',
  },
  evolutionStats: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap' as const,
  },
  evolutionStat: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    color: '#8899b4',
  },
  evolutionStatDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  logItemRouting: {
    borderLeft: '2px solid rgba(59, 130, 246, 0.5)',
  },
  logItemFeedback: {
    borderLeft: '2px solid rgba(245, 158, 11, 0.5)',
  },
}
