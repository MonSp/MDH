# Tasks

## Task 1: 改造任务模式 — 多阶段协作流程
改造 `process_user_message` 中的任务模式，CEO 指派任务后进入"执行→审查→总结"多阶段流程。

- [x] 1.1 在 `meeting_coordinator.py` 中新增 `review_task_execution` 方法：接受任务描述和执行结果，依次调用 Reviewer 审查、Monitor 评估、Coordinator 总结，每个 Agent 的发言通过 `on_message` 实时推送
- [x] 1.2 修改 `process_user_message` 的任务模式分支：在 `execute_assigned_tasks` 完成后，调用 `review_task_execution` 进入审查流程
- [x] 1.3 确保 `server.py` 中的 `send_agent_message` 回调能正确处理审查阶段的多条消息

## Task 2: 改造讨论模式 — 多轮讨论机制
改造 `run_discussion` 方法，支持 Agent 之间的多轮讨论。

- [x] 2.1 重构 `run_discussion` 方法：改为 `run_multi_round_discussion`，支持配置最大轮数（默认 2 轮）
- [x] 2.2 实现第一轮讨论逻辑：各 Agent 依次发表初始观点（复用现有逻辑）
- [x] 2.3 实现后续轮次逻辑：每个 Agent 的 prompt 中包含前几轮讨论摘要，支持引用和回应
- [x] 2.4 实现 CEO 收敛性评估：每轮结束后调用 CEO Agent 判断讨论是否已达成共识
- [x] 2.5 在每轮讨论结束后添加 Coordinator 阶段性总结

## Task 3: Prompt 工程优化
为多阶段协作和多轮讨论设计高质量的 Prompt。

- [x] 3.1 编写 Reviewer 审查 Prompt：包含任务描述、执行结果、审查角度指引
- [x] 3.2 编写 Monitor 评估 Prompt：包含任务描述、执行结果、审查意见、评估角度指引
- [x] 3.3 编写 Coordinator 总结 Prompt：包含所有阶段的讨论内容
- [x] 3.4 编写多轮讨论回应 Prompt：包含前几轮讨论摘要、回应方式指引
- [x] 3.5 编写 CEO 收敛性评估 Prompt：判断讨论是否已达成足够共识

## Task 4: 前端适配与消息流优化
确保前端能正确展示多阶段协作的消息流。

- [x] 4.1 验证 `useMeetingSocket.ts` 能正确处理连续多条 `agent_message` 消息
- [x] 4.2 验证 `MeetingChatPanel.tsx` 能正确渲染来自不同 Agent 的连续消息
- [ ] 4.3 (可选) 添加会议阶段指示器，显示当前处于哪个协作阶段

---

# Task Dependencies

- Task 1（任务模式改造）可独立进行
- Task 2（讨论模式改造）可独立进行，与 Task 1 并行
- Task 3（Prompt 工程）依赖 Task 1 和 Task 2 的设计确定后进行
- Task 4（前端适配）依赖 Task 1 和 Task 2 完成后验证

### 可并行执行的任务组
- **并行组 A**: Task 1 + Task 2（两种模式独立改造）
- **串行依赖**: Task 1 & Task 2 → Task 3 → Task 4
