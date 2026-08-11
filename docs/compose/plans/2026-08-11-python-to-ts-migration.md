# Python → Electron TS 功能迁移计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Python 后端中缺失的核心功能完整迁移到 Electron TS 端，使 TS 端具备独立运行能力。

**Architecture:** 按优先级分 4 批次迁移，每批独立可测试。TS 端遵循现有模块模式：单文件模块 + 纯函数/类 + 测试文件。所有新模块导出到 `src/modules/index.ts`。

**Tech Stack:** TypeScript, Vitest (测试), 现有模块模式

## Global Constraints

- 遵循现有 TS 代码风格（class-based, 非 functional）
- 每个模块必须有对应测试文件
- 不引入新依赖
- 保持与 Python 版本相同的接口语义
- 新模块必须导出到 `src/modules/index.ts`

---

## 批次 P0: 核心缺失 (影响独立运行)

### Task 1: LLM 缓存 (`llmCache.ts`)

**Covers:** 基础设施层

**Files:**
- Create: `src/modules/llmCache.ts`
- Create: `src/modules/__tests__/llmCache.test.ts`
- Modify: `src/modules/index.ts`

**Interfaces:**
- Produces: `LLMCache` class with `get()`, `put()`, `clear()`, `stats`

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/__tests__/llmCache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LLMCache } from '../llmCache'

describe('LLMCache', () => {
  let cache: LLMCache

  beforeEach(() => {
    cache = new LLMCache({ maxSize: 3, ttl: 1000 })
  })

  it('should store and retrieve values', () => {
    cache.put('hello', 'world', 'role1', 'model1')
    expect(cache.get('hello', 'role1', 'model1')).toBe('world')
  })

  it('should return null for missing keys', () => {
    expect(cache.get('missing')).toBeNull()
  })

  it('should evict expired entries', () => {
    const shortCache = new LLMCache({ maxSize: 10, ttl: 0 })
    shortCache.put('key', 'value')
    vi.advanceTimersByTime(1)
    expect(shortCache.get('key')).toBeNull()
  })

  it('should evict oldest when full (LRU)', () => {
    cache.put('a', '1')
    cache.put('b', '2')
    cache.put('c', '3')
    cache.put('d', '4') // should evict 'a'
    expect(cache.get('a')).toBeNull()
    expect(cache.get('d')).toBe('4')
  })

  it('should track stats', () => {
    cache.put('a', '1')
    cache.get('a') // hit
    cache.get('b') // miss
    const stats = cache.stats
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.hitRate).toBe(0.5)
  })

  it('should clear all entries', () => {
    cache.put('a', '1')
    cache.put('b', '2')
    cache.clear()
    expect(cache.stats.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/__tests__/llmCache.test.ts`
Expected: FAIL with "Cannot find module '../llmCache'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/llmCache.ts
export interface LLMCacheConfig {
  maxSize?: number
  ttl?: number // milliseconds
}

interface CacheEntry {
  key: string
  response: unknown
  createdAt: number
  hitCount: number
  ttl: number
}

export class LLMCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number
  private ttl: number
  private hits = 0
  private misses = 0

  constructor(config?: LLMCacheConfig) {
    this.maxSize = config?.maxSize ?? 100
    this.ttl = config?.ttl ?? 300_000 // 5 minutes
  }

  private makeKey(prompt: string, role = '', model = ''): string {
    const content = `${role}:${model}:${prompt}`
    // Simple hash - use crypto if available, fallback to string
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return `llm_${Math.abs(hash).toString(36)}`
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > entry.ttl
  }

  private evict(): void {
    if (this.cache.size === 0) return
    let oldestKey = ''
    let oldestTime = Infinity
    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt
        oldestKey = key
      }
    }
    if (oldestKey) this.cache.delete(oldestKey)
  }

  get(prompt: string, role?: string, model?: string): unknown | null {
    const key = this.makeKey(prompt, role, model)
    const entry = this.cache.get(key)
    if (entry && !this.isExpired(entry)) {
      entry.hitCount++
      this.hits++
      return entry.response
    }
    if (entry) this.cache.delete(key)
    this.misses++
    return null
  }

  put(prompt: string, response: unknown, role?: string, model?: string): void {
    if (this.cache.size >= this.maxSize) this.evict()
    const key = this.makeKey(prompt, role, model)
    this.cache.set(key, {
      key,
      response,
      createdAt: Date.now(),
      hitCount: 0,
      ttl: this.ttl,
    })
  }

  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  get stats() {
    const total = this.hits + this.misses
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    }
  }
}

export const llmCache = new LLMCache()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/__tests__/llmCache.test.ts`
Expected: PASS

- [ ] **Step 5: Export from index.ts**

Add to `src/modules/index.ts`:
```typescript
export { LLMCache, llmCache, type LLMCacheConfig } from './llmCache'
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/llmCache.ts src/modules/__tests__/llmCache.test.ts src/modules/index.ts
git commit -m "feat(ts): add LLM cache module (migrated from Python llm_cache.py)"
```

---

### Task 2: 复杂度分类器 (`complexityClassifier.ts`)

**Covers:** 任务管理层

**Files:**
- Create: `src/modules/complexityClassifier.ts`
- Create: `src/modules/__tests__/complexityClassifier.test.ts`
- Modify: `src/modules/index.ts`

**Interfaces:**
- Produces: `ComplexityClassifier` class with `classify()`, `classifyWithLLM()`

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/__tests__/complexityClassifier.test.ts
import { describe, it, expect } from 'vitest'
import { ComplexityClassifier } from '../complexityClassifier'

describe('ComplexityClassifier', () => {
  const classifier = new ComplexityClassifier()

  describe('rule-based classification', () => {
    it('should classify simple browser operations', () => {
      const result = classifier.classify('打开 https://example.com')
      expect(result.level).toBe('simple')
      expect(result.method).toBe('rule')
    })

    it('should classify simple file operations', () => {
      const result = classifier.classify('读取文件 config.json')
      expect(result.level).toBe('simple')
    })

    it('should classify complex multi-step tasks', () => {
      const result = classifier.classify('首先设计数据库，然后实现API，最后编写前端页面')
      expect(result.level).toBe('complex')
    })

    it('should classify cross-department tasks as complex', () => {
      const result = classifier.classify('实现前端和后端的联调')
      expect(result.level).toBe('complex')
    })

    it('should have confidence between 0 and 1', () => {
      const result = classifier.classify('随便什么消息')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/__tests__/complexityClassifier.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/modules/complexityClassifier.ts
export interface ComplexityResult {
  level: 'simple' | 'complex'
  confidence: number
  reason: string
  method: 'rule' | 'llm'
}

const SIMPLE_PATTERNS: RegExp[] = [
  // Browser operations
  /打开\s*\S+/, /访问\s*\S+/, /导航到\s*\S+/,
  /搜索\s*\S+/, /搜索一下\s*\S+/, /点击\s*\S+/,
  /填写\s*\S+/, /输入\s*\S+/, /截图/, /截屏/,
  /滚动\s*(页面|向下|向上)/, /等待\s*\d+\s*(秒|毫秒)/,
  /关闭\s*(标签页|页面)/, /切换到\s*\S+/, /新建\s*(标签页|页面)/,
  // File operations
  /读取\s*(文件|内容)/, /打开\s*(文件|目录)/,
  /保存\s*(文件|内容)/, /创建\s*(文件|目录)/,
  /删除\s*(文件|目录)/, /复制\s*(文件|目录)/, /移动\s*(文件|目录)/,
  // Simple queries
  /(什么是|解释一下|告诉我)\s*\S+/,
  /(帮我|请)\s*(查一下|看一下|找一下)\s*\S+/,
]

const COMPLEX_PATTERNS: RegExp[] = [
  // Multi-step connectors
  /首先.*然后.*最后/, /第一步.*第二步.*第三步/,
  /先.*再.*后/, /先.*接着.*然后/,
  // Cross-department keywords
  /前端.*后端/, /后端.*前端/,
  /设计.*开发/, /开发.*测试/, /测试.*部署/,
  /分析.*实现/, /实现.*验证/,
  // Complex task descriptions
  /完整.*(系统|平台|应用)/,
  /从零开始/, /全栈/, /架构设计/,
]

const COMPLEX_KEYWORDS = [
  '重构', '优化', '迁移', '部署', '集成', '测试', '安全',
  '性能', '监控', 'CI/CD', 'Docker', '数据库设计',
]

export class ComplexityClassifier {
  classify(message: string): ComplexityResult {
    // Layer 1: Rule engine
    let simpleScore = 0
    let complexScore = 0

    for (const pattern of SIMPLE_PATTERNS) {
      if (pattern.test(message)) simpleScore++
    }

    for (const pattern of COMPLEX_PATTERNS) {
      if (pattern.test(message)) complexScore++
    }

    for (const keyword of COMPLEX_KEYWORDS) {
      if (message.includes(keyword)) complexScore += 0.5
    }

    // Count verbs (Chinese verb detection heuristic)
    const verbMatches = message.match(/[实现创建开发编写设计测试部署配置集成优化重构迁移]/g)
    if (verbMatches && verbMatches.length >= 3) complexScore += verbMatches.length * 0.3

    // Decision
    const total = simpleScore + complexScore
    if (total === 0) {
      return { level: 'complex', confidence: 0.5, reason: '无法判定，默认复杂', method: 'rule' }
    }

    if (complexScore > simpleScore) {
      const confidence = Math.min(complexScore / total, 1)
      return { level: 'complex', confidence, reason: `复杂度得分 ${complexScore.toFixed(1)} > 简单度得分 ${simpleScore}`, method: 'rule' }
    }

    const confidence = Math.min(simpleScore / total, 1)
    if (confidence >= 0.7) {
      return { level: 'simple', confidence, reason: `简单度得分 ${simpleScore} >= 阈值`, method: 'rule' }
    }

    // Low confidence - default to complex
    return { level: 'complex', confidence: 0.5, reason: '置信度不足，默认复杂', method: 'rule' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/__tests__/complexityClassifier.test.ts`
Expected: PASS

- [ ] **Step 5: Export from index.ts**

- [ ] **Step 6: Commit**

---

### Task 3: 工作流引擎本地实现 (`workflowEngineLocal.ts`)

**Covers:** 工作流引擎层

**Files:**
- Create: `src/modules/workflowEngineLocal.ts`
- Create: `src/modules/__tests__/workflowEngineLocal.test.ts`
- Modify: `src/modules/index.ts`

**Interfaces:**
- Produces: `WorkflowEngineLocal` class with `createWorkflow()`, `executeWorkflow()`, `pauseWorkflow()`, `resumeWorkflow()`, `cancelWorkflow()`, `getWorkflowStatus()`
- Uses: `WorkflowDefinition`, `WorkflowExecution`, `WorkflowNode`, `WorkflowEdge` from `agentTypes.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/__tests__/workflowEngineLocal.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { WorkflowEngineLocal } from '../workflowEngineLocal'
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '../agentTypes'

describe('WorkflowEngineLocal', () => {
  let engine: WorkflowEngineLocal

  beforeEach(() => {
    engine = new WorkflowEngineLocal()
  })

  const makeNode = (id: string, deptId = 'test'): WorkflowNode => ({
    nodeId: id, deptId, label: `Node ${id}`, status: 'pending' as any,
  })

  const makeEdge = (from: string, to: string): WorkflowEdge => ({
    from, to,
  })

  it('should create a workflow execution', () => {
    const def: WorkflowDefinition = {
      workflowId: 'wf1',
      nodes: [makeNode('A'), makeNode('B')],
      edges: [makeEdge('A', 'B')],
      executionStrategy: 'sequential' as any,
    }
    const exec = engine.createWorkflow(def)
    expect(exec.executionId).toBeDefined()
    expect(exec.workflowId).toBe('wf1')
    expect(exec.status).toBe('created')
  })

  it('should execute sequential workflow', async () => {
    const order: string[] = []
    engine.registerNodeExecutor('test', async (node) => {
      order.push(node.nodeId)
      return {}
    })

    const def: WorkflowDefinition = {
      workflowId: 'wf1',
      nodes: [makeNode('A'), makeNode('B'), makeNode('C')],
      edges: [makeEdge('A', 'B'), makeEdge('B', 'C')],
      executionStrategy: 'sequential' as any,
    }

    const exec = engine.createWorkflow(def)
    await engine.executeWorkflow(exec.executionId)
    expect(order).toEqual(['A', 'B', 'C'])
    expect(exec.status).toBe('completed')
  })

  it('should execute parallel workflow', async () => {
    const started: string[] = []
    engine.registerNodeExecutor('test', async (node) => {
      started.push(node.nodeId)
      return {}
    })

    const def: WorkflowDefinition = {
      workflowId: 'wf1',
      nodes: [makeNode('A'), makeNode('B'), makeNode('C')],
      edges: [makeEdge('A', 'C'), makeEdge('B', 'C')],
      executionStrategy: 'parallel' as any,
    }

    const exec = engine.createWorkflow(def)
    await engine.executeWorkflow(exec.executionId)
    expect(started).toContain('A')
    expect(started).toContain('B')
    expect(exec.status).toBe('completed')
  })

  it('should handle node failure and skip dependents', async () => {
    engine.registerNodeExecutor('test', async (node) => {
      if (node.nodeId === 'A') throw new Error('fail')
      return {}
    })

    const def: WorkflowDefinition = {
      workflowId: 'wf1',
      nodes: [makeNode('A'), makeNode('B')],
      edges: [makeEdge('A', 'B')],
      executionStrategy: 'sequential' as any,
    }

    const exec = engine.createWorkflow(def)
    await engine.executeWorkflow(exec.executionId)
    expect(exec.nodeStates['A']).toBe('failed')
    expect(exec.nodeStates['B']).toBe('skipped')
  })

  it('should cancel workflow', async () => {
    engine.registerNodeExecutor('test', async () => {
      await new Promise(r => setTimeout(r, 1000))
      return {}
    })

    const def: WorkflowDefinition = {
      workflowId: 'wf1',
      nodes: [makeNode('A')],
      edges: [],
      executionStrategy: 'sequential' as any,
    }

    const exec = engine.createWorkflow(def)
    const promise = engine.executeWorkflow(exec.executionId)
    engine.cancelWorkflow(exec.executionId)
    await promise
    expect(exec.status).toBe('cancelled')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/__tests__/workflowEngineLocal.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/modules/workflowEngineLocal.ts
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeStatus,
  WorkflowExecutionStatus,
} from './agentTypes'

export type NodeExecutor = (node: WorkflowNode, inputData?: Record<string, unknown>) => Promise<Record<string, unknown>>

export class WorkflowEngineLocal {
  private definitions = new Map<string, WorkflowDefinition>()
  private executions = new Map<string, WorkflowExecution>()
  private nodeExecutors = new Map<string, NodeExecutor>()
  private cancelled = new Set<string>()
  private idCounter = 0

  registerNodeExecutor(deptId: string, executor: NodeExecutor): void {
    this.nodeExecutors.set(deptId, executor)
  }

  createWorkflow(definition: WorkflowDefinition): WorkflowExecution {
    const executionId = `exec_${++this.idCounter}_${Date.now().toString(36)}`
    const nodeStates: Record<string, WorkflowNodeStatus> = {}
    for (const node of definition.nodes) {
      nodeStates[node.nodeId] = 'pending' as WorkflowNodeStatus
    }
    const execution: WorkflowExecution = {
      executionId,
      workflowId: definition.workflowId,
      status: 'created' as WorkflowExecutionStatus,
      startedAt: new Date().toISOString(),
      nodeStates,
      results: {},
    }
    this.definitions.set(definition.workflowId, definition)
    this.executions.set(executionId, execution)
    return execution
  }

  async executeWorkflow(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId)
    if (!execution) throw new Error(`Execution not found: ${executionId}`)
    const definition = this.definitions.get(execution.workflowId)
    if (!definition) throw new Error(`Definition not found: ${execution.workflowId}`)

    execution.status = 'running' as WorkflowExecutionStatus
    execution.startedAt = new Date().toISOString()

    try {
      const strategy = definition.executionStrategy || 'sequential'
      if (strategy === 'sequential') {
        await this.executeSequential(execution, definition)
      } else if (strategy === 'parallel') {
        await this.executeParallel(execution, definition)
      } else {
        await this.executeMixed(execution, definition)
      }

      if (this.cancelled.has(executionId)) {
        execution.status = 'cancelled' as WorkflowExecutionStatus
      } else {
        const allCompleted = Object.values(execution.nodeStates).every(
          s => s === 'completed' || s === 'skipped'
        )
        execution.status = (allCompleted ? 'completed' : 'failed') as WorkflowExecutionStatus
      }
      execution.completedAt = new Date().toISOString()
    } catch {
      if (!this.cancelled.has(executionId)) {
        execution.status = 'failed' as WorkflowExecutionStatus
        execution.completedAt = new Date().toISOString()
      }
    }
  }

  cancelWorkflow(executionId: string): void {
    this.cancelled.add(executionId)
    const execution = this.executions.get(executionId)
    if (execution) {
      execution.status = 'cancelled' as WorkflowExecutionStatus
      execution.completedAt = new Date().toISOString()
    }
  }

  getWorkflowStatus(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId)
  }

  private async executeSequential(execution: WorkflowExecution, definition: WorkflowDefinition): Promise<void> {
    const sorted = this.topologicalSort(definition)
    for (const node of sorted) {
      if (this.cancelled.has(execution.executionId)) break
      if (!this.checkDependencies(node, execution, definition)) {
        execution.nodeStates[node.nodeId] = 'skipped' as WorkflowNodeStatus
        continue
      }
      await this.executeNode(execution, node)
    }
  }

  private async executeParallel(execution: WorkflowExecution, definition: WorkflowDefinition): Promise<void> {
    const depGraph = this.buildDependencyGraph(definition)
    const inDegree = this.calculateInDegree(definition)
    let ready = definition.nodes.filter(n => inDegree[n.nodeId] === 0)

    while (ready.length > 0) {
      if (this.cancelled.has(execution.executionId)) break
      await Promise.all(ready.map(n => this.executeNode(execution, n)))

      const newReady: WorkflowNode[] = []
      for (const node of ready) {
        for (const depId of (depGraph[node.nodeId] || [])) {
          inDegree[depId]--
          if (inDegree[depId] === 0) {
            const depNode = definition.nodes.find(n => n.nodeId === depId)
            if (depNode && this.checkDependencies(depNode, execution, definition)) {
              newReady.push(depNode)
            } else if (depNode) {
              execution.nodeStates[depId] = 'skipped' as WorkflowNodeStatus
            }
          }
        }
      }
      ready = newReady
    }
  }

  private async executeMixed(execution: WorkflowExecution, definition: WorkflowDefinition): Promise<void> {
    // Mixed = parallel with condition evaluation
    await this.executeParallel(execution, definition)
  }

  private async executeNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    execution.nodeStates[node.nodeId] = 'running' as WorkflowNodeStatus
    const executor = this.nodeExecutors.get(node.deptId)
    if (!executor) {
      execution.nodeStates[node.nodeId] = 'skipped' as WorkflowNodeStatus
      return
    }
    try {
      const result = await executor(node, execution.results)
      execution.results[node.nodeId] = result
      execution.nodeStates[node.nodeId] = 'completed' as WorkflowNodeStatus
    } catch {
      execution.nodeStates[node.nodeId] = 'failed' as WorkflowNodeStatus
      this.propagateSkip(node.nodeId, execution, definition)
    }
  }

  private propagateSkip(failedId: string, execution: WorkflowExecution, definition: WorkflowDefinition): void {
    const depGraph = this.buildDependencyGraph(definition)
    const queue = [...(depGraph[failedId] || [])]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (execution.nodeStates[id] === 'pending') {
        execution.nodeStates[id] = 'skipped' as WorkflowNodeStatus
        queue.push(...(depGraph[id] || []))
      }
    }
  }

  private checkDependencies(node: WorkflowNode, execution: WorkflowExecution, definition: WorkflowDefinition): boolean {
    const deps = definition.edges.filter(e => e.to === node.nodeId)
    return deps.every(e => execution.nodeStates[e.from] === 'completed')
  }

  private topologicalSort(definition: WorkflowDefinition): WorkflowNode[] {
    const inDegree = this.calculateInDegree(definition)
    const queue = definition.nodes.filter(n => inDegree[n.nodeId] === 0)
    const result: WorkflowNode[] = []
    const depGraph = this.buildReverseGraph(definition)

    while (queue.length > 0) {
      const node = queue.shift()!
      result.push(node)
      for (const depId of (depGraph[node.nodeId] || [])) {
        inDegree[depId]--
        if (inDegree[depId] === 0) {
          const depNode = definition.nodes.find(n => n.nodeId === depId)
          if (depNode) queue.push(depNode)
        }
      }
    }
    return result
  }

  private buildDependencyGraph(definition: WorkflowDefinition): Record<string, string[]> {
    const graph: Record<string, string[]> = {}
    for (const node of definition.nodes) graph[node.nodeId] = []
    for (const edge of definition.edges) {
      if (!graph[edge.from]) graph[edge.from] = []
      graph[edge.from].push(edge.to)
    }
    return graph
  }

  private buildReverseGraph(definition: WorkflowDefinition): Record<string, string[]> {
    const graph: Record<string, string[]> = {}
    for (const node of definition.nodes) graph[node.nodeId] = []
    for (const edge of definition.edges) {
      if (!graph[edge.to]) graph[edge.to] = []
      graph[edge.to].push(edge.from)
    }
    return graph
  }

  private calculateInDegree(definition: WorkflowDefinition): Record<string, number> {
    const inDegree: Record<string, number> = {}
    for (const node of definition.nodes) inDegree[node.nodeId] = 0
    for (const edge of definition.edges) inDegree[edge.to]++
    return inDegree
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/__tests__/workflowEngineLocal.test.ts`
Expected: PASS

- [ ] **Step 5: Export from index.ts**

- [ ] **Step 6: Commit**

---

### Task 4: 项目管理器 (`projectManager.ts`)

**Covers:** 项目管理层

**Files:**
- Create: `src/modules/projectManager.ts`
- Create: `src/modules/__tests__/projectManager.test.ts`
- Modify: `src/modules/index.ts`

**Interfaces:**
- Produces: `ProjectManagerLocal` class with `createProject()`, `getProject()`, `listProjects()`, `deleteProject()`, `addTask()`, `updateTaskStatus()`, `archiveProject()`

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/__tests__/projectManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ProjectManagerLocal } from '../projectManager'

describe('ProjectManagerLocal', () => {
  let pm: ProjectManagerLocal

  beforeEach(() => {
    pm = new ProjectManagerLocal()
  })

  it('should create a project', () => {
    const project = pm.createProject({ name: 'Test Project', description: 'desc' })
    expect(project.projectId).toBeDefined()
    expect(project.name).toBe('Test Project')
    expect(project.status).toBe('created')
  })

  it('should list projects', () => {
    pm.createProject({ name: 'A' })
    pm.createProject({ name: 'B' })
    expect(pm.listProjects()).toHaveLength(2)
  })

  it('should get project by id', () => {
    const project = pm.createProject({ name: 'Test' })
    expect(pm.getProject(project.projectId)?.name).toBe('Test')
  })

  it('should delete project', () => {
    const project = pm.createProject({ name: 'Test' })
    pm.deleteProject(project.projectId)
    expect(pm.getProject(project.projectId)).toBeUndefined()
  })

  it('should add tasks to project', () => {
    const project = pm.createProject({ name: 'Test' })
    pm.addTask(project.projectId, { title: 'Task 1', description: 'do something' })
    const tasks = pm.getProjectTasks(project.projectId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Task 1')
  })

  it('should update task status', () => {
    const project = pm.createProject({ name: 'Test' })
    pm.addTask(project.projectId, { title: 'Task 1' })
    const tasks = pm.getProjectTasks(project.projectId)
    pm.updateTaskStatus(project.projectId, tasks[0].taskId, 'completed')
    expect(pm.getProjectTasks(project.projectId)[0].status).toBe('completed')
  })

  it('should archive project', () => {
    const project = pm.createProject({ name: 'Test' })
    pm.archiveProject(project.projectId)
    expect(pm.getProject(project.projectId)?.status).toBe('archived')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/__tests__/projectManager.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/modules/projectManager.ts
export interface ProjectCreateInput {
  name: string
  description?: string
  category?: string
}

export interface Project {
  projectId: string
  name: string
  description: string
  status: 'created' | 'instantiating' | 'running' | 'archiving' | 'archived'
  category: string
  createdAt: string
  tasks: ProjectTask[]
}

export interface ProjectTask {
  taskId: string
  title: string
  description: string
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled'
  assignee?: string
  createdAt: string
}

export class ProjectManagerLocal {
  private projects = new Map<string, Project>()
  private idCounter = 0

  createProject(input: ProjectCreateInput): Project {
    const projectId = `proj_${++this.idCounter}_${Date.now().toString(36)}`
    const project: Project = {
      projectId,
      name: input.name,
      description: input.description || '',
      status: 'created',
      category: input.category || 'general',
      createdAt: new Date().toISOString(),
      tasks: [],
    }
    this.projects.set(projectId, project)
    return project
  }

  getProject(projectId: string): Project | undefined {
    return this.projects.get(projectId)
  }

  listProjects(): Project[] {
    return Array.from(this.projects.values())
  }

  deleteProject(projectId: string): boolean {
    return this.projects.delete(projectId)
  }

  addTask(projectId: string, input: { title: string; description?: string; assignee?: string }): ProjectTask {
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const task: ProjectTask = {
      taskId: `task_${++this.idCounter}_${Date.now().toString(36)}`,
      title: input.title,
      description: input.description || '',
      status: 'pending',
      assignee: input.assignee,
      createdAt: new Date().toISOString(),
    }
    project.tasks.push(task)
    return task
  }

  updateTaskStatus(projectId: string, taskId: string, status: ProjectTask['status']): void {
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const task = project.tasks.find(t => t.taskId === taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    task.status = status
  }

  getProjectTasks(projectId: string): ProjectTask[] {
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return project.tasks
  }

  archiveProject(projectId: string): void {
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    project.status = 'archived'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/__tests__/projectManager.test.ts`
Expected: PASS

- [ ] **Step 5: Export from index.ts**

- [ ] **Step 6: Commit**

---

## 批次 P1: 重要缺失 (影响功能完整性)

### Task 5: EARS 验收句式校验器 (`earsValidator.ts`)

**Covers:** 规格/门禁系统

**Files:**
- Create: `src/modules/earsValidator.ts`
- Create: `src/modules/__tests__/earsValidator.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/__tests__/earsValidator.test.ts
import { describe, it, expect } from 'vitest'
import { EarsValidator } from '../earsValidator'

describe('EarsValidator', () => {
  const validator = new EarsValidator()

  it('should pass valid EARS sentence (English)', () => {
    const result = validator.validate('WHEN user clicks submit THEN the system SHALL save the data')
    expect(result.valid).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('should pass valid EARS sentence (Chinese)', () => {
    const result = validator.validate('当用户点击提交时，系统应当保存数据')
    expect(result.valid).toBe(true)
  })

  it('should fail without trigger word', () => {
    const result = validator.validate('the system SHALL save the data')
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.includes('trigger'))).toBe(true)
  })

  it('should fail without response word', () => {
    const result = validator.validate('WHEN user clicks submit the system saves data')
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.includes('response'))).toBe(true)
  })

  it('should fail with vague words', () => {
    const result = validator.validate('WHEN user clicks THEN the system 应该 save data')
    expect(result.valid).toBe(false)
  })

  it('should validate batch', () => {
    const results = validator.validateBatch([
      'WHEN A THEN B SHALL C',
      'invalid sentence',
    ])
    expect(results).toHaveLength(2)
    expect(results[0].valid).toBe(true)
    expect(results[1].valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/__tests__/earsValidator.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/modules/earsValidator.ts
export interface EarsViolation {
  rule: string
  message: string
}

export interface EarsValidationResult {
  valid: boolean
  violations: EarsViolation[]
}

const TRIGGER_WORDS = ['WHEN', 'IF', 'when', 'if', '如果', '若', '当']
const RESPONSE_WORDS = ['SHALL', 'Shall', 'shall', '应', '必须', '应当']
const VAGUE_WORDS = ['应该', '可能', '尽量', '也许', '大概', 'should', 'might', 'may', 'could', 'maybe']

export class EarsValidator {
  validate(sentence: string): EarsValidationResult {
    const violations: EarsViolation[] = []

    // Rule 1: Must contain trigger word
    const hasTrigger = TRIGGER_WORDS.some(w => sentence.includes(w))
    if (!hasTrigger) {
      violations.push({ rule: 'trigger', message: 'Missing trigger word (WHEN/IF/当/如果/若)' })
    }

    // Rule 2: Must contain response word
    const hasResponse = RESPONSE_WORDS.some(w => sentence.includes(w))
    if (!hasResponse) {
      violations.push({ rule: 'response', message: 'Missing response word (SHALL/应/必须/应当)' })
    }

    // Rule 3: Trigger before response
    if (hasTrigger && hasResponse) {
      const triggerPos = Math.min(
        ...TRIGGER_WORDS.filter(w => sentence.includes(w)).map(w => sentence.indexOf(w))
      )
      const responsePos = Math.min(
        ...RESPONSE_WORDS.filter(w => sentence.includes(w)).map(w => sentence.indexOf(w))
      )
      if (triggerPos >= responsePos) {
        violations.push({ rule: 'order', message: 'Trigger word must appear before response word' })
      }
    }

    // Rule 4: No vague words
    const foundVague = VAGUE_WORDS.filter(w => sentence.includes(w))
    if (foundVague.length > 0) {
      violations.push({ rule: 'vague', message: `Contains vague words: ${foundVague.join(', ')}` })
    }

    return { valid: violations.length === 0, violations }
  }

  validateBatch(sentences: string[]): EarsValidationResult[] {
    return sentences.map(s => this.validate(s))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/__tests__/earsValidator.test.ts`
Expected: PASS

- [ ] **Step 5-6: Export and commit**

---

### Task 6: SpecTree 校验器 (`specTreeValidator.ts`)

**Covers:** 规格/门禁系统

**Files:**
- Create: `src/modules/specTreeValidator.ts`
- Create: `src/modules/__tests__/specTreeValidator.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/modules/__tests__/specTreeValidator.test.ts
import { describe, it, expect } from 'vitest'
import { SpecTreeValidator, type SpecTree, type SpecTreeNode } from '../specTreeValidator'

describe('SpecTreeValidator', () => {
  const validator = new SpecTreeValidator()

  const makeNode = (id: string, type: string, parentId: string | null = null): SpecTreeNode => ({
    id, type: type as any, parentId, title: `Node ${id}`,
  })

  const makeValidTree = (): SpecTree => ({
    rootNodeId: 'root',
    version: 1,
    successCriteria: [{ id: 'sc1', text: 'criterion 1' }],
    nodes: [
      makeNode('root', 'requirement', null),
      makeNode('d1', 'design', 'root'),
      makeNode('t1', 'task', 'd1'),
    ],
    provenance: { generationSource: 'llm' },
  })

  it('should pass valid tree', () => {
    const result = validator.validate(makeValidTree())
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('should fail with too few nodes', () => {
    const tree = makeValidTree()
    tree.nodes = [makeNode('root', 'requirement', null)]
    const result = validator.validate(tree)
    expect(result.passed).toBe(false)
    expect(result.violations.some(v => v.includes('node count'))).toBe(true)
  })

  it('should fail with cycle', () => {
    const tree = makeValidTree()
    tree.nodes = [
      makeNode('a', 'requirement', 'b'),
      makeNode('b', 'design', 'a'),
      makeNode('c', 'task', 'a'),
    ]
    tree.rootNodeId = 'a'
    const result = validator.validate(tree)
    expect(result.passed).toBe(false)
  })

  it('should fail with invalid provenance source', () => {
    const tree = makeValidTree()
    tree.provenance = { generationSource: 'invalid' }
    const result = validator.validate(tree)
    expect(result.passed).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/__tests__/specTreeValidator.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/modules/specTreeValidator.ts
export type SpecTreeNodeType = 'requirement' | 'design' | 'task' | 'evidence'

export interface SpecTreeNode {
  id: string
  parentId: string | null
  type: SpecTreeNodeType
  title: string
  acceptance?: string
  coversCriteria?: string[]
  evidenceRefs?: string[]
  notes?: string
  source?: string
  verify?: string
}

export interface SuccessCriterion {
  id: string
  text: string
}

export interface Provenance {
  generationSource: string
  promptId?: string
  model?: string
  fingerprint?: string
}

export interface SpecTree {
  rootNodeId: string
  version: number
  successCriteria: SuccessCriterion[]
  nodes: SpecTreeNode[]
  provenance: Provenance
}

export interface ValidationResult {
  passed: boolean
  violations: string[]
  stats?: Record<string, unknown>
}

const VALID_SOURCES = new Set(['llm', 'llm_fallback', 'template'])
const VALID_TYPES = new Set(['requirement', 'design', 'task', 'evidence'])

export class SpecTreeValidator {
  private readonly MIN_NODES = 3
  private readonly MAX_NODES = 60
  private readonly MAX_DEPTH = 4

  validate(tree: SpecTree): ValidationResult {
    const violations: string[] = []

    // 1. Structure validation
    if (tree.nodes.length < this.MIN_NODES || tree.nodes.length > this.MAX_NODES) {
      violations.push(`node count ${tree.nodes.length} outside range [${this.MIN_NODES}, ${this.MAX_NODES}]`)
    }

    // Unique IDs
    const ids = new Set(tree.nodes.map(n => n.id))
    if (ids.size !== tree.nodes.length) violations.push('duplicate node IDs')

    // Single root
    const roots = tree.nodes.filter(n => n.parentId === null)
    if (roots.length !== 1) violations.push(`expected 1 root, found ${roots.length}`)

    // Root matches rootNodeId
    if (roots.length === 1 && roots[0].id !== tree.rootNodeId) {
      violations.push(`root node ID mismatch: ${roots[0].id} !== ${tree.rootNodeId}`)
    }

    // Valid types
    for (const node of tree.nodes) {
      if (!VALID_TYPES.has(node.type)) {
        violations.push(`invalid node type: ${node.type} on node ${node.id}`)
      }
    }

    // Parent reachability (all non-root nodes have valid parent)
    for (const node of tree.nodes) {
      if (node.parentId !== null && !ids.has(node.parentId)) {
        violations.push(`node ${node.id} references missing parent ${node.parentId}`)
      }
    }

    // Cycle detection (DFS)
    if (this.hasCycle(tree)) violations.push('cycle detected in tree')

    // Max depth
    const depth = this.maxDepth(tree)
    if (depth > this.MAX_DEPTH) violations.push(`depth ${depth} exceeds max ${this.MAX_DEPTH}`)

    // 2. Provenance
    if (!VALID_SOURCES.has(tree.provenance.generationSource)) {
      violations.push(`invalid provenance source: ${tree.provenance.generationSource}`)
    }

    return {
      passed: violations.length === 0,
      violations,
      stats: { nodeCount: tree.nodes.length, depth },
    }
  }

  private hasCycle(tree: SpecTree): boolean {
    const adj = new Map<string, string[]>()
    for (const node of tree.nodes) {
      adj.set(node.id, [])
    }
    for (const node of tree.nodes) {
      if (node.parentId && adj.has(node.parentId)) {
        adj.get(node.parentId)!.push(node.id)
      }
    }
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const dfs = (id: string): boolean => {
      visited.add(id)
      inStack.add(id)
      for (const child of adj.get(id) || []) {
        if (!visited.has(child) && dfs(child)) return true
        if (inStack.has(child)) return true
      }
      inStack.delete(id)
      return false
    }
    return dfs(tree.rootNodeId)
  }

  private maxDepth(tree: SpecTree): number {
    const children = new Map<string, string[]>()
    for (const node of tree.nodes) {
      if (node.parentId) {
        if (!children.has(node.parentId)) children.set(node.parentId, [])
        children.get(node.parentId)!.push(node.id)
      }
    }
    let maxD = 0
    const queue: Array<{ id: string; depth: number }> = [{ id: tree.rootNodeId, depth: 1 }]
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      maxD = Math.max(maxD, depth)
      for (const child of children.get(id) || []) {
        queue.push({ id: child, depth: depth + 1 })
      }
    }
    return maxD
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/__tests__/specTreeValidator.test.ts`
Expected: PASS

- [ ] **Step 5-6: Export and commit**

---

### Task 7: 证据链 (`evidenceChain.ts`)

**Covers:** 规格/门禁系统

**Files:**
- Create: `src/modules/evidenceChain.ts`
- Create: `src/modules/__tests__/evidenceChain.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1-3: Implementation**

```typescript
// src/modules/evidenceChain.ts
export interface Evidence {
  evidenceId: string
  traceId: string
  stage: 'routing' | 'decomposition' | 'assignment' | 'execution' | 'review'
  source: string
  content: string
  timestamp: string
}

export class EvidenceChain {
  private chains = new Map<string, Evidence[]>()
  private idCounter = 0

  addEvidence(traceId: string, stage: Evidence['stage'], source: string, content: string): Evidence {
    const evidence: Evidence = {
      evidenceId: `ev_${++this.idCounter}`,
      traceId,
      stage,
      source,
      content,
      timestamp: new Date().toISOString(),
    }
    if (!this.chains.has(traceId)) this.chains.set(traceId, [])
    this.chains.get(traceId)!.push(evidence)
    return evidence
  }

  getChain(traceId: string): Evidence[] {
    return this.chains.get(traceId) || []
  }

  getStages(traceId: string): string[] {
    const chain = this.getChain(traceId)
    return [...new Set(chain.map(e => e.stage))]
  }

  hasEvidence(traceId: string): boolean {
    return (this.chains.get(traceId)?.length ?? 0) > 0
  }

  exportChain(traceId: string): Record<string, unknown> {
    return {
      traceId,
      evidence: this.getChain(traceId),
      stages: this.getStages(traceId),
    }
  }

  clear(): void {
    this.chains.clear()
  }
}
```

- [ ] **Step 4: Write test and verify**

```typescript
// src/modules/__tests__/evidenceChain.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { EvidenceChain } from '../evidenceChain'

describe('EvidenceChain', () => {
  let chain: EvidenceChain

  beforeEach(() => { chain = new EvidenceChain() })

  it('should add and retrieve evidence', () => {
    chain.addEvidence('trace1', 'execution', 'agent1', 'created file.ts')
    expect(chain.getChain('trace1')).toHaveLength(1)
  })

  it('should get unique stages', () => {
    chain.addEvidence('t1', 'routing', 'r1', 'a')
    chain.addEvidence('t1', 'execution', 'e1', 'b')
    chain.addEvidence('t1', 'execution', 'e2', 'c')
    expect(chain.getStages('t1')).toEqual(['routing', 'execution'])
  })

  it('should check evidence existence', () => {
    expect(chain.hasEvidence('missing')).toBe(false)
    chain.addEvidence('t1', 'review', 'r1', 'x')
    expect(chain.hasEvidence('t1')).toBe(true)
  })

  it('should export chain', () => {
    chain.addEvidence('t1', 'routing', 'r1', 'x')
    const exported = chain.exportChain('t1')
    expect(exported.traceId).toBe('t1')
  })
})
```

- [ ] **Step 5-6: Export and commit**

---

### Task 8: 门禁管理器 (`gateManager.ts`)

**Covers:** 规格/门禁系统

**Files:**
- Create: `src/modules/gateManager.ts`
- Create: `src/modules/__tests__/gateManager.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1-3: Implementation**

```typescript
// src/modules/gateManager.ts
import { SpecTreeValidator, type SpecTree, type ValidationResult } from './specTreeValidator'
import { EarsValidator } from './earsValidator'

export interface GateResult {
  gateId: string
  passed: boolean
  details: ValidationResult
  timestamp: string
}

export interface ChecksLedger {
  entries: GateResult[]
}

export type GateFunction = (input: unknown) => ValidationResult

export class GateManager {
  private gates = new Map<string, GateFunction>()
  private ledger: ChecksLedger = { entries: [] }

  constructor() {
    // Register built-in gates
    const specValidator = new SpecTreeValidator()
    const earsValidator = new EarsValidator()

    this.registerGate('spec_tree', (input) => specValidator.validate(input as SpecTree))
    this.registerGate('ears', (input) => {
      const sentences = Array.isArray(input) ? input as string[] : [input as string]
      const results = earsValidator.validateBatch(sentences)
      const allValid = results.every(r => r.valid)
      const violations = results.flatMap(r => r.violations.map(v => v.message))
      return { passed: allValid, violations }
    })
  }

  registerGate(gateId: string, fn: GateFunction): void {
    this.gates.set(gateId, fn)
  }

  runGate(gateId: string, input: unknown): GateResult {
    const fn = this.gates.get(gateId)
    if (!fn) throw new Error(`Gate not found: ${gateId}`)
    const details = fn(input)
    const result: GateResult = {
      gateId,
      passed: details.passed,
      details,
      timestamp: new Date().toISOString(),
    }
    this.ledger.entries.push(result)
    return result
  }

  getLedger(): ChecksLedger {
    return this.ledger
  }

  getSummary(): { total: number; passed: number; failed: number; passRate: number } {
    const total = this.ledger.entries.length
    const passed = this.ledger.entries.filter(e => e.passed).length
    return { total, passed, failed: total - passed, passRate: total > 0 ? passed / total : 0 }
  }
}
```

- [ ] **Step 4: Write test and verify**

```typescript
// src/modules/__tests__/gateManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { GateManager } from '../gateManager'

describe('GateManager', () => {
  let gm: GateManager

  beforeEach(() => { gm = new GateManager() })

  it('should run spec_tree gate on valid tree', () => {
    const tree = {
      rootNodeId: 'root', version: 1,
      successCriteria: [{ id: 'sc1', text: 'test' }],
      nodes: [
        { id: 'root', type: 'requirement', parentId: null, title: 'Root' },
        { id: 'd1', type: 'design', parentId: 'root', title: 'Design' },
        { id: 't1', type: 'task', parentId: 'd1', title: 'Task' },
      ],
      provenance: { generationSource: 'llm' },
    }
    const result = gm.runGate('spec_tree', tree)
    expect(result.passed).toBe(true)
  })

  it('should run ears gate', () => {
    const result = gm.runGate('ears', 'WHEN A THEN B SHALL C')
    expect(result.passed).toBe(true)
  })

  it('should track ledger', () => {
    gm.runGate('ears', 'WHEN A THEN B SHALL C')
    gm.runGate('ears', 'invalid')
    expect(gm.getSummary().total).toBe(2)
    expect(gm.getSummary().passed).toBe(1)
  })
})
```

- [ ] **Step 5-6: Export and commit**

---

### Task 9: 回退链 (`fallbackChain.ts`)

**Covers:** 补偿/容错层

**Files:**
- Create: `src/modules/fallbackChain.ts`
- Create: `src/modules/__tests__/fallbackChain.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1-3: Implementation**

```typescript
// src/modules/fallbackChain.ts
export interface FallbackStep {
  targetId: string
  reason: string
  confidence: number
}

export interface FallbackChainConfig {
  primary: string
  fallbacks: FallbackStep[]
  strategy: 'sequential' | 'parallel'
  maxAttempts: number
}

export interface FallbackResult {
  success: boolean
  targetId: string
  attempts: number
  results: Array<{ targetId: string; success: boolean; result?: unknown; error?: string }>
  fallbackUsed: boolean
  compensated: boolean
}

export type FallbackExecutor = (targetId: string) => Promise<unknown>
export type CompensationCallback = (context?: Record<string, unknown>) => Promise<boolean>

export class FallbackChainRunner {
  private compensationCallback?: CompensationCallback

  constructor(compensationCallback?: CompensationCallback) {
    this.compensationCallback = compensationCallback
  }

  async execute(chain: FallbackChainConfig, executor: FallbackExecutor, context?: Record<string, unknown>): Promise<FallbackResult> {
    const allTargets = [chain.primary, ...chain.fallbacks.map(f => f.targetId)]
    let attempts = 0
    const results: FallbackResult['results'] = []
    let fallbackUsed = false

    for (const targetId of allTargets) {
      if (attempts >= chain.maxAttempts) break
      attempts++

      try {
        const result = await executor(targetId)
        results.push({ targetId, success: true, result })
        return { success: true, targetId, attempts, results, fallbackUsed, compensated: false }
      } catch (err) {
        results.push({ targetId, success: false, error: String(err) })
        fallbackUsed = true
      }
    }

    // All failed - try compensation
    let compensated = false
    if (this.compensationCallback) {
      compensated = await this.compensationCallback(context)
    }

    return { success: false, targetId: chain.primary, attempts, results, fallbackUsed, compensated }
  }
}

export class RoutingFallbackBuilder {
  static buildFromCandidates(candidates: Array<{ deptId: string; score: number }>): FallbackChainConfig {
    if (candidates.length === 0) throw new Error('No candidates provided')
    const sorted = [...candidates].sort((a, b) => b.score - a.score)
    return {
      primary: sorted[0].deptId,
      fallbacks: sorted.slice(1).map(c => ({
        targetId: c.deptId,
        reason: `score: ${c.score}`,
        confidence: c.score,
      })),
      strategy: 'sequential',
      maxAttempts: 3,
    }
  }
}
```

- [ ] **Step 4: Write test and verify**

```typescript
// src/modules/__tests__/fallbackChain.test.ts
import { describe, it, expect } from 'vitest'
import { FallbackChainRunner, RoutingFallbackBuilder, type FallbackChainConfig } from '../fallbackChain'

describe('FallbackChainRunner', () => {
  it('should succeed on primary target', async () => {
    const runner = new FallbackChainRunner()
    const chain: FallbackChainConfig = {
      primary: 'A', fallbacks: [{ targetId: 'B', reason: 'backup', confidence: 0.5 }],
      strategy: 'sequential', maxAttempts: 3,
    }
    const result = await runner.execute(chain, async () => 'ok')
    expect(result.success).toBe(true)
    expect(result.targetId).toBe('A')
    expect(result.fallbackUsed).toBe(false)
  })

  it('should fallback on primary failure', async () => {
    const runner = new FallbackChainRunner()
    const chain: FallbackChainConfig = {
      primary: 'A', fallbacks: [{ targetId: 'B', reason: 'backup', confidence: 0.5 }],
      strategy: 'sequential', maxAttempts: 3,
    }
    let callCount = 0
    const result = await runner.execute(chain, async (id) => {
      callCount++
      if (id === 'A') throw new Error('fail')
      return 'ok'
    })
    expect(result.success).toBe(true)
    expect(result.targetId).toBe('B')
    expect(result.fallbackUsed).toBe(true)
  })

  it('should call compensation on all failures', async () => {
    let compensated = false
    const runner = new FallbackChainRunner(async () => { compensated = true; return true })
    const chain: FallbackChainConfig = {
      primary: 'A', fallbacks: [],
      strategy: 'sequential', maxAttempts: 1,
    }
    const result = await runner.execute(chain, async () => { throw new Error('fail') })
    expect(result.success).toBe(false)
    expect(compensated).toBe(true)
  })

  it('RoutingFallbackBuilder should build from candidates', () => {
    const chain = RoutingFallbackBuilder.buildFromCandidates([
      { deptId: 'A', score: 0.9 },
      { deptId: 'B', score: 0.7 },
      { deptId: 'C', score: 0.5 },
    ])
    expect(chain.primary).toBe('A')
    expect(chain.fallbacks).toHaveLength(2)
  })
})
```

- [ ] **Step 5-6: Export and commit**

---

## 批次 P2: 增强缺失 (影响协作能力)

### Task 10: Agent 池管理 (`agentPool.ts`)

**Files:**
- Create: `src/modules/agentPool.ts`
- Create: `src/modules/__tests__/agentPool.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1-3: Implementation**

```typescript
// src/modules/agentPool.ts
export interface AgentPoolConfig {
  role: string
  maxInstances: number
  provider?: string
  model?: string
  apiKey?: string
}

export interface PoolAgentInstance {
  instanceId: string
  role: string
  status: 'healthy' | 'unhealthy' | 'idle'
  useCount: number
  errorCount: number
  lastUsed: number
  provider?: string
  model?: string
}

export class AgentPool {
  private pools = new Map<string, PoolAgentInstance[]>()
  private roundRobinIndex = new Map<string, number>()
  private idCounter = 0

  createTeam(template: AgentPoolConfig[]): void {
    for (const config of template) {
      const instances: PoolAgentInstance[] = []
      for (let i = 0; i < config.maxInstances; i++) {
        instances.push({
          instanceId: `${config.role}_${++this.idCounter}`,
          role: config.role,
          status: 'healthy',
          useCount: 0,
          errorCount: 0,
          lastUsed: 0,
          provider: config.provider,
          model: config.model,
        })
      }
      this.pools.set(config.role, instances)
      this.roundRobinIndex.set(config.role, 0)
    }
  }

  getAgentByRole(role: string): PoolAgentInstance | undefined {
    const pool = this.pools.get(role)
    if (!pool || pool.length === 0) return undefined

    const healthy = pool.filter(a => a.status === 'healthy')
    if (healthy.length === 0) return undefined

    const idx = this.roundRobinIndex.get(role) || 0
    const agent = healthy[idx % healthy.length]
    this.roundRobinIndex.set(role, (idx + 1) % healthy.length)
    agent.useCount++
    agent.lastUsed = Date.now()
    return agent
  }

  getAllAgents(): PoolAgentInstance[] {
    return Array.from(this.pools.values()).flat()
  }

  getPoolStatus(): Record<string, { total: number; healthy: number; unhealthy: number }> {
    const status: Record<string, { total: number; healthy: number; unhealthy: number }> = {}
    for (const [role, pool] of this.pools) {
      status[role] = {
        total: pool.length,
        healthy: pool.filter(a => a.status === 'healthy').length,
        unhealthy: pool.filter(a => a.status === 'unhealthy').length,
      }
    }
    return status
  }

  markUnhealthy(instanceId: string): void {
    for (const pool of this.pools.values()) {
      const agent = pool.find(a => a.instanceId === instanceId)
      if (agent) {
        agent.status = 'unhealthy'
        agent.errorCount++
        return
      }
    }
  }

  scaleUp(role: string, count = 1): void {
    const pool = this.pools.get(role)
    if (!pool) return
    for (let i = 0; i < count; i++) {
      pool.push({
        instanceId: `${role}_${++this.idCounter}`,
        role,
        status: 'healthy',
        useCount: 0,
        errorCount: 0,
        lastUsed: 0,
      })
    }
  }

  scaleDown(role: string, count = 1): void {
    const pool = this.pools.get(role)
    if (!pool) return
    for (let i = 0; i < count && pool.length > 1; i++) {
      pool.pop()
    }
  }

  clear(): void {
    this.pools.clear()
    this.roundRobinIndex.clear()
  }
}
```

- [ ] **Step 4: Write test and verify**

```typescript
// src/modules/__tests__/agentPool.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AgentPool } from '../agentPool'

describe('AgentPool', () => {
  let pool: AgentPool

  beforeEach(() => { pool = new AgentPool() })

  it('should create team from template', () => {
    pool.createTeam([
      { role: 'executor', maxInstances: 2 },
      { role: 'reviewer', maxInstances: 1 },
    ])
    expect(pool.getAllAgents()).toHaveLength(3)
  })

  it('should get agent by role with round-robin', () => {
    pool.createTeam([{ role: 'executor', maxInstances: 2 }])
    const a1 = pool.getAgentByRole('executor')
    const a2 = pool.getAgentByRole('executor')
    expect(a1?.instanceId).not.toBe(a2?.instanceId)
  })

  it('should mark agent unhealthy', () => {
    pool.createTeam([{ role: 'executor', maxInstances: 1 }])
    const agent = pool.getAgentByRole('executor')!
    pool.markUnhealthy(agent.instanceId)
    expect(pool.getAgentByRole('executor')).toBeUndefined()
  })

  it('should scale up and down', () => {
    pool.createTeam([{ role: 'executor', maxInstances: 1 }])
    pool.scaleUp('executor', 2)
    expect(pool.getAllAgents()).toHaveLength(3)
    pool.scaleDown('executor', 1)
    expect(pool.getAllAgents()).toHaveLength(2)
  })
})
```

- [ ] **Step 5-6: Export and commit**

---

### Task 11: 死信队列 (`deadLetterQueue.ts`)

**Files:**
- Create: `src/modules/deadLetterQueue.ts`
- Create: `src/modules/__tests__/deadLetterQueue.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1-3: Implementation**

```typescript
// src/modules/deadLetterQueue.ts
export interface DeadLetterMessage {
  messageId: string
  topic: string
  payload: unknown
  error: string
  retryCount: number
  maxRetries: number
  timestamp: string
}

export class DeadLetterQueue {
  private queue: DeadLetterMessage[] = []
  private threshold = 10
  private onThresholdExceeded?: (count: number) => void

  setThreshold(threshold: number): void {
    this.threshold = threshold
  }

  setOnThresholdExceeded(callback: (count: number) => void): void {
    this.onThresholdExceeded = callback
  }

  enqueue(message: DeadLetterMessage): void {
    this.queue.push(message)
    if (this.queue.length > this.threshold && this.onThresholdExceeded) {
      this.onThresholdExceeded(this.queue.length)
    }
  }

  dequeue(): DeadLetterMessage | undefined {
    return this.queue.shift()
  }

  peek(): DeadLetterMessage | undefined {
    return this.queue[0]
  }

  size(): number {
    return this.queue.length
  }

  getAll(): DeadLetterMessage[] {
    return [...this.queue]
  }

  clear(): void {
    this.queue = []
  }
}
```

- [ ] **Step 4: Write test and verify**

```typescript
// src/modules/__tests__/deadLetterQueue.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { DeadLetterQueue, type DeadLetterMessage } from '../deadLetterQueue'

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue
  const makeMsg = (id: string): DeadLetterMessage => ({
    messageId: id, topic: 'test', payload: {}, error: 'fail',
    retryCount: 3, maxRetries: 3, timestamp: new Date().toISOString(),
  })

  beforeEach(() => { dlq = new DeadLetterQueue() })

  it('should enqueue and dequeue', () => {
    dlq.enqueue(makeMsg('1'))
    expect(dlq.size()).toBe(1)
    expect(dlq.dequeue()?.messageId).toBe('1')
    expect(dlq.size()).toBe(0)
  })

  it('should peek without removing', () => {
    dlq.enqueue(makeMsg('1'))
    expect(dlq.peek()?.messageId).toBe('1')
    expect(dlq.size()).toBe(1)
  })

  it('should alert on threshold exceeded', () => {
    let alerted = false
    dlq.setThreshold(2)
    dlq.setOnThresholdExceeded(() => { alerted = true })
    dlq.enqueue(makeMsg('1'))
    dlq.enqueue(makeMsg('2'))
    dlq.enqueue(makeMsg('3'))
    expect(alerted).toBe(true)
  })
})
```

- [ ] **Step 5-6: Export and commit**

---

## 批次 P3: 低优先级

### Task 12: 消息队列 (`messageQueue.ts`)

**Files:**
- Create: `src/modules/messageQueue.ts`
- Create: `src/modules/__tests__/messageQueue.test.ts`
- Modify: `src/modules/index.ts`

- [ ] **Step 1-3: Implementation**

```typescript
// src/modules/messageQueue.ts
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
}

export enum MessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export interface QueueMessage {
  messageId: string
  topic: string
  payload: unknown
  priority: MessagePriority
  status: MessageStatus
  retryCount: number
  maxRetries: number
  createdAt: string
}

type MessageHandler = (message: QueueMessage) => Promise<void>

export class MessageQueue {
  private queues = new Map<string, QueueMessage[]>()
  private subscribers = new Map<string, MessageHandler[]>()
  private idCounter = 0

  publish(topic: string, payload: unknown, priority = MessagePriority.NORMAL, maxRetries = 3): QueueMessage {
    const message: QueueMessage = {
      messageId: `msg_${++this.idCounter}`,
      topic,
      payload,
      priority,
      status: MessageStatus.PENDING,
      retryCount: 0,
      maxRetries,
      createdAt: new Date().toISOString(),
    }
    if (!this.queues.has(topic)) this.queues.set(topic, [])
    this.queues.get(topic)!.push(message)
    this.sortQueue(topic)
    return message
  }

  subscribe(topic: string, handler: MessageHandler): void {
    if (!this.subscribers.has(topic)) this.subscribers.set(topic, [])
    this.subscribers.get(topic)!.push(handler)
  }

  async consume(topic: string): Promise<QueueMessage | undefined> {
    const queue = this.queues.get(topic)
    if (!queue || queue.length === 0) return undefined
    const message = queue.shift()!
    message.status = MessageStatus.PROCESSING
    const handlers = this.subscribers.get(topic) || []
    try {
      for (const handler of handlers) {
        await handler(message)
      }
      message.status = MessageStatus.COMPLETED
    } catch {
      message.retryCount++
      if (message.retryCount >= message.maxRetries) {
        message.status = MessageStatus.DEAD_LETTER
      } else {
        message.status = MessageStatus.FAILED
        queue.push(message)
        this.sortQueue(topic)
      }
    }
    return message
  }

  getQueueSize(topic?: string): number {
    if (topic) return this.queues.get(topic)?.length ?? 0
    let total = 0
    for (const q of this.queues.values()) total += q.length
    return total
  }

  clearQueue(topic?: string): void {
    if (topic) {
      this.queues.set(topic, [])
    } else {
      this.queues.clear()
    }
  }

  private sortQueue(topic: string): void {
    const queue = this.queues.get(topic)
    if (queue) queue.sort((a, b) => b.priority - a.priority)
  }
}
```

- [ ] **Step 4: Write test and verify**

```typescript
// src/modules/__tests__/messageQueue.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { MessageQueue, MessagePriority, MessageStatus } from '../messageQueue'

describe('MessageQueue', () => {
  let mq: MessageQueue

  beforeEach(() => { mq = new MessageQueue() })

  it('should publish and consume messages', async () => {
    mq.publish('test', { data: 1 })
    const msg = await mq.consume('test')
    expect(msg?.payload).toEqual({ data: 1 })
    expect(msg?.status).toBe(MessageStatus.COMPLETED)
  })

  it('should order by priority', async () => {
    mq.publish('test', 'low', MessagePriority.LOW)
    mq.publish('test', 'urgent', MessagePriority.URGENT)
    mq.publish('test', 'normal', MessagePriority.NORMAL)
    const msg = await mq.consume('test')
    expect(msg?.payload).toBe('urgent')
  })

  it('should retry on failure', async () => {
    mq.publish('test', 'data', MessagePriority.NORMAL, 2)
    let calls = 0
    mq.subscribe('test', async () => {
      calls++
      if (calls < 2) throw new Error('fail')
    })
    const msg = await mq.consume('test')
    expect(msg?.status).toBe(MessageStatus.COMPLETED)
  })

  it('should dead letter after max retries', async () => {
    mq.publish('test', 'data', MessagePriority.NORMAL, 1)
    mq.subscribe('test', async () => { throw new Error('fail') })
    const msg = await mq.consume('test')
    expect(msg?.status).toBe(MessageStatus.DEAD_LETTER)
  })
})
```

- [ ] **Step 5-6: Export and commit**

---

### Task 13: 更新 index.ts 导出所有新模块

**Files:**
- Modify: `src/modules/index.ts`

- [ ] **Step 1: Add all new exports**

Add exports for all new modules created in Tasks 1-12.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run src/modules/__tests__/`
Expected: ALL PASS

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

---

## 迁移完成度检查表

| 批次 | 模块 | 状态 |
|------|------|------|
| P0 | LLM 缓存 (Task 1) | - [ ] |
| P0 | 复杂度分类器 (Task 2) | - [ ] |
| P0 | 工作流引擎本地版 (Task 3) | - [ ] |
| P0 | 项目管理器 (Task 4) | - [ ] |
| P1 | EARS 校验器 (Task 5) | - [ ] |
| P1 | SpecTree 校验器 (Task 6) | - [ ] |
| P1 | 证据链 (Task 7) | - [ ] |
| P1 | 门禁管理器 (Task 8) | - [ ] |
| P1 | 回退链 (Task 9) | - [ ] |
| P2 | Agent 池管理 (Task 10) | - [ ] |
| P2 | 死信队列 (Task 11) | - [ ] |
| P3 | 消息队列 (Task 12) | - [ ] |
| P3 | 导出更新 (Task 13) | - [ ] |
