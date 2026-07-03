import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listProjects, createProject, getProject, getProjectStatus, instantiateProject, archiveProject } from '../projectManager'

describe('projectManager', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    global.fetch = fetchSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockProject = {
    project_id: 'proj-1',
    name: 'Test Project',
    status: 'created',
    brief: { description: 'A test project' },
    created_at: '2024-01-01T00:00:00Z',
    skill_packages: [],
    employees: [],
  }

  const mockStatus = {
    project_id: 'proj-1',
    name: 'Test Project',
    status: 'running',
    employee_count: 3,
    task_stats: { total: 10, completed: 5, failed: 1 },
    iteration_stats: { total_iterations: 15, avg_iterations_per_task: 1.5 },
    skill_increment_stats: { total_rules: 20, approved_rules: 15 },
  }

  describe('listProjects', () => {
    it('should fetch project list successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: [mockProject] }),
      })

      const result = await listProjects()

      expect(fetchSpy).toHaveBeenCalledWith('/api/projects')
      expect(result).toEqual([mockProject])
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Server error' }),
      })

      await expect(listProjects()).rejects.toThrow('Server error')
    })
  })

  describe('createProject', () => {
    it('should create project successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockProject }),
      })

      const result = await createProject('Test Project', { description: 'A test project' })

      expect(fetchSpy).toHaveBeenCalledWith('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Project', brief: { description: 'A test project' } }),
      })
      expect(result).toEqual(mockProject)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Validation failed' }),
      })

      await expect(createProject('Test', {})).rejects.toThrow('Validation failed')
    })
  })

  describe('getProject', () => {
    it('should fetch project details successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockProject }),
      })

      const result = await getProject('proj-1')

      expect(fetchSpy).toHaveBeenCalledWith('/api/projects/proj-1')
      expect(result).toEqual(mockProject)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      })

      await expect(getProject('bad-id')).rejects.toThrow('Not found')
    })
  })

  describe('getProjectStatus', () => {
    it('should fetch project status successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockStatus }),
      })

      const result = await getProjectStatus('proj-1')

      expect(fetchSpy).toHaveBeenCalledWith('/api/projects/proj-1/status')
      expect(result).toEqual(mockStatus)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      })

      await expect(getProjectStatus('bad-id')).rejects.toThrow('Not found')
    })
  })

  describe('instantiateProject', () => {
    it('should instantiate project successfully', async () => {
      const mockResult = { started_employees: 3 }
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockResult }),
      })

      const dag = { nodes: [{ id: 'n1', task: 'setup' }] }
      const result = await instantiateProject('proj-1', dag)

      expect(fetchSpy).toHaveBeenCalledWith('/api/projects/proj-1/instantiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dag }),
      })
      expect(result).toEqual(mockResult)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Invalid DAG' }),
      })

      await expect(instantiateProject('proj-1', {})).rejects.toThrow('Invalid DAG')
    })
  })

  describe('archiveProject', () => {
    it('should archive project successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: { archived: true } }),
      })

      const result = await archiveProject('proj-1')

      expect(fetchSpy).toHaveBeenCalledWith('/api/projects/proj-1/archive', { method: 'POST' })
      expect(result).toEqual({ archived: true })
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Cannot archive running project' }),
      })

      await expect(archiveProject('proj-1')).rejects.toThrow('Cannot archive running project')
    })
  })
})
