import React, { useState } from 'react'

interface InterventionConsoleProps {
  onPauseTask: (taskId: string) => void
  onResumeTask: (taskId: string) => void
  onOverrideDecision: (decisionId: string, newDecision: string) => void
  onAdjustWeight: (agentId: string, weight: number) => void
  activeTasks?: Array<{ id: string; title: string; status: string; agentId: string }>
  agentWeights?: Record<string, number>
}

const statusColors: Record<string, string> = {
  assigned: '#3b82f6',
  running: '#f59e0b',
  paused: '#6b7280',
  completed: '#10b981',
  failed: '#ef4444',
}

const statusLabels: Record<string, string> = {
  assigned: '已分配',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
}

export default function InterventionConsole({
  onPauseTask,
  onResumeTask,
  onOverrideDecision,
  onAdjustWeight,
  activeTasks = [],
  agentWeights = {},
}: InterventionConsoleProps) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [overrideDecisionId, setOverrideDecisionId] = useState('')
  const [overrideText, setOverrideText] = useState('')
  const [localWeights, setLocalWeights] = useState<Record<string, number>>(agentWeights)

  const handleWeightChange = (agentId: string, value: number) => {
    const weight = Math.max(0.1, Math.min(2.0, value))
    setLocalWeights(prev => ({ ...prev, [agentId]: weight }))
    onAdjustWeight(agentId, weight)
  }

  const handleOverrideSubmit = () => {
    if (overrideDecisionId.trim() && overrideText.trim()) {
      onOverrideDecision(overrideDecisionId.trim(), overrideText.trim())
      setOverrideDecisionId('')
      setOverrideText('')
    }
  }

  const renderTaskControl = () => (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <h4 style={styles.sectionTitle}>任务控制</h4>
        <span style={styles.taskCount}>{activeTasks.length} 个活跃任务</span>
      </div>

      <div style={styles.taskList}>
        {activeTasks.length === 0 ? (
          <div style={styles.emptyState}>暂无活跃任务</div>
        ) : (
          activeTasks.map(task => {
            const isPaused = task.status === 'paused'
            const statusColor = statusColors[task.status] || '#6b7280'
            const isSelected = selectedTask === task.id

            return (
              <div
                key={task.id}
                style={{
                  ...styles.taskItem,
                  ...(isSelected ? styles.taskItemSelected : {}),
                }}
                onClick={() => setSelectedTask(isSelected ? null : task.id)}
              >
                <div style={styles.taskHeader}>
                  <div style={styles.taskInfo}>
                    <span style={styles.taskTitle}>{task.title}</span>
                    <span style={styles.taskAgent}>Agent: {task.agentId}</span>
                  </div>
                  <span style={{
                    ...styles.statusBadge,
                    background: `${statusColor}20`,
                    color: statusColor,
                    borderColor: `${statusColor}40`,
                  }}>
                    {statusLabels[task.status] || task.status}
                  </span>
                </div>

                <div style={styles.taskActions}>
                  {isPaused ? (
                    <button
                      style={styles.resumeBtn}
                      onClick={e => {
                        e.stopPropagation()
                        onResumeTask(task.id)
                      }}
                    >
                      ▶ 恢复
                    </button>
                  ) : (
                    <button
                      style={styles.pauseBtn}
                      onClick={e => {
                        e.stopPropagation()
                        onPauseTask(task.id)
                      }}
                    >
                      ⏸ 暂停
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  const renderDecisionOverride = () => (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <h4 style={styles.sectionTitle}>决策覆盖</h4>
      </div>

      <div style={styles.overrideForm}>
        <div style={styles.formGroup}>
          <label style={styles.label}>决策 ID</label>
          <input
            style={styles.input}
            type="text"
            placeholder="输入决策 ID..."
            value={overrideDecisionId}
            onChange={e => setOverrideDecisionId(e.target.value)}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>新决策内容</label>
          <textarea
            style={styles.textarea}
            placeholder="输入新的决策内容..."
            value={overrideText}
            onChange={e => setOverrideText(e.target.value)}
            rows={3}
          />
        </div>

        <button
          style={{
            ...styles.submitBtn,
            ...(overrideDecisionId.trim() && overrideText.trim() ? {} : styles.submitBtnDisabled),
          }}
          onClick={handleOverrideSubmit}
          disabled={!overrideDecisionId.trim() || !overrideText.trim()}
        >
          提交覆盖
        </button>
      </div>
    </div>
  )

  const renderWeightAdjustment = () => {
    const agents = Object.keys(localWeights)

    return (
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h4 style={styles.sectionTitle}>Agent 权重调整</h4>
        </div>

        <div style={styles.weightList}>
          {agents.length === 0 ? (
            <div style={styles.emptyState}>暂无 Agent 权重信息</div>
          ) : (
            agents.map(agentId => {
              const weight = localWeights[agentId] || 1.0
              const percentage = Math.round((weight / 2.0) * 100)

              return (
                <div key={agentId} style={styles.weightItem}>
                  <div style={styles.weightHeader}>
                    <span style={styles.agentId}>{agentId}</span>
                    <span style={styles.weightValue}>{weight.toFixed(2)}</span>
                  </div>

                  <div style={styles.sliderContainer}>
                    <span style={styles.sliderLabel}>0.1</span>
                    <input
                      style={styles.slider}
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.05"
                      value={weight}
                      onChange={e => handleWeightChange(agentId, parseFloat(e.target.value))}
                    />
                    <span style={styles.sliderLabel}>2.0</span>
                  </div>

                  <div style={styles.weightBar}>
                    <div style={{
                      ...styles.weightFill,
                      width: `${percentage}%`,
                      background: weight > 1.5
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : weight > 1.0
                        ? 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                        : weight > 0.5
                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(90deg, #ef4444, #f87171)',
                    }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>干预控制台</h3>
        <span style={styles.subtitle}>人工干预与控制</span>
      </div>

      <div style={styles.content}>
        {renderTaskControl()}
        {renderDecisionOverride()}
        {renderWeightAdjustment()}
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
    flexDirection: 'column',
    gap: '4px',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  subtitle: {
    fontSize: '12px',
    color: '#6b7280',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px 20px',
    maxHeight: '600px',
    overflow: 'auto',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  taskCount: {
    fontSize: '11px',
    color: '#6b7280',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  taskItem: {
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  taskItemSelected: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    background: 'rgba(59, 130, 246, 0.1)',
  },
  taskHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  taskInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  taskTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#e2e8f0',
  },
  taskAgent: {
    fontSize: '11px',
    color: '#6b7280',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid',
  },
  taskActions: {
    display: 'flex',
    gap: '8px',
  },
  pauseBtn: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  resumeBtn: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #10b981, #34d399)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '13px',
    background: 'rgba(0, 0, 0, 0.15)',
    borderRadius: '8px',
  },
  overrideForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#e2e8f0',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  textarea: {
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#e2e8f0',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  submitBtn: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
    alignSelf: 'flex-end',
  },
  submitBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  weightList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  weightItem: {
    padding: '14px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  weightHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  agentId: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#3b82f6',
  },
  weightValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
    fontFamily: 'monospace',
  },
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sliderLabel: {
    fontSize: '10px',
    color: '#6b7280',
    fontFamily: 'monospace',
    minWidth: '24px',
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    height: '6px',
    appearance: 'none',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    outline: 'none',
    cursor: 'pointer',
  },
  weightBar: {
    height: '4px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  weightFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.2s ease',
  },
}
