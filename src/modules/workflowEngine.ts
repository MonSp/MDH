import { WorkflowDefinition, WorkflowExecution, WorkflowVisualization } from './agentTypes'

const API_BASE = '/api/workflow'

export interface WorkflowEngineAPI {
  createWorkflow: (definition: WorkflowDefinition) => Promise<WorkflowExecution>
  executeWorkflow: (executionId: string) => Promise<void>
  pauseWorkflow: (executionId: string) => Promise<void>
  resumeWorkflow: (executionId: string) => Promise<void>
  cancelWorkflow: (executionId: string) => Promise<void>
  retryNode: (executionId: string, nodeId: string) => Promise<void>
  getWorkflowStatus: (executionId: string) => Promise<WorkflowExecution>
  getWorkflowVisualization: (executionId: string) => Promise<WorkflowVisualization>
}

export const workflowEngineAPI: WorkflowEngineAPI = {
  createWorkflow: async (definition: WorkflowDefinition) => {
    const response = await fetch(`${API_BASE}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(definition),
    })
    if (!response.ok) {
      throw new Error(`Failed to create workflow: ${response.statusText}`)
    }
    return response.json()
  },

  executeWorkflow: async (executionId: string) => {
    const response = await fetch(`${API_BASE}/execute/${executionId}`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Failed to execute workflow: ${response.statusText}`)
    }
  },

  pauseWorkflow: async (executionId: string) => {
    const response = await fetch(`${API_BASE}/pause/${executionId}`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Failed to pause workflow: ${response.statusText}`)
    }
  },

  resumeWorkflow: async (executionId: string) => {
    const response = await fetch(`${API_BASE}/resume/${executionId}`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Failed to resume workflow: ${response.statusText}`)
    }
  },

  cancelWorkflow: async (executionId: string) => {
    const response = await fetch(`${API_BASE}/cancel/${executionId}`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Failed to cancel workflow: ${response.statusText}`)
    }
  },

  retryNode: async (executionId: string, nodeId: string) => {
    const response = await fetch(`${API_BASE}/retry/${executionId}/${nodeId}`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Failed to retry node: ${response.statusText}`)
    }
  },

  getWorkflowStatus: async (executionId: string) => {
    const response = await fetch(`${API_BASE}/status/${executionId}`)
    if (!response.ok) {
      throw new Error(`Failed to get workflow status: ${response.statusText}`)
    }
    return response.json()
  },

  getWorkflowVisualization: async (executionId: string) => {
    const response = await fetch(`${API_BASE}/visualization/${executionId}`)
    if (!response.ok) {
      throw new Error(`Failed to get workflow visualization: ${response.statusText}`)
    }
    return response.json()
  },
}