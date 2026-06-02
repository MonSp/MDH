# CEO Agent 智能自动指派 Spec

## Why
当前多智能体会议系统存在两个核心问题：
1. **任务分配依赖手动操作**：用户必须通过下拉菜单手动选择 Agent 才能派发任务，不符合真实会议的工作流
2. **讨论缺乏智能组织**：所有 Agent 按固定顺序发言，没有一个"会议组织者"来根据语义智能调度

真实会议场景中，CEO/会议主持人会根据每个人的发言内容，自动判断应该由谁来执行什么任务，而不是让老板手动点名。

## What Changes
- **新增 CEO Agent 角色**：作为会议组织者，具备语义分析和自动任务指派能力
- **新增语义分析引擎**：CEO Agent 通过 LLM 分析用户每句话的意图，自动识别任务需求并匹配最佳执行者
- **改造任务派发流程**：从"用户选择 Agent → 输入任务"变为"用户直接表达需求 → CEO 自动分析并指派"
- **简化前端交互**：移除手动选择 Agent 的下拉菜单，用户只需在聊天框中输入即可

## Impact
- Affected specs: `meeting-mode-backend`, `multi-agent-collaboration-mode`
- Affected code:
  - 修改: `backend/protocol.py`（新增 CEO 角色和语义分析消息类型）
  - 修改: `backend/meeting.py`（DEFAULT_MEETING_AGENTS 增加 CEO Agent）
  - 修改: `backend/meeting_coordinator.py`（新增语义分析和自动指派逻辑）
  - 修改: `backend/server.py`（处理新的消息流）
  - 修改: `src/components/office-team/TaskAssignPanel.tsx`（简化为纯输入框）
  - 修改: `src/components/OfficeTeamMode.tsx`（移除手动选择逻辑）
  - 修改: `src/hooks/useMeetingSocket.ts`（支持新的消息协议）

---

## ADDED Requirements

### Requirement: CEO Agent 角色
系统 SHALL 提供一个 CEO Agent 作为会议组织者，负责语义分析和任务自动指派。

#### Scenario: CEO Agent 初始化
- **WHEN** 会议启动
- **THEN** 系统自动创建 CEO Agent，其角色标识为 `ceo`，具备语义分析和任务分配能力

#### Scenario: CEO 语义分析
- **WHEN** 用户在会议中发送任意消息
- **THEN** CEO Agent 首先分析消息语义，判断是否包含任务意图，如果包含则自动识别任务描述和最佳执行者

### Requirement: 智能任务自动指派
系统 SHALL 支持基于语义分析的自动任务指派，无需用户手动选择 Agent。

#### Scenario: 用户表达任务需求
- **WHEN** 用户发送"帮我分析一下前端性能问题"
- **THEN** CEO Agent 分析语义，识别出这是一个前端性能分析任务，自动指派给 Executor Agent（具备前端能力）

#### Scenario: 用户发送非任务消息
- **WHEN** 用户发送"大家觉得这个方案怎么样？"
- **THEN** CEO Agent 判断这是讨论性消息，触发多 Agent 讨论流程而非任务指派

#### Scenario: 指派结果通知
- **WHEN** CEO Agent 完成自动指派
- **THEN** 系统向前端推送 `task_auto_assigned` 消息，包含任务描述、被指派的 Agent 和 CEO 的分析理由

### Requirement: 语义分析提示词工程
系统 SHALL 为 CEO Agent 提供专业的语义分析提示词，支持准确识别任务意图和匹配执行者。

#### Scenario: 任务意图识别
- **WHEN** CEO Agent 收到用户消息
- **THEN** 通过 LLM 分析返回结构化结果：`{ "is_task": boolean, "task_description": string, "target_agent_id": string, "reason": string }`

#### Scenario: 多候选 Agent 评分
- **WHEN** 任务涉及多个能力领域
- **THEN** CEO Agent 对每个候选 Agent 进行匹配评分，选择得分最高的 Agent 执行

---

## MODIFIED Requirements

### Requirement: AgentRole 枚举
现有 `AgentRole` 枚举 SHALL 新增 `CEO` 角色：
```python
class AgentRole(str, Enum):
    CEO = "ceo"
    PLANNER = "planner"
    EXECUTOR = "executor"
    MONITOR = "monitor"
    REVIEWER = "reviewer"
    COORDINATOR = "coordinator"
```

### Requirement: 会议消息协议
现有会议消息协议 SHALL 新增以下消息类型：
- `SEMANTIC_ANALYSIS_RESULT`：CEO 语义分析结果
- `TASK_AUTO_ASSIGNED`：自动任务指派通知

### Requirement: 前端任务派发面板
现有 `TaskAssignPanel` SHALL 简化为纯输入框模式：
- 移除 Agent 选择下拉菜单
- 用户只需输入任务描述，系统自动处理指派
- 显示 CEO 的分析结果和指派理由

### Requirement: 讨论流程
现有 `run_discussion` 方法 SHALL 改造为 CEO 驱动模式：
- CEO Agent 首先分析用户消息
- 根据分析结果决定是触发讨论还是任务指派
- 讨论时由 CEO 智能调度发言顺序

---

## REMOVED Requirements
无移除需求。现有功能保持兼容，手动指派作为备选方案保留。

---

## 技术实现细节

### CEO Agent 语义分析 Prompt
```
你是会议的CEO和组织者。请分析以下用户消息，判断其意图：

用户消息：{user_message}

可用Agent：
{agent_list_with_capabilities}

请返回JSON格式分析结果：
{
  "is_task": true/false,
  "intent": "task/discussion/question/feedback",
  "task_description": "如果is_task为true，提取任务描述",
  "target_agent_id": "最佳执行者的ID",
  "reason": "选择该Agent的理由",
  "discussion_topic": "如果is_task为false，提取讨论主题"
}

分析规则：
1. 如果消息包含明确的行动指令（如"帮我..."、"请执行..."、"分析..."），判定为任务
2. 如果消息是征求意见（如"大家觉得..."、"你们怎么看"），判定为讨论
3. 根据任务内容匹配Agent能力，选择最合适的执行者
```

### 消息流设计
```
用户输入 → server.py 接收 meeting_message
         → meeting_coordinator.semantic_analyze()
         → CEO Agent LLM 分析
         → 如果 is_task=true:
              → 自动创建任务并分配给 target_agent
              → 推送 task_auto_assigned 消息
              → 目标 Agent 开始执行
         → 如果 is_task=false:
              → 触发 run_discussion() 多Agent讨论
```
