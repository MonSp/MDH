# Checklist

## Phase 1: 基础设施层

- [x] **C1**: `backend/protocol.py` 中新增了全部 10 种消息类型枚举值和 7 个数据模型（AgendaState, Proposal, Vote, ApprovalRequest, Checkpoint, AuditEntry, TraceContext）
- [x] **C2**: `src/modules/meetingProtocol.ts` 中同步定义了与后端一致的 TypeScript 接口
- [x] **C3**: `MessageEnvelope` 已扩展 traceId, spanId, sequenceNo, causalMessageId 字段，前后端一致
- [x] **C4**: `src/modules/traceContext.ts` 能生成唯一 traceId/spanId，注入到消息中，并传播因果链
- [x] **C5**: `src/modules/structuredLogger.ts` 能按 agentId/sessionId/messageType 过滤日志，环形缓冲区不溢出
- [x] **C6**: `backend/trace.py` 实现了 traceId 生成和 span 管理，日志输出为结构化格式
- [x] **C7**: `CollaborationVisualizer.tsx` 新增的"追踪链路"标签页能正确展示消息因果关系图
- [x] **C8**: `CommunicationBus` 实现了消息 ACK 机制，发送后超时能自动重试
- [x] **C9**: `CommunicationBus` 实现了消息 ID 幂等去重，重复消息被正确丢弃
- [x] **C10**: `CommunicationBus` 的 `sortHandlersByPriority` 排序 bug 已修复
- [x] **C11**: `useMeetingSocket` 实现了 WebSocket 断线自动重连（指数退避），连接状态正确暴露给 UI
- [x] **C12**: 后端 `server.py` 实现了消息环形缓冲区，支持按序列号重传

## Phase 2: 协作智能层

- [x] **C13**: `src/modules/agendaStateMachine.ts` 实现了完整的议程状态转换（IDLE→OPEN_TOPIC→DISCUSSION→PROPOSAL→VOTING→ACCEPTED/REJECTED→CLOSED + EMERGENCY）
- [x] **C14**: 令牌管理器能根据内容相关性评分分配说话权，`CRITICAL_BLOCKER` 消息能抢占当前发言
- [x] **C15**: `src/modules/negotiationEngine.ts` 支持结构化论辩（stance/confidence/argumentRefs）
- [x] **C16**: 共识协议支持三种策略：简单多数投票、加权投票、基于论证协商
- [x] **C17**: 决策回溯图（DecisionGraph）正确记录每项决策的赞成/反对方和依据
- [x] **C18**: `MeetingCoordinator.run_discussion()` 已从固定顺序改为议程状态机驱动的动态调度
- [x] **C19**: 紧急中断场景：Executor 发送 CRITICAL_BLOCKER 后，Planner 被优先调度响应
- [x] **C20**: 共识失败场景：多轮投票无结果后自动触发 human_approval_request
- [x] **C21**: `MeetingChatPanel.tsx` 正确展示当前议程状态指示器
- [x] **C22**: `CollaborationVisualizer.tsx` 的"决策回溯"标签页能可视化决策图

## Phase 3: 系统工程层

- [x] **C23**: `taskTypes.ts` 中 SubTask 已扩展 compensateAction、rollbackCondition、failureImpact 字段
- [x] **C24**: 补偿引擎能正确执行失败检测→查找补偿动作→执行回滚→通知重规划的完整流程
- [x] **C25**: 检查点管理器能保存/恢复任务执行快照，支持从失败步骤附近重试
- [x] **C26**: 后端补偿引擎 `backend/compensation.py` 已实现
- [x] **C27**: 死锁检测基于等待图（Wait-for Graph）正确识别 Agent 间循环依赖
- [x] **C28**: Monitor Agent 能检测死锁并自动打破（超时释放/优先级抢占）
- [x] **C29**: `src/modules/permissionManager.ts` 实现了 Agent 能力白名单和运行时权限校验
- [x] **C30**: 高风险操作需要 Planner + Reviewer 双重签名才允许执行
- [x] **C31**: 操作频率限制（滑动窗口算法）正确限制单个 Agent 的危险操作频率
- [x] **C32**: `backend/security.py` 安全中间件记录所有危险操作的审计日志

## Phase 4: 人机交互层

- [x] **C33**: `ApprovalDialog.tsx` 审批对话框正确展示操作详情、风险评估、Agent 置信度，支持批准/拒绝
- [x] **C34**: `src/modules/approvalQueue.ts` 审批队列支持优先级排序和超时自动处理
- [x] **C35**: `App.tsx` 中 `handleConfirmRequest` 已从自动批准改为弹出 ApprovalDialog
- [x] **C36**: 置信度低于阈值时自动创建审批请求并推送到前端
- [x] **C37**: `OfficeTeamMode.tsx` 显示审批通知徽章和待审批队列入口
- [x] **C38**: `AuditTrail.tsx` 能展示完整决策链路、审批历史、操作日志，支持过滤
- [x] **C39**: `InterventionConsole.tsx` 允许人工暂停/恢复任务、手动分配任务、调整 Agent 权重
- [x] **C40**: 后端 `server.py` 正确处理 `pause_task`, `resume_task`, `override_decision`, `adjust_agent_weight` 消息
- [x] **C41**: 审批结果正确记录为监督信号，可用于后续 Agent 决策权重调整

## 整体集成

- [x] **C42**: 所有新增模块与现有系统向后兼容，现有功能（multi-agent-collaboration-mode, meeting-mode-backend, office-agent-collaboration）不受影响
- [x] **C43**: 项目构建成功（`npm run build` 无新增错误）
- [x] **C44**: 后端会议测试全部通过（33/33），`test_collaboration.py` 的 29 个失败为预存问题
