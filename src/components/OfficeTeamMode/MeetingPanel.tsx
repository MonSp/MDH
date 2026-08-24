/**
 * MeetingPanel — 会议面板组件
 */

import React from 'react'
import type { TeamAgent, Task, ChatMessage, AgendaState } from '../office-team/types'
import MeetingChatPanel from '../office-team/MeetingChatPanel'
import TaskAssignPanel from '../office-team/TaskAssignPanel'
import AgendaPanel from '../office-team/AgendaPanel'
import WorkspacePanel from '../office-team/WorkspacePanel'
import VotingPanel from '../office-team/VotingPanel'
import ApprovalPanel from '../office-team/ApprovalPanel'
import CheckpointPanel from '../office-team/CheckpointPanel'
import AuditLogPanel from '../office-team/AuditLogPanel'
import AgentWeightPanel from '../office-team/AgentWeightPanel'
import RoleEditorPanel from '../office-team/RoleEditorPanel'
import HistoryPanel from '../office-team/HistoryPanel'
import SkillMarketplace from '../office-team/SkillMarketplace'
import AssetBrowserPanel from '../office-team/AssetBrowserPanel'
import A2AAgentPanel from '../office-team/A2AAgentPanel'
import SkillEvolutionPanel from '../skill-evolution/SkillEvolutionPanel'
import TaskList from './TaskList'

interface MeetingPanelProps {
  agents: TeamAgent[]
  tasks: Task[]
  chatMessages: ChatMessage[]
  agendaState: AgendaState | null
  workspace: any
  toolCallLogs: any[]
  meetingPhase: string
  maxIterations: number
  activeProposal: any
  votes: Map<string, any>
  voteResults: any
  pendingApprovals: Map<string, any>
  checkpoints: any[]
  restoredState: any
  auditLog: any[]
  taskInput: string
  meetingTab: 'chat' | 'files' | 'skills' | 'vote' | 'assets' | 'a2a'
  wsRef: React.MutableRefObject<WebSocket | null>
  onEndMeeting: () => void
  onSetMeetingTab: (tab: 'chat' | 'files' | 'skills' | 'vote' | 'assets') => void
  onSetMaxIterations: (n: number) => void
  onSetTaskInput: (v: string) => void
  onSendMessage: () => void
  onSendAgendaAction: (action: string, topic?: string, reason?: string) => void
  onSendToolCall: (name: string, args: Record<string, unknown>) => void
  onSendWorkspaceAction: (action: string, id?: string) => void
  onDeleteTask: (id: string) => void
  onCreateProposal: (content: string, proposerId?: string) => void
  onCastVote: (proposalId: string, approve: boolean, reason?: string, voterId?: string) => void
  onEvaluateConsensus: (proposalId: string, strategy?: string) => void
  onSendApprovalResponse: (id: string, approved: boolean, reason?: string) => void
  onSaveCheckpoint: (taskId: string, stepIndex: number, state: Record<string, unknown>) => void
  onRestoreCheckpoint: (id: string) => void
  onDeleteCheckpoint: (id: string) => void
  onGetCheckpoints: (taskId?: string) => void
  onClearRestoredState: () => void
  onGetAuditLog: (filters?: { agentId?: string; operation?: string; riskLevel?: string }) => void
  onAdjustWeight: (agentId: string, weight: number) => void
}

export default function MeetingPanel(props: MeetingPanelProps) {
  const {
    agents, tasks, chatMessages, agendaState, workspace, toolCallLogs,
    meetingPhase, maxIterations, activeProposal, votes, voteResults,
    pendingApprovals, checkpoints, restoredState, auditLog,
    taskInput, meetingTab, wsRef,
    onEndMeeting, onSetMeetingTab, onSetMaxIterations, onSetTaskInput,
    onSendMessage, onSendAgendaAction, onSendToolCall, onSendWorkspaceAction,
    onDeleteTask, onCreateProposal, onCastVote, onEvaluateConsensus,
    onSendApprovalResponse, onSaveCheckpoint, onRestoreCheckpoint,
    onDeleteCheckpoint, onGetCheckpoints, onClearRestoredState,
    onGetAuditLog, onAdjustWeight,
  } = props

  return (
    <div style={styles.meetingOverlay}>
      <div style={styles.meetingPanel}>
        {/* 会议头部 */}
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
                onChange={e => onSetMaxIterations(Number(e.target.value))}
              >
                {[1, 2, 3, 5, 10].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button style={styles.closeMeetingBtn} onClick={onEndMeeting}>×</button>
          </div>
        </div>

        {/* Tab 栏 */}
        <div style={styles.meetingTabBar}>
          {([['chat', '💬 对话'], ['files', '📄 文件'], ['skills', '🧬 技能进化'], ['vote', '🗳️ 投票'], ['assets', '🧠 资产'], ['a2a', '🔗 执行节点']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onSetMeetingTab(key)}
              style={{
                ...styles.meetingTabBtn,
                ...(meetingTab === key ? styles.meetingTabBtnActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div style={styles.meetingContent}>
          {meetingTab === 'chat' ? (
            <>
              <TaskList tasks={tasks} agents={agents} onDeleteTask={onDeleteTask} />
              <MeetingChatPanel
                agents={agents}
                messages={chatMessages}
                onEndMeeting={onEndMeeting}
                agendaPhase={agendaState?.phase || 'idle'}
              />
              <AgendaPanel agendaState={agendaState} onAction={onSendAgendaAction} />
            </>
          ) : meetingTab === 'files' ? (
            <WorkspacePanel
              workspace={workspace}
              toolCallLogs={toolCallLogs}
              onToolCall={(name, args) => onSendToolCall(name, args)}
              onDestroy={() => onSendWorkspaceAction('destroy', workspace?.workspace_id)}
              messages={chatMessages}
            />
          ) : meetingTab === 'vote' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'auto' }}>
              <VotingPanel
                activeProposal={activeProposal}
                votes={votes}
                voteResults={voteResults}
                onCreateProposal={onCreateProposal}
                onCastVote={onCastVote}
                onEvaluateConsensus={onEvaluateConsensus}
              />
              <ApprovalPanel
                pendingApprovals={pendingApprovals}
                onApprove={(id, reason) => onSendApprovalResponse(id, true, reason)}
                onReject={(id, reason) => onSendApprovalResponse(id, false, reason)}
              />
              <CheckpointPanel
                checkpoints={checkpoints}
                restoredState={restoredState}
                onSaveCheckpoint={onSaveCheckpoint}
                onRestoreCheckpoint={onRestoreCheckpoint}
                onDeleteCheckpoint={onDeleteCheckpoint}
                onGetCheckpoints={onGetCheckpoints}
                onClearRestoredState={onClearRestoredState}
              />
              <AuditLogPanel auditLog={auditLog} onGetAuditLog={onGetAuditLog} />
              <AgentWeightPanel
                agents={agents.map(a => ({ id: a.id, name: a.name || a.id, role: a.role || 'executor' }))}
                onAdjustWeight={onAdjustWeight}
              />
              <RoleEditorPanel wsRef={wsRef} />
              <HistoryPanel />
              <SkillMarketplace />
            </div>
          ) : meetingTab === 'assets' ? (
            <AssetBrowserPanel />
          ) : meetingTab === 'a2a' ? (
            <A2AAgentPanel />
          ) : (
            <SkillEvolutionPanel />
          )}
        </div>

        {/* 任务输入 */}
        <TaskAssignPanel
          agents={agents}
          taskInput={taskInput}
          onTaskInputChange={onSetTaskInput}
          onSendMessage={onSendMessage}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
}
