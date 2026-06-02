import React, { useRef, useEffect } from 'react'
import type { TeamAgent } from './types'

interface TaskAssignPanelProps {
  agents: TeamAgent[]
  taskInput: string
  onTaskInputChange: (value: string) => void
  onSendMessage: () => void
}

export default function TaskAssignPanel({
  agents,
  taskInput,
  onTaskInputChange,
  onSendMessage,
}: TaskAssignPanelProps) {
  const taskInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    taskInputRef.current?.focus()
  }, [])

  return (
    <div style={styles.taskPanel}>
      <div style={styles.taskFormHeader}>
        <h3 style={styles.taskFormTitle}>💬 发送消息</h3>
        <span style={styles.taskFormHint}>CEO 会自动分析并安排</span>
      </div>
      <div style={styles.taskForm}>
        <input
          ref={taskInputRef}
          style={styles.taskInput}
          type="text"
          placeholder="输入需求或任务，按 Enter 发送..."
          value={taskInput}
          onChange={(e) => onTaskInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && taskInput.trim() && onSendMessage()}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  taskPanel: {
    height: '120px',
    minHeight: '120px',
    padding: '12px 20px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  taskFormHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskFormTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  taskFormHint: {
    fontSize: '11px',
    color: '#6b7280',
  },
  taskForm: {
    display: 'flex',
    gap: '8px',
    flex: 1,
  },
  taskInput: {
    flex: 1,
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#e2e8f0',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
  },
}
