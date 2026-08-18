/**
 * 本地工作流引擎
 *
 * 完全在前端执行的工作流引擎，支持拓扑排序、顺序/并行执行策略、
 * 失败时跳过传播。
 */

import {
  type WorkflowDefinition,
  type WorkflowExecution,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowVisualization,
  WorkflowNodeStatus,
  WorkflowExecutionStatus,
} from './agentTypes'

/** 节点执行器：接收节点定义，返回执行结果 */
export type NodeExecutor = (node: WorkflowNode) => Promise<Record<string, any>>

interface StoredWorkflow {
  definition: WorkflowDefinition
  execution: WorkflowExecution
}

export class WorkflowEngineLocal {
  private nodeExecutors: Map<string, NodeExecutor> = new Map()
  private workflows: Map<string, StoredWorkflow> = new Map()
  private cancelFlags: Map<string, boolean> = new Map()

  /**
   * 注册某部门的节点执行器。
   */
  registerNodeExecutor(deptId: string, executor: NodeExecutor): void {
    this.nodeExecutors.set(deptId, executor)
  }

  /**
   * 创建工作流定义并初始化执行实例。
   * 返回 execution_id。
   */
  createWorkflow(definition: WorkflowDefinition): string {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const nodeStates: Record<string, WorkflowNodeStatus> = {}
    for (const node of definition.nodes) {
      nodeStates[node.node_id] = WorkflowNodeStatus.Pending
    }

    const execution: WorkflowExecution = {
      execution_id: executionId,
      workflow_id: definition.workflow_id,
      status: WorkflowExecutionStatus.Created,
      started_at: new Date().toISOString(),
      completed_at: null,
      node_states: nodeStates,
      results: {},
    }

    this.workflows.set(executionId, { definition, execution })
    return executionId
  }

  /**
   * 执行工作流。
   * 支持 sequential、parallel、mixed 策略。
   * 失败时进行 skip 传播（跳过依赖该节点的下游节点）。
   */
  async executeWorkflow(executionId: string): Promise<WorkflowExecution> {
    const stored = this.workflows.get(executionId)
    if (!stored) {
      throw new Error(`Workflow execution not found: ${executionId}`)
    }

    const { definition, execution } = stored
    execution.status = WorkflowExecutionStatus.Running
    execution.started_at = new Date().toISOString()

    const strategy = definition.execution_strategy

    if (strategy === 'parallel') {
      await this.executeParallel(definition, execution)
    } else {
      // sequential 和 mixed 都按拓扑序顺序执行
      await this.executeSequential(definition, execution)
    }

    // 判定最终状态
    const hasFailure = Object.values(execution.node_states).some(
      s => s === WorkflowNodeStatus.Failed
    )
    execution.status = hasFailure
      ? WorkflowExecutionStatus.Failed
      : WorkflowExecutionStatus.Completed
    execution.completed_at = new Date().toISOString()

    return execution
  }

  /**
   * 取消工作流执行。
   */
  cancelWorkflow(executionId: string): WorkflowExecution {
    const stored = this.workflows.get(executionId)
    if (!stored) {
      throw new Error(`Workflow execution not found: ${executionId}`)
    }

    this.cancelFlags.set(executionId, true)

    const { execution } = stored
    // 将所有 pending/running 节点标记为 skipped
    for (const [nodeId, status] of Object.entries(execution.node_states)) {
      if (status === WorkflowNodeStatus.Pending || status === WorkflowNodeStatus.Running) {
        execution.node_states[nodeId] = WorkflowNodeStatus.Skipped
      }
    }
    execution.status = WorkflowExecutionStatus.Cancelled
    execution.completed_at = new Date().toISOString()

    return execution
  }

  /**
   * 获取工作流执行状态。
   */
  getWorkflowStatus(executionId: string): WorkflowExecution {
    const stored = this.workflows.get(executionId)
    if (!stored) {
      throw new Error(`Workflow execution not found: ${executionId}`)
    }
    return { ...stored.execution, node_states: { ...stored.execution.node_states } }
  }

  /**
   * 获取工作流可视化数据。
   */
  getWorkflowVisualization(executionId: string): WorkflowVisualization {
    const stored = this.workflows.get(executionId)
    if (!stored) {
      throw new Error(`Workflow execution not found: ${executionId}`)
    }
    return {
      execution: { ...stored.execution },
      definition: { ...stored.definition },
    }
  }

  // ====== 内部方法 ======

  /**
   * 拓扑排序：Kahn 算法。
   * 返回排序后的节点 ID 列表。
   */
  private topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()

    for (const node of nodes) {
      inDegree.set(node.node_id, 0)
      adjList.set(node.node_id, [])
    }

    for (const edge of edges) {
      adjList.get(edge.source_node_id)?.push(edge.target_node_id)
      inDegree.set(edge.target_node_id, (inDegree.get(edge.target_node_id) ?? 0) + 1)
    }

    const queue: string[] = []
    for (const [nodeId, deg] of inDegree) {
      if (deg === 0) queue.push(nodeId)
    }

    const sorted: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      sorted.push(current)
      for (const neighbor of adjList.get(current) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) {
          queue.push(neighbor)
        }
      }
    }

    return sorted
  }

  /**
   * 检测循环依赖。
   */
  private hasCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    return this.topologicalSort(nodes, edges).length < nodes.length
  }

  /**
   * 获取某节点的下游节点。
   */
  private getDownstream(nodeId: string, edges: WorkflowEdge[]): string[] {
    const downstream: string[] = []
    for (const edge of edges) {
      if (edge.source_node_id === nodeId) {
        downstream.push(edge.target_node_id)
      }
    }
    return downstream
  }

  /**
   * Skip 传播：递归跳过下游节点。
   */
  private propagateSkip(
    nodeId: string,
    edges: WorkflowEdge[],
    execution: WorkflowExecution,
  ): void {
    const downstream = this.getDownstream(nodeId, edges)
    for (const depId of downstream) {
      if (execution.node_states[depId] === WorkflowNodeStatus.Pending) {
        execution.node_states[depId] = WorkflowNodeStatus.Skipped
        this.propagateSkip(depId, edges, execution)
      }
    }
  }

  /**
   * 顺序执行：按拓扑序逐个执行节点。
   */
  private async executeSequential(
    definition: WorkflowDefinition,
    execution: WorkflowExecution,
  ): Promise<void> {
    const sorted = this.topologicalSort(definition.nodes, definition.edges)
    const nodeMap = new Map<string, WorkflowNode>()
    for (const node of definition.nodes) {
      nodeMap.set(node.node_id, node)
    }

    for (const nodeId of sorted) {
      if (this.cancelFlags.get(execution.execution_id)) return

      const node = nodeMap.get(nodeId)
      if (!node) continue

      // 检查前置节点是否全部完成
      const predecessors = definition.edges
        .filter(e => e.target_node_id === nodeId)
        .map(e => e.source_node_id)
      const allPredecessorsCompleted = predecessors.every(
        pid => execution.node_states[pid] === WorkflowNodeStatus.Completed
      )

      // 如果前置节点有失败或跳过，传播 skip
      const hasFailedPredecessor = predecessors.some(
        pid =>
          execution.node_states[pid] === WorkflowNodeStatus.Failed ||
          execution.node_states[pid] === WorkflowNodeStatus.Skipped
      )

      if (hasFailedPredecessor) {
        execution.node_states[nodeId] = WorkflowNodeStatus.Skipped
        this.propagateSkip(nodeId, definition.edges, execution)
        continue
      }

      if (!allPredecessorsCompleted && definition.execution_strategy !== 'parallel') {
        continue
      }

      // 执行节点
      execution.node_states[nodeId] = WorkflowNodeStatus.Running
      try {
        const executor = this.nodeExecutors.get(node.dept_id)
        if (!executor) {
          throw new Error(`No executor registered for dept: ${node.dept_id}`)
        }
        const result = await executor(node)
        execution.node_states[nodeId] = WorkflowNodeStatus.Completed
        execution.results[nodeId] = result
        node.status = WorkflowNodeStatus.Completed
        node.result = result
      } catch (err) {
        execution.node_states[nodeId] = WorkflowNodeStatus.Failed
        execution.results[nodeId] = { error: String(err) }
        node.status = WorkflowNodeStatus.Failed
        node.result = { error: String(err) }
        this.propagateSkip(nodeId, definition.edges, execution)
      }
    }
  }

  /**
   * 并行执行：将所有无依赖节点同时执行，然后逐层推进。
   */
  private async executeParallel(
    definition: WorkflowDefinition,
    execution: WorkflowExecution,
  ): Promise<void> {
    const nodeMap = new Map<string, WorkflowNode>()
    for (const node of definition.nodes) {
      nodeMap.set(node.node_id, node)
    }

    const remaining = new Set(definition.nodes.map(n => n.node_id))
    const completed = new Set<string>()
    const failed = new Set<string>()

    while (remaining.size > 0) {
      if (this.cancelFlags.get(execution.execution_id)) return

      // 找到所有依赖已满足的节点
      const ready: string[] = []
      for (const nodeId of remaining) {
        const predecessors = definition.edges
          .filter(e => e.target_node_id === nodeId)
          .map(e => e.source_node_id)

        const hasFailedPredecessor = predecessors.some(
          pid => failed.has(pid) || execution.node_states[pid] === WorkflowNodeStatus.Skipped
        )

        if (hasFailedPredecessor) {
          execution.node_states[nodeId] = WorkflowNodeStatus.Skipped
          this.propagateSkip(nodeId, definition.edges, execution)
          remaining.delete(nodeId)
          continue
        }

        const allDone = predecessors.every(pid => completed.has(pid))
        if (allDone) {
          ready.push(nodeId)
        }
      }

      if (ready.length === 0) break // 无更多可执行节点（可能有循环）

      // 并行执行所有 ready 节点
      const promises = ready.map(async nodeId => {
        const node = nodeMap.get(nodeId)!
        execution.node_states[nodeId] = WorkflowNodeStatus.Running

        try {
          const executor = this.nodeExecutors.get(node.dept_id)
          if (!executor) {
            throw new Error(`No executor registered for dept: ${node.dept_id}`)
          }
          const result = await executor(node)
          execution.node_states[nodeId] = WorkflowNodeStatus.Completed
          execution.results[nodeId] = result
          node.status = WorkflowNodeStatus.Completed
          node.result = result
          completed.add(nodeId)
        } catch (err) {
          execution.node_states[nodeId] = WorkflowNodeStatus.Failed
          execution.results[nodeId] = { error: String(err) }
          node.status = WorkflowNodeStatus.Failed
          node.result = { error: String(err) }
          failed.add(nodeId)
          this.propagateSkip(nodeId, definition.edges, execution)
        }

        remaining.delete(nodeId)
      })

      await Promise.all(promises)
    }
  }
}

/** 全局单例 */
export const workflowEngineLocal = new WorkflowEngineLocal()
