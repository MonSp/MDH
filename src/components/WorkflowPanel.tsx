import React, { useMemo } from 'react'
import { WorkflowNodeStatus, WorkflowExecutionStatus } from '../modules/agentTypes'
import type { WorkflowExecution, WorkflowDefinition } from '../modules/agentTypes'

/* ───────── 状态颜色映射 ───────── */

const NODE_STATUS_COLORS: Record<WorkflowNodeStatus, string> = {
  [WorkflowNodeStatus.Pending]: '#6b7280',
  [WorkflowNodeStatus.Running]: '#0a84ff',
  [WorkflowNodeStatus.Completed]: '#30d158',
  [WorkflowNodeStatus.Failed]: '#ff375f',
  [WorkflowNodeStatus.Skipped]: '#ff9f0a',
}

const NODE_STATUS_LABELS: Record<WorkflowNodeStatus, string> = {
  [WorkflowNodeStatus.Pending]: '等待中',
  [WorkflowNodeStatus.Running]: '执行中',
  [WorkflowNodeStatus.Completed]: '已完成',
  [WorkflowNodeStatus.Failed]: '失败',
  [WorkflowNodeStatus.Skipped]: '已跳过',
}

const EXEC_STATUS_LABELS: Record<WorkflowExecutionStatus, string> = {
  [WorkflowExecutionStatus.Created]: '已创建',
  [WorkflowExecutionStatus.Running]: '执行中',
  [WorkflowExecutionStatus.Paused]: '已暂停',
  [WorkflowExecutionStatus.Completed]: '已完成',
  [WorkflowExecutionStatus.Failed]: '执行失败',
  [WorkflowExecutionStatus.Cancelled]: '已取消',
}

const EXEC_STATUS_COLORS: Record<WorkflowExecutionStatus, string> = {
  [WorkflowExecutionStatus.Created]: '#6b7280',
  [WorkflowExecutionStatus.Running]: '#0a84ff',
  [WorkflowExecutionStatus.Paused]: '#ff9f0a',
  [WorkflowExecutionStatus.Completed]: '#30d158',
  [WorkflowExecutionStatus.Failed]: '#ff375f',
  [WorkflowExecutionStatus.Cancelled]: '#6b7280',
}

/* ───────── 部门名称映射 ───────── */

const DEPT_NAMES: Record<string, string> = {
  'dept-software': '软件产品部',
  'dept-ai-movie': 'AI 影视部',
  'dept-data': '数据智能部',
  'dept-content': '内容创作部',
  'dept-ppt': '演示设计部',
  'dept-frontend': '前端开发组',
  'dept-backend': '后端开发组',
  'dept-qa': '质量保障组',
  'dept-devops': 'DevOps 运维组',
  'dept-fullstack': '全栈开发组',
}

/* ───────── 接口 ───────── */

interface WorkflowPanelProps {
  workflow: WorkflowExecution | null
  workflowDef?: WorkflowDefinition | null
  onClose: () => void
  onPause?: (executionId: string) => void
  onResume?: (executionId: string) => void
  onCancel?: (executionId: string) => void
  onRetry?: (executionId: string, nodeId: string) => void
}

/* ───────── 工作流DAG可视化 ───────── */

function WorkflowDAG({ workflow, workflowDef }: {
  workflow: WorkflowExecution
  workflowDef?: WorkflowDefinition | null
}) {
  const nodeEntries = Object.entries(workflow.node_states)

  // 计算布局：按依赖层级排列
  const layers = useMemo(() => {
    if (workflowDef?.edges && workflowDef.edges.length > 0) {
      // 有边信息，按拓扑排序分层
      const adjacency: Record<string, string[]> = {}
      const inDegree: Record<string, number> = {}

      for (const nodeId of nodeEntries.map(([id]) => id)) {
        adjacency[nodeId] = []
        inDegree[nodeId] = 0
      }

      for (const edge of workflowDef.edges) {
        if (adjacency[edge.source_node_id]) {
          adjacency[edge.source_node_id].push(edge.target_node_id)
        }
        if (inDegree[edge.target_node_id] !== undefined) {
          inDegree[edge.target_node_id]++
        }
      }

      // BFS分层
      const layers: string[][] = []
      const visited = new Set<string>()
      let queue = nodeEntries.filter(([id]) => inDegree[id] === 0).map(([id]) => id)

      while (queue.length > 0) {
        layers.push([...queue])
        for (const nodeId of queue) visited.add(nodeId)

        const nextQueue: string[] = []
        for (const nodeId of queue) {
          for (const neighbor of (adjacency[nodeId] || [])) {
            inDegree[neighbor]--
            if (inDegree[neighbor] === 0 && !visited.has(neighbor)) {
              nextQueue.push(neighbor)
            }
          }
        }
        queue = nextQueue
      }

      // 未访问的节点（可能有环）
      const remaining = nodeEntries.filter(([id]) => !visited.has(id)).map(([id]) => id)
      if (remaining.length > 0) layers.push(remaining)

      return layers
    }

    // 无边信息，按顺序排列
    return [nodeEntries.map(([id]) => id)]
  }, [workflowDef, nodeEntries])

  return (
    <div style={{ padding: '12px 0' }}>
      {layers.map((layer, layerIdx) => (
        <div key={layerIdx}>
          {layerIdx > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
              <div style={{ color: '#64d2ff', fontSize: 18 }}>↓</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {layer.map((nodeId) => {
              const status = workflow.node_states[nodeId]
              const color = NODE_STATUS_COLORS[status] ?? '#6b7280'
              const isRunning = status === WorkflowNodeStatus.Running

              return (
                <div
                  key={nodeId}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: `2px solid ${color}`,
                    background: isRunning
                      ? `${color}18`
                      : 'rgba(255,255,255,0.03)',
                    minWidth: 120,
                    textAlign: 'center',
                    transition: 'all 0.3s',
                    boxShadow: isRunning ? `0 0 16px ${color}40` : 'none',
                  }}
                >
                  <div style={{
                    fontSize: 11, color: '#999', marginBottom: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 140,
                  }}>
                    {DEPT_NAMES[nodeId] ?? nodeId}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color,
                      boxShadow: isRunning ? `0 0 8px ${color}` : 'none',
                      animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : 'none',
                    }} />
                    <span style={{ color, fontSize: 12, fontWeight: 600 }}>
                      {NODE_STATUS_LABELS[status] ?? status}
                    </span>
                  </div>
                  {workflow.results?.[nodeId] && (
                    <div style={{
                      fontSize: 10, color: '#666', marginTop: 4,
                      maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {(workflow.results[nodeId] as any)?.result?.substring(0, 30) ?? ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

/* ───────── 主组件 ───────── */

export default function WorkflowPanel({
  workflow,
  workflowDef,
  onClose,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: WorkflowPanelProps) {
  if (!workflow) return null

  const isRunning = workflow.status === WorkflowExecutionStatus.Running
  const isPaused = workflow.status === WorkflowExecutionStatus.Paused
  const isActive = isRunning || isPaused
  const statusColor = EXEC_STATUS_COLORS[workflow.status]

  const completedCount = Object.values(workflow.node_states).filter(
    s => s === WorkflowNodeStatus.Completed
  ).length
  const totalCount = Object.keys(workflow.node_states).length
  const progress = totalCount > 0 ? completedCount / totalCount : 0

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div
        style={{
          width: 560, maxHeight: '80vh',
          background: 'linear-gradient(135deg, #0d0d2b 0%, #1a1a3a 100%)',
          borderRadius: 16, border: '1px solid rgba(100,210,255,0.2)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(100,210,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e0e0e0' }}>
                工作流执行
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                ID: {workflow.execution_id}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(255,255,255,0.05)', border: 'none',
              color: '#999', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* 状态栏 */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid rgba(100,210,255,0.1)',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20,
            background: `${statusColor}18`, border: `1px solid ${statusColor}40`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: statusColor,
              boxShadow: isRunning ? `0 0 8px ${statusColor}` : 'none',
              animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }} />
            <span style={{ color: statusColor, fontSize: 12, fontWeight: 600 }}>
              {EXEC_STATUS_LABELS[workflow.status]}
            </span>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${progress * 100}%`,
                background: `linear-gradient(90deg, ${statusColor}, ${statusColor}80)`,
                borderRadius: 2, transition: 'width 0.5s',
              }} />
            </div>
          </div>

          <span style={{ fontSize: 11, color: '#999' }}>
            {completedCount}/{totalCount}
          </span>
        </div>

        {/* DAG可视化 */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '8px 20px',
        }}>
          <WorkflowDAG workflow={workflow} workflowDef={workflowDef} />
        </div>

        {/* 控制按钮 */}
        {isActive && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid rgba(100,210,255,0.1)',
            display: 'flex', gap: 10,
          }}>
            {isRunning && onPause && (
              <button
                onClick={() => onPause(workflow.execution_id)}
                style={controlBtnStyle('rgba(255,159,10,0.12)', '#ff9f0a', 'rgba(255,159,10,0.4)')}
              >
                ⏸ 暂停
              </button>
            )}
            {isPaused && onResume && (
              <button
                onClick={() => onResume(workflow.execution_id)}
                style={controlBtnStyle('rgba(48,209,88,0.12)', '#30d158', 'rgba(48,209,88,0.4)')}
              >
                ▶ 恢复
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(workflow.execution_id)}
                style={controlBtnStyle('rgba(255,55,95,0.12)', '#ff375f', 'rgba(255,55,95,0.4)')}
              >
                ✕ 取消
              </button>
            )}
          </div>
        )}

        {/* 失败节点重试 */}
        {onRetry && Object.entries(workflow.node_states).some(([, s]) => s === WorkflowNodeStatus.Failed) && (
          <div style={{
            padding: '8px 20px 12px', borderTop: '1px solid rgba(100,210,255,0.1)',
          }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>失败节点：</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(workflow.node_states)
                .filter(([, s]) => s === WorkflowNodeStatus.Failed)
                .map(([nodeId]) => (
                  <button
                    key={nodeId}
                    onClick={() => onRetry(workflow.execution_id, nodeId)}
                    style={{
                      padding: '4px 12px', borderRadius: 6,
                      border: '1px solid rgba(255,55,95,0.4)',
                      background: 'rgba(255,55,95,0.08)',
                      color: '#ff375f', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    🔄 {DEPT_NAMES[nodeId] ?? nodeId}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function controlBtnStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 0',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}
