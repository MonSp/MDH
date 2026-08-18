import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEngineLocal, type NodeExecutor } from '../workflowEngine'
import {
  type WorkflowDefinition,
  type WorkflowNode,
  WorkflowNodeStatus,
  WorkflowExecutionStatus,
} from '../agentTypes'

function makeNode(nodeId: string, deptId: string): WorkflowNode {
  return {
    node_id: nodeId,
    task_description: `Task ${nodeId}`,
    dept_id: deptId,
    input_spec: {},
    output_spec: {},
    status: WorkflowNodeStatus.Pending,
    result: null,
  }
}

function makeDefinition(
  nodes: WorkflowNode[],
  edges: Array<{ source: string; target: string }>,
  strategy: 'sequential' | 'parallel' | 'mixed' = 'sequential',
): WorkflowDefinition {
  return {
    workflow_id: 'wf-test',
    name: 'Test Workflow',
    description: 'A test workflow',
    nodes,
    edges: edges.map(e => ({
      source_node_id: e.source,
      target_node_id: e.target,
      condition: null,
    })),
    execution_strategy: strategy,
  }
}

describe('WorkflowEngineLocal', () => {
  let engine: WorkflowEngineLocal

  beforeEach(() => {
    engine = new WorkflowEngineLocal()
  })

  describe('registerNodeExecutor', () => {
    it('should register and use executor for a department', async () => {
      const executor: NodeExecutor = vi.fn().mockResolvedValue({ output: 'done' })
      engine.registerNodeExecutor('dept-1', executor)

      const def = makeDefinition([makeNode('n1', 'dept-1')], [])
      const execId = engine.createWorkflow(def)
      await engine.executeWorkflow(execId)

      expect(executor).toHaveBeenCalledWith(expect.objectContaining({ node_id: 'n1' }))
    })

    it('should fail if no executor registered for dept', async () => {
      const def = makeDefinition([makeNode('n1', 'dept-missing')], [])
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.status).toBe(WorkflowExecutionStatus.Failed)
      expect(result.node_states['n1']).toBe(WorkflowNodeStatus.Failed)
    })
  })

  describe('createWorkflow', () => {
    it('should create a workflow and return execution id', () => {
      const def = makeDefinition([makeNode('n1', 'd1')], [])
      const execId = engine.createWorkflow(def)

      expect(execId).toBeTruthy()
      expect(execId).toMatch(/^exec-/)
    })

    it('should initialize all nodes as pending', () => {
      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1')],
        [],
      )
      const execId = engine.createWorkflow(def)
      const status = engine.getWorkflowStatus(execId)

      expect(status.node_states['n1']).toBe(WorkflowNodeStatus.Pending)
      expect(status.node_states['n2']).toBe(WorkflowNodeStatus.Pending)
      expect(status.status).toBe(WorkflowExecutionStatus.Created)
    })
  })

  describe('sequential execution', () => {
    it('should execute nodes in topological order', async () => {
      const order: string[] = []
      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        order.push(node.node_id)
        return { done: true }
      })
      engine.registerNodeExecutor('d1', executor)

      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1'), makeNode('n3', 'd1')],
        [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
        'sequential',
      )
      const execId = engine.createWorkflow(def)
      await engine.executeWorkflow(execId)

      expect(order).toEqual(['n1', 'n2', 'n3'])
    })

    it('should complete all nodes successfully', async () => {
      const executor: NodeExecutor = vi.fn().mockResolvedValue({ ok: true })
      engine.registerNodeExecutor('d1', executor)

      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1')],
        [{ source: 'n1', target: 'n2' }],
      )
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.status).toBe(WorkflowExecutionStatus.Completed)
      expect(result.node_states['n1']).toBe(WorkflowNodeStatus.Completed)
      expect(result.node_states['n2']).toBe(WorkflowNodeStatus.Completed)
    })

    it('should execute independent nodes sequentially', async () => {
      const order: string[] = []
      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        order.push(node.node_id)
        return {}
      })
      engine.registerNodeExecutor('d1', executor)

      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1')],
        [],
        'sequential',
      )
      const execId = engine.createWorkflow(def)
      await engine.executeWorkflow(execId)

      expect(order).toHaveLength(2)
      expect(order).toContain('n1')
      expect(order).toContain('n2')
    })
  })

  describe('parallel execution', () => {
    it('should execute independent nodes in parallel', async () => {
      const running = new Set<string>()
      const maxConcurrent = { value: 0 }

      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        running.add(node.node_id)
        maxConcurrent.value = Math.max(maxConcurrent.value, running.size)
        await new Promise(resolve => setTimeout(resolve, 10))
        running.delete(node.node_id)
        return {}
      })
      engine.registerNodeExecutor('d1', executor)

      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1'), makeNode('n3', 'd1')],
        [],
        'parallel',
      )
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.status).toBe(WorkflowExecutionStatus.Completed)
      expect(maxConcurrent.value).toBeGreaterThan(1)
    })

    it('should respect dependencies in parallel mode', async () => {
      const order: string[] = []
      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        order.push(node.node_id)
        return {}
      })
      engine.registerNodeExecutor('d1', executor)

      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1'), makeNode('n3', 'd1')],
        [{ source: 'n1', target: 'n2' }],
        'parallel',
      )
      const execId = engine.createWorkflow(def)
      await engine.executeWorkflow(execId)

      // n1 must come before n2
      expect(order.indexOf('n1')).toBeLessThan(order.indexOf('n2'))
    })
  })

  describe('skip propagation on failure', () => {
    it('should skip downstream nodes when a node fails', async () => {
      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        if (node.node_id === 'n1') throw new Error('fail')
        return {}
      })
      engine.registerNodeExecutor('d1', executor)

      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1'), makeNode('n3', 'd1')],
        [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
      )
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.status).toBe(WorkflowExecutionStatus.Failed)
      expect(result.node_states['n1']).toBe(WorkflowNodeStatus.Failed)
      expect(result.node_states['n2']).toBe(WorkflowNodeStatus.Skipped)
      expect(result.node_states['n3']).toBe(WorkflowNodeStatus.Skipped)
    })

    it('should skip only affected branches in diamond dependency', async () => {
      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        if (node.node_id === 'n2') throw new Error('fail')
        return {}
      })
      engine.registerNodeExecutor('d1', executor)

      // n1 -> n2 -> n4
      // n1 -> n3 -> n4
      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1'), makeNode('n3', 'd1'), makeNode('n4', 'd1')],
        [
          { source: 'n1', target: 'n2' },
          { source: 'n1', target: 'n3' },
          { source: 'n2', target: 'n4' },
          { source: 'n3', target: 'n4' },
        ],
      )
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.node_states['n1']).toBe(WorkflowNodeStatus.Completed)
      expect(result.node_states['n2']).toBe(WorkflowNodeStatus.Failed)
      expect(result.node_states['n3']).toBe(WorkflowNodeStatus.Completed)
      // n4 depends on n2 (failed) and n3 (completed) — should be skipped
      expect(result.node_states['n4']).toBe(WorkflowNodeStatus.Skipped)
    })

    it('should not skip independent branches', async () => {
      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        if (node.node_id === 'n1') throw new Error('fail')
        return {}
      })
      engine.registerNodeExecutor('d1', executor)

      // n1 -> n2, n3 (independent)
      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1'), makeNode('n3', 'd1')],
        [{ source: 'n1', target: 'n2' }],
      )
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.node_states['n1']).toBe(WorkflowNodeStatus.Failed)
      expect(result.node_states['n2']).toBe(WorkflowNodeStatus.Skipped)
      expect(result.node_states['n3']).toBe(WorkflowNodeStatus.Completed)
    })
  })

  describe('cancelWorkflow', () => {
    it('should cancel workflow execution', () => {
      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1')],
        [{ source: 'n1', target: 'n2' }],
      )
      const execId = engine.createWorkflow(def)
      const result = engine.cancelWorkflow(execId)

      expect(result.status).toBe(WorkflowExecutionStatus.Cancelled)
      expect(result.node_states['n1']).toBe(WorkflowNodeStatus.Skipped)
      expect(result.node_states['n2']).toBe(WorkflowNodeStatus.Skipped)
      expect(result.completed_at).toBeTruthy()
    })

    it('should throw for non-existent execution', () => {
      expect(() => engine.cancelWorkflow('nonexistent')).toThrow('not found')
    })
  })

  describe('getWorkflowStatus', () => {
    it('should return workflow status', () => {
      const def = makeDefinition([makeNode('n1', 'd1')], [])
      const execId = engine.createWorkflow(def)
      const status = engine.getWorkflowStatus(execId)

      expect(status.execution_id).toBe(execId)
      expect(status.workflow_id).toBe('wf-test')
      expect(status.status).toBe(WorkflowExecutionStatus.Created)
    })

    it('should throw for non-existent execution', () => {
      expect(() => engine.getWorkflowStatus('nonexistent')).toThrow('not found')
    })

    it('should return a copy, not a reference', () => {
      const def = makeDefinition([makeNode('n1', 'd1')], [])
      const execId = engine.createWorkflow(def)
      const status1 = engine.getWorkflowStatus(execId)
      const status2 = engine.getWorkflowStatus(execId)

      expect(status1).toEqual(status2)
      expect(status1).not.toBe(status2)
      expect(status1.node_states).not.toBe(status2.node_states)
    })
  })

  describe('getWorkflowVisualization', () => {
    it('should return execution and definition', () => {
      const def = makeDefinition([makeNode('n1', 'd1')], [])
      const execId = engine.createWorkflow(def)
      const viz = engine.getWorkflowVisualization(execId)

      expect(viz.execution).toBeTruthy()
      expect(viz.definition).toBeTruthy()
      expect(viz.definition.workflow_id).toBe('wf-test')
    })

    it('should throw for non-existent execution', () => {
      expect(() => engine.getWorkflowVisualization('nonexistent')).toThrow('not found')
    })
  })

  describe('multi-department workflows', () => {
    it('should route nodes to different executors by dept_id', async () => {
      const frontendExecutor = vi.fn().mockResolvedValue({ component: 'Button' })
      const backendExecutor = vi.fn().mockResolvedValue({ api: '/endpoint' })

      engine.registerNodeExecutor('frontend', frontendExecutor)
      engine.registerNodeExecutor('backend', backendExecutor)

      const def = makeDefinition(
        [makeNode('ui', 'frontend'), makeNode('api', 'backend')],
        [{ source: 'api', target: 'ui' }],
      )
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(frontendExecutor).toHaveBeenCalledTimes(1)
      expect(backendExecutor).toHaveBeenCalledTimes(1)
      expect(result.status).toBe(WorkflowExecutionStatus.Completed)
    })
  })

  describe('mixed strategy', () => {
    it('should execute mixed strategy like sequential', async () => {
      const order: string[] = []
      const executor: NodeExecutor = vi.fn().mockImplementation(async (node: WorkflowNode) => {
        order.push(node.node_id)
        return {}
      })
      engine.registerNodeExecutor('d1', executor)

      const def = makeDefinition(
        [makeNode('n1', 'd1'), makeNode('n2', 'd1')],
        [{ source: 'n1', target: 'n2' }],
        'mixed',
      )
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.status).toBe(WorkflowExecutionStatus.Completed)
      expect(order.indexOf('n1')).toBeLessThan(order.indexOf('n2'))
    })
  })

  describe('empty workflow', () => {
    it('should handle empty workflow', async () => {
      const def = makeDefinition([], [])
      const execId = engine.createWorkflow(def)
      const result = await engine.executeWorkflow(execId)

      expect(result.status).toBe(WorkflowExecutionStatus.Completed)
    })
  })
})
