/**
 * MeetingChatPanel 特殊消息渲染器
 */

import React from 'react'
import type { ChatMessage } from '../types'
import { formatTime } from '../utils'

interface RendererProps {
  msg: ChatMessage
  index: number
  styles: Record<string, React.CSSProperties>
}

/** 结构化反馈消息渲染 */
export function renderStructuredFeedback({ msg, index, styles }: RendererProps): React.ReactElement | null {
  const fb = msg._structuredFeedback
  if (!fb) return null
  const isApproved = fb.status === 'approved'
  return (
    <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
      <div style={{
        maxWidth: '85%',
        padding: '12px 16px',
        borderRadius: '12px',
        background: isApproved
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.15) 100%)'
          : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%)',
        border: `1px solid ${isApproved ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>{isApproved ? '✅' : '⚠️'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: isApproved ? '#065f46' : '#92400e' }}>
            结构化验收 ({fb.current_iteration}/{fb.max_iterations})
          </span>
          <span style={{
            padding: '1px 8px',
            borderRadius: 10,
            fontSize: 11,
            background: isApproved ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            color: isApproved ? '#065f46' : '#92400e',
          }}>
            {isApproved ? '通过' : '需修改'}
          </span>
        </div>
        {fb.overall_comment && (
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>{fb.overall_comment}</div>
        )}
        {fb.issues?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {fb.issues.map((issue: any, i: number) => (
              <div key={i} style={{
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.05)',
                borderRadius: 6,
                fontSize: 11,
              }}>
                <span style={{
                  padding: '1px 4px',
                  borderRadius: 3,
                  marginRight: 4,
                  background: issue.type === 'logic_error' ? 'rgba(239, 68, 68, 0.2)' :
                              issue.type === 'missing_feature' ? 'rgba(245, 158, 11, 0.2)' :
                              'rgba(59, 130, 246, 0.2)',
                  color: issue.type === 'logic_error' ? '#dc2626' :
                         issue.type === 'missing_feature' ? '#d97706' : '#2563eb',
                }}>
                  {issue.type === 'logic_error' ? '逻辑' :
                   issue.type === 'missing_feature' ? '缺失' :
                   issue.type === 'performance' ? '性能' : '格式'}
                </span>
                <span style={{ color: '#374151' }}>{issue.detail}</span>
                {issue.suggestion && (
                  <div style={{ color: '#6b7280', marginTop: 2 }}>💡 {issue.suggestion}</div>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

/** 路由决策消息渲染 */
export function renderRoutingDecision({ msg, index, styles }: RendererProps): React.ReactElement | null {
  const rd = msg._routingDecision
  if (!rd) return null
  return (
    <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 14 }}>🧭</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af' }}>路由决策</span>
          <span style={{
            padding: '1px 8px',
            borderRadius: 10,
            fontSize: 11,
            background: 'rgba(59, 130, 246, 0.2)',
            color: '#1e40af',
          }}>
            置信度 {(rd.confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#374151' }}>{rd.reason}</div>
        {rd.candidate_depts?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {rd.candidate_depts.slice(0, 3).map((dept: any) => (
              <span key={dept.dept_id} style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                background: dept.dept_id === rd.selected_dept ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.05)',
                color: dept.dept_id === rd.selected_dept ? '#1e40af' : '#6b7280',
                fontWeight: dept.dept_id === rd.selected_dept ? 600 : 400,
              }}>
                {dept.dept_name} ({(dept.score * 100).toFixed(1)}%)
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(0,0,0,0.3)' }}>{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

/** 经验注入消息渲染 */
export function renderExperience({ msg, index, styles }: RendererProps): React.ReactElement | null {
  return (
    <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
      <div style={{
        maxWidth: '70%',
        padding: '6px 14px',
        borderRadius: 10,
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        textAlign: 'center',
        fontSize: 12,
        color: '#6b21a8',
      }}>
        🧪 {msg.content}
      </div>
    </div>
  )
}

/** 迭代状态消息渲染 */
export function renderIteration({ msg, index, styles }: RendererProps): React.ReactElement | null {
  const it = msg._iterationStatus
  if (!it) return null
  return (
    <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
      <div style={{
        maxWidth: '70%',
        padding: '6px 14px',
        borderRadius: 10,
        background: it.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
        border: `1px solid ${it.status === 'approved' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
        textAlign: 'center',
        fontSize: 12,
        color: it.status === 'approved' ? '#065f46' : '#92400e',
      }}>
        🔄 {msg.content}
      </div>
    </div>
  )
}

/** 任务指派通知渲染 */
export function renderAssignmentNotification({ msg, index, styles }: RendererProps): React.ReactElement | null {
  const assignMatch = msg.content.match(/已将任务分配给(.+?)(?:[。！]|$)/)
  const ceoAnalysisMatch = msg.content.match(/CEO分析[：:]\s*(.+)/)
  const assignee = assignMatch ? assignMatch[1].trim() : ''
  const analysis = ceoAnalysisMatch ? ceoAnalysisMatch[1].trim() : ''

  return (
    <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
      <div style={styles.assignmentNotification}>
        <div style={styles.assignmentHeader}>
          <span style={styles.assignmentIcon}>📋</span>
          <span style={styles.assignmentTitle}>任务指派通知</span>
        </div>
        <div style={styles.assignmentBody}>
          {analysis && (
            <div style={styles.assignmentAnalysis}>
              <span style={styles.assignmentAnalysisLabel}>🧠 CEO分析：</span>
              <span style={styles.assignmentAnalysisText}>{analysis}</span>
            </div>
          )}
          {assignee && (
            <div style={styles.assignmentTarget}>
              <span style={styles.assignmentTargetIcon}>👉</span>
              <span>已将任务分配给 </span>
              <span style={styles.assignmentTargetName}>{assignee}</span>
            </div>
          )}
          {!assignee && !analysis && (
            <div style={styles.assignmentContent}>{msg.content}</div>
          )}
        </div>
        <div style={styles.assignmentTime}>{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

/** 思维链消息渲染（折叠展示） */
export function renderThinkingBlock({ msg, index, styles }: RendererProps): React.ReactElement | null {
  if (!(msg as any)._thinking) return null
  const isStreaming = (msg as any)._streaming
  return (
    <div key={index} style={{ ...styles.chatMessage, justifyContent: 'center' }}>
      <div style={{
        maxWidth: '85%',
        padding: '8px 12px',
        borderRadius: '10px',
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.15)',
        fontSize: '12px',
        color: '#8b5cf6',
        opacity: 0.85,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span>🧠</span>
          <span style={{ fontWeight: 600, fontSize: '11px' }}>
            {isStreaming ? '思考中...' : '思维链'}
          </span>
          {isStreaming && (
            <span style={{ animation: 'blink 1s infinite', color: '#8b5cf6' }}>▍</span>
          )}
        </div>
        <div style={{
          fontSize: '11px',
          color: '#6b7280',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap' as const,
          maxHeight: isStreaming ? 'none' : '150px',
          overflow: isStreaming ? 'visible' : 'hidden',
        }}>
          {msg.content || (isStreaming ? '' : '(空)')}
        </div>
      </div>
    </div>
  )
}
