import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getRouteTable, addRouteEntry, removeRouteEntry } from '../dynamicRouter'

describe('dynamicRouter', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    global.fetch = fetchSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockRoute = {
    dept_id: 'dept-1',
    dept_name: 'Engineering',
    capability_desc: 'Handles engineering tasks',
    capability_keywords: ['code', 'build'],
    tools: ['git', 'docker'],
    success_rate: 0.95,
    total_tasks: 100,
    successful_tasks: 95,
    last_active: '2024-01-01T00:00:00Z',
    priority: 1,
  }

  describe('getRouteTable', () => {
    it('should fetch route table successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: [mockRoute] }),
      })

      const result = await getRouteTable()

      expect(fetchSpy).toHaveBeenCalledWith('/api/router/table', undefined)
      expect(result).toEqual([mockRoute])
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'DB error' }),
      })

      await expect(getRouteTable()).rejects.toThrow('DB error')
    })
  })

  describe('addRouteEntry', () => {
    it('should add route entry successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockRoute }),
      })

      const result = await addRouteEntry({
        dept_id: 'dept-1',
        dept_name: 'Engineering',
        capability_desc: 'Handles engineering tasks',
      })

      expect(fetchSpy).toHaveBeenCalledWith('/api/router/table', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
      expect(result).toEqual(mockRoute)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Validation failed' }),
      })

      await expect(addRouteEntry({ dept_id: 'dept-1', dept_name: 'Test' })).rejects.toThrow('Validation failed')
    })
  })

  describe('removeRouteEntry', () => {
    it('should remove route entry successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: true }),
      })

      const result = await removeRouteEntry('dept-1')

      expect(fetchSpy).toHaveBeenCalledWith('/api/router/table/dept-1', { method: 'DELETE' })
      expect(result).toBe(true)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      })

      await expect(removeRouteEntry('dept-99')).rejects.toThrow('Not found')
    })
  })
})
