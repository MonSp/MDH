/**
 * A2A 执行节点 API 客户端
 *
 * 封装 /api/a2a/* 端点，供前端管理面板调用。
 */

import { apiFetch } from '../services/apiFetch'

/* ------------------------------------------------------------------ */
/*  类型定义                                                          */
/* ------------------------------------------------------------------ */

export interface AgentSkill {
  id: string
  name: string
  description: string
  tags?: string[]
  examples?: string[]
}

export interface A2AAgent {
  agent_id: string
  name: string
  description: string
  url: string
  skills: AgentSkill[]
  status: 'active' | 'unhealthy' | 'offline'
  task_count: number
  success_rate: number
}

export interface RegisterAgentPayload {
  agent_id: string
  card: {
    name: string
    description?: string
    url: string
    skills?: AgentSkill[]
    capabilities?: Record<string, unknown>
    version?: string
  }
}

/* ------------------------------------------------------------------ */
/*  API 方法                                                          */
/* ------------------------------------------------------------------ */

/**
 * 获取所有已注册的 A2A 执行节点
 */
export async function fetchA2AAgents(): Promise<A2AAgent[]> {
  return apiFetch<A2AAgent[]>('/api/a2a/agents')
}

/**
 * 注册新的 A2A 执行节点
 */
export async function registerA2AAgent(
  payload: RegisterAgentPayload,
): Promise<{ agent_id: string; status: string }> {
  return apiFetch<{ agent_id: string; status: string }>('/api/a2a/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/**
 * 注销 A2A 执行节点
 */
export async function unregisterA2AAgent(agentId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/a2a/unregister/${encodeURIComponent(agentId)}`, {
    method: 'POST',
  })
}
