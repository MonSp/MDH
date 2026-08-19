/**
 * useMeetingSocket 消息处理器 — 统一导出
 *
 * 从按领域拆分的子模块中导出所有 handler 函数和类型。
 * 保持向后兼容，原有导入路径不变。
 */

// Import handlers from submodules
import {
  handleMeetingStarted,
  handleAgentMessage,
  handleThinkingStart,
  handleThinkingDelta,
  handleThinkingEnd,
  handleTaskAssigned,
  handleTaskDeleted,
  handleAgentStatusUpdate,
  handleMeetingEnded,
  handleAgendaUpdate,
  handleMeetingError,
  handleSemanticAnalysisResult,
  handleTaskAutoAssigned,
  handleStructuredFeedback,
  handleIterationUpdate,
  handleExperienceInjected,
  handleSkillMounted,
  handleReviewCompleted,
  handleWorkflowExecuted,
  handleWorkflowNodeStatusUpdate,
  handleWorkspaceCreated,
  handleToolResult,
  handleCriticalBlocker,
} from './handlers/meeting'

import {
  handleProposal,
  handleVote,
  handleVoteResult,
} from './handlers/voting'

import {
  handleHumanApprovalRequest,
  handleHumanApprovalResponse,
  handlePendingApprovals,
} from './handlers/approval'

import {
  handleCheckpointSaved,
  handleCheckpointRestored,
  handleCheckpointsList,
  handleCheckpointDeleted,
  handleMeetingSnapshotSaved,
  handleMeetingSnapshotRestored,
  handleAuditLog,
  handleAuditLogList,
} from './handlers/checkpoint'

import {
  handleBridgeAgentRegistered,
  handleBridgeMessage,
} from './handlers/bridge'

// Re-export all handlers
export {
  handleMeetingStarted,
  handleAgentMessage,
  handleThinkingStart,
  handleThinkingDelta,
  handleThinkingEnd,
  handleTaskAssigned,
  handleTaskDeleted,
  handleAgentStatusUpdate,
  handleMeetingEnded,
  handleAgendaUpdate,
  handleMeetingError,
  handleSemanticAnalysisResult,
  handleTaskAutoAssigned,
  handleStructuredFeedback,
  handleIterationUpdate,
  handleExperienceInjected,
  handleSkillMounted,
  handleReviewCompleted,
  handleWorkflowExecuted,
  handleWorkflowNodeStatusUpdate,
  handleWorkspaceCreated,
  handleToolResult,
  handleCriticalBlocker,
  handleProposal,
  handleVote,
  handleVoteResult,
  handleHumanApprovalRequest,
  handleHumanApprovalResponse,
  handlePendingApprovals,
  handleCheckpointSaved,
  handleCheckpointRestored,
  handleCheckpointsList,
  handleCheckpointDeleted,
  handleMeetingSnapshotSaved,
  handleMeetingSnapshotRestored,
  handleAuditLog,
  handleAuditLogList,
  handleBridgeAgentRegistered,
  handleBridgeMessage,
}

// Re-export types
export type { MeetingSetters, MeetingRefs } from './handlers/meeting'
export type { VotingSetters } from './handlers/voting'
export type { ApprovalSetters } from './handlers/approval'
export type { CheckpointSetters } from './handlers/checkpoint'
export type { BridgeSetters, BridgeRefs } from './handlers/bridge'

// ── 消息分发器 ──

type Handler = (msg: any, setters: any, refs?: any) => void

const HANDLER_REGISTRY: Record<string, Handler> = {
  meeting_started: handleMeetingStarted,
  agent_message: handleAgentMessage,
  thinking_start: handleThinkingStart,
  thinking_delta: handleThinkingDelta,
  thinking_end: handleThinkingEnd,
  task_assigned: handleTaskAssigned,
  task_deleted: handleTaskDeleted,
  agent_status_update: handleAgentStatusUpdate,
  meeting_ended: handleMeetingEnded,
  agenda_update: handleAgendaUpdate,
  meeting_error: handleMeetingError,
  semantic_analysis_result: handleSemanticAnalysisResult,
  task_auto_assigned: handleTaskAutoAssigned,
  structured_feedback: handleStructuredFeedback,
  iteration_update: handleIterationUpdate,
  experience_injected: handleExperienceInjected,
  skill_mounted: handleSkillMounted,
  review_completed: handleReviewCompleted,
  workflow_executed: handleWorkflowExecuted,
  workflow_node_status_update: handleWorkflowNodeStatusUpdate,
  workspace_created: handleWorkspaceCreated,
  tool_result: handleToolResult,
  critical_blocker: handleCriticalBlocker,
  proposal: handleProposal,
  vote: handleVote,
  vote_result: handleVoteResult,
  human_approval_request: handleHumanApprovalRequest,
  human_approval_response: handleHumanApprovalResponse,
  pending_approvals: handlePendingApprovals,
  checkpoint_saved: handleCheckpointSaved,
  checkpoint_restored: handleCheckpointRestored,
  checkpoints_list: handleCheckpointsList,
  checkpoint_deleted: handleCheckpointDeleted,
  meeting_snapshot_saved: handleMeetingSnapshotSaved,
  meeting_snapshot_restored: handleMeetingSnapshotRestored,
  audit_log: handleAuditLog,
  audit_log_list: handleAuditLogList,
  bridge_agent_registered: handleBridgeAgentRegistered,
  bridge_message: handleBridgeMessage,
}

export function dispatchMessage(
  msgType: string,
  msg: any,
  setters: any,
  refs?: any,
): boolean {
  const handler = HANDLER_REGISTRY[msgType]
  if (handler) {
    handler(msg, setters, refs)
    return true
  }
  return false
}
