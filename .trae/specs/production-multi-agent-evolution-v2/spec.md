# 多智能体协作系统生产级进化 V2 — 补强迭代 Spec

## Why
`production-multi-agent-evolution` 已完成核心功能实现，但代码审查发现若干设计缺口：状态机缺少超时与持久化、审批缺少 SLA 升级、补偿链缺少深度限制、Trace Context 未对齐 W3C 标准、性能阈值硬编码未暴露配置。本轮迭代旨在补齐这些工程细节，使系统达到真正的生产就绪状态。

## What Changes
- **议程状态机增强**：为每个状态添加超时配置，支持状态持久化/恢复，新增 `state_timeout` 事件
- **审批 SLA 与升级**：审批超时后自动执行升级策略（拒绝/转人工/自动批准），支持审批优先级动态调整
- **补偿链深度保护**：为补偿执行添加最大递归深度限制，补偿失败时的降级策略
- **W3C Trace Context 对齐**：TraceContext 采用 `traceparent`/`tracestate` 格式，支持跨进程传播
- **可配置阈值系统**：将 DLQ 阈值、速率限制、令牌超时等硬编码值抽取为统一配置 schema
- **指标收集器**：实现独立的 MetricsCollector，持续采集对话轮次、任务时长、处理延迟等指标
- **状态机序列化**：支持议程状态的快照与恢复，用于会议中断后恢复

## Impact
- Affected specs: production-multi-agent-evolution
- Affected code:
  - 修改: `src/modules/agendaStateMachine.ts`, `src/modules/approvalQueue.ts`, `src/modules/compensationEngine.ts`, `src/modules/traceContext.ts`, `src/modules/communicationBus.ts`, `src/modules/permissionManager.ts`
  - 新增: `src/modules/metricsCollector.ts`, `src/modules/configSchema.ts`

---

## ADDED Requirements

### Requirement: 议程状态超时管理
系统 SHALL 为议程状态机的每个状态提供可配置的超时时间，超时后自动触发状态转换或告警。

#### Scenario: 讨论状态超时
- **WHEN** 议程处于 `DISCUSSION` 状态且超过配置的超时时间（默认 10 分钟）无新消息
- **THEN** 系统发出 `state_timeout` 事件，Coordinator 可选择推进到 `PROPOSAL` 或延长讨论

#### Scenario: 投票状态超时
- **WHEN** 议程处于 `VOTING` 状态且超过配置的超时时间（默认 3 分钟）未收到所有投票
- **THEN** 系统自动计算已有投票结果并推进，未投票 Agent 计为弃权

#### Scenario: 紧急状态超时
- **WHEN** 议程处于 `EMERGENCY` 状态且超过配置的超时时间（默认 5 分钟）
- **THEN** 系统自动升级为人工介入请求，暂停议程等待人工裁决

---

### Requirement: 议程状态持久化
系统 SHALL 支持议程状态的序列化与反序列化，用于会议中断后恢复。

#### Scenario: 状态快照保存
- **WHEN** 议程状态发生转换或每 N 分钟（可配置）
- **THEN** 系统自动保存当前状态快照（阶段、令牌队列、事件历史）

#### Scenario: 状态恢复
- **WHEN** 会议因网络中断或服务重启后重新连接
- **THEN** 系统从最近的快照恢复议程状态，继续执行而非重新开始

---

### Requirement: 审批 SLA 与升级策略
系统 SHALL 为审批请求定义 SLA 超时和升级策略，替代简单的过期丢弃。

#### Scenario: 审批超时升级
- **WHEN** 审批请求在 SLA 时间内（默认 5 分钟）未被处理
- **THEN** 系统根据配置的升级策略执行：`reject`（自动拒绝）、`escalate`（升级到更高权限人）、`auto_approve`（低风险操作自动批准）

#### Scenario: 审批优先级动态调整
- **WHEN** 审批请求在队列中等待超过阈值时间
- **THEN** 系统自动提升该请求的优先级，确保高优先级请求优先处理

#### Scenario: 审批批量处理
- **WHEN** 存在多个低风险审批请求
- **THEN** 前端支持批量审批操作，一次性批准或拒绝多个请求

---

### Requirement: 补偿链深度保护
系统 SHALL 为补偿执行添加递归深度限制和失败降级策略。

#### Scenario: 补偿链深度限制
- **WHEN** 补偿动作触发级联补偿且递归深度超过配置上限（默认 5 层）
- **THEN** 系统停止递归，记录警告日志，通知 Monitor Agent 评估影响

#### Scenario: 补偿动作失败降级
- **WHEN** 补偿动作执行失败
- **THEN** 系统执行降级策略：记录失败、标记任务为 `compensation_failed`、触发人工介入请求

#### Scenario: 补偿超时保护
- **WHEN** 单个补偿动作执行时间超过配置上限（默认 30 秒）
- **THEN** 系统强制终止补偿动作，记录超时事件，执行降级策略

---

### Requirement: W3C Trace Context 对齐
系统 SHALL 采用 W3C Trace Context 标准格式，支持跨进程传播。

#### Scenario: traceparent 格式注入
- **WHEN** 消息从 Planner 发送到 Executor
- **THEN** 消息头携带 `traceparent` 字段，格式为 `{version}-{traceId}-{spanId}-{flags}`

#### Scenario: tracestate 传播
- **WHEN** 消息经过多个 Agent 转发
- **THEN** `tracestate` 字段保留上游服务的追踪信息，支持多厂商追踪系统互操作

#### Scenario: 跨进程追踪
- **WHEN** 消息从前端 WebSocket 发送到后端 Python 服务
- **THEN** 前端自动注入 traceparent，后端解析并继续传播，实现端到端追踪

---

### Requirement: 可配置阈值系统
系统 SHALL 提供统一的配置 schema，将硬编码的阈值和参数抽取为可配置项。

#### Scenario: 配置加载
- **WHEN** 系统启动时
- **THEN** 从配置文件或环境变量加载阈值配置，未配置项使用默认值

#### Scenario: 运行时配置更新
- **WHEN** 管理员通过干预控制台修改配置
- **THEN** 配置变更实时生效，无需重启服务

#### Scenario: 配置验证
- **WHEN** 配置值超出合法范围
- **THEN** 系统拒绝该配置并记录警告，使用上一次合法值

---

### Requirement: 指标收集与导出
系统 SHALL 提供独立的指标收集器，持续采集协作过程的关键指标。

#### Scenario: 指标采集
- **WHEN** 协作过程进行中
- **THEN** 系统持续采集：对话轮次、任务完成时长、Agent 消息处理延迟、共识达成时间、错误率、审批等待时长

#### Scenario: 指标导出
- **WHEN** 外部监控系统请求指标数据
- **THEN** 系统以 Prometheus 格式导出指标，支持 `/metrics` 端点

#### Scenario: 指标告警
- **WHEN** 某项指标超过配置的阈值
- **THEN** 系统触发告警通知（通过 WebSocket 推送到前端）

---

## MODIFIED Requirements

### Requirement: 议程状态机
现有 `AgendaStateMachine` SHALL 增强：
- 为每个状态添加可配置的超时时间
- 新增 `state_timeout` 事件类型
- 支持 `serialize()`/`deserialize()` 方法用于状态持久化
- 新增 `getRemainingTime()` 方法返回当前状态剩余时间

### Requirement: 审批队列
现有 `ApprovalQueue` SHALL 增强：
- 审批超时后执行升级策略（替代简单的过期标记）
- 支持审批优先级动态调整
- 新增 `batchApprove()`/`batchReject()` 批量操作方法
- 新增 `getAverageWaitTime()` 方法返回平均等待时长

### Requirement: 补偿引擎
现有 `CompensationEngine` SHALL 增强：
- 新增 `maxDepth` 配置项限制补偿链递归深度
- 新增 `compensationTimeoutMs` 配置项限制单个补偿动作超时
- 补偿失败时触发降级策略（标记任务状态、触发人工介入）
- 新增 `getCompensationStats()` 方法返回补偿统计

### Requirement: TraceContext 管理器
现有 `TraceContextManager` SHALL 增强：
- 采用 W3C `traceparent` 格式：`{version}-{traceId}-{spanId}-{flags}`
- 新增 `inject(headers)`/`extract(headers)` 方法支持跨进程传播
- 新增 `tracestate` 支持多厂商追踪系统互操作
- 新增 `getTraceparent()`/`getTracestate()` 便捷方法

### Requirement: CommunicationBus
现有 `CommunicationBus` SHALL 增强：
- 所有阈值参数（DLQ 阈值、去重 TTL、重试次数）从硬编码改为可配置
- 新增 `updateConfig()` 方法支持运行时配置更新
- 配置变更时自动验证合法性

### Requirement: PermissionManager
现有 `PermissionManager` SHALL 增强：
- 速率限制参数从硬编码改为可配置
- 新增 `getRateLimitStatus()` 方法返回当前速率限制状态
- 支持按 Agent 动态调整速率限制

---

## REMOVED Requirements
无移除需求。所有现有功能保持兼容。

---

## 配置 Schema 定义

```typescript
interface CollaborationConfig {
  agenda: {
    stateTimeouts: {
      idle: number           // 默认: 0 (无超时)
      open_topic: number     // 默认: 300000 (5分钟)
      discussion: number     // 默认: 600000 (10分钟)
      proposal: number       // 默认: 120000 (2分钟)
      voting: number         // 默认: 180000 (3分钟)
      emergency: number      // 默认: 300000 (5分钟)
    }
    tokenDuration: number    // 默认: 60000 (1分钟)
    snapshotInterval: number // 默认: 300000 (5分钟)
  }
  approval: {
    defaultTimeoutMs: number      // 默认: 300000 (5分钟)
    escalationStrategy: 'reject' | 'escalate' | 'auto_approve'
    priorityEscalationThreshold: number // 默认: 120000 (2分钟)
    maxBatchSize: number          // 默认: 10
  }
  compensation: {
    maxDepth: number              // 默认: 5
    timeoutMs: number             // 默认: 30000 (30秒)
    onFailure: 'abort' | 'skip' | 'manual'
  }
  communication: {
    dlqThreshold: number          // 默认: 10
    dedupTtlMs: number            // 默认: 300000 (5分钟)
    maxRetries: number            // 默认: 3
    retryDelayMs: number          // 默认: 1000
  }
  security: {
    rateLimits: Array<{
      capability: string
      maxOperations: number
      windowMs: number
    }>
  }
  tracing: {
    enabled: boolean              // 默认: true
    propagationFormat: 'w3c' | 'custom'
    sampleRate: number            // 默认: 1.0 (100%)
  }
  metrics: {
    enabled: boolean              // 默认: true
    exportFormat: 'prometheus' | 'json'
    exportInterval: number        // 默认: 15000 (15秒)
  }
}
```
