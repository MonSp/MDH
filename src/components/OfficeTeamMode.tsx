import React, { useState, useEffect, useCallback } from 'react'
import type { ViewState, ProjectDetail } from './office-team/types'
import OfficeHeader from './office-team/OfficeHeader'
import OfficeScene from './office-team/OfficeScene'
import MeetingChatPanel from './office-team/MeetingChatPanel'
import TaskAssignPanel from './office-team/TaskAssignPanel'
import AgendaPanel from './office-team/AgendaPanel'
import TechTowerView from './TechTowerView'
import WorkflowPanel from './WorkflowPanel'
import WorkspacePanel from './office-team/WorkspacePanel'
import SkillEvolutionPanel from './skill-evolution/SkillEvolutionPanel'
import VotingPanel from './office-team/VotingPanel'
import ApprovalPanel from './office-team/ApprovalPanel'
import CheckpointPanel from './office-team/CheckpointPanel'
import AuditLogPanel from './office-team/AuditLogPanel'
import AgentWeightPanel from './office-team/AgentWeightPanel'
import RoleEditorPanel from './office-team/RoleEditorPanel'
import HistoryPanel from './office-team/HistoryPanel'
import SkillMarketplace from './office-team/SkillMarketplace'
import useMeetingSocket from '../hooks/useMeetingSocket'
import { useAgentSystem } from '../hooks/useAgentSystem'
import { AgentRole, AgentCapability } from '../modules/agentTypes'

interface OfficeTeamModeProps {
  wsRef: React.MutableRefObject<WebSocket | null>
  onBackToSingle: () => void
  pendingApprovalCount?: number
  onOpenApproval?: () => void
}

export default function OfficeTeamMode({ wsRef, onBackToSingle, pendingApprovalCount = 0, onOpenApproval }: OfficeTeamModeProps) {
  const [viewState, setViewState] = useState<ViewState>('tower')
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null)
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [meetingTab, setMeetingTab] = useState<'chat' | 'files' | 'skills' | 'vote'>('chat')
  const [refreshKey, setRefreshKey] = useState(0)

  const {
    agents,
    tasks,
    chatMessages,
    isMeetingActive,
    lastWorkflow,
    agendaState,
    workspace,
    toolCallLogs,
    clearWorkflow,
    startMeeting,
    sendMeetingMessage,
    endMeeting,
    sendAgendaAction,
    sendToolCall,
    sendWorkspaceAction,
    activeProposal,
    votes,
    voteResults,
    createProposal,
    castVote,
    evaluateConsensus,
    // 人工审批
    pendingApprovals,
    sendApprovalResponse,
    getPendingApprovals,
    // 检查点
    checkpoints,
    restoredState,
    saveCheckpoint,
    restoreCheckpoint,
    getCheckpoints,
    deleteCheckpoint,
    clearRestoredState,
    // 审计日志
    auditLog,
    getAuditLog,
    // 迭代配置
    maxIterations,
    setMaxIterations,
    // 权重调整
    adjustAgentWeight,
  } = useMeetingSocket({ wsRef })

  // TS 智能体系统
  const {
    agents: tsAgents,
    createAgent: createTsAgent,
    removeAgent: removeTsAgent,
    sendAgentMessage,
    onAgentMessage,
    getPythonId,
    registerToPython,
  } = useAgentSystem({ wsRef, autoRegister: true })

  // 从科技大厦进入办公室
  const handleEnterOffice = useCallback((projectId: string, projectName: string) => {
    setSelectedProject({ id: projectId, name: projectName })
    setViewState('office')
    refreshProjectDetail(projectId)
  }, [])

  // 刷新项目详情
  const refreshProjectDetail = useCallback((projectId: string) => {
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setProjectDetail(data.data)
        }
      })
      .catch(err => console.error('加载项目详情失败:', err))
  }, [])

  // 启动会议（留在办公室，弹出面板）
  const handleStartMeeting = useCallback(() => {
    startMeeting()
    setViewState('meeting')
    setMeetingTab('chat')
  }, [startMeeting])

  // 结束会议（收回面板，回到办公室）
  const handleEndMeeting = useCallback(() => {
    endMeeting()
    setViewState('office')
    // 会议结束后刷新项目详情（可能有新任务/子任务）
    if (selectedProject) {
      refreshProjectDetail(selectedProject.id)
    }
  }, [endMeeting, selectedProject, refreshProjectDetail])

  // 返回科技大厦
  const handleBackToTower = useCallback(() => {
    // 如果会议正在进行，先结束会议
    if (isMeetingActive) {
      endMeeting()
    }
    setViewState('tower')
    setSelectedProject(null)
    setProjectDetail(null)
    setPendingTaskDescription(null)
    setRefreshKey(k => k + 1) // 触发项目列表刷新
  }, [isMeetingActive, endMeeting])

  // 发送会议消息
  const handleSendMessage = useCallback(() => {
    if (!taskInput.trim()) return
    sendMeetingMessage(taskInput.trim())
    setTaskInput('')
  }, [taskInput, sendMeetingMessage])

  // 待发送的任务描述（从大厦直接发送任务时暂存）
  const [pendingTaskDescription, setPendingTaskDescription] = useState<string | null>(null)

  // 从大厦直接发送任务
  const handleTowerSendTask = useCallback((description: string) => {
    startMeeting()
    setViewState('meeting')
    setPendingTaskDescription(description)
  }, [startMeeting])

  // 会议启动后自动发送待处理任务
  useEffect(() => {
    if (isMeetingActive && pendingTaskDescription) {
      sendMeetingMessage(pendingTaskDescription)
      setPendingTaskDescription(null)
    }
  }, [isMeetingActive, pendingTaskDescription, sendMeetingMessage])

  const isTower = viewState === 'tower'
  const isMeeting = viewState === 'meeting'

  // 第一层：公司大楼
  if (isTower) {
    return (
      <TechTowerView
        wsRef={wsRef}
        onStartMeeting={() => handleTowerSendTask('开始新会议')}
        onSendTask={handleTowerSendTask}
        onBackToSingle={onBackToSingle}
        onEnterProject={handleEnterOffice}
        refreshKey={refreshKey}
      />
    )
  }

  // 第二层：办公室 + 第三层：会议面板（叠加）
  return (
    <div style={styles.container}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <OfficeHeader
        viewState={viewState}
        tasks={tasks}
        hasMessages={chatMessages.length > 0}
        onBackToSingle={onBackToSingle}
        onBackToTower={handleBackToTower}
        onStartMeeting={handleStartMeeting}
        meetingPhase={meetingPhase}
        meetingStartTime={meetingStartTime}
        projectName={selectedProject?.name}
      />

      {pendingApprovalCount > 0 && (
        <div style={styles.approvalBar}>
          <button style={styles.approvalButton} onClick={onOpenApproval}>
            <span style={styles.approvalIcon}>🔔</span>
            <span style={styles.approvalText}>{pendingApprovalCount} 个审批请求待处理</span>
            <span style={styles.approvalBadge}>{pendingApprovalCount}</span>
          </button>
        </div>
      )}

      <div style={styles.mainContent}>
        {/* 办公室主体（始终保持显示） */}
        <div style={{ ...styles.officeArea, animation: 'fadeIn 0.4s ease' }}>
          <OfficeScene
            agents={agents}
            viewState={viewState}
            onStartMeeting={handleStartMeeting}
            projectName={selectedProject?.name}
            projectId={selectedProject?.id}
            projectDetail={projectDetail}
          />
        </div>

        {/* TS 智能体管理面板 */}
        {!isMeeting && tsAgents.length > 0 && (
          <div style={styles.tsAgentPanel}>
            <div style={styles.tsAgentPanelHeader}>
              <span>🤖 自定义智能体</span>
              <span style={styles.tsAgentCount}>{tsAgents.length}</span>
            </div>
            {tsAgents.map(agent => (
              <div key={agent.id} style={styles.tsAgentCard}>
                <div style={styles.tsAgentInfo}>
                  <span style={styles.tsAgentName}>{agent.configId}</span>
                  <span style={styles.tsAgentStatus}>{agent.status}</span>
                </div>
                {getPythonId(agent.id) && (
                  <span style={styles.tsAgentPyId}>→ {getPythonId(agent.id)}</span>
                )}
                <button
                  style={styles.tsAgentRemoveBtn}
                  onClick={() => removeTsAgent(agent.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 会议面板（从右侧滑出，覆盖办公室右侧） */}
        {isMeeting && (
          <div style={styles.meetingOverlay}>
            <div style={styles.meetingPanel}>
              <div style={styles.meetingHeader}>
                <div style={styles.meetingTitle}>
                  <span>📋 会议进行中</span>
                  <span style={styles.meetingPhase}>{meetingPhase !== 'idle' ? meetingPhase : ''}</span>
                </div>
                <div style={styles.meetingHeaderRight}>
                  <label style={styles.iterLabel} title="最大审查迭代轮次">
                    轮次:
                    <select
                      style={styles.iterSelect}
                      value={maxIterations}
                      onChange={e => setMaxIterations(Number(e.target.value))}
                    >
                      {[1, 2, 3, 5, 10].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button style={styles.closeMeetingBtn} onClick={handleEndMeeting}>×</button>
                </div>
              </div>

              <div style={styles.meetingTabBar}>
                {([['chat', '💬 对话'], ['files', '📄 文件'], ['skills', '🧬 技能进化'], ['vote', '🗳️ 投票']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMeetingTab(key)}
                    style={{
                      ...styles.meetingTabBtn,
                      ...(meetingTab === key ? styles.meetingTabBtnActive : {}),
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={styles.meetingContent}>
                {meetingTab === 'chat' ? (
                  <>
                    {/* 任务列表 */}
                    {tasks.length > 0 && (
                      <div style={styles.taskListSection}>
                        <div style={styles.taskListHeader}>
                          <span>📋 任务列表 ({tasks.length})</span>
                        </div>
                        <div style={styles.taskList}>
                          {tasks.map(task => {
                            const agent = agents.find(a => a.id === task.agentId)
                            const statusMap: Record<string, { icon: string; color: string }> = {
                              completed: { icon: '✅', color: '#10b981' },
                              executing: { icon: '⚡', color: '#f59e0b' },
                              assigned: { icon: '📌', color: '#3b82f6' },
                              pending: { icon: '⏳', color: '#6b7280' },
                              failed: { icon: '❌', color: '#ef4444' },
                              revision_required: { icon: '⚠️', color: '#f59e0b' },
                            }
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
                                  onClick={() => deleteTask(task.id)}
                                  style={styles.deleteTaskBtn}
                                  title="删除任务"
                                >×</button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <MeetingChatPanel
                      agents={agents}
                      messages={chatMessages}
                      onEndMeeting={handleEndMeeting}
                      agendaPhase={agendaState?.phase || 'idle'}
                    />
                    <AgendaPanel
                      agendaState={agendaState}
                      onAction={sendAgendaAction}
                    />
                  </>
                ) : meetingTab === 'files' ? (
                  <WorkspacePanel
                    workspace={workspace}
                    toolCallLogs={toolCallLogs}
                    onToolCall={(name, args) => sendToolCall(name, args)}
                    onDestroy={() => sendWorkspaceAction('destroy', workspace?.workspace_id)}
                    messages={chatMessages}
                  />
                ) : meetingTab === 'vote' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'auto' }}>
                    <VotingPanel
                      activeProposal={activeProposal}
                      votes={votes}
                      voteResults={voteResults}
                      onCreateProposal={createProposal}
                      onCastVote={castVote}
                      onEvaluateConsensus={evaluateConsensus}
                    />
                    <ApprovalPanel
                      pendingApprovals={pendingApprovals}
                      onApprove={(id, reason) => sendApprovalResponse(id, true, reason)}
                      onReject={(id, reason) => sendApprovalResponse(id, false, reason)}
                    />
                    <CheckpointPanel
                      checkpoints={checkpoints}
                      restoredState={restoredState}
                      onSaveCheckpoint={saveCheckpoint}
                      onRestoreCheckpoint={restoreCheckpoint}
                      onDeleteCheckpoint={deleteCheckpoint}
                      onGetCheckpoints={getCheckpoints}
                      onClearRestoredState={clearRestoredState}
                    />
                    <AuditLogPanel
                      auditLog={auditLog}
                      onGetAuditLog={getAuditLog}
                    />
                    <AgentWeightPanel
                      agents={agents.map(a => ({ id: a.id, name: a.name || a.id, role: a.role || 'executor' }))}
                      onAdjustWeight={adjustAgentWeight}
                    />
                    <RoleEditorPanel wsRef={wsRef} />
                    <HistoryPanel />
                    <SkillMarketplace />
                  </div>
                ) : (
                  <SkillEvolutionPanel />
                )}
              </div>

              <TaskAssignPanel
                agents={agents}
                taskInput={taskInput}
                onTaskInputChange={setTaskInput}
                onSendMessage={handleSendMessage}
              />
            </div>
          </div>
        )}
      </div>

      <WorkflowPanel
        workflow={lastWorkflow}
        onClose={clearWorkflow}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a2a 100%)',
    color: '#e2e8f0',
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  officeArea: {
    flex: 1,
    position: 'relative',
    transition: 'all 0.3s ease',
  },
  meetingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '450px',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(10, 10, 30, 0.95)',
    borderLeft: '1px solid rgba(139, 92, 246, 0.3)',
    boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.5)',
    zIndex: 100,
    animation: 'slideInRight 0.3s ease',
  },
  meetingPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  meetingHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(139, 92, 246, 0.1)',
  },
  meetingTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  meetingPhase: {
    fontSize: '11px',
    color: '#a78bfa',
    padding: '2px 8px',
    background: 'rgba(139, 92, 246, 0.15)',
    borderRadius: '10px',
  },
  closeMeetingBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#9ca3af',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  iterLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iterSelect: {
    padding: '2px 6px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '11px',
    outline: 'none',
  },
  meetingTabBar: {
    display: 'flex',
    gap: '2px',
    padding: '4px 12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  meetingTabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  meetingTabBtnActive: {
    background: 'rgba(139, 92, 246, 0.15)',
    color: '#a78bfa',
  },
  meetingContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  approvalBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 16px',
    background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
  },
  approvalButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    background: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  approvalIcon: { fontSize: '14px' },
  approvalText: { color: '#fca5a5' },
  approvalBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    background: '#ef4444',
    borderRadius: '9px',
    color: 'white',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
  },
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
  // TS 智能体面板样式
  tsAgentPanel: {
    position: 'absolute' as const,
    top: '60px',
    right: '16px',
    width: '220px',
    background: 'rgba(15, 23, 42, 0.95)',
    borderRadius: '12px',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    padding: '12px',
    zIndex: 10,
    backdropFilter: 'blur(8px)',
  },
  tsAgentPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  tsAgentCount: {
    fontSize: '11px',
    color: '#a78bfa',
    background: 'rgba(139, 92, 246, 0.2)',
    padding: '1px 6px',
    borderRadius: '8px',
  },
  tsAgentCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.03)',
    marginBottom: '4px',
  },
  tsAgentInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
  },
  tsAgentName: {
    fontSize: '12px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tsAgentStatus: {
    fontSize: '10px',
    color: '#94a3b8',
  },
  tsAgentPyId: {
    fontSize: '10px',
    color: '#a78bfa',
    whiteSpace: 'nowrap' as const,
  },
  tsAgentRemoveBtn: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    border: 'none',
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    fontSize: '11px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
}
