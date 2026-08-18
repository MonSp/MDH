/**
 * OfficeTeamMode — 办公团队模式主组件
 *
 * 拆分自 OfficeTeamMode.tsx，使用 TaskList 和 MeetingPanel 分离任务列表和会议面板。
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import type { ViewState, ProjectDetail } from '../office-team/types'
import OfficeHeader from '../office-team/OfficeHeader'
import OfficeScene from '../office-team/OfficeScene'
import WorkflowPanel from '../WorkflowPanel'
import { useAgentSystem } from '../../hooks/useAgentSystem'
import useMeetingSocket from '../../hooks/useMeetingSocket'
import TaskList from './TaskList'
import MeetingPanel from './MeetingPanel'

const TechTowerView = React.lazy(() => import('../TechTowerView'))

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
  const [meetingTab, setMeetingTab] = useState<'chat' | 'files' | 'skills' | 'vote' | 'assets'>('chat')
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingTaskDescription, setPendingTaskDescription] = useState<string | null>(null)

  const meetingSocket = useMeetingSocket({ wsRef })
  const {
    agents, tasks, chatMessages, isMeetingActive, lastWorkflow, agendaState,
    workspace, toolCallLogs, clearWorkflow, startMeeting, sendMeetingMessage,
    endMeeting, sendAgendaAction, sendToolCall, meetingPhase, meetingStartTime,
    deleteTask, sendWorkspaceAction, activeProposal, votes, voteResults,
    createProposal, castVote, evaluateConsensus, pendingApprovals,
    sendApprovalResponse, getPendingApprovals, checkpoints, restoredState,
    saveCheckpoint, restoreCheckpoint, getCheckpoints, deleteCheckpoint,
    clearRestoredState, auditLog, getAuditLog, maxIterations, setMaxIterations,
    adjustAgentWeight,
  } = meetingSocket

  const {
    agents: tsAgents, createAgent: createTsAgent, removeAgent: removeTsAgent,
    sendAgentMessage, onAgentMessage, getPythonId, registerToPython,
  } = useAgentSystem({ wsRef, autoRegister: true })

  const handleEnterOffice = useCallback((projectId: string, projectName: string) => {
    setSelectedProject({ id: projectId, name: projectName })
    setViewState('office')
    refreshProjectDetail(projectId)
  }, [])

  const refreshProjectDetail = useCallback((projectId: string) => {
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(data => { if (data.success && data.data) setProjectDetail(data.data) })
      .catch(err => console.error('加载项目详情失败:', err))
  }, [])

  const handleStartMeeting = useCallback(() => {
    startMeeting()
    setViewState('meeting')
    setMeetingTab('chat')
  }, [startMeeting])

  const handleEndMeeting = useCallback(() => {
    endMeeting()
    setViewState('office')
    if (selectedProject) refreshProjectDetail(selectedProject.id)
  }, [endMeeting, selectedProject, refreshProjectDetail])

  const handleBackToTower = useCallback(() => {
    if (isMeetingActive) endMeeting()
    setViewState('tower')
    setSelectedProject(null)
    setProjectDetail(null)
    setPendingTaskDescription(null)
    setRefreshKey(k => k + 1)
  }, [isMeetingActive, endMeeting])

  const handleSendMessage = useCallback(() => {
    if (!taskInput.trim()) return
    sendMeetingMessage(taskInput.trim())
    setTaskInput('')
  }, [taskInput, sendMeetingMessage])

  const handleTowerSendTask = useCallback((description: string) => {
    startMeeting()
    setViewState('meeting')
    setPendingTaskDescription(description)
  }, [startMeeting])

  useEffect(() => {
    if (isMeetingActive && pendingTaskDescription) {
      sendMeetingMessage(pendingTaskDescription)
      setPendingTaskDescription(null)
    }
  }, [isMeetingActive, pendingTaskDescription, sendMeetingMessage])

  useEffect(() => { getPendingApprovals() }, [getPendingApprovals])

  const isTower = viewState === 'tower'
  const isMeeting = viewState === 'meeting'

  // 第一层：公司大楼
  if (isTower) {
    return (
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#a78bfa' }}>加载 3D 场景...</div>}>
        <TechTowerView
          wsRef={wsRef}
          onStartMeeting={() => handleTowerSendTask('开始新会议')}
          onSendTask={handleTowerSendTask}
          onBackToSingle={onBackToSingle}
          onEnterProject={handleEnterOffice}
          refreshKey={refreshKey}
        />
      </Suspense>
    )
  }

  // 第二层：办公室 + 第三层：会议面板
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
                <button style={styles.tsAgentRemoveBtn} onClick={() => removeTsAgent(agent.id)}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* 会议面板 */}
        {isMeeting && (
          <MeetingPanel
            agents={agents}
            tasks={tasks}
            chatMessages={chatMessages}
            agendaState={agendaState}
            workspace={workspace}
            toolCallLogs={toolCallLogs}
            meetingPhase={meetingPhase}
            maxIterations={maxIterations}
            activeProposal={activeProposal}
            votes={votes}
            voteResults={voteResults}
            pendingApprovals={pendingApprovals}
            checkpoints={checkpoints}
            restoredState={restoredState}
            auditLog={auditLog}
            taskInput={taskInput}
            meetingTab={meetingTab}
            wsRef={wsRef}
            onEndMeeting={handleEndMeeting}
            onSetMeetingTab={setMeetingTab}
            onSetMaxIterations={setMaxIterations}
            onSetTaskInput={setTaskInput}
            onSendMessage={handleSendMessage}
            onSendAgendaAction={sendAgendaAction}
            onSendToolCall={sendToolCall}
            onSendWorkspaceAction={sendWorkspaceAction}
            onDeleteTask={deleteTask}
            onCreateProposal={createProposal}
            onCastVote={castVote}
            onEvaluateConsensus={evaluateConsensus}
            onSendApprovalResponse={sendApprovalResponse}
            onSaveCheckpoint={saveCheckpoint}
            onRestoreCheckpoint={restoreCheckpoint}
            onDeleteCheckpoint={deleteCheckpoint}
            onGetCheckpoints={getCheckpoints}
            onClearRestoredState={clearRestoredState}
            onGetAuditLog={getAuditLog}
            onAdjustWeight={adjustAgentWeight}
          />
        )}
      </div>

      <WorkflowPanel workflow={lastWorkflow} onClose={clearWorkflow} />
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
  tsAgentStatus: { fontSize: '10px', color: '#94a3b8' },
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
