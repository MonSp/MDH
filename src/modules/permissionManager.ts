import type { AgentCapability } from './agentTypes'
import { configManager } from './configSchema'
import type { CollaborationConfig } from './configSchema'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface Permission {
  capability: AgentCapability
  granted: boolean
  grantedBy: string | null
  grantedAt: number
  expiresAt: number | null
}

export interface SecurityPolicy {
  highRiskCapabilities: AgentCapability[]
  requireDualSignature: AgentCapability[]
  rateLimit: {
    capability: AgentCapability
    maxOperations: number
    windowMs: number
  }[]
}

export interface AuditEntry {
  id: string
  agentId: string
  operation: string
  target: string
  riskLevel: RiskLevel
  allowed: boolean
  reason: string
  timestamp: number
  signers: string[]
}

export interface OperationRequest {
  agentId: string
  capability: AgentCapability
  operation: string
  target: string
  params?: Record<string, unknown>
}

export interface RateLimitStatus {
  capability: AgentCapability
  currentCount: number
  maxOperations: number
  windowMs: number
  windowStart: number
  isLimited: boolean
}

const DEFAULT_POLICY: SecurityPolicy = {
  highRiskCapabilities: [
    'browser_automation' as AgentCapability,
    'file_operation' as AgentCapability,
  ],
  requireDualSignature: ['browser_automation' as AgentCapability],
  rateLimit: [
    {
      capability: 'browser_automation' as AgentCapability,
      maxOperations: 10,
      windowMs: 60_000,
    },
    {
      capability: 'file_operation' as AgentCapability,
      maxOperations: 10,
      windowMs: 60_000,
    },
  ],
}

export class PermissionManager {
  private permissions: Map<string, Permission[]> = new Map()
  private auditLog: AuditEntry[] = []
  private policy: SecurityPolicy
  private operationCounts: Map<string, { count: number; windowStart: number }> = new Map()
  private pendingSignatures: Map<string, { request: OperationRequest; signers: string[] }> = new Map()
  private configListener: (config: CollaborationConfig) => void

  constructor(policy?: Partial<SecurityPolicy>) {
    const configRateLimits = configManager.getConfig().security.rateLimits
    const rateLimit = configRateLimits?.length
      ? configRateLimits.map((rl) => ({
          capability: rl.action as AgentCapability,
          maxOperations: rl.maxPerWindow,
          windowMs: rl.windowMs,
        }))
      : DEFAULT_POLICY.rateLimit

    this.policy = { ...DEFAULT_POLICY, ...policy, rateLimit }

    this.configListener = (config: CollaborationConfig) => {
      const newRateLimits = config.security.rateLimits
      if (newRateLimits?.length) {
        this.policy.rateLimit = newRateLimits.map((rl) => ({
          capability: rl.action as AgentCapability,
          maxOperations: rl.maxPerWindow,
          windowMs: rl.windowMs,
        }))
      }
    }

    configManager.addListener(this.configListener)
  }

  checkPermission(agentId: string, capability: AgentCapability): boolean {
    const agentPermissions = this.permissions.get(agentId) ?? []
    const now = Date.now()
    return agentPermissions.some(
      (p) =>
        p.capability === capability &&
        p.granted &&
        (p.expiresAt === null || p.expiresAt > now),
    )
  }

  grantPermission(
    agentId: string,
    capability: AgentCapability,
    grantedBy: string,
    expiresAt?: number,
  ): void {
    const agentPermissions = this.permissions.get(agentId) ?? []
    const existing = agentPermissions.findIndex((p) => p.capability === capability)

    const permission: Permission = {
      capability,
      granted: true,
      grantedBy,
      grantedAt: Date.now(),
      expiresAt: expiresAt ?? null,
    }

    if (existing >= 0) {
      agentPermissions[existing] = permission
    } else {
      agentPermissions.push(permission)
    }

    this.permissions.set(agentId, agentPermissions)
  }

  revokePermission(agentId: string, capability: AgentCapability): boolean {
    const agentPermissions = this.permissions.get(agentId) ?? []
    const index = agentPermissions.findIndex(
      (p) => p.capability === capability && p.granted,
    )

    if (index < 0) return false

    agentPermissions[index] = { ...agentPermissions[index], granted: false }
    this.permissions.set(agentId, agentPermissions)
    return true
  }

  requestOperation(request: OperationRequest): {
    allowed: boolean
    requiresSignature: boolean
    pendingId?: string
  } {
    if (!this.checkPermission(request.agentId, request.capability)) {
      this.logAudit(request, false, 'Permission denied', [])
      return { allowed: false, requiresSignature: false }
    }

    if (!this.checkRateLimit(request.agentId, request.capability)) {
      this.logAudit(request, false, 'Rate limit exceeded', [])
      return { allowed: false, requiresSignature: false }
    }

    if (this.policy.requireDualSignature.includes(request.capability)) {
      const pendingId = crypto.randomUUID()
      this.pendingSignatures.set(pendingId, { request, signers: [] })
      this.logAudit(request, false, 'Requires dual signature', [])
      return { allowed: false, requiresSignature: true, pendingId }
    }

    this.logAudit(request, true, 'Operation approved', [])
    return { allowed: true, requiresSignature: false }
  }

  signOperation(
    pendingId: string,
    signerId: string,
  ): { approved: boolean; reason: string } {
    const pending = this.pendingSignatures.get(pendingId)
    if (!pending) {
      return { approved: false, reason: 'Pending signature request not found' }
    }

    if (pending.signers.includes(signerId)) {
      return { approved: false, reason: 'Signer has already signed' }
    }

    pending.signers.push(signerId)

    if (pending.signers.length >= 2) {
      this.pendingSignatures.delete(pendingId)
      this.logAudit(pending.request, true, 'Dual signature approved', pending.signers)
      return { approved: true, reason: 'Operation approved with dual signature' }
    }

    return {
      approved: false,
      reason: `Requires ${2 - pending.signers.length} more signature(s)`,
    }
  }

  getAuditLog(
    filter?: { agentId?: string; operation?: string; riskLevel?: RiskLevel },
  ): AuditEntry[] {
    if (!filter) return [...this.auditLog]

    return this.auditLog.filter((entry) => {
      if (filter.agentId && entry.agentId !== filter.agentId) return false
      if (filter.operation && entry.operation !== filter.operation) return false
      if (filter.riskLevel && entry.riskLevel !== filter.riskLevel) return false
      return true
    })
  }

  getPolicy(): SecurityPolicy {
    return { ...this.policy }
  }

  getRateLimitStatus(agentId: string, capability: AgentCapability): RateLimitStatus {
    const limitConfig = this.policy.rateLimit.find((r) => r.capability === capability)
    const key = `${agentId}:${capability}`
    const entry = this.operationCounts.get(key)
    const now = Date.now()

    const maxOperations = limitConfig?.maxOperations ?? 0
    const windowMs = limitConfig?.windowMs ?? 0

    if (!entry || now - entry.windowStart > windowMs) {
      return {
        capability,
        currentCount: 0,
        maxOperations,
        windowMs,
        windowStart: now,
        isLimited: false,
      }
    }

    return {
      capability,
      currentCount: entry.count,
      maxOperations,
      windowMs,
      windowStart: entry.windowStart,
      isLimited: entry.count >= maxOperations,
    }
  }

  updatePolicy(update: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...update }
  }

  clear(): void {
    this.permissions.clear()
    this.auditLog = []
    this.operationCounts.clear()
    this.pendingSignatures.clear()
  }

  destroy(): void {
    configManager.removeListener(this.configListener)
  }

  private checkRateLimit(agentId: string, capability: AgentCapability): boolean {
    const limitConfig = this.policy.rateLimit.find((r) => r.capability === capability)
    if (!limitConfig) return true

    const key = `${agentId}:${capability}`
    const now = Date.now()
    const entry = this.operationCounts.get(key)

    if (!entry || now - entry.windowStart > limitConfig.windowMs) {
      this.operationCounts.set(key, { count: 1, windowStart: now })
      return true
    }

    if (entry.count >= limitConfig.maxOperations) {
      return false
    }

    entry.count++
    return true
  }

  private logAudit(
    request: OperationRequest,
    allowed: boolean,
    reason: string,
    signers: string[],
  ): void {
    const riskLevel = this.determineRiskLevel(request.capability)
    this.auditLog.push({
      id: crypto.randomUUID(),
      agentId: request.agentId,
      operation: request.operation,
      target: request.target,
      riskLevel,
      allowed,
      reason,
      timestamp: Date.now(),
      signers,
    })
  }

  private determineRiskLevel(capability: AgentCapability): RiskLevel {
    if (this.policy.highRiskCapabilities.includes(capability)) {
      return 'high'
    }
    return 'low'
  }
}
