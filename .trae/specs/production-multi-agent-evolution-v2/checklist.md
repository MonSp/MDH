# Checklist

## Phase 1: 配置基础设施

- [x] **C1**: `src/modules/configSchema.ts` 定义了完整的 `CollaborationConfig` 接口，包含所有子配置（agenda、approval、compensation、communication、security、tracing、metrics）
- [x] **C2**: `ConfigManager` 类能加载配置、验证合法性（类型检查、范围检查）、运行时更新并通知监听器
- [x] **C3**: `CommunicationBus` 的 `dlqThreshold` 和 `DEDUP_TTL_MS` 从 `ConfigManager` 读取，不再硬编码
- [x] **C4**: `PermissionManager` 的 `rateLimit` 配置从 `ConfigManager` 读取，支持运行时更新
- [x] **C5**: 配置值超出合法范围时，系统拒绝并记录警告，使用上一次合法值

## Phase 2: 议程状态机增强

- [x] **C6**: `AgendaStateMachine` 构造函数接受 `stateTimeouts` 配置，各状态超时时间可独立配置
- [x] **C7**: `AgendaEvent` 类型包含 `state_timeout` 事件，超时后正确触发该事件
- [x] **C8**: `getRemainingTime()` 返回当前状态剩余毫秒数，精度误差 < 1 秒
- [x] **C9**: `resetTimer()` 在收到新消息时重置超时计时器
- [x] **C10**: `serialize()` 返回完整的状态快照 JSON，包含阶段、令牌、队列、历史、主题
- [x] **C11**: `deserialize(snapshot)` 能从快照恢复状态机，恢复后状态与序列化前一致

## Phase 3: 审批 SLA 增强

- [x] **C12**: 审批超时后根据 `escalationStrategy` 执行：`reject` 自动拒绝、`escalate` 提升优先级、`auto_approve` 低风险自动批准
- [x] **C13**: `escalateRequest()` 正确将请求从当前队列移除并以更高优先级重新插入
- [x] **C14**: `batchApprove(requestIds)` 能一次性批准多个请求，返回成功/失败列表
- [x] **C15**: `batchReject(requestIds)` 能一次性拒绝多个请求，返回成功/失败列表
- [x] **C16**: `getAverageWaitTime()` 返回已处理请求的平均等待时长（毫秒）
- [x] **C17**: 等待超过 `priorityEscalationThreshold` 的请求自动提升优先级

## Phase 4: 补偿链保护

- [x] **C18**: `CompensationEngine` 构造函数接受 `maxDepth` 和 `timeoutMs` 配置
- [x] **C19**: `executeCompensation()` 在递归深度超过 `maxDepth` 时停止递归，记录警告日志
- [x] **C20**: 单个补偿动作执行超过 `timeoutMs` 时强制终止，返回超时失败结果
- [x] **C21**: 补偿失败时 `CompensationResult.success` 为 `false`，`details` 包含失败原因
- [x] **C22**: `getCompensationStats()` 返回正确的统计数据：总次数、成功/失败次数、平均耗时

## Phase 5: W3C Trace Context 对齐

- [x] **C23**: traceId 为 32 位十六进制字符串，spanId 为 16 位十六进制字符串
- [x] **C24**: `getTraceparent()` 返回格式为 `{version}-{traceId}-{spanId}-{flags}` 的字符串
- [x] **C25**: `getTracestate()` 返回格式正确的 tracestate 键值对字符串
- [x] **C26**: `inject(headers)` 将 traceparent 和 tracestate 注入到请求头对象
- [x] **C27**: `extract(headers)` 能正确解析 traceparent 和 tracestate，返回 TraceSpan
- [x] **C28**: `setSampled(true/false)` 正确设置 flags 字段的采样标志位（0x01 或 0x00）

## Phase 6: 指标收集器

- [x] **C29**: `MetricsCollector` 支持三种指标类型：Counter（累计计数）、Gauge（瞬时值）、Histogram（分布统计）
- [x] **C30**: 内置指标 `conversation_rounds`、`task_duration_ms`、`message_processing_latency_ms`、`consensus_time_ms`、`error_count`、`approval_wait_time_ms` 正确采集
- [x] **C31**: `exportPrometheus()` 输出符合 Prometheus 文本格式的指标数据
- [x] **C32**: `exportJSON()` 输出 JSON 格式的指标数据
- [x] **C33**: 指标值超过配置阈值时触发告警回调

## 整体集成

- [x] **C34**: 所有修改与现有 `production-multi-agent-evolution` 功能向后兼容
- [x] **C35**: `ConfigManager` 变更通知能正确触发各模块的配置更新
- [x] **C36**: 项目构建成功（`npm run build` 无新增错误）
