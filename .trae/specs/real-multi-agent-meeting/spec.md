# 真正的多智能体会议迭代 Spec

## Why
当前多智能体会议系统存在两个核心缺陷，导致它不是真正的"多智能体会议"：
1. **任务模式**：CEO 分析后只指派给一个 Agent 执行，执行完就结束了。其他 Agent（Reviewer、Monitor 等）完全不参与，没有审查、监督、总结环节。
2. **讨论模式**：`run_discussion` 按固定顺序让每个 Agent 发言一次就结束，Agent 之间无法互相回应、辩论、迭代改进方案。

用户期望的是一个**真正的多智能体协作会议**：多个 Agent 能够围绕议题进行多轮讨论、互相回应、达成共识，任务执行后有审查和总结环节。

## What Changes
- **任务模式改造**：CEO 指派任务后，进入"执行→审查→总结"多阶段流程，多个 Agent 依次参与
- **讨论模式改造**：支持多轮讨论，Agent 可以引用其他 Agent 的发言进行回应和辩论
- **CEO 智能调度**：CEO 在每轮讨论后判断是否需要继续讨论或可以结束
- **前端消息流优化**：支持长时间多 Agent 交互的消息流式展示

## Impact
- Affected specs: `ceo-agent-auto-assign`, `meeting-mode-backend`
- Affected code:
  - 核心修改: `backend/meeting_coordinator.py`（`process_user_message`、`run_discussion`、新增任务审查流程）
  - 可能修改: `backend/server.py`（消息处理流程适配）

---

## ADDED Requirements

### Requirement: 任务执行后的多 Agent 协作流程
系统 SHALL 在任务指派后自动进入多阶段协作流程，而非单个 Agent 执行完就结束。

#### Scenario: 任务执行→审查→总结
- **WHEN** CEO 将任务指派给某个 Agent
- **THEN** 系统依次执行以下阶段：
  1. 被指派的 Agent 执行任务并输出结果
  2. Reviewer Agent 审查执行结果，提出改进建议
  3. Monitor Agent 评估风险和完成度
  4. Coordinator Agent 总结最终结论

#### Scenario: 执行结果流式推送
- **WHEN** 每个 Agent 完成发言
- **THEN** 通过 `on_message` 实时将发言内容推送给前端，用户可以看到完整的协作过程

---

### Requirement: 多轮讨论机制
系统 SHALL 支持 Agent 之间的多轮讨论，而非单轮发言。

#### Scenario: 多轮讨论流程
- **WHEN** 用户消息被判定为讨论类型
- **THEN** 系统执行最多 N 轮（可配置，默认 2 轮）讨论：
  1. 第一轮：各 Agent 依次发表初始观点
  2. 后续轮次：每个 Agent 可以引用其他 Agent 的发言进行回应、补充或反驳
  3. 每轮结束后由 Coordinator 总结当前共识状态

#### Scenario: Agent 互相引用
- **WHEN** 讨论进入第二轮及以后
- **THEN** 每个 Agent 的 prompt 中包含其他 Agent 之前的发言摘要，支持引用和回应

#### Scenario: CEO 判断讨论是否收敛
- **WHEN** 一轮讨论结束后
- **THEN** CEO Agent 评估讨论是否已达成足够共识，决定是否继续下一轮

---

### Requirement: 会议消息协议扩展
系统 SHALL 在现有协议基础上支持长时间多 Agent 交互。

#### Scenario: 会议进行中状态通知
- **WHEN** 会议进入新的协作阶段（如从执行进入审查）
- **THEN** 前端收到阶段变更通知，可在 UI 上展示当前进度

---

## MODIFIED Requirements

### Requirement: process_user_message 流程
现有 `process_user_message` 方法 SHALL 改造为支持多阶段协作：

**任务模式新流程：**
```
CEO 分析 → 指派任务 → 执行 Agent 工作 → Reviewer 审查 → Monitor 评估 → Coordinator 总结 → 返回结果
```

**讨论模式新流程：**
```
CEO 分析 → 判定为讨论 → 第一轮各 Agent 发言 → CEO 评估收敛性 → (可选)第二轮回应 → Coordinator 总结 → 返回结果
```

### Requirement: run_discussion 方法
现有 `run_discussion` 方法 SHALL 改造为支持多轮讨论：
- 每轮讨论中，各 Agent 的 prompt 包含前几轮的讨论摘要
- 支持配置最大讨论轮数
- 每轮结束后通过 CEO 或 Coordinator 判断是否需要继续

### Requirement: 任务执行后审查
现有 `execute_assigned_tasks` 方法 SHALL 扩展为支持执行后审查：
- 执行完成后，自动触发 Reviewer 和 Monitor 的审查流程
- 审查结果通过 `on_message` 推送给前端

---

## REMOVED Requirements
无移除需求。现有功能保持兼容。

---

## 技术实现细节

### 任务模式多阶段 Prompt 设计

**Reviewer 审查 Prompt：**
```
你是团队的审查者。以下是一位同事的工作成果，请审查并提出改进建议。

任务：{task_description}
执行结果：{execution_result}

请从以下角度审查：
1. 方案的完整性和可行性
2. 潜在的问题和风险
3. 具体的改进建议

请用 2-3 句话给出你的审查意见。
```

**Monitor 评估 Prompt：**
```
你是团队的监控者。请评估以下任务的执行情况。

任务：{task_description}
执行结果：{execution_result}
审查意见：{reviewer_feedback}

请评估：
1. 任务完成度
2. 潜在风险
3. 是否需要补充

请用 2-3 句话给出你的评估。
```

**Coordinator 总结 Prompt：**
```
你是团队的协调者。请综合以下讨论内容，给出最终总结。

任务：{task_description}
执行结果：{execution_result}
审查意见：{reviewer_feedback}
监控评估：{monitor_feedback}

请给出简洁的总结和最终结论。
```

### 多轮讨论 Prompt 设计

**后续轮次 Agent Prompt：**
```
当前会议议题：{topic}
之前的讨论：
{all_previous_discussions}

请以{role}的身份回应其他同事的观点，可以：
1. 支持并补充某位同事的观点
2. 提出不同意见并说明理由
3. 综合多方观点提出新的建议

请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。
```

### 消息流设计

**任务模式：**
```
用户输入 → CEO 分析 → 推送 CEO 分析消息
         → 指派任务 → 推送 task_auto_assigned
         → 执行 Agent 工作 → 推送 agent_message
         → Reviewer 审查 → 推送 agent_message
         → Monitor 评估 → 推送 agent_message
         → Coordinator 总结 → 推送 agent_message
         → 返回 task_auto_assigned 结果
```

**讨论模式：**
```
用户输入 → CEO 分析 → 推送 CEO 分析消息
         → 第一轮：Planner 发言 → 推送 agent_message
                    Executor 发言 → 推送 agent_message
                    Monitor 发言 → 推送 agent_message
                    Reviewer 发言 → 推送 agent_message
         → CEO 评估收敛性
         → (如需)第二轮：各 Agent 回应 → 推送 agent_message
         → Coordinator 总结 → 推送 agent_message
         → 返回 discussion 结果
```
