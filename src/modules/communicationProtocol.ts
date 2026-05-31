export enum MessageType {
  TaskAssignment = 'task_assignment',
  TaskResult = 'task_result',
  TaskRequest = 'task_request',
  TaskUpdate = 'task_update',
  StatusReport = 'status_report',
  StatusRequest = 'status_request',
  ErrorReport = 'error_report',
  HelpRequest = 'help_request',
  HelpResponse = 'help_response',
  DataShare = 'data_share',
  ControlCommand = 'control_command',
  Heartbeat = 'heartbeat',
  Acknowledgement = 'acknowledgement',
  AgendaUpdate = 'agenda_update',
  Proposal = 'proposal',
  Vote = 'vote',
  VoteResult = 'vote_result',
  CriticalBlocker = 'critical_blocker',
  HumanApprovalRequest = 'human_approval_request',
  HumanApprovalResponse = 'human_approval_response',
  AuditLog = 'audit_log',
}

export enum MessagePriority {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
  Urgent = 'urgent',
}

export enum MessageStatus {
  Pending = 'pending',
  Sent = 'sent',
  Delivered = 'delivered',
  Processed = 'processed',
  Failed = 'failed',
  Expired = 'expired',
}

export interface MessageEnvelope<T = unknown> {
  id: string
  type: MessageType
  priority: MessagePriority
  status: MessageStatus
  senderId: string
  receiverId: string | null
  broadcast: boolean
  sessionId: string
  correlationId: string | null
  replyTo: string | null
  timestamp: number
  expiresAt: number | null
  payload: T
  metadata: Record<string, unknown>
  traceId?: string
  spanId?: string
  causalMessageId?: string
  sequenceNo?: number
}

export interface TaskAssignmentPayload {
  taskId: string
  taskTitle: string
  taskDescription: string
  input: Record<string, unknown>
  constraints: Record<string, unknown>
  deadline: number | null
}

export interface TaskResultPayload {
  taskId: string
  success: boolean
  output: unknown
  artifacts: Array<{
    type: string
    name: string
    content?: string
    url?: string
  }>
  summary: string
  duration: number
  metrics?: Record<string, number>
}

export interface TaskUpdatePayload {
  taskId: string
  status: string
  progress: number
  message: string
}

export interface StatusReportPayload {
  agentId: string
  status: string
  currentTaskId: string | null
  completedTaskCount: number
  failedTaskCount: number
  uptime: number
  resourceUsage?: {
    cpu?: number
    memory?: number
  }
}

export interface ErrorReportPayload {
  taskId: string
  errorCode: string
  errorMessage: string
  recoverable: boolean
  stackTrace?: string
  context?: Record<string, unknown>
}

export interface HelpRequestPayload {
  taskId: string
  requiredCapabilities: string[]
  description: string
  urgency: MessagePriority
}

export interface HelpResponsePayload {
  requestId: string
  accepted: boolean
  agentId: string
  estimatedTime?: number
  reason?: string
}

export interface DataSharePayload {
  key: string
  data: unknown
  format: string
  ttl?: number
}

export interface ControlCommandPayload {
  command: 'pause' | 'resume' | 'cancel' | 'restart' | 'escalate'
  targetTaskId?: string
  reason?: string
  params?: Record<string, unknown>
}

export interface HeartbeatPayload {
  agentId: string
  timestamp: number
  load: number
}

export interface AcknowledgementPayload {
  messageId: string
  accepted: boolean
  reason?: string
}

export interface AgendaUpdatePayload {
  phase: string
  topic: string
  currentSpeaker?: string
  proposalId?: string
}

export interface ProposalPayload {
  proposalId: string
  proposerId: string
  content: string
  stance: 'support' | 'oppose' | 'modify' | 'neutral'
  confidence: number
  argumentRefs: Array<{ messageId: string; summary: string }>
}

export interface VotePayload {
  proposalId: string
  voterId: string
  approve: boolean
  weight: number
  reason: string
}

export interface VoteResultPayload {
  proposalId: string
  strategy: string
  totalVotes: number
  approveCount: number
  opposeCount: number
  weightedApprove: number
  weightedOppose: number
  accepted: boolean
}

export interface CriticalBlockerPayload {
  agentId: string
  content: string
  blockerType: string
}

export interface HumanApprovalRequestPayload {
  requestId: string
  requesterId: string
  operation: string
  description: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
}

export interface HumanApprovalResponsePayload {
  requestId: string
  approved: boolean
  reason?: string
}

export interface AuditLogPayload {
  entryId: string
  agentId: string
  operation: string
  target: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  result: string
  details: Record<string, unknown>
}

export type TypedMessage =
  | MessageEnvelope<TaskAssignmentPayload>
  | MessageEnvelope<TaskResultPayload>
  | MessageEnvelope<TaskUpdatePayload>
  | MessageEnvelope<StatusReportPayload>
  | MessageEnvelope<ErrorReportPayload>
  | MessageEnvelope<HelpRequestPayload>
  | MessageEnvelope<HelpResponsePayload>
  | MessageEnvelope<DataSharePayload>
  | MessageEnvelope<ControlCommandPayload>
  | MessageEnvelope<HeartbeatPayload>
  | MessageEnvelope<AcknowledgementPayload>
  | MessageEnvelope<AgendaUpdatePayload>
  | MessageEnvelope<ProposalPayload>
  | MessageEnvelope<VotePayload>
  | MessageEnvelope<VoteResultPayload>
  | MessageEnvelope<CriticalBlockerPayload>
  | MessageEnvelope<HumanApprovalRequestPayload>
  | MessageEnvelope<HumanApprovalResponsePayload>
  | MessageEnvelope<AuditLogPayload>
  | MessageEnvelope

export interface CommunicationChannel {
  id: string
  name: string
  type: 'direct' | 'broadcast' | 'topic'
  participants: string[]
  messageHistory: MessageEnvelope[]
  createdAt: number
}

export interface MessageHandler {
  messageType: MessageType
  handler: (message: MessageEnvelope) => Promise<MessageEnvelope | null>
}

export interface CommunicationBus {
  channels: Map<string, CommunicationChannel>
  handlers: Map<MessageType, MessageHandler[]>
  pendingMessages: MessageEnvelope[]
  deadLetterQueue: MessageEnvelope[]
}

export function createMessage<T>(
  type: MessageType,
  senderId: string,
  receiverId: string | null,
  payload: T,
  options?: Partial<Omit<MessageEnvelope<T>, 'id' | 'type' | 'senderId' | 'receiverId' | 'payload' | 'timestamp'>>,
): MessageEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    type,
    priority: options?.priority ?? MessagePriority.Normal,
    status: MessageStatus.Pending,
    senderId,
    receiverId,
    broadcast: options?.broadcast ?? false,
    sessionId: options?.sessionId ?? '',
    correlationId: options?.correlationId ?? null,
    replyTo: options?.replyTo ?? null,
    timestamp: Date.now(),
    expiresAt: options?.expiresAt ?? null,
    payload,
    metadata: options?.metadata ?? {},
  }
}

export function createReply<T>(
  original: MessageEnvelope,
  type: MessageType,
  senderId: string,
  payload: T,
): MessageEnvelope<T> {
  return createMessage(type, senderId, original.senderId, payload, {
    sessionId: original.sessionId,
    correlationId: original.id,
    replyTo: original.id,
    priority: original.priority,
  })
}

export function isMessageExpired(message: MessageEnvelope): boolean {
  if (!message.expiresAt) return false
  return Date.now() > message.expiresAt
}

export function createCommunicationChannel(
  name: string,
  type: CommunicationChannel['type'],
  participants: string[],
): CommunicationChannel {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    participants,
    messageHistory: [],
    createdAt: Date.now(),
  }
}
