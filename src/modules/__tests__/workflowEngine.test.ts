import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { workflowEngineAPI } from '../workflowEngine'
import { WorkflowExecutionStatus } from '../agentTypes'

describe('workflowEngineAPI', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    global.fetch = fetchSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockDefinition = {
    workflow_id: 'wf-1',
    name: 'Test Workflow',
    description: 'A test workflow',
    nodes: [
      {
        node_id: 'n1',
        task_description: 'First task',
        dept_id: 'dept-1',
        input_spec: {},
        output_spec: {},
        status: 'pending' as const,
        result: null,
      },
    ],
    edges: [],
    execution_strategy: 'sequential' as const,
  }

  const mockExecution = {
    execution_id: 'exec-1',
    workflow_id: 'wf-1',
    status: WorkflowExecutionStatus.Created,
    started_at: '2024-01-01T00:00:00Z',
    completed_at: null,
    node_states: { n1: 'pending' },
    results: {},
  }

  const mockVisualization = {
    execution: mockExecution,
    definition: mockDefinition,
  }

  function mockApiResponse(data: any) {
    return {
      ok: true,
      json: () => Promise.resolve({ success: true, data }),
    }
  }

  describe('createWorkflow', () => {
    it('should create workflow via POST', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(mockExecution))

      const result = await workflowEngineAPI.createWorkflow(mockDefinition)

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/workflow/create'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockExecution)
    })
  })

  describe('executeWorkflow', () => {
    it('should execute workflow via POST', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(null))

      const result = await workflowEngineAPI.executeWorkflow('exec-1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflow/execute/exec-1'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('pauseWorkflow', () => {
    it('should pause workflow via POST', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(null))

      const result = await workflowEngineAPI.pauseWorkflow('exec-1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflow/pause/exec-1'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('resumeWorkflow', () => {
    it('should resume workflow via POST', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(null))

      const result = await workflowEngineAPI.resumeWorkflow('exec-1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflow/resume/exec-1'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('cancelWorkflow', () => {
    it('should cancel workflow via POST', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(null))

      const result = await workflowEngineAPI.cancelWorkflow('exec-1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflow/cancel/exec-1'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('retryNode', () => {
    it('should retry node via POST', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(null))

      const result = await workflowEngineAPI.retryNode('exec-1', 'n1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflow/retry/exec-1/n1'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.success).toBe(true)
    })
  })

  describe('getWorkflowStatus', () => {
    it('should get workflow status via GET', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(mockExecution))

      const result = await workflowEngineAPI.getWorkflowStatus('exec-1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflow/status/exec-1'),
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockExecution)
    })
  })

  describe('getWorkflowVisualization', () => {
    it('should get workflow visualization via GET', async () => {
      fetchSpy.mockResolvedValue(mockApiResponse(mockVisualization))

      const result = await workflowEngineAPI.getWorkflowVisualization('exec-1')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/workflow/visualization/exec-1'),
        expect.objectContaining({ method: 'GET' }),
      )
      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockVisualization)
    })
  })

  describe('error handling', () => {
    it('should handle fetch failure', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'))

      const result = await workflowEngineAPI.getWorkflowStatus('exec-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })

    it('should handle HTTP error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })

      const result = await workflowEngineAPI.createWorkflow(mockDefinition)

      expect(result.success).toBe(false)
      expect(result.error).toContain('500')
    })
  })
})
