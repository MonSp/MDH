import { describe, it, expect, beforeEach } from 'vitest'
import { ExperienceExtractorLocal } from '../experienceExtractorLocal'
import type { ExecutionLogLocal, ExperienceRuleLocal } from '../experienceExtractorLocal'

describe('ExperienceExtractorLocal', () => {
  let extractor: ExperienceExtractorLocal

  beforeEach(() => {
    extractor = new ExperienceExtractorLocal()
  })

  // Helper to create a success log
  const makeSuccessLog = (overrides?: Partial<ExecutionLogLocal>): ExecutionLogLocal => ({
    taskId: 'task-001',
    agentId: 'agent-1',
    taskDescription: 'Implement REST API for user management',
    taskType: 'software-dev',
    status: 'success',
    steps: ['Analyze requirements', 'Design API endpoints', 'Implement controllers', 'Write tests'],
    errors: [],
    corrections: [],
    finalOutput: 'Successfully implemented user CRUD API with authentication',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  })

  // Helper to create a failure-recovery log
  const makeFailureRecoveryLog = (overrides?: Partial<ExecutionLogLocal>): ExecutionLogLocal => ({
    taskId: 'task-002',
    agentId: 'agent-2',
    taskDescription: 'Fix database connection timeout',
    taskType: 'software-dev',
    status: 'success',
    steps: ['Identify error', 'Apply fix', 'Verify'],
    errors: ['Connection timeout after 30s', 'SSL handshake failed'],
    corrections: ['Increase connection pool timeout to 60s', 'Add CA certificate to trust store'],
    finalOutput: 'Database connection stable',
    createdAt: '2024-01-02T00:00:00Z',
    ...overrides,
  })

  // ====== extractFromSuccess ======

  describe('extractFromSuccess', () => {
    it('should extract step pattern rule from multi-step success log', () => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)

      expect(rules.length).toBeGreaterThanOrEqual(1)
      const stepRule = rules.find(r => r.ruleType === 'success_pattern')
      expect(stepRule).toBeDefined()
      expect(stepRule!.action).toContain('Analyze requirements')
      expect(stepRule!.action).toContain('Design API endpoints')
      expect(stepRule!.status).toBe('pending_review')
    })

    it('should extract heuristic rule from final output', () => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)

      const heuristicRule = rules.find(r => r.ruleType === 'heuristic')
      expect(heuristicRule).toBeDefined()
      expect(heuristicRule!.action).toContain('user CRUD API')
    })

    it('should return empty for non-success status', () => {
      const log = makeSuccessLog({ status: 'failure' })
      const rules = extractor.extractFromSuccess(log)
      expect(rules).toEqual([])
    })

    it('should return empty for single-step log (no step pattern)', () => {
      const log = makeSuccessLog({ steps: ['Do everything at once'] })
      const rules = extractor.extractFromSuccess(log)
      // Only heuristic rule if finalOutput is present
      expect(rules.every(r => r.ruleType !== 'success_pattern')).toBe(true)
    })

    it('should return empty for empty steps', () => {
      const log = makeSuccessLog({ steps: [] })
      const rules = extractor.extractFromSuccess(log)
      // No step pattern, but heuristic from output
      expect(rules.every(r => r.ruleType !== 'success_pattern')).toBe(true)
    })

    it('should include source task info in rules', () => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)

      for (const rule of rules) {
        expect(rule.sourceTaskId).toBe('task-001')
        expect(rule.sourceTaskType).toBe('software-dev')
      }
    })

    it('should extract keywords from task description', () => {
      const log = makeSuccessLog({ taskDescription: 'Build React component for dashboard' })
      const rules = extractor.extractFromSuccess(log)

      expect(rules.length).toBeGreaterThan(0)
      expect(rules[0].keywords).toContain('react')
      expect(rules[0].keywords).toContain('component')
    })

    it('should store rules internally', () => {
      const log = makeSuccessLog()
      extractor.extractFromSuccess(log)

      const pending = extractor.getPendingRules()
      expect(pending.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ====== extractFromFailureRecovery ======

  describe('extractFromFailureRecovery', () => {
    it('should create rules from error-correction pairs', () => {
      const log = makeFailureRecoveryLog()
      const rules = extractor.extractFromFailureRecovery(log)

      expect(rules).toHaveLength(2)

      expect(rules[0].ruleType).toBe('failure_recovery')
      expect(rules[0].triggerCondition).toContain('Connection timeout')
      expect(rules[0].action).toContain('Increase connection pool timeout')

      expect(rules[1].triggerCondition).toContain('SSL handshake failed')
      expect(rules[1].action).toContain('CA certificate')
    })

    it('should return empty when no errors', () => {
      const log = makeFailureRecoveryLog({ errors: [] })
      const rules = extractor.extractFromFailureRecovery(log)
      expect(rules).toEqual([])
    })

    it('should return empty when no corrections', () => {
      const log = makeFailureRecoveryLog({ corrections: [] })
      const rules = extractor.extractFromFailureRecovery(log)
      expect(rules).toEqual([])
    })

    it('should pair up to min(errors, corrections)', () => {
      const log = makeFailureRecoveryLog({
        errors: ['err1', 'err2', 'err3'],
        corrections: ['fix1'],
      })
      const rules = extractor.extractFromFailureRecovery(log)
      expect(rules).toHaveLength(1)
      expect(rules[0].triggerCondition).toContain('err1')
      expect(rules[0].action).toContain('fix1')
    })

    it('should mark all rules as pending_review', () => {
      const log = makeFailureRecoveryLog()
      const rules = extractor.extractFromFailureRecovery(log)
      expect(rules.every(r => r.status === 'pending_review')).toBe(true)
    })

    it('should store rules internally', () => {
      const log = makeFailureRecoveryLog()
      extractor.extractFromFailureRecovery(log)

      const all = extractor.getAllRules()
      expect(all.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ====== submitForReview ======

  describe('submitForReview', () => {
    it('should set status to pending_review', () => {
      const rule: ExperienceRuleLocal = {
        ruleId: 'r-1',
        triggerCondition: 'When X happens',
        action: 'Do Y',
        note: '',
        sourceTaskId: 't-1',
        sourceTaskType: 'software-dev',
        ruleType: 'heuristic',
        status: 'rejected',
        keywords: ['test'],
        createdAt: '2024-01-01T00:00:00Z',
      }

      const result = extractor.submitForReview(rule)
      expect(result.status).toBe('pending_review')
    })

    it('should store the rule internally', () => {
      const rule: ExperienceRuleLocal = {
        ruleId: 'r-submit',
        triggerCondition: 'test',
        action: 'test',
        note: '',
        sourceTaskId: 't-1',
        sourceTaskType: 'software-dev',
        ruleType: 'heuristic',
        status: 'pending_review',
        keywords: [],
        createdAt: '2024-01-01T00:00:00Z',
      }

      extractor.submitForReview(rule)
      const pending = extractor.getPendingRules()
      expect(pending.some(r => r.ruleId === 'r-submit')).toBe(true)
    })
  })

  // ====== approveRule ======

  describe('approveRule', () => {
    let ruleId: string

    beforeEach(() => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)
      ruleId = rules[0].ruleId
    })

    it('should approve a pending rule', () => {
      const result = extractor.approveRule(ruleId)
      expect(result).not.toBeNull()
      expect(result!.status).toBe('approved')
    })

    it('should append approval comment to note', () => {
      const result = extractor.approveRule(ruleId, 'Looks good')
      expect(result!.note).toContain('Approved: Looks good')
    })

    it('should approve without comment', () => {
      const result = extractor.approveRule(ruleId)
      expect(result!.status).toBe('approved')
    })

    it('should return null for non-existent rule', () => {
      const result = extractor.approveRule('nonexistent')
      expect(result).toBeNull()
    })
  })

  // ====== rejectRule ======

  describe('rejectRule', () => {
    let ruleId: string

    beforeEach(() => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)
      ruleId = rules[0].ruleId
    })

    it('should reject a pending rule', () => {
      const result = extractor.rejectRule(ruleId, 'Not applicable')
      expect(result).not.toBeNull()
      expect(result!.status).toBe('rejected')
    })

    it('should append rejection reason to note', () => {
      const result = extractor.rejectRule(ruleId, 'Too specific')
      expect(result!.note).toContain('Rejected: Too specific')
    })

    it('should return null for non-existent rule', () => {
      const result = extractor.rejectRule('nonexistent', 'reason')
      expect(result).toBeNull()
    })
  })

  // ====== modifyRule ======

  describe('modifyRule', () => {
    let ruleId: string

    beforeEach(() => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)
      ruleId = rules[0].ruleId
    })

    it('should update triggerCondition', () => {
      const result = extractor.modifyRule(ruleId, { triggerCondition: 'New condition' })
      expect(result).not.toBeNull()
      expect(result!.triggerCondition).toBe('New condition')
    })

    it('should update action', () => {
      const result = extractor.modifyRule(ruleId, { action: 'New action' })
      expect(result!.action).toBe('New action')
    })

    it('should update note', () => {
      const result = extractor.modifyRule(ruleId, { note: 'Updated note' })
      expect(result!.note).toBe('Updated note')
    })

    it('should update keywords', () => {
      const result = extractor.modifyRule(ruleId, { keywords: ['new', 'keywords'] })
      expect(result!.keywords).toEqual(['new', 'keywords'])
    })

    it('should do nothing with empty updates', () => {
      const before = extractor.getAllRules().find(r => r.ruleId === ruleId)!
      const result = extractor.modifyRule(ruleId, {})
      expect(result!.triggerCondition).toBe(before.triggerCondition)
      expect(result!.action).toBe(before.action)
    })

    it('should return null for non-existent rule', () => {
      const result = extractor.modifyRule('nonexistent', { note: 'x' })
      expect(result).toBeNull()
    })
  })

  // ====== retrieveRelevantRules ======

  describe('retrieveRelevantRules', () => {
    beforeEach(() => {
      // Create and approve some rules
      const log1 = makeSuccessLog({ taskId: 't1', taskType: 'software-dev', taskDescription: 'Build REST API endpoint' })
      const log2 = makeSuccessLog({ taskId: 't2', taskType: 'data-analysis', taskDescription: 'Analyze sales data metrics' })
      const rules1 = extractor.extractFromSuccess(log1)
      const rules2 = extractor.extractFromSuccess(log2)

      // Approve all rules
      for (const r of [...rules1, ...rules2]) {
        extractor.approveRule(r.ruleId)
      }
    })

    it('should retrieve rules matching task type', () => {
      const results = extractor.retrieveRelevantRules('software-dev', ['nonexistent-keyword'])
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.sourceTaskType === 'software-dev' || r.keywords.some(k => ['nonexistent-keyword'].includes(k)))).toBe(true)
    })

    it('should retrieve rules matching keywords', () => {
      const results = extractor.retrieveRelevantRules('unknown-type', ['rest', 'api'])
      expect(results.length).toBeGreaterThan(0)
    })

    it('should not return unapproved rules', () => {
      // Add a pending rule
      const log = makeSuccessLog({ taskId: 't-pending', taskType: 'software-dev', taskDescription: 'pending rule test' })
      extractor.extractFromSuccess(log)
      // leave it pending

      const before = extractor.getAllRules().filter(r => r.status === 'approved').length
      const results = extractor.retrieveRelevantRules('software-dev', ['pending'])
      expect(results.length).toBeLessThanOrEqual(before)
    })

    it('should return empty when no matches', () => {
      const results = extractor.retrieveRelevantRules('unknown-type', ['xyznokeyword'])
      expect(results).toEqual([])
    })

    it('should return copies not references', () => {
      const results1 = extractor.retrieveRelevantRules('software-dev', [])
      const results2 = extractor.retrieveRelevantRules('software-dev', [])

      if (results1.length > 0) {
        expect(results1[0]).toEqual(results2[0])
        expect(results1[0]).not.toBe(results2[0])
      }
    })
  })

  // ====== buildExperienceContext ======

  describe('buildExperienceContext', () => {
    it('should format rules as prompt text', () => {
      const rules: ExperienceRuleLocal[] = [
        {
          ruleId: 'r-1',
          triggerCondition: 'When building API',
          action: 'Use REST conventions',
          note: 'Important pattern',
          sourceTaskId: 't-1',
          sourceTaskType: 'software-dev',
          ruleType: 'success_pattern',
          status: 'approved',
          keywords: ['api', 'rest'],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]

      const context = extractor.buildExperienceContext(rules)

      expect(context).toContain('# Relevant Experience Rules')
      expect(context).toContain('## Rule 1 [success_pattern]')
      expect(context).toContain('**Trigger:** When building API')
      expect(context).toContain('**Action:** Use REST conventions')
      expect(context).toContain('**Note:** Important pattern')
      expect(context).toContain('**Keywords:** api, rest')
    })

    it('should handle multiple rules', () => {
      const rules: ExperienceRuleLocal[] = [
        {
          ruleId: 'r-1', triggerCondition: 'A', action: 'B', note: '', sourceTaskId: '', sourceTaskType: '', ruleType: 'heuristic', status: 'approved', keywords: [], createdAt: '',
        },
        {
          ruleId: 'r-2', triggerCondition: 'C', action: 'D', note: '', sourceTaskId: '', sourceTaskType: '', ruleType: 'failure_recovery', status: 'approved', keywords: [], createdAt: '',
        },
      ]

      const context = extractor.buildExperienceContext(rules)
      expect(context).toContain('## Rule 1 [heuristic]')
      expect(context).toContain('## Rule 2 [failure_recovery]')
    })

    it('should return empty string for no rules', () => {
      expect(extractor.buildExperienceContext([])).toBe('')
    })

    it('should skip note line when note is empty', () => {
      const rules: ExperienceRuleLocal[] = [{
        ruleId: 'r-1', triggerCondition: 'A', action: 'B', note: '', sourceTaskId: '', sourceTaskType: '', ruleType: 'heuristic', status: 'approved', keywords: [], createdAt: '',
      }]

      const context = extractor.buildExperienceContext(rules)
      expect(context).not.toContain('**Note:**')
    })
  })

  // ====== getPendingRules ======

  describe('getPendingRules', () => {
    it('should return only pending rules', () => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)
      extractor.approveRule(rules[0].ruleId)

      const pending = extractor.getPendingRules()
      expect(pending.every(r => r.status === 'pending_review')).toBe(true)
      expect(pending.length).toBe(rules.length - 1)
    })

    it('should return empty when no rules exist', () => {
      expect(extractor.getPendingRules()).toEqual([])
    })
  })

  // ====== getAllRules ======

  describe('getAllRules', () => {
    it('should return all rules when no status filter', () => {
      const log = makeSuccessLog()
      extractor.extractFromSuccess(log)

      const all = extractor.getAllRules()
      expect(all.length).toBeGreaterThan(0)
    })

    it('should filter by status', () => {
      const log = makeSuccessLog()
      const rules = extractor.extractFromSuccess(log)
      extractor.approveRule(rules[0].ruleId)

      const approved = extractor.getAllRules('approved')
      const pending = extractor.getAllRules('pending_review')

      expect(approved).toHaveLength(1)
      expect(pending).toHaveLength(rules.length - 1)
    })

    it('should return empty when no rules match status', () => {
      const log = makeSuccessLog()
      extractor.extractFromSuccess(log)

      const rejected = extractor.getAllRules('rejected')
      expect(rejected).toEqual([])
    })

    it('should return copies not references', () => {
      const log = makeSuccessLog()
      extractor.extractFromSuccess(log)

      const all1 = extractor.getAllRules()
      const all2 = extractor.getAllRules()

      expect(all1).toEqual(all2)
      if (all1.length > 0) {
        expect(all1[0]).not.toBe(all2[0])
      }
    })
  })

  // ====== inferTaskType ======

  describe('inferTaskType', () => {
    it('should infer software-dev for coding tasks', () => {
      expect(extractor.inferTaskType('Implement a REST API with authentication')).toBe('software-dev')
      expect(extractor.inferTaskType('Fix the bug in the database query')).toBe('software-dev')
      expect(extractor.inferTaskType('Refactor the TypeScript class')).toBe('software-dev')
    })

    it('should infer data-analysis for data tasks', () => {
      expect(extractor.inferTaskType('Analyze the dataset and create a dashboard')).toBe('data-analysis')
      expect(extractor.inferTaskType('Build statistics visualization chart')).toBe('data-analysis')
    })

    it('should infer content-writing for writing tasks', () => {
      expect(extractor.inferTaskType('Write an article about AI trends')).toBe('content-writing')
      expect(extractor.inferTaskType('Draft a blog post and edit the content')).toBe('content-writing')
    })

    it('should infer ppt-design for presentation tasks', () => {
      expect(extractor.inferTaskType('Create a slide deck for the pitch presentation')).toBe('ppt-design')
      expect(extractor.inferTaskType('Design the PPT slides')).toBe('ppt-design')
    })

    it('should infer video-production for video tasks', () => {
      expect(extractor.inferTaskType('Create a video animation with motion graphics')).toBe('video-production')
      expect(extractor.inferTaskType('Render the scene timeline frames')).toBe('video-production')
    })

    it('should return general for unmatched descriptions', () => {
      expect(extractor.inferTaskType('Do something')).toBe('general')
      expect(extractor.inferTaskType('xyz abc def')).toBe('general')
    })

    it('should be case-insensitive', () => {
      expect(extractor.inferTaskType('IMPLEMENT A REST API')).toBe('software-dev')
      expect(extractor.inferTaskType('ANALYZE THE DATASET')).toBe('data-analysis')
    })

    it('should pick the type with most keyword matches', () => {
      // This has 3 software-dev keywords and 2 data-analysis keywords
      expect(extractor.inferTaskType('develop api function with data metrics')).toBe('software-dev')
    })
  })

  // ====== singleton ======

  describe('singleton', () => {
    it('should export a singleton instance', async () => {
      const { experienceExtractorLocal } = await import('../experienceExtractorLocal')
      expect(experienceExtractorLocal).toBeInstanceOf(ExperienceExtractorLocal)
    })
  })
})
