import React, { useRef, useEffect } from 'react'
import type { TeamAgent } from './types'
import { ROLE_EMOJI } from './constants'

interface TaskAssignPanelProps {
  agents: TeamAgent[]
  selectedAgentId: string | null
  taskInput: string
  onSelectAgent: (id: string | null) => void
  onTaskInputChange: (value: string) => void
  onAssignTask: () => void
}

export default function TaskAssignPanel({
  agents,
  selectedAgentId,
  taskInput,
  onSelectAgent,
  onTaskInputChange,
  onAssignTask,
}: TaskAssignPanelProps) {
  const taskInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    taskInputRef.current?.focus()
  }, [])

  return (
    <div style={styles.taskPanel}>
      <div style={styles.taskFormHeader}>
        <h3 style={styles.taskFormTitle}>📋 派发任务</h3>
        <span style={styles.taskFormHint}>选择成员并输入任务</span>
      </div>
      <div style={styles.taskForm}>
        <select
          style={styles.select}
          value={selectedAgentId || ''}
          onChange={(e) => onSelectAgent(e.target.value || null)}
        >
          <option value="">👤 选择成员...</option>
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>
              {ROLE_EMOJI[agent.role]} {agent.name}
            </option>
          ))}
        </select>
        <input
          ref={taskInputRef}
          style={styles.taskInput}
          type="text"
          placeholder="输入任务描述，按 Enter 派发..."
          value={taskInput}
          onChange={(e) => onTaskInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAssignTask()}
        />
        <button
          style={{
            ...styles.assignBtn,
            opacity: selectedAgentId && taskInput.trim() ? 1 : 0.5,
          }}
          onClick={onAssignTask}
          disabled={!selectedAgentId || !taskInput.trim()}
        >
          📋 派发
        </button>
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
  select: {
    width: '160px',
    padding: '8px 10px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#e2e8f0',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    fontSize: '12px',
    outline: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
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
  assignBtn: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #4d9fff, #3b82f6)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
}
