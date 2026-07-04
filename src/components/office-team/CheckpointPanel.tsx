import React, { useState } from 'react'

interface CheckpointInfo {
  id: string
  taskId: string
  stepIndex: number
  createdAt: number
}

interface CheckpointPanelProps {
  checkpoints: CheckpointInfo[]
  restoredState: { checkpointId: string; taskId: string; stepIndex: number; state: Record<string, unknown> } | null
  onSaveCheckpoint: (taskId: string, stepIndex: number, state: Record<string, unknown>) => void
  onRestoreCheckpoint: (checkpointId: string) => void
  onDeleteCheckpoint: (checkpointId: string) => void
  onGetCheckpoints: (taskId?: string) => void
  onClearRestoredState: () => void
}

export default function CheckpointPanel({
  checkpoints,
  restoredState,
  onSaveCheckpoint,
  onRestoreCheckpoint,
  onDeleteCheckpoint,
  onGetCheckpoints,
  onClearRestoredState,
}: CheckpointPanelProps) {
  const [taskId, setTaskId] = useState('')
  const [stepIndex, setStepIndex] = useState(0)
  const [filterTaskId, setFilterTaskId] = useState('')

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>检查点管理</span>
        <button style={styles.refreshBtn} onClick={() => onGetCheckpoints(filterTaskId || undefined)}>
          刷新
        </button>
      </div>

      {/* 保存检查点 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>保存检查点</div>
        <div style={styles.inputRow}>
          <input
            style={styles.input}
            placeholder="任务ID"
            value={taskId}
            onChange={e => setTaskId(e.target.value)}
          />
          <input
            style={{ ...styles.input, width: '60px' }}
            type="number"
            placeholder="步骤"
            value={stepIndex}
            onChange={e => setStepIndex(Number(e.target.value))}
          />
          <button
            style={styles.saveBtn}
            onClick={() => {
              if (taskId) onSaveCheckpoint(taskId, stepIndex, {})
            }}
          >
            保存
          </button>
        </div>
      </div>

      {/* 恢复状态显示 */}
      {restoredState && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>已恢复状态</div>
          <div style={styles.restoredCard}>
            <div style={styles.restoredInfo}>
              <span>任务: {restoredState.taskId}</span>
              <span>步骤: {restoredState.stepIndex}</span>
            </div>
            <button style={styles.clearBtn} onClick={onClearRestoredState}>清除</button>
          </div>
        </div>
      )}

      {/* 检查点列表 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          检查点列表 ({checkpoints.length})
          <input
            style={styles.filterInput}
            placeholder="按任务ID过滤"
            value={filterTaskId}
            onChange={e => setFilterTaskId(e.target.value)}
          />
        </div>
        {checkpoints.length === 0 ? (
          <div style={styles.empty}>暂无检查点</div>
        ) : (
          <div style={styles.list}>
            {checkpoints
              .filter(cp => !filterTaskId || cp.taskId.includes(filterTaskId))
              .map(cp => (
                <div key={cp.id} style={styles.item}>
                  <div style={styles.itemInfo}>
                    <span style={styles.taskIdTag}>{cp.taskId}</span>
                    <span style={styles.stepTag}>步骤 {cp.stepIndex}</span>
                    <span style={styles.timeTag}>{new Date(cp.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div style={styles.itemActions}>
                    <button style={styles.restoreBtn} onClick={() => onRestoreCheckpoint(cp.id)}>
                      恢复
                    </button>
                    <button style={styles.deleteBtn} onClick={() => onDeleteCheckpoint(cp.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '8px',
    border: '1px solid rgba(139, 92, 246, 0.2)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  refreshBtn: {
    padding: '4px 10px',
    background: 'rgba(139, 92, 246, 0.2)',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    borderRadius: '4px',
    color: '#a78bfa',
    fontSize: '11px',
    cursor: 'pointer',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  inputRow: {
    display: 'flex',
    gap: '6px',
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '12px',
    outline: 'none',
  },
  saveBtn: {
    padding: '6px 14px',
    background: 'rgba(34, 197, 94, 0.2)',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    borderRadius: '4px',
    color: '#22c55e',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterInput: {
    marginLeft: 'auto',
    padding: '2px 8px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    color: '#e2e8f0',
    fontSize: '11px',
    outline: 'none',
    width: '100px',
  },
  empty: {
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'center' as const,
    padding: '16px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  itemInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  taskIdTag: {
    color: '#a78bfa',
    fontWeight: 600,
    fontSize: '11px',
    background: 'rgba(139, 92, 246, 0.15)',
    padding: '1px 6px',
    borderRadius: '3px',
  },
  stepTag: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  timeTag: {
    color: '#6b7280',
    fontSize: '10px',
  },
  itemActions: {
    display: 'flex',
    gap: '6px',
  },
  restoreBtn: {
    padding: '4px 10px',
    background: 'rgba(59, 130, 246, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    borderRadius: '4px',
    color: '#3b82f6',
    fontSize: '11px',
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '4px 10px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    color: '#ef4444',
    fontSize: '11px',
    cursor: 'pointer',
  },
  restoredCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'rgba(34, 197, 94, 0.1)',
    borderRadius: '6px',
    border: '1px solid rgba(34, 197, 94, 0.3)',
  },
  restoredInfo: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px',
    color: '#22c55e',
  },
  clearBtn: {
    padding: '4px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: '#94a3b8',
    fontSize: '11px',
    cursor: 'pointer',
  },
}
