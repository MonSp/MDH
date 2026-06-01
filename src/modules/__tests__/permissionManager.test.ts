import { PermissionManager } from '../permissionManager'
import type { OperationRequest } from '../permissionManager'
import { AgentCapability } from '../agentTypes'
import { configManager } from '../configSchema'
import type { CollaborationConfig } from '../configSchema'

describe('PermissionManager', () => {
    let pm: PermissionManager
    let uuidCounter: number
    let realConfig: CollaborationConfig

    beforeEach(() => {
        uuidCounter = 0
        realConfig = configManager.getConfig()
        vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `uuid-${++uuidCounter}`)
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
            ...realConfig,
            security: { rateLimits: [] },
        })
        pm = new PermissionManager()
    })

    afterEach(() => {
        pm.destroy()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    function makeRequest(overrides?: Partial<OperationRequest>): OperationRequest {
        return {
            agentId: 'agent-1',
            capability: AgentCapability.BrowserAutomation,
            operation: 'navigate',
            target: 'https://example.com',
            ...overrides,
        }
    }

    describe('capability whitelist', () => {
        it('should deny capability that has not been granted', () => {
            expect(pm.checkPermission('agent-1', AgentCapability.BrowserAutomation)).toBe(false)
        })

        it('should allow capability after grantPermission', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            expect(pm.checkPermission('agent-1', AgentCapability.BrowserAutomation)).toBe(true)
        })

        it('should not grant unrelated capabilities', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            expect(pm.checkPermission('agent-1', AgentCapability.FileOperation)).toBe(false)
        })

        it('should deny capability after revokePermission', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            expect(pm.checkPermission('agent-1', AgentCapability.BrowserAutomation)).toBe(true)

            const result = pm.revokePermission('agent-1', AgentCapability.BrowserAutomation)
            expect(result).toBe(true)
            expect(pm.checkPermission('agent-1', AgentCapability.BrowserAutomation)).toBe(false)
        })

        it('should return false when revoking non-existent permission', () => {
            expect(pm.revokePermission('agent-1', AgentCapability.BrowserAutomation)).toBe(false)
        })
    })

    describe('dual signature', () => {
        it('should require dual signature for browser_automation', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')

            const result = pm.requestOperation(makeRequest())

            expect(result.allowed).toBe(false)
            expect(result.requiresSignature).toBe(true)
            expect(result.pendingId).toBeDefined()
        })

        it('should approve after two different signers sign', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')

            const { pendingId } = pm.requestOperation(makeRequest())

            const first = pm.signOperation(pendingId!, 'signer-a')
            expect(first.approved).toBe(false)

            const second = pm.signOperation(pendingId!, 'signer-b')
            expect(second.approved).toBe(true)
        })

        it('should reject duplicate signer', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')

            const { pendingId } = pm.requestOperation(makeRequest())

            pm.signOperation(pendingId!, 'signer-a')
            const dup = pm.signOperation(pendingId!, 'signer-a')
            expect(dup.approved).toBe(false)
            expect(dup.reason).toBe('Signer has already signed')
        })

        it('should return error for non-existent pendingId', () => {
            const result = pm.signOperation('non-existent', 'signer-a')
            expect(result.approved).toBe(false)
            expect(result.reason).toBe('Pending signature request not found')
        })

        it('should not require dual signature for low-risk capability', () => {
            pm.grantPermission('agent-1', AgentCapability.CodeGeneration, 'admin')

            const result = pm.requestOperation(makeRequest({ capability: AgentCapability.CodeGeneration }))
            expect(result.allowed).toBe(true)
            expect(result.requiresSignature).toBe(false)
        })
    })

    describe('rate limiting (sliding window)', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        it('should allow requests up to maxOperations and deny the next', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')

            for (let i = 0; i < 10; i++) {
                const result = pm.requestOperation(makeRequest())
                expect(result.allowed).toBe(false)
                expect(result.requiresSignature).toBe(true)
            }

            const exceeded = pm.requestOperation(makeRequest())
            expect(exceeded.allowed).toBe(false)
            expect(exceeded.requiresSignature).toBe(false)
        })

        it('should allow requests again after window expires', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')

            for (let i = 0; i < 10; i++) {
                pm.requestOperation(makeRequest())
            }

            const denied = pm.requestOperation(makeRequest())
            expect(denied.allowed).toBe(false)
            expect(denied.requiresSignature).toBe(false)

            vi.advanceTimersByTime(60_001)

            const allowed = pm.requestOperation(makeRequest())
            expect(allowed.requiresSignature).toBe(true)
        })

        it('should track rate limit per agent independently', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            pm.grantPermission('agent-2', AgentCapability.BrowserAutomation, 'admin')

            for (let i = 0; i < 10; i++) {
                pm.requestOperation(makeRequest({ agentId: 'agent-1' }))
            }

            const agent1Result = pm.requestOperation(makeRequest({ agentId: 'agent-1' }))
            expect(agent1Result.allowed).toBe(false)
            expect(agent1Result.requiresSignature).toBe(false)

            const agent2Result = pm.requestOperation(makeRequest({ agentId: 'agent-2' }))
            expect(agent2Result.requiresSignature).toBe(true)
        })
    })

    describe('per-agent rate limit override', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        it('should use custom rate limit for specific agent', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            pm.setAgentRateLimit('agent-1', AgentCapability.BrowserAutomation, 2, 30_000)

            const status = pm.getRateLimitStatus('agent-1', AgentCapability.BrowserAutomation)
            expect(status.maxOperations).toBe(2)
            expect(status.windowMs).toBe(30_000)
        })

        it('should enforce custom rate limit', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            pm.setAgentRateLimit('agent-1', AgentCapability.BrowserAutomation, 2, 30_000)

            pm.requestOperation(makeRequest())
            pm.requestOperation(makeRequest())

            const third = pm.requestOperation(makeRequest())
            expect(third.allowed).toBe(false)
            expect(third.requiresSignature).toBe(false)
        })

        it('should reflect current count in getRateLimitStatus', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            pm.setAgentRateLimit('agent-1', AgentCapability.BrowserAutomation, 5, 60_000)

            pm.requestOperation(makeRequest())
            pm.requestOperation(makeRequest())

            const status = pm.getRateLimitStatus('agent-1', AgentCapability.BrowserAutomation)
            expect(status.currentCount).toBe(2)
            expect(status.maxOperations).toBe(5)
            expect(status.isLimited).toBe(false)
        })

        it('should show isLimited when count reaches maxOperations', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')
            pm.setAgentRateLimit('agent-1', AgentCapability.BrowserAutomation, 3, 60_000)

            for (let i = 0; i < 3; i++) {
                pm.requestOperation(makeRequest())
            }

            const status = pm.getRateLimitStatus('agent-1', AgentCapability.BrowserAutomation)
            expect(status.isLimited).toBe(true)
        })

        it('should remove agent rate limit override', () => {
            pm.setAgentRateLimit('agent-1', AgentCapability.BrowserAutomation, 2, 30_000)
            expect(pm.getAgentRateLimits('agent-1')).toHaveLength(1)

            const removed = pm.removeAgentRateLimit('agent-1', AgentCapability.BrowserAutomation)
            expect(removed).toBe(true)
            expect(pm.getAgentRateLimits('agent-1')).toHaveLength(0)
        })
    })

    describe('audit log', () => {
        it('should record allowed operations', () => {
            pm.grantPermission('agent-1', AgentCapability.CodeGeneration, 'admin')

            pm.requestOperation(makeRequest({
                agentId: 'agent-1',
                capability: AgentCapability.CodeGeneration,
                operation: 'generate',
                target: 'src/main.ts',
            }))

            const log = pm.getAuditLog()
            expect(log).toHaveLength(1)
            expect(log[0].agentId).toBe('agent-1')
            expect(log[0].operation).toBe('generate')
            expect(log[0].allowed).toBe(true)
            expect(log[0].reason).toBe('Operation approved')
        })

        it('should record denied operations', () => {
            pm.requestOperation(makeRequest({
                agentId: 'agent-1',
                capability: AgentCapability.BrowserAutomation,
                operation: 'navigate',
                target: 'https://example.com',
            }))

            const log = pm.getAuditLog()
            expect(log).toHaveLength(1)
            expect(log[0].agentId).toBe('agent-1')
            expect(log[0].allowed).toBe(false)
            expect(log[0].reason).toBe('Permission denied')
        })

        it('should filter audit log by agentId', () => {
            pm.grantPermission('agent-1', AgentCapability.CodeGeneration, 'admin')
            pm.grantPermission('agent-2', AgentCapability.CodeGeneration, 'admin')

            pm.requestOperation(makeRequest({
                agentId: 'agent-1',
                capability: AgentCapability.CodeGeneration,
                operation: 'op1',
                target: 'a',
            }))
            pm.requestOperation(makeRequest({
                agentId: 'agent-2',
                capability: AgentCapability.CodeGeneration,
                operation: 'op2',
                target: 'b',
            }))
            pm.requestOperation(makeRequest({
                agentId: 'agent-1',
                capability: AgentCapability.CodeGeneration,
                operation: 'op3',
                target: 'c',
            }))

            const agent1Log = pm.getAuditLog({ agentId: 'agent-1' })
            expect(agent1Log).toHaveLength(2)
            expect(agent1Log.every((e) => e.agentId === 'agent-1')).toBe(true)

            const agent2Log = pm.getAuditLog({ agentId: 'agent-2' })
            expect(agent2Log).toHaveLength(1)
            expect(agent2Log[0].agentId).toBe('agent-2')
        })

        it('should return all entries when no filter is provided', () => {
            pm.grantPermission('agent-1', AgentCapability.CodeGeneration, 'admin')

            pm.requestOperation(makeRequest({
                agentId: 'agent-1',
                capability: AgentCapability.CodeGeneration,
                operation: 'op1',
                target: 'a',
            }))
            pm.requestOperation(makeRequest({
                agentId: 'agent-1',
                capability: AgentCapability.CodeGeneration,
                operation: 'op2',
                target: 'b',
            }))

            expect(pm.getAuditLog()).toHaveLength(2)
        })

        it('should include correct risk level for high-risk capabilities', () => {
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin')

            pm.requestOperation(makeRequest())

            const log = pm.getAuditLog()
            expect(log[0].riskLevel).toBe('high')
        })

        it('should include correct risk level for low-risk capabilities', () => {
            pm.grantPermission('agent-1', AgentCapability.CodeGeneration, 'admin')

            pm.requestOperation(makeRequest({
                capability: AgentCapability.CodeGeneration,
            }))

            const log = pm.getAuditLog()
            expect(log[0].riskLevel).toBe('low')
        })
    })

    describe('expired permissions', () => {
        it('should deny expired permission', () => {
            const pastTime = Date.now() - 1000
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin', pastTime)

            expect(pm.checkPermission('agent-1', AgentCapability.BrowserAutomation)).toBe(false)
        })

        it('should allow non-expired permission', () => {
            const futureTime = Date.now() + 60_000
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin', futureTime)

            expect(pm.checkPermission('agent-1', AgentCapability.BrowserAutomation)).toBe(true)
        })

        it('should deny requestOperation for expired permission', () => {
            const pastTime = Date.now() - 1000
            pm.grantPermission('agent-1', AgentCapability.BrowserAutomation, 'admin', pastTime)

            const result = pm.requestOperation(makeRequest())
            expect(result.allowed).toBe(false)
            expect(result.requiresSignature).toBe(false)
        })
    })
})
