/**
 * TaskList — 会议任务列表组件
 */

import React from 'react'
import type { TeamAgent, Task } from '../office-team/types'

interface TaskListProps {
  tasks: Task[]
  agents: TeamAgent[]
  onDeleteTask: (taskId: string) => void
}

const statusMap: Record<string, { icon: string; color: string }> = {
  completed: { icon: '✅', color: '#10b981' },
  executing: { icon: '⚡', color: '#f59e0b' },
  assigned: { icon: '📌', color: '#3b82f6' },
  pending: { icon: '⏳', color: '#6b7280' },
  failed: { icon: '❌', color: '#ef4444' },
  revision_required: { icon: '⚠️', color: '#f59e0b' },
}

export default function TaskList({ tasks, agents, onDeleteTask }: TaskListProps) {
  if (tasks.length === 0) return null

  return (
    <div style={styles.taskListSection}>
      <div style={styles.taskListHeader}>
        <span>📋 任务列表 ({tasks.length})</span>
      </div>
      <div style={styles.taskList}>
        {tasks.map(task => {
          const agent = agents.find(a => a.id === task.agentId)
          const st = statusMap[task.status] || statusMap.pending
          return (
            <div key={task.id} style={styles.taskItem}>
              <span style={{ fontSize: 12 }}>{st.icon}</span>
              <div style={styles.taskInfo}>
                <div style={styles.taskDesc}>{task.description}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  {agent?.name?.split('-')[0] || '未分配'}
                </div>
              </div>
              <button
                onClick={() => onDeleteTask(task.id)}
                style={styles.deleteTaskBtn}
                title="删除任务"
              >×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  taskListSection: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.15)',
  },
  taskListHeader: {
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#9ca3af',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  taskList: {
    maxHeight: '120px',
    overflowY: 'auto' as const,
    padding: '6px 10px',
  },
  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    marginBottom: '4px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  taskInfo: {
    flex: 1,
    overflow: 'hidden',
  },
  taskDesc: {
    fontSize: '11px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  deleteTaskBtn: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
}
