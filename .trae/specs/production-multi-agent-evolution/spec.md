# 多智能体协作系统生产级进化 Spec

## Why
当前系统实现了"多Agent按脚本演练"的基本框架——固定角色顺序发言、Coordinator拍板式决策、内存级通信、自动批准式人工介入。要成为真正的生产级多智能体协作平台，需要在协作智能、系统可靠性、人机安全三个维度进行深度进化，使系统从"轮流报告"升级为"自主协商"。

## What Changes
- **动态议程管理**：将固定线性发言流程改造为议程状态机驱动的动态讨论，支持中断/插话和基于令牌的说话权管理
- **协商与冲突消解**：为消息添加立场/置信度/论据结构，实现多策略共识协议和决策回溯图
- **失败补偿机制**：为子任务引入补偿动作和回滚条件，实现检查点/快照与分布式监督
- **可靠通信层**：WebSocket自动重连、消息ACK与去重、消息序列号、死信队列监控
- **可观测性基础设施**：Trace Context注入、结构化日志、指标收集与导出接口
- **人在回路审批**：真正的审批弹窗与队列（替代自动批准）、置信度门限触发挂起、审批结果反馈学习
- **权限与安全边界**：最小权限执行沙箱、危险操作审计、高风险操作共识签名

## Impact
- Affected specs: multi-agent-collaboration-mode, meeting-mode-backend, office-agent-collaboration
- Affected code:
  - 后端: `backend/meeting_coordinator.py`, `backend/meeting.py`, `backend/server.py`, `backend/protocol.py`
  - 前端模块: `src/modules/communicationBus.ts`, `src/modules/communicationProtocol.ts`, `src/modules/meetingProtocol.ts`, `src/modules/collaborationState.ts`, `src/modules/speakingCoordinator.ts`, `src/modules/conversationFlowController.ts`
  - 前端组件: `src/components/OfficeTeamMode.tsx`, `src/components/office-team/MeetingChatPanel.tsx`, `src/components/office-team/MeetingLogPanel.tsx`, `src/components/CollaborationVisualizer.tsx`
  - 新增: 审批对话框组件、结构化日志模块、追踪上下文模块、议程状态机模块

---

## ADDED Requirements

### Requirement: 动态议程状态机
系统 SHALL 提供议程状态机驱动的会议流程，取代固定角色发言顺序。

#### Scenario: 正常讨论流转
- **WHEN** 会议开始且 Planner 提出任务分解方案
- **THEN** 议程状态从 `OPEN_TOPIC` 进入 `DISCUSSION`，各 Agent 可按内容相关性（而非固定顺序）发言

#### Scenario: 紧急中断
- **WHEN** Executor 在执行中发现计划不可行，发送 `CRITICAL_BLOCKER` 类型消息
- **THEN** 系统立即暂停当前议程，进入紧急协商状态，Planner 被优先调度响应

#### Scenario: 提案与表决
- **WHEN** 讨论中产生明确的行动方案
- **THEN** Coordinator 可发起 `PROPOSAL`，进入 `VOTING` 状态，各 Agent 投票后进入 `ACCEPTED` 或 `REJECTED`

---

### Requirement: 协商与冲突消解引擎
系统 SHALL 支持结构化论辩和多策略共识协议。

#### Scenario: 结构化论辩
- **WHEN** Reviewer 对 Planner 的方案持反对意见
- **THEN** 消息可携带立场（support/oppose/modify）、置信度（0-1）、论据引用（指向先前消息ID）

#### Scenario: 共识达成
- **WHEN** 对某提案存在分歧
- **THEN** 系统根据配置的共识策略（简单多数/加权投票/基于论证协商）计算结果，记录到决策回溯图

#### Scenario: 共识失败
- **WHEN** 多轮投票无法达成共识
- **THEN** 系统自动触发 `human_approval_request`，挂起等待人工裁决

---

### Requirement: 失败补偿与检查点
系统 SHALL 为多步任务提供补偿动作定义和检查点恢复能力。

#### Scenario: 子任务失败补偿
- **WHEN** 多步计划中某一步骤执行失败
- **THEN** Monitor 检测到失败后，系统查找该步骤的补偿动作并执行回滚，同时通知 Planner 评估是否需要重规划

#### Scenario: 检查点恢复
- **WHEN** 长流程任务在第 N 步失败且已完成检查点快照
- **THEN** 系统从最近的检查点恢复执行，而非从头开始

#### Scenario: 死锁检测
- **WHEN** Monitor 检测到 Agent 间存在循环等待
- **THEN** 系统自动打破死锁（超时释放/优先级抢占），并记录死锁事件到决策回溯图

---

### Requirement: 可靠消息通信
系统 SHALL 保证消息的可靠投递、顺序性和幂等性。

#### Scenario: WebSocket 断线重连
- **WHEN** WebSocket 连接意外断开
- **THEN** 前端自动尝试重连（指数退避），重连成功后通过序列号检测丢失消息并请求重传

#### Scenario: 消息去重
- **WHEN** 同一消息因网络重传被接收两次
- **THEN** 系统通过消息ID进行幂等检查，丢弃重复消息

#### Scenario: 死信队列监控
- **WHEN** 消息进入死信队列
- **THEN** 系统记录死信原因，当死信数量超过阈值时触发告警通知

---

### Requirement: 可观测性基础设施
系统 SHALL 提供分布式追踪、结构化日志和指标导出能力。

#### Scenario: 跨Agent消息追踪
- **WHEN** 一条消息从 Planner 发送到 Executor 再到 Reviewer
- **THEN** 每条消息携带 Trace Context（traceId + spanId），可视化组件可展示完整的消息因果链路

#### Scenario: 结构化协作日志
- **WHEN** Agent 执行任何操作（发言、决策、任务执行）
- **THEN** 系统生成结构化日志条目，包含 agentId、sessionId、messageType、causalMessageId、decisionSummary、timestamp

#### Scenario: 指标收集
- **WHEN** 协作过程进行中
- **THEN** 系统持续收集指标：对话轮次、任务完成时长、Agent消息处理延迟、共识达成时间、错误率

---

### Requirement: 人在回路审批机制
系统 SHALL 提供真正的人工审批流程，替代当前的自动批准。

#### Scenario: 高风险操作审批
- **WHEN** Agent 请求执行高风险操作（如文件删除、外部API调用）
- **THEN** 系统暂停执行，前端弹出审批对话框，显示操作详情和风险评估，等待人工决策

#### Scenario: 置信度门限触发
- **WHEN** Monitor 评估当前决策的置信度低于配置阈值
- **THEN** 系统自动挂起任务并推送审批请求，前端展示待审批队列

#### Scenario: 审批结果反馈
- **WHEN** 人工批准或拒绝某操作
- **THEN** 审批结果作为监督信号记录，可用于后续调整 Agent 的决策权重

---

### Requirement: 权限与安全边界
系统 SHALL 实施最小权限原则和危险操作审计。

#### Scenario: 能力权限校验
- **WHEN** Agent 请求执行某操作（如 browser_automation）
- **THEN** Coordinator 校验该 Agent 是否拥有对应权限，无权限则拒绝并记录审计日志

#### Scenario: 共识安全签名
- **WHEN** 某操作被标记为高风险
- **THEN** 需要 Planner + Reviewer 双重签名确认后才允许执行

#### Scenario: 操作频率限制
- **WHEN** 某 Agent 短时间内发起大量危险操作
- **THEN** 安全中间件触发频率限制，暂停该 Agent 的操作权限并告警

---

## MODIFIED Requirements

### Requirement: MeetingCoordinator 讨论流程
现有 `run_discussion()` 的固定角色顺序发言 SHALL 被改造为议程状态机驱动的动态发言流程。Coordinator 不再简单按序调用，而是根据议程状态、消息优先级和内容相关性动态调度下一个发言者。

### Requirement: MeetingProtocol 消息类型
现有 11 种 WebSocket 消息类型 SHALL 扩展，新增：
- `agenda_update` — 议程状态变更通知
- `proposal` / `vote` / `vote_result` — 提案与表决
- `critical_blocker` — 紧急中断消息
- `human_approval_request` / `human_approval_response` — 人工审批
- `checkpoint_save` / `checkpoint_restore` — 检查点操作
- `audit_log` — 审计日志推送

### Requirement: CommunicationBus 消息处理
现有 CommunicationBus SHALL 增强：
- 消息自动 ACK 机制（当前仅定义了 Acknowledgement 类型但未实现）
- 消息 ID 幂等去重
- 消息序列号保证顺序
- 死信队列阈值告警

### Requirement: useMeetingSocket 连接管理
现有 useMeetingSocket hook SHALL 增强：
- WebSocket 断线自动重连（指数退避）
- 重连后状态同步（通过序列号检测丢失消息）
- 连接状态暴露给 UI（连接中/已连接/重连中/断开）

---

## REMOVED Requirements
无移除需求。所有现有功能保持兼容，新增能力为渐进式增强。

---

## 分层架构蓝图

```
┌───────────────────────────────────────────────────┐
│               Human Interface Layer               │
│  审批对话框 · 干预控制台 · 审计回溯 · 待审队列      │
├───────────────────────────────────────────────────┤
│          Collaboration Control Plane              │
│  议程状态机 · 协商引擎 · 共识协议 · 能力权限管控     │
├───────────────────────────────────────────────────┤
│          Agent Execution Environment              │
│  执行沙箱 · 动态工具授权 · 补偿动作 · 经验记忆       │
├───────────────────────────────────────────────────┤
│        Reliable Communication Fabric             │
│  消息ACK · 顺序保证 · 去重 · 断线重连 · 死信监控     │
├───────────────────────────────────────────────────┤
│               Observability Stack                │
│  Trace Context · 结构化日志 · 指标收集 · 协作回放    │
└───────────────────────────────────────────────────┘
```
