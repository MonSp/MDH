import { WorkflowDefinition, WorkflowExecution, WorkflowVisualization } from './agentTypes'
import { apiClient, ApiResponse } from './apiClient'

export interface WorkflowEngineAPI {
  createWorkflow: (definition: WorkflowDefinition) => Promise<ApiResponse<WorkflowExecution>>
  executeWorkflow: (executionId: string) => Promise<ApiResponse<void>>
  pauseWorkflow: (executionId: string) => Promise<ApiResponse<void>>
  resumeWorkflow: (executionId: string) => Promise<ApiResponse<void>>
  cancelWorkflow: (executionId: string) => Promise<ApiResponse<void>>
  retryNode: (executionId: string, nodeId: string) => Promise<ApiResponse<void>>
  getWorkflowStatus: (executionId: string) => Promise<ApiResponse<WorkflowExecution>>
  getWorkflowVisualization: (executionId: string) => Promise<ApiResponse<WorkflowVisualization>>
}

export const workflowEngineAPI: WorkflowEngineAPI = {
  createWorkflow: (definition: WorkflowDefinition) => {
    return apiClient.post<WorkflowExecution>('/workflow/create', definition)
  },

  executeWorkflow: (executionId: string) => {
    return apiClient.post<void>(`/workflow/execute/${executionId}`)
  },

  pauseWorkflow: (executionId: string) => {
    return apiClient.post<void>(`/workflow/pause/${executionId}`)
  },

  resumeWorkflow: (executionId: string) => {
    return apiClient.post<void>(`/workflow/resume/${executionId}`)
  },

  cancelWorkflow: (executionId: string) => {
    return apiClient.post<void>(`/workflow/cancel/${executionId}`)
  },

  retryNode: (executionId: string, nodeId: string) => {
    return apiClient.post<void>(`/workflow/retry/${executionId}/${nodeId}`)
  },

  getWorkflowStatus: (executionId: string) => {
    return apiClient.get<WorkflowExecution>(`/workflow/status/${executionId}`)
  },

  getWorkflowVisualization: (executionId: string) => {
    return apiClient.get<WorkflowVisualization>(`/workflow/visualization/${executionId}`)
  },
}