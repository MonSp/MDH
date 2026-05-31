# Tasks

## Phase 1: 基础设施层 — 可靠通信与可观测性

### Task 1: 扩展协议类型定义
- [x] 1.1 在 `backend/protocol.py` 中新增消息类型枚举值：`agenda_update`, `proposal`, `vote`, `vote_result`, `critical_blocker`, `human_approval_request`, `human_approval_response`, `checkpoint_save`, `checkpoint_restore`, `audit_log`
- [x] 1.2 在 `backend/protocol.py` 中新增数据模型：`AgendaState`(议程状态), `Proposal`(提案), `Vote`(投票), `ApprovalRequest`(审批请求), `Checkpoint`(检查点), `AuditEntry`(审计条目), `TraceContext`(追踪上下文)
- [x] 1.3 在 `src/modules/meetingProtocol.ts` 中同步新增对应的 TypeScript 接口和类型
- [x] 1.4 在 `src/modules/communicationProtocol.ts` 中为 `MessageEnvelope` 添加 `traceId`, `spanId`, `sequenceNo`, `causalMessageId` 字段

### Task 2: 实现结构化日志与追踪模块
- [x] 2.1 创建 `src/modules/traceContext.ts`，实现 TraceContext 管理：生成 traceId/spanId、注入到消息、传播因果链
- [x] 2.2 创建 `src/modules/structuredLogger.ts`，实现结构化日志记录器：按 agentId/sessionId/messageType 过滤，支持日志级别、输出到内存环形缓冲区（可配置上限）
- [x] 2.3 在后端创建 `backend/trace.py`，实现轻量级追踪上下文：traceId 生成、span 管理、日志结构化输出
- [x] 2.4 在 `CollaborationVisualizer.tsx` 中新增"追踪链路"标签页，展示消息的因果关系图

### Task 3: 增强 CommunicationBus 消息可靠性
- [x] 3.1 在 `src/modules/communicationBus.ts` 中实现消息 ACK 机制：发送后等待确认，超时自动重试
- [x] 3.2 实现消息 ID 幂等去重：维护已处理消息 ID 集合（带 TTL 过期清理）
- [x] 3.3 实现消息序列号：每个通道维护递增序列号，接收端检测并报告乱序/缺失
- [x] 3.4 实现死信队列阈值告警：当 DLQ 长度超过可配置阈值时触发回调通知
- [x] 3.5 修复 `sortHandlersByPriority` 中的排序 bug（a 和 b 使用了同一个 messagePriority 值）

### Task 4: 增强 WebSocket 连接可靠性
- [x] 4.1 在 `src/hooks/useMeetingSocket.ts` 中实现 WebSocket 断线自动重连（指数退避，最大重试次数可配置）
- [x] 4.2 暴露连接状态给 UI：`connecting | connected | reconnecting | disconnected`
- [x] 4.3 重连成功后通过序列号检测丢失消息，发送 `request_retransmit` 请求后端补发
- [x] 4.4 在后端 `backend/server.py` 中实现消息缓冲区：为每个会话维护最近 N 条消息的环形缓冲，支持按序列号重传

---

## Phase 2: 协作智能层 — 议程管理与协商引擎

### Task 5: 实现议程状态机
- [x] 5.1 创建 `src/modules/agendaStateMachine.ts`，定义议程状态：`IDLE → OPEN_TOPIC → DISCUSSION → PROPOSAL → VOTING → ACCEPTED/REJECTED → CLOSED`，以及 `EMERGENCY` 紧急状态
- [x] 5.2 实现状态转换规则：定义每个状态的合法转换路径和触发条件
- [x] 5.3 实现令牌管理器：基于内容相关性评分的说话权分配，支持高优先级消息抢占（`CRITICAL_BLOCKER`）
- [x] 5.4 在后端创建 `backend/agenda.py`，实现对应的议程管理逻辑

### Task 6: 实现协商与冲突消解引擎
- [x] 6.1 创建 `src/modules/negotiationEngine.ts`，实现结构化论辩：消息附加立场(stance)、置信度(confidence)、论据引用(argumentRefs)
- [x] 6.2 实现多策略共识协议：简单多数投票、加权投票（基于 Agent 历史表现权重）、基于论证的协商框架
- [x] 6.3 实现决策回溯图（DecisionGraph）：记录每项决策的赞成/反对方、依据、时间戳
- [x] 6.4 在后端创建 `backend/negotiation.py`，实现对应的协商逻辑，供 MeetingCoordinator 调用

### Task 7: 改造 MeetingCoordinator 讨论流程
- [x] 7.1 重构 `backend/meeting_coordinator.py` 的 `run_discussion()` 方法：从固定角色顺序改为议程状态机驱动
- [x] 7.2 实现动态发言调度：根据议程状态、消息优先级、Agent 相关性评分选择下一个发言者
- [x] 7.3 实现紧急中断处理：收到 `CRITICAL_BLOCKER` 消息时暂停当前议程，进入 `EMERGENCY` 状态
- [x] 7.4 集成协商引擎：当出现分歧时自动触发共识协议，共识失败时触发人工审批

### Task 8: 前端议程与协商 UI
- [x] 8.1 在 `MeetingChatPanel.tsx` 中展示当前议程状态指示器
- [x] 8.2 在 `MeetingLogPanel.tsx` 中展示消息的立场/置信度标签
- [x] 8.3 在 `CollaborationVisualizer.tsx` 中新增"决策回溯"标签页，可视化决策图
- [x] 8.4 在 `OfficeTeamMode.tsx` 中添加议程手动控制按钮（推进/暂停/紧急中断）

---

## Phase 3: 系统工程层 — 失败补偿与安全

### Task 9: 实现失败补偿机制
- [x] 9.1 在 `src/modules/taskTypes.ts` 中扩展 SubTask 定义：添加 `compensateAction`(补偿动作)、`rollbackCondition`(回滚条件)、`failureImpact`(失败影响范围) 字段
- [x] 9.2 创建 `src/modules/compensationEngine.ts`，实现补偿引擎：失败检测 → 查找补偿动作 → 执行回滚 → 通知重规划
- [x] 9.3 创建 `src/modules/checkpointManager.ts`，实现检查点管理：保存/恢复任务执行快照，支持从失败步骤附近重试
- [x] 9.4 在后端 `backend/compensation.py` 中实现对应的补偿引擎和检查点管理器

### Task 10: 实现死锁检测与分布式监督
- [x] 10.1 在 `src/modules/collaborationState.ts` 中实现死锁检测：基于等待图（Wait-for Graph）检测 Agent 间循环依赖
- [x] 10.2 实现死锁打破策略：超时释放、优先级抢占
- [x] 10.3 增强 Monitor Agent 的监督职能：除风险监控外，增加死锁检测、资源泄漏检测、无限循环检测
- [x] 10.4 实现 Monitor 的暂停任务权限：检测到严重异常时可暂停任务并请求人工介入

### Task 11: 实现权限与安全边界
- [x] 11.1 创建 `src/modules/permissionManager.ts`，实现权限管理器：Agent 能力白名单、运行时权限校验、权限授予/撤销
- [x] 11.2 实现操作审计日志：记录所有危险操作（browser_automation, file_operation）的执行者、时间、参数、结果
- [x] 11.3 实现高风险操作共识签名：定义高风险操作列表，要求 Planner + Reviewer 双重签名
- [x] 11.4 实现操作频率限制：滑动窗口算法限制单个 Agent 的危险操作频率
- [x] 11.5 在后端 `backend/security.py` 中实现对应的安全中间件

---

## Phase 4: 人机交互层 — 审批与审计

### Task 12: 实现人在回路审批机制
- [x] 12.1 创建 `src/components/ApprovalDialog.tsx` 审批对话框组件：展示操作详情、风险评估、Agent 置信度、批准/拒绝按钮
- [x] 12.2 创建 `src/modules/approvalQueue.ts`，实现审批队列管理：待审批项列表、优先级排序、超时自动处理
- [x] 12.3 修改 `src/App.tsx` 中的 `handleConfirmRequest`：从自动批准改为弹出 ApprovalDialog
- [x] 12.4 实现置信度门限触发：当 Monitor 评估置信度低于阈值时自动创建审批请求
- [x] 12.5 在 `OfficeTeamMode.tsx` 中添加审批通知徽章和待审批队列入口

### Task 13: 实现审计回溯与干预控制台
- [x] 13.1 创建 `src/components/AuditTrail.tsx` 审计回溯组件：展示完整的决策链路、审批历史、操作日志，支持按时间/Agent/操作类型过滤
- [x] 13.2 创建 `src/components/InterventionConsole.tsx` 干预控制台：允许人工暂停/恢复任务、手动分配任务、调整 Agent 权重
- [x] 13.3 在后端 `backend/server.py` 中新增 WebSocket 消息处理：`pause_task`, `resume_task`, `override_decision`, `adjust_agent_weight`
- [x] 13.4 将审批结果记录为监督信号，用于后续 Agent 决策权重调整

---

## Task Dependencies

- Task 1 可立即开始，无依赖（协议类型是所有后续任务的基础）
- Task 2 依赖 Task 1（追踪模块需要协议中定义的 TraceContext）
- Task 3 依赖 Task 1（消息可靠性增强需要新协议字段）
- Task 4 依赖 Task 1, 3（WebSocket 增强需要消息序列号支持）
- Task 5 依赖 Task 1, 2（议程状态机需要协议类型和追踪支持）
- Task 6 依赖 Task 1, 2, 5（协商引擎需要协议、追踪和议程状态）
- Task 7 依赖 Task 5, 6（MeetingCoordinator 改造需要议程和协商模块）
- Task 8 依赖 Task 5, 6, 7（前端 UI 需要后端议程/协商逻辑完成）
- Task 9 依赖 Task 1, 2（补偿机制需要协议和追踪支持）
- Task 10 依赖 Task 9（死锁检测建立在补偿机制之上）
- Task 11 依赖 Task 1, 2（安全模块需要协议和日志支持）
- Task 12 依赖 Task 1, 11（审批机制需要协议和安全模块）
- Task 13 依赖 Task 12, 2（审计回溯需要审批和追踪数据）

### 可并行执行的任务组
- **并行组 A**: Task 1（协议扩展）
- **并行组 B**: Task 2, Task 3（日志追踪 + 消息可靠性，均仅依赖 Task 1）
- **并行组 C**: Task 5, Task 9, Task 11（议程 + 补偿 + 安全，均仅依赖 Task 1-2）
- **串行链**: Task 5 → Task 6 → Task 7 → Task 8
- **串行链**: Task 9 → Task 10
- **串行链**: Task 11 → Task 12 → Task 13
