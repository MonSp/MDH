import React from 'react'
import type { ProjectDetail } from '../types'
import { TASK_STATUS_MAP } from '../types'
import { styles } from '../OfficeScene.styles'

interface TasksTabProps {
  projectDetail?: ProjectDetail | null
}

export default function TasksTab({ projectDetail }: TasksTabProps) {
  return (
    <div>
      <div style={styles.sectionTitle}>任务列表 ({projectDetail?.tasks?.length || 0})</div>
      {projectDetail?.tasks && projectDetail.tasks.length > 0 ? (
        projectDetail.tasks
          .sort((a, b) => b.created_at - a.created_at)
          .map((task) => {
            const st = TASK_STATUS_MAP[task.status] || TASK_STATUS_MAP.pending
            const timeStr = task.created_at > 0
              ? new Date(task.created_at * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : ''
            const completedSubtasks = task.subtasks?.filter(s => s.status === 'completed').length || 0
            const totalSubtasks = task.subtasks?.length || 0

            return (
              <div key={task.task_id} style={styles.taskItem}>
                <div style={styles.taskMain}>
                  <span style={{ fontSize: 14 }}>{st.icon}</span>
                  <div style={styles.taskInfo}>
                    <div style={styles.taskDesc}>{task.description}</div>
                    <div style={styles.taskMeta}>
                      {timeStr && <span>{timeStr}</span>}
                      {totalSubtasks > 0 && <span> · 子任务 {completedSubtasks}/{totalSubtasks}</span>}
                    </div>
                  </div>
                  <span style={{ ...styles.taskStatus, color: st.color }}>{st.label}</span>
                </div>
                {/* 子任务列表 */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div style={styles.subtaskList}>
                    {task.subtasks.map((subtask) => {
                      const subst = TASK_STATUS_MAP[subtask.status] || TASK_STATUS_MAP.pending
                      return (
                        <div key={subtask.subtask_id} style={styles.subtaskItem}>
                          <span style={{ fontSize: 12, width: 16, textAlign: 'center' as const }}>{subst.icon}</span>
                          <div style={styles.subtaskDesc}>{subtask.description}</div>
                          <span style={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: subst.color,
                            padding: '2px 6px',
                            borderRadius: '8px',
                            background: `${subst.color}15`,
                            flexShrink: 0,
                          }}>{subst.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
      ) : (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ marginBottom: 4 }}>暂无任务记录</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>通过CEO对话发起任务后，将在这里显示</div>
        </div>
      )}
    </div>
  )
}
