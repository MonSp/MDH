/**
 * AgentReferenceSystem types and enums.
 * Extracted from agentReferenceSystem.ts for reduced file size.
 */

export enum ReferenceType {
  DirectMention = 'direct_mention',
  Quote = 'quote',
  Response = 'response',
  Collaboration = 'collaboration',
  Delegation = 'delegation',
  Feedback = 'feedback',
}

export enum ReferenceStatus {
  Pending = 'pending',
  Acknowledged = 'acknowledged',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Completed = 'completed',
}

export interface AgentReference {
  id: string
  conversationId: string
  sourceAgentId: string
  targetAgentId: string
  referenceType: ReferenceType
  messageId: string
  content: string
  timestamp: number
  status: ReferenceStatus
  metadata: Record<string, unknown>
}

export interface ReferenceRequest {
  id: string
  referenceId: string
  sourceAgentId: string
  targetAgentId: string
  requestType: string
  content: string
  timestamp: number
  deadline?: number
}

export interface ReferenceResponse {
  id: string
  requestId: string
  agentId: string
  accepted: boolean
  content: string
  timestamp: number
  metadata: Record<string, unknown>
}

export interface CollaborationSession {
  id: string
  conversationId: string
  participants: string[]
  initiatorId: string
  topic: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  startTime: number
  endTime: number | null
  references: AgentReference[]
  metadata: Record<string, unknown>
}
