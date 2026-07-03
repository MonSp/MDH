import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listSkills, registerSkill, cloneSkill, getSkillVersions, getSkill } from '../skillRegistry'

vi.mock('../apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { apiClient } from '../apiClient'

describe('skillRegistry', () => {
  const mockGet = vi.mocked(apiClient.get)
  const mockPost = vi.mocked(apiClient.post)

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('listSkills', () => {
    it('should GET /skills', async () => {
      const data = [{ skill_id: 's1', name: 'test' }]
      mockGet.mockResolvedValue({ success: true, data, error: null })

      const result = await listSkills()

      expect(mockGet).toHaveBeenCalledWith('/skills')
      expect(result.data).toEqual(data)
    })
  })

  describe('registerSkill', () => {
    it('should POST /skills with skill_dir', async () => {
      const data = { skill_id: 's1', name: 'new-skill' }
      mockPost.mockResolvedValue({ success: true, data, error: null })

      const result = await registerSkill('/path/to/skill')

      expect(mockPost).toHaveBeenCalledWith('/skills', { skill_dir: '/path/to/skill' })
      expect(result.data).toEqual(data)
    })
  })

  describe('cloneSkill', () => {
    it('should POST /skills/:id/clone with target_dir', async () => {
      mockPost.mockResolvedValue({ success: true, data: { cloned_path: '/target' }, error: null })

      const result = await cloneSkill('s1', '/target')

      expect(mockPost).toHaveBeenCalledWith('/skills/s1/clone', { target_dir: '/target' })
      expect(result.data!.cloned_path).toBe('/target')
    })
  })

  describe('getSkillVersions', () => {
    it('should GET /skills/:id/versions', async () => {
      const data = [{ version: '1.0.0', created_at: '2024-01-01', changelog: 'init' }]
      mockGet.mockResolvedValue({ success: true, data, error: null })

      const result = await getSkillVersions('s1')

      expect(mockGet).toHaveBeenCalledWith('/skills/s1/versions')
      expect(result.data).toEqual(data)
    })
  })

  describe('getSkill', () => {
    it('should GET /skills/:id', async () => {
      const data = { skill_id: 's1', name: 'test' }
      mockGet.mockResolvedValue({ success: true, data, error: null })

      const result = await getSkill('s1')

      expect(mockGet).toHaveBeenCalledWith('/skills/s1')
      expect(result.data).toEqual(data)
    })
  })
})
