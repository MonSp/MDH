import { WorkflowDefinition, WorkflowExecution, WorkflowVisualization } from './agentTypes'
import { apiClient, ApiResponse } from './apiClient'

/**
 * 工作流引擎 REST API 接口（预留）
 *
 * 当前后端 (server.py) 无对应的 /api/workflow/* 端点。
 * 工作流的创建和执行完全通过 WebSocket 的 meeting_message 流程驱动。
 * 此模块保留为未来独立管理工作流的预留接口，当前不应在生产代码中调用。
 */

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