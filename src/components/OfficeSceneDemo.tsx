import React, { useState, useEffect, useCallback, useMemo } from 'react'
import OfficeScene, { WORKSTATION_POSITIONS, MEETING_TABLE_POSITION } from './OfficeScene'
import Workstation from './Workstation'
import MeetingTable from './MeetingTable'
import OfficeAgent from './OfficeAgent'
import MovementPath from './MovementPath'
import officeStateManager from '../modules/officeStateManager'
import officeWorkflow from '../modules/officeWorkflow'
import { AgentRole, DEFAULT_ROLE_PROFILES } from '../modules/agentTypes'
import type { WorkflowPhase, OfficeAgentState } from '../modules/officeStateManager'
import type { WorkflowTask } from '../modules/officeWorkflow'

interface OfficeSceneDemoProps {
  onClose?: () => void
}

const AGENT_CONFIGS = [
  { id: 'agent-planner', name: '规划者-Alpha', role: AgentRole.Planner, workstationId: 'ws-1' },
  { id: 'agent-executor', name: '执行者-Beta', role: AgentRole.Executor, workstationId: 'ws-2' },
  { id: 'agent-monitor', name: '监控者-Gamma', role: AgentRole.Monitor, workstationId: 'ws-3' },
  { id: 'agent-reviewer', name: '审查者-Delta', role: AgentRole.Reviewer, workstationId: 'ws-4' },
  { id: 'agent-coordinator', name: '协调者-Epsilon', role: AgentRole.Coordinator, workstationId: 'ws-5' },
]

const SCENE_WIDTH = 800
const SCENE_HEIGHT = 600
const CELL_WIDTH = SCENE_WIDTH / 3
const CELL_HEIGHT = SCENE_HEIGHT / 3

const themeColors = {
  primaryColor: '#4d9fff',
  secondaryColor: '#a78bfa',
  accentColor: '#3dd6c8',
  backgroundColor: '#0f192d',
  surfaceColor: 'rgba(15, 25, 45, 0.95)',
  borderColor: 'rgba(90, 140, 210, 0.15)',
  textPrimary: '#e2e8f0',
  textSecondary: '#8899b4',
  textMuted: '#4a5575',
}

const roleLabels: Record<AgentRole, string> = {
  planner: '规划者',
  executor: '执行者',
  monitor: '监控者',
  reviewer: '审查者',
  coordinator: '协调者',
}

function getWorkstationPixelPosition(pos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: pos.x * CELL_WIDTH + CELL_WIDTH / 2,
    y: pos.y * CELL_HEIGHT + CELL_HEIGHT / 2,
  }
}

function getMeetingTablePixelPosition(): { x: number; y: number } {
  return getWorkstationPixelPosition(MEETING_TABLE_POSITION)
}

export default function OfficeSceneDemo({ onClose }: OfficeSceneDemoProps) {
  const [agents, setAgents] = useState<OfficeAgentState[]>([])
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('idle')
  const [tasks, setTasks] = useState<WorkflowTask[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [taskDescription, setTaskDescription] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  const initializeScene = useCallback(() => {
    officeStateManager.reset()

    AGENT_CONFIGS.forEach((config) => {
      const workstationPos = WORKSTATION_POSITIONS.find(ws => ws.id === config.workstationId)
      if (!workstationPos) return

      const pixelPos = getWorkstationPixelPosition(workstationPos)

      officeStateManager.addWorkstation(config.workstationId)
      officeStateManager.addAgent({
        id: config.id,
        name: config.name,
        role: config.role,
        position: pixelPos,
        targetPosition: null,
        status: 'idle',
        workstationId: config.workstationId,
        currentTask: null,
      })
      officeStateManager.bindWorkstation(config.workstationId, config.id)
    })

    setIsInitialized(true)
  }, [])

  useEffect(() => {
    initializeScene()

    officeWorkflow.setCallbacks({
      onPhaseChange: (phase) => {
        setWorkflowPhase(phase)
        refreshState()
      },
      onAgentMoveStart: () => {
        refreshState()
      },
      onAgentMoveComplete: () => {
        refreshState()
      },
      onTaskAssigned: (task) => {
        setTasks((prev) => [...prev, task])
        refreshState()
      },
      onTaskComplete: () => {
        refreshState()
      },
    })

    const unsubscribe = officeStateManager.subscribe(() => {
      refreshState()
    })

    return () => {
      unsubscribe()
      officeWorkflow.setCallbacks({})
    }
  }, [initializeScene])

  const refreshState = useCallback(() => {
    const allAgents = officeStateManager.getAllAgents()
    setAgents(allAgents)
    setWorkflowPhase(officeStateManager.getWorkflowPhase())
    setTasks(officeWorkflow.getAllTasks())
  }, [])

  const handleStartMeeting = useCallback(async () => {
    await officeWorkflow.startMeeting()
  }, [])

  const handleAssignTask = useCallback(() => {
    if (!selectedAgentId || !taskDescription.trim()) return
    officeWorkflow.assignTask(selectedAgentId, taskDescription.trim())
    setTaskDescription('')
    setSelectedAgentId(null)
  }, [selectedAgentId, taskDescription])

  const handleStartWorking = useCallback(async () => {
    await officeWorkflow.startWorking()
  }, [])

  const handleCompleteTask = useCallback((taskId: string) => {
    officeWorkflow.completeTask(taskId)
  }, [])

  const handleReset = useCallback(() => {
    officeWorkflow.reset()
    initializeScene()
    setTasks([])
    setSelectedAgentId(null)
    setTaskDescription('')
  }, [initializeScene])

  const meetingAgents = useMemo(() => {
    return agents
      .filter((a) => a.status === 'meeting')
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        status: (a.currentTask ? 'discussing' : 'waiting') as 'idle' | 'discussing' | 'waiting',
      }))
  }, [agents])

  const meetingStatus = useMemo(() => {
    if (workflowPhase === 'meeting') return 'discussing' as const
    if (workflowPhase === 'assigning') return 'assigning' as const
    if (workflowPhase === 'done') return 'done' as const
    return 'idle' as const
  }, [workflowPhase])

  const movementPaths = useMemo(() => {
    return agents
      .filter((a) => a.status === 'moving' && a.targetPosition)
      .map((a) => ({
        id: `path-${a.id}`,
        points: [
          { x: a.position.x, y: a.position.y },
          { x: a.targetPosition!.x, y: a.targetPosition!.y },
        ],
        color: DEFAULT_ROLE_PROFILES[a.role].themeColor,
        animated: true,
      }))
  }, [agents])

  const phaseLabels: Record<WorkflowPhase, string> = {
    idle: '待命',
    meeting: '会议中',
    assigning: '任务派发',
    working: '工作中',
    done: '已完成',
  }

  const canStartMeeting = workflowPhase === 'idle' || workflowPhase === 'done'
  const canAssignTask = workflowPhase === 'meeting' || workflowPhase === 'assigning'
  const canStartWorking = workflowPhase === 'assigning'

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>办公室场景演示</h2>
          <div style={styles.phaseBadge}>
            <span style={styles.phaseDot} />
            <span style={styles.phaseText}>{phaseLabels[workflowPhase]}</span>
          </div>
        </div>
        {onClose && (
          <button style={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div style={styles.mainContent}>
        <div style={styles.sceneContainer}>
          <OfficeScene>
            {WORKSTATION_POSITIONS.map((pos) => {
              const agent = agents.find((a) => a.workstationId === pos.id)
              return (
                <div
                  key={pos.id}
                  style={{
                    position: 'absolute',
                    left: pos.x * CELL_WIDTH,
                    top: pos.y * CELL_HEIGHT,
                    width: CELL_WIDTH,
                    height: CELL_HEIGHT,
                    pointerEvents: 'none',
                  }}
                >
                  <Workstation
                    id={pos.id}
                    position={{ x: 20, y: 20 }}
                    agentId={agent?.id}
                    agentName={agent?.name}
                    agentRole={agent?.role}
                    status={agent?.status === 'meeting' ? 'meeting' : agent?.status === 'working' ? 'busy' : 'idle'}
                    currentTask={agent?.currentTask ? tasks.find((t) => t.id === agent.currentTask)?.description : undefined}
                  />
                </div>
              )
            })}

            <div
              style={{
                position: 'absolute',
                left: MEETING_TABLE_POSITION.x * CELL_WIDTH,
                top: MEETING_TABLE_POSITION.y * CELL_HEIGHT,
                width: CELL_WIDTH,
                height: CELL_HEIGHT,
                pointerEvents: 'none',
              }}
            >
              <MeetingTable
                agents={meetingAgents}
                meetingStatus={meetingStatus}
                onAssignTask={(agentId, task) => {
                  officeWorkflow.assignTask(agentId, task)
                }}
                onStartMeeting={handleStartMeeting}
                onEndMeeting={handleReset}
              />
            </div>

            <MovementPath paths={movementPaths} width={SCENE_WIDTH} height={SCENE_HEIGHT} />

            {agents.map((agent) => (
              <OfficeAgent
                key={agent.id}
                id={agent.id}
                name={agent.name}
                role={agent.role}
                status={agent.status}
                currentPosition={agent.position}
                targetPosition={agent.targetPosition || undefined}
                onMoveComplete={() => {
                  officeStateManager.updateAgentPosition(agent.id, agent.position)
                }}
                showPath={false}
                speed={150}
              />
            ))}
          </OfficeScene>
        </div>

        <div style={styles.controlPanel}>
          <div style={styles.controlSection}>
            <h3 style={styles.sectionTitle}>工作流程控制</h3>
            <div style={styles.buttonGroup}>
              <button
                style={{
                  ...styles.primaryButton,
                  opacity: canStartMeeting ? 1 : 0.5,
                }}
                onClick={handleStartMeeting}
                disabled={!canStartMeeting}
              >
                开始会议
              </button>
              <button
                style={{
                  ...styles.successButton,
                  opacity: canStartWorking ? 1 : 0.5,
                }}
                onClick={handleStartWorking}
                disabled={!canStartWorking}
              >
                开始工作
              </button>
              <button style={styles.resetButton} onClick={handleReset}>
                重置场景
              </button>
            </div>
          </div>

          <div style={styles.controlSection}>
            <h3 style={styles.sectionTitle}>任务派发</h3>
            <div style={styles.taskAssignForm}>
              <select
                style={styles.select}
                value={selectedAgentId || ''}
                onChange={(e) => setSelectedAgentId(e.target.value || null)}
                disabled={!canAssignTask}
              >
                <option value="">选择Agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({roleLabels[agent.role]})
                  </option>
                ))}
              </select>
              <input
                type="text"
                style={styles.input}
                placeholder="输入任务描述..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                disabled={!canAssignTask}
              />
              <button
                style={{
                  ...styles.assignButton,
                  opacity: canAssignTask && selectedAgentId && taskDescription.trim() ? 1 : 0.5,
                }}
                onClick={handleAssignTask}
                disabled={!canAssignTask || !selectedAgentId || !taskDescription.trim()}
              >
                派发任务
              </button>
            </div>
          </div>

          <div style={styles.controlSection}>
            <h3 style={styles.sectionTitle}>Agent 状态</h3>
            <div style={styles.agentList}>
              {agents.map((agent) => {
                const profile = DEFAULT_ROLE_PROFILES[agent.role]
                return (
                  <div
                    key={agent.id}
                    style={{
                      ...styles.agentItem,
                      borderColor: profile.themeColor + '40',
                    }}
                  >
                    <div style={styles.agentItemHeader}>
                      <span style={{ ...styles.agentDot, background: profile.themeColor }} />
                      <span style={styles.agentName}>{agent.name}</span>
                      <span style={styles.agentRole}>{roleLabels[agent.role]}</span>
                    </div>
                    <div style={styles.agentStatus}>
                      {agent.status === 'idle' && '💤 空闲'}
                      {agent.status === 'moving' && '🚶 移动中'}
                      {agent.status === 'working' && '⚡ 工作中'}
                      {agent.status === 'meeting' && '👥 会议中'}
                    </div>
                    {agent.currentTask && (
                      <div style={styles.agentTask}>
                        📋 {tasks.find((t) => t.id === agent.currentTask)?.description || '执行任务'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={styles.controlSection}>
            <h3 style={styles.sectionTitle}>任务列表</h3>
            <div style={styles.taskList}>
              {tasks.length === 0 ? (
                <div style={styles.emptyText}>暂无任务</div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} style={styles.taskItem}>
                    <div style={styles.taskItemHeader}>
                      <span style={styles.taskDescription}>{task.description}</span>
                      <span
                        style={{
                          ...styles.taskStatus,
                          color:
                            task.status === 'completed'
                              ? '#10b981'
                              : task.status === 'failed'
                              ? '#ef4444'
                              : task.status === 'executing'
                              ? '#f59e0b'
                              : '#6b7280',
                        }}
                      >
                        {task.status === 'pending' && '待分配'}
                        {task.status === 'assigned' && '已分配'}
                        {task.status === 'executing' && '执行中'}
                        {task.status === 'completed' && '已完成'}
                        {task.status === 'failed' && '失败'}
                      </span>
                    </div>
                    <div style={styles.taskAgent}>
                      执行者: {agents.find((a) => a.id === task.agentId)?.name || task.agentId}
                    </div>
                    {task.status === 'assigned' && (
                      <button
                        style={styles.completeButton}
                        onClick={() => handleCompleteTask(task.id)}
                      >
                        标记完成
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.instructions}>
        <h4 style={styles.instructionsTitle}>使用说明</h4>
        <ol style={styles.instructionsList}>
          <li>点击"开始会议"按钮，所有Agent将移动到会议桌</li>
          <li>在任务派发区域选择Agent并输入任务描述，点击"派发任务"</li>
          <li>派发任务后，点击"开始工作"按钮，Agent将返回各自工位</li>
          <li>在任务列表中标记任务完成，当所有任务完成后工作流程结束</li>
          <li>点击"重置场景"可重新开始演示</li>
        </ol>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: themeColors.backgroundColor,
    color: themeColors.textPrimary,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: `1px solid ${themeColors.borderColor}`,
    background: themeColors.surfaceColor,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: themeColors.textPrimary,
  },
  phaseBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    background: 'rgba(77, 159, 255, 0.1)',
    borderRadius: '20px',
    border: `1px solid ${themeColors.primaryColor}30`,
  },
  phaseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: themeColors.primaryColor,
    boxShadow: `0 0 8px ${themeColors.primaryColor}`,
  },
  phaseText: {
    fontSize: '13px',
    fontWeight: 500,
    color: themeColors.primaryColor,
  },
  closeButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: `1px solid ${themeColors.borderColor}`,
    borderRadius: '8px',
    color: themeColors.textSecondary,
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s ease',
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sceneContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: 'rgba(0, 0, 0, 0.2)',
  },
  controlPanel: {
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px',
    background: themeColors.surfaceColor,
    borderLeft: `1px solid ${themeColors.borderColor}`,
    overflowY: 'auto',
  },
  controlSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: themeColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  primaryButton: {
    padding: '10px 16px',
    background: `linear-gradient(135deg, ${themeColors.primaryColor} 0%, #3b82f6 100%)`,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: `0 4px 12px ${themeColors.primaryColor}40`,
  },
  successButton: {
    padding: '10px 16px',
    background: `linear-gradient(135deg, ${themeColors.accentColor} 0%, #10b981 100%)`,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: `0 4px 12px ${themeColors.accentColor}40`,
  },
  resetButton: {
    padding: '10px 16px',
    background: 'transparent',
    color: themeColors.textSecondary,
    border: `1px solid ${themeColors.borderColor}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  taskAssignForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  select: {
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: themeColors.textPrimary,
    border: `1px solid ${themeColors.borderColor}`,
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
  },
  input: {
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.3)',
    color: themeColors.textPrimary,
    border: `1px solid ${themeColors.borderColor}`,
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
  },
  assignButton: {
    padding: '10px 16px',
    background: `linear-gradient(135deg, ${themeColors.secondaryColor} 0%, #8b5cf6 100%)`,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: `0 4px 12px ${themeColors.secondaryColor}40`,
  },
  agentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  agentItem: {
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    border: '1px solid',
  },
  agentItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  agentDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  agentName: {
    fontSize: '13px',
    fontWeight: 600,
    color: themeColors.textPrimary,
    flex: 1,
  },
  agentRole: {
    fontSize: '11px',
    color: themeColors.textMuted,
  },
  agentStatus: {
    fontSize: '12px',
    color: themeColors.textSecondary,
    marginLeft: '16px',
  },
  agentTask: {
    fontSize: '11px',
    color: themeColors.textMuted,
    marginLeft: '16px',
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  emptyText: {
    fontSize: '13px',
    color: themeColors.textMuted,
    textAlign: 'center',
    padding: '16px',
  },
  taskItem: {
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    border: `1px solid ${themeColors.borderColor}`,
  },
  taskItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  taskDescription: {
    fontSize: '13px',
    color: themeColors.textPrimary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  taskStatus: {
    fontSize: '11px',
    fontWeight: 600,
  },
  taskAgent: {
    fontSize: '11px',
    color: themeColors.textMuted,
  },
  completeButton: {
    marginTop: '8px',
    padding: '6px 12px',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  instructions: {
    padding: '16px 24px',
    background: themeColors.surfaceColor,
    borderTop: `1px solid ${themeColors.borderColor}`,
  },
  instructionsTitle: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: themeColors.textSecondary,
  },
  instructionsList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '12px',
    color: themeColors.textMuted,
    lineHeight: 1.8,
  },
}
