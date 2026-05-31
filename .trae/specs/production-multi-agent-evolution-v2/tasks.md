# Tasks

## Phase 1: 配置基础设施

### Task 1: 创建统一配置 Schema
- [x] 1.1 创建 `src/modules/configSchema.ts`，定义 `CollaborationConfig` 接口及默认值
- [x] 1.2 实现 `ConfigManager` 类：加载配置、验证合法性、运行时更新、变更通知
- [x] 1.3 为 `CommunicationBus` 添加 `updateConfig(config)` 方法，将硬编码的 `dlqThreshold`、`DEDUP_TTL_MS` 改为从配置读取
- [x] 1.4 为 `PermissionManager` 添加配置支持，将 `DEFAULT_POLICY.rateLimit` 改为从配置读取

---

## Phase 2: 议程状态机增强

### Task 2: 议程状态超时管理
- [x] 2.1 修改 `src/modules/agendaStateMachine.ts`，为 `AgendaStateMachine` 构造函数添加 `stateTimeouts` 配置参数
- [x] 2.2 新增 `state_timeout` 事件类型到 `AgendaEvent` 联合类型
- [x] 2.3 实现状态超时检测：在 `getPhase()` 中检查当前状态是否超时，超时则发出 `state_timeout` 事件
- [x] 2.4 新增 `getRemainingTime()` 方法，返回当前状态剩余毫秒数
- [x] 2.5 新增 `resetTimer()` 方法，重置当前状态的超时计时器（用于收到新消息时）

### Task 3: 议程状态持久化
- [x] 3.1 为 `AgendaStateMachine` 添加 `serialize()` 方法，返回 JSON 序列化的状态快照
- [x] 3.2 添加静态 `deserialize(snapshot)` 方法，从快照恢复状态机实例
- [x] 3.3 快照包含：当前阶段、当前令牌、令牌队列、事件历史、主题、各状态剩余时间

---

## Phase 3: 审批 SLA 增强

### Task 4: 审批升级策略
- [x] 4.1 修改 `src/modules/approvalQueue.ts`，将 `expiresAt` 过期逻辑改为升级策略执行
- [x] 4.2 新增 `escalationStrategy` 配置：`'reject' | 'escalate' | 'auto_approve'`
- [x] 4.3 实现 `escalateRequest()` 方法：将请求提升到更高优先级队列
- [x] 4.4 修改 `startAutoExpiryCheck()` 中的过期处理：根据策略执行拒绝/升级/自动批准

### Task 5: 审批批量操作与统计
- [x] 5.1 新增 `batchApprove(requestIds: string[])` 方法
- [x] 5.2 新增 `batchReject(requestIds: string[])` 方法
- [x] 5.3 新增 `getAverageWaitTime()` 方法，计算已处理请求的平均等待时长
- [x] 5.4 实现优先级动态调整：等待超过阈值时间的请求自动提升优先级

---

## Phase 4: 补偿链保护

### Task 6: 补偿深度限制与超时
- [x] 6.1 修改 `src/modules/compensationEngine.ts`，构造函数添加 `maxDepth` 和 `timeoutMs` 配置
- [x] 6.2 修改 `executeCompensation()` 方法，添加深度参数，超过 maxDepth 则停止递归
- [x] 6.3 实现补偿超时保护：使用 Promise.race 包装补偿执行，超时则强制终止
- [x] 6.4 补偿失败时执行降级策略：记录失败事件、返回 `CompensationResult` 标记失败原因
- [x] 6.5 新增 `getCompensationStats()` 方法，返回：总补偿次数、成功/失败次数、平均耗时

---

## Phase 5: W3C Trace Context 对齐

### Task 7: TraceContext W3C 格式
- [x] 7.1 修改 `src/modules/traceContext.ts`，将 traceId 格式改为 32 位十六进制，spanId 改为 16 位十六进制
- [x] 7.2 新增 `getTraceparent()` 方法，返回 `{version}-{traceId}-{spanId}-{flags}` 格式字符串
- [x] 7.3 新增 `getTracestate()` 方法，返回 tracestate 键值对字符串
- [x] 7.4 新增静态 `inject(headers: Record<string, string>)` 方法，将当前上下文注入到请求头
- [x] 7.5 新增静态 `extract(headers: Record<string, string>)` 方法，从请求头解析追踪上下文
- [x] 7.6 新增 `setSampled(sampled: boolean)` 方法，控制 flags 字段的采样标志位

---

## Phase 6: 指标收集器

### Task 8: 实现 MetricsCollector
- [x] 8.1 创建 `src/modules/metricsCollector.ts`，定义指标类型：Counter、Gauge、Histogram
- [x] 8.2 实现内置指标采集：`conversation_rounds`、`task_duration_ms`、`message_processing_latency_ms`、`consensus_time_ms`、`error_count`、`approval_wait_time_ms`
- [x] 8.3 实现 `recordCounter(name, value)`、`recordGauge(name, value)`、`recordHistogram(name, value)` 方法
- [x] 8.4 实现 `exportPrometheus()` 方法，返回 Prometheus 文本格式的指标数据
- [x] 8.5 实现 `exportJSON()` 方法，返回 JSON 格式的指标数据
- [x] 8.6 实现指标告警：当指标值超过配置阈值时触发回调通知

---

## Task Dependencies

- Task 1 可立即开始，无依赖（配置是所有后续任务的基础）
- Task 2 依赖 Task 1（状态超时需要配置支持）
- Task 3 依赖 Task 2（持久化需要超时信息）
- Task 4 依赖 Task 1（审批升级需要配置支持）
- Task 5 依赖 Task 4（批量操作基于升级策略）
- Task 6 依赖 Task 1（补偿配置需要统一配置）
- Task 7 可与 Task 1 并行（Trace Context 改造独立于配置）
- Task 8 依赖 Task 1（指标收集需要配置阈值）

### 可并行执行的任务组
- **并行组 A**: Task 1（配置 Schema）
- **并行组 B**: Task 7（W3C Trace Context，独立于配置）
- **串行链**: Task 1 → Task 2 → Task 3
- **串行链**: Task 1 → Task 4 → Task 5
- **串行链**: Task 1 → Task 6
- **串行链**: Task 1 → Task 8
