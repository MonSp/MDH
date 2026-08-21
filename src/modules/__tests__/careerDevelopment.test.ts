import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getAgentProfile,
  getSkillTree,
  grantXP,
  checkPromotion,
} from '../careerDevelopment'

describe('careerDevelopment', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    global.fetch = fetchSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('module exports', () => {
    it('should export getAgentProfile function', () => {
      expect(typeof getAgentProfile).toBe('function')
    })

    it('should export getSkillTree function', () => {
      expect(typeof getSkillTree).toBe('function')
    })

    it('should export grantXP function', () => {
      expect(typeof grantXP).toBe('function')
    })

    it('should export checkPromotion function', () => {
      expect(typeof checkPromotion).toBe('function')
    })
  })

  describe('getAgentProfile', () => {
    const mockProfile = {
      agent_id: 'agent-1',
      name: 'Test Agent',
      created_at: 1700000000,
      career_stage: 'junior',
      total_xp: 1200,
      skill_progress: {},
    }

    it('should fetch agent profile successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockProfile }),
      })

      const result = await getAgentProfile('agent-1')

      expect(fetchSpy).toHaveBeenCalledWith('/api/agents/agent-1/profile', undefined)
      expect(result).toEqual(mockProfile)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      })

      await expect(getAgentProfile('bad-id')).rejects.toThrow('Not found')
    })
  })

  describe('getSkillTree', () => {
    const mockTree = {
      coding: {
        description: 'Software engineering skills',
        category: 'engineering',
        prerequisites: [],
        xp_thresholds: [100, 500, 2000] as [number, number, number],
      },
    }

    it('should fetch skill tree successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockTree }),
      })

      const result = await getSkillTree()

      expect(fetchSpy).toHaveBeenCalledWith('/api/skills/tree', undefined)
      expect(result).toEqual(mockTree)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Server error' }),
      })

      await expect(getSkillTree()).rejects.toThrow('Server error')
    })
  })

  describe('grantXP', () => {
    const xpParams = {
      skill_id: 'coding',
      task_success: true,
      review_score: 8,
      task_complexity: 3,
    }

    const mockResult = {
      xp_gained: 45,
      new_level: 2,
      leveled_up: true,
      skill_id: 'coding',
    }

    it('should grant XP successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockResult }),
      })

      const result = await grantXP('agent-1', xpParams)

      expect(fetchSpy).toHaveBeenCalledWith('/api/agents/agent-1/grant-xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(xpParams),
      })
      expect(result).toEqual(mockResult)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Invalid params' }),
      })

      await expect(grantXP('agent-1', xpParams)).rejects.toThrow('Invalid params')
    })
  })

  describe('checkPromotion', () => {
    const mockStatus = {
      can_promote_to: 'mid',
      current_stage: 'junior',
    }

    it('should check promotion status successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockStatus }),
      })

      const result = await checkPromotion('agent-1')

      expect(fetchSpy).toHaveBeenCalledWith('/api/agents/agent-1/promotion', undefined)
      expect(result).toEqual(mockStatus)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Unauthorized' }),
      })

      await expect(checkPromotion('agent-1')).rejects.toThrow('Unauthorized')
    })
  })
})
