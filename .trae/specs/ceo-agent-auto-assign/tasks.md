# Tasks

## Phase 1: 后端协议与角色扩展

### Task 1: 扩展协议定义
- [x] 1.1 在 `backend/protocol.py` 的 `AgentRole` 枚举中新增 `CEO = "ceo"` 角色
- [x] 1.2 在 `MeetingMessageType` 枚举中新增 `SEMANTIC_ANALYSIS_RESULT` 和 `TASK_AUTO_ASSIGNED` 消息类型
- [x] 1.3 新增 `SemanticAnalysisResult` 数据类，包含 `is_task`、`intent`、`task_description`、`target_agent_id`、`reason`、`discussion_topic` 字段
- [x] 1.4 新增 `semantic_analysis_to_dict()` 序列化函数

### Task 2: 扩展会议会话管理
- [x] 2.1 在 `backend/meeting.py` 的 `DEFAULT_MEETING_AGENTS` 列表头部新增 CEO Agent 定义
- [x] 2.2 CEO Agent 的 capabilities 包含 `["semantic_analysis", "task_delegation", "meeting_coordination"]`
- [x] 2.3 确保 CEO Agent 在 `start()` 方法中被正确初始化

---

## Phase 2: CEO Agent 语义分析引擎

### Task 3: 实现语义分析方法
- [x] 3.1 在 `backend/meeting_coordinator.py` 的 `MeetingCoordinator` 类中新增 `semantic_analyze(user_message: str)` 异步方法
- [x] 3.2 构建 CEO Agent 的语义分析 Prompt，包含用户消息和可用 Agent 列表（含能力描述）
- [x] 3.3 调用 CEO Agent 的 LLM 进行语义分析
- [x] 3.4 解析 LLM 返回的 JSON 结果，容错处理非标准格式
- [x] 3.5 返回 `SemanticAnalysisResult` 对象

### Task 4: 实现自动任务指派方法
- [x] 4.1 在 `MeetingCoordinator` 类中新增 `auto_assign_task(task_description: str, target_agent_id: str, reason: str)` 异步方法
- [x] 4.2 创建任务并分配给目标 Agent
- [x] 4.3 更新 Agent 状态为 WORKING
- [x] 4.4 记录 CEO 的指派理由到会议消息
- [x] 4.5 返回任务分配结果字典

### Task 5: 改造讨论入口方法
- [x] 5.1 在 `MeetingCoordinator` 类中新增 `process_user_message(user_message: str, on_message: Callable)` 异步方法
- [x] 5.2 该方法首先调用 `semantic_analyze()` 进行语义分析
- [x] 5.3 如果 `is_task=true`，调用 `auto_assign_task()` 并返回指派结果
- [x] 5.4 如果 `is_task=false`，调用现有的 `run_discussion()` 并传入 `discussion_topic`
- [x] 5.5 将 CEO 的分析结果通过 `on_message` 回调推送给前端

---

## Phase 3: 后端 WebSocket 消息处理

### Task 6: 改造 server.py 消息处理
- [x] 6.1 修改 `backend/server.py` 中 `meeting_message` 消息的处理逻辑
- [x] 6.2 将原来直接调用 `coordinator.run_discussion()` 改为调用 `coordinator.process_user_message()`
- [x] 6.3 新增 `semantic_analysis_result` 消息的推送（包含 CEO 分析结果）
- [x] 6.4 新增 `task_auto_assigned` 消息的推送（自动指派通知）
- [x] 6.5 保持 `task_assign` 手动指派消息的兼容性

---

## Phase 4: 前端交互改造

### Task 7: 简化 TaskAssignPanel 组件
- [x] 7.1 修改 `src/components/office-team/TaskAssignPanel.tsx`，移除 Agent 选择下拉菜单
- [x] 7.2 将标题从"📋 派发任务"改为"💬 发送消息"
- [x] 7.3 将输入框 placeholder 改为"输入需求或任务，CEO 会自动分析并安排..."
- [x] 7.4 移除 `selectedAgentId` 相关的 props 和状态
- [x] 7.5 移除派发按钮，改为纯回车发送

### Task 8: 修改 OfficeTeamMode 组件
- [x] 8.1 修改 `src/components/OfficeTeamMode.tsx`，移除 `selectedAgentId` 状态
- [x] 8.2 简化 `handleAssignTask` 为 `handleSendMessage`，直接发送消息内容
- [x] 8.3 更新 `TaskAssignPanel` 的 props 传递

### Task 9: 扩展 useMeetingSocket Hook
- [x] 9.1 修改 `src/hooks/useMeetingSocket.ts`，新增 `semantic_analysis_result` 消息类型的处理
- [x] 9.2 新增 `task_auto_assigned` 消息类型的处理
- [x] 9.3 在聊天消息列表中展示 CEO 的分析结果和自动指派通知
- [x] 9.4 保持现有 `task_assign` 手动指派的兼容性

### Task 10: 更新 MeetingChatPanel 展示
- [x] 10.1 修改 `src/components/office-team/MeetingChatPanel.tsx`，支持渲染 CEO Agent 的分析消息
- [x] 10.2 新增 CEO 分析结果的特殊样式（带分析图标和指派理由）
- [x] 10.3 新增自动指派通知的样式（显示任务描述和被指派 Agent）

---

## Task Dependencies

- Task 1（协议扩展）可立即开始，无依赖
- Task 2（会议会话扩展）依赖 Task 1（需要 CEO 角色定义）
- Task 3（语义分析）依赖 Task 1、Task 2
- Task 4（自动指派）依赖 Task 3
- Task 5（讨论入口）依赖 Task 3、Task 4
- Task 6（server.py）依赖 Task 5
- Task 7（TaskAssignPanel）可与后端任务并行
- Task 8（OfficeTeamMode）依赖 Task 7
- Task 9（useMeetingSocket）依赖 Task 6
- Task 10（MeetingChatPanel）依赖 Task 9

### 可并行执行的任务组
- **并行组 A**: Task 1 + Task 7（协议扩展 + 前端组件简化）
- **串行链**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6
- **串行链**: Task 7 → Task 8
- **合并点**: Task 6 + Task 8 → Task 9 → Task 10
