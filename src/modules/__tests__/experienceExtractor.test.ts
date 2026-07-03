import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAllRules, getPendingRules, approveRule, rejectRule, modifyRule } from '../experienceExtractor'

describe('experienceExtractor', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    global.fetch = fetchSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockRule = {
    rule_id: 'rule-1',
    trigger_condition: 'When task involves API design',
    action: 'Follow REST conventions',
    note: 'Always use proper HTTP methods',
    source_task_id: 'task-1',
    source_task_type: 'code_review',
    rule_type: 'success_pattern' as const,
    status: 'pending_review' as const,
    keywords: ['api', 'rest'],
    created_at: '2024-01-01T00:00:00Z',
  }

  describe('getAllRules', () => {
    it('should fetch all rules successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: [mockRule] }),
      })

      const result = await getAllRules()

      expect(fetchSpy).toHaveBeenCalledWith('/api/experience/rules')
      expect(result).toEqual([mockRule])
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Server error' }),
      })

      await expect(getAllRules()).rejects.toThrow('Server error')
    })
  })

  describe('getPendingRules', () => {
    it('should fetch pending rules successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: [mockRule] }),
      })

      const result = await getPendingRules()

      expect(fetchSpy).toHaveBeenCalledWith('/api/experience/rules/pending')
      expect(result).toEqual([mockRule])
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Unauthorized' }),
      })

      await expect(getPendingRules()).rejects.toThrow('Unauthorized')
    })
  })

  describe('approveRule', () => {
    it('should approve rule successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: true }),
      })

      const result = await approveRule('rule-1', 'Looks good')

      expect(fetchSpy).toHaveBeenCalledWith('/api/experience/rules/rule-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'Looks good' }),
      })
      expect(result).toBe(true)
    })

    it('should approve rule without comment', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: true }),
      })

      await approveRule('rule-1')

      expect(fetchSpy).toHaveBeenCalledWith('/api/experience/rules/rule-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: undefined }),
      })
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      })

      await expect(approveRule('bad-id')).rejects.toThrow('Not found')
    })
  })

  describe('rejectRule', () => {
    it('should reject rule successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: true }),
      })

      const result = await rejectRule('rule-1', 'Not applicable')

      expect(fetchSpy).toHaveBeenCalledWith('/api/experience/rules/rule-1/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Not applicable' }),
      })
      expect(result).toBe(true)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      })

      await expect(rejectRule('bad-id', 'reason')).rejects.toThrow('Not found')
    })
  })

  describe('modifyRule', () => {
    it('should modify rule successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: true }),
      })

      const result = await modifyRule('rule-1', { note: 'Updated note' })

      expect(fetchSpy).toHaveBeenCalledWith('/api/experience/rules/rule-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Updated note' }),
      })
      expect(result).toBe(true)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Forbidden' }),
      })

      await expect(modifyRule('rule-1', {})).rejects.toThrow('Forbidden')
    })
  })
})
