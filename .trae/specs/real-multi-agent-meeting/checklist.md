# Checklist

## Task 1: 任务模式 — 多阶段协作流程

- [x] **C1**: `review_task_execution` 方法存在，接受任务描述、执行结果和 `on_message` 回调
- [x] **C2**: `review_task_execution` 依次调用 Reviewer、Monitor、Coordinator，每个 Agent 发言通过 `on_message` 推送
- [x] **C3**: `process_user_message` 任务模式分支在执行完成后调用审查流程
- [x] **C4**: 用户发送任务消息后，前端依次收到：CEO 分析 → task_auto_assigned → 执行 Agent 回复 → Reviewer 审查 → Monitor 评估 → Coordinator 总结

## Task 2: 讨论模式 — 多轮讨论机制

- [x] **C5**: `run_discussion` 方法支持多轮讨论（至少 2 轮）
- [x] **C6**: 第一轮讨论中，各 Agent 依次发表初始观点
- [x] **C7**: 后续轮次中，每个 Agent 的 prompt 包含前几轮讨论摘要
- [x] **C8**: 每轮结束后 CEO 评估收敛性，决定是否继续
- [x] **C9**: 讨论结束后 Coordinator 给出总结
- [x] **C10**: 用户发送讨论消息后，前端收到多轮 Agent 讨论消息

## Task 3: Prompt 工程

- [x] **C11**: Reviewer 审查 Prompt 包含任务描述、执行结果和审查角度指引
- [x] **C12**: Monitor 评估 Prompt 包含任务描述、执行结果、审查意见和评估角度指引
- [x] **C13**: Coordinator 总结 Prompt 包含所有阶段的讨论内容
- [x] **C14**: 多轮讨论回应 Prompt 包含前几轮讨论摘要和回应方式指引
- [x] **C15**: CEO 收敛性评估 Prompt 能正确判断讨论是否达成共识

## Task 4: 前端适配

- [x] **C16**: 前端能正确渲染来自不同 Agent 的连续多条消息
- [x] **C17**: 消息顺序正确：先收到的消息先显示

## 整体集成

- [ ] **C18**: 任务模式端到端测试通过：用户输入任务 → 多个 Agent 依次参与 → 前端正确展示
- [ ] **C19**: 讨论模式端到端测试通过：用户输入讨论话题 → 多轮讨论 → 前端正确展示
- [ ] **C20**: 后端无异常日志，所有 LLM 调用正常返回
