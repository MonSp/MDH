# Tasks

## Task 1: 定义会议模式 WebSocket 协议类型
- [x] 在后端定义会议模式消息类型和数据结构
- [x] 在前端定义对应的 TypeScript 类型

### Task 1 子步骤
- [x] 1.1 创建 `backend/protocol.py`，定义会议模式消息类型枚举和数据模型（`MeetingMessageType`、`AgentRole`、`MeetingAgentStatus`、`MeetingAgentInfo`、`MeetingTaskInfo`、`MeetingSummary`）
- [x] 1.2 创建 `src/modules/meetingProtocol.ts`，定义对应的 TypeScript 接口和类型

---

## Task 2: 实现后端会议会话管理器
- [x] 创建 `MeetingSession` 类，管理单次会议的完整生命周期
- [x] 实现 Agent 角色初始化、状态管理、会话清理

### Task 2 子步骤
- [x] 2.1 创建 `backend/meeting.py`，实现 `MeetingAgentInfo` 数据类和 `MeetingSession` 类
- [x] 2.2 实现 `MeetingSession.start()` 方法，初始化 5 个角色 Agent（Planner、Executor、Monitor、Reviewer、Coordinator）
- [x] 2.3 实现 `MeetingSession.stop()` 方法，停止所有 Agent 活动，汇总结果，清理资源
- [x] 2.4 实现 `MeetingSession.get_agents_dict()` 和 `MeetingSession.get_summary()` 状态查询方法

---

## Task 3: 实现后端多智能体会议协调器
- [x] 创建 `MeetingCoordinator` 类，使用 LLM 驱动 Agent 讨论与任务分解
- [x] 实现任务分解、多 Agent 讨论、智能任务分配功能

### Task 3 子步骤
- [x] 3.1 创建 `backend/meeting_coordinator.py`，实现 `MeetingCoordinator` 类，接收 session 的 LLM model 配置
- [x] 3.2 实现 `MeetingCoordinator.decompose_task()` 方法，使用 LLM 将用户任务分解为结构化子任务列表（JSON 格式：子任务名、描述、优先级、依赖关系）
- [x] 3.3 实现 `MeetingCoordinator.run_discussion()` 方法，按角色顺序调用 LLM 生成各 Agent 的讨论发言，通过回调函数流式推送
- [x] 3.4 实现 `MeetingCoordinator.assign_tasks()` 方法，根据子任务内容和 Agent 能力进行匹配分配

---

## Task 4: 集成会议模式到 WebSocket 服务端
- [x] 在 `backend/server.py` 中新增会议模式消息处理分支
- [x] 将 `MeetingSession` 和 `MeetingCoordinator` 接入 WebSocket 消息循环

### Task 4 子步骤
- [x] 4.1 扩展 `backend/session.py`，在 `Session` 类中添加 `meeting_session` 属性和 `meeting_mode` 标志
- [x] 4.2 在 `backend/server.py` 的 `ws_handler` 中新增 `start_meeting` 消息处理：创建 `MeetingSession`，返回 `meeting_started`
- [x] 4.3 新增 `meeting_message` 消息处理：将用户消息传入 `MeetingCoordinator.run_discussion()`，通过流式 `agent_message` 回传各 Agent 回复
- [x] 4.4 新增 `task_assign` 消息处理：调用 `MeetingCoordinator.assign_tasks()` 分配任务，返回 `task_assigned`
- [x] 4.5 新增 `end_meeting` 消息处理：结束会议会话，返回 `meeting_ended` 和汇总信息
- [x] 4.6 新增 `get_meeting_status` 消息处理：返回当前会议状态和 Agent 列表

---

## Task 5: 实现前端 WebSocket 会议模式 Hook
- [x] 创建 `useMeetingSocket` hook，桥接后端会议事件与前端 UI 状态
- [x] 处理所有会议相关 WebSocket 消息类型

### Task 5 子步骤
- [x] 5.1 创建 `src/hooks/useMeetingSocket.ts`，实现 hook 接收 `wsRef` 参数
- [x] 5.2 实现 `startMeeting()` 发送函数，发送 `start_meeting` 消息
- [x] 5.3 实现 `sendMeetingMessage()` 发送函数，发送 `meeting_message` 消息
- [x] 5.4 实现 `assignTask()` 发送函数，发送 `task_assign` 消息
- [x] 5.5 实现 `endMeeting()` 发送函数，发送 `end_meeting` 消息
- [x] 5.6 实现消息监听 useEffect，处理 `meeting_started`、`agent_message`（含流式 delta 拼接）、`task_assigned`、`agent_status_update`、`meeting_ended` 消息，更新状态

---

## Task 6: 改造前端 OfficeTeamMode 对接后端
- [x] 修改 `OfficeTeamMode.tsx` 使用 `useMeetingSocket` hook 替换 mock 逻辑
- [x] 改造子组件以接收真实数据

### Task 6 子步骤
- [x] 6.1 修改 `OfficeTeamMode.tsx`，引入 `useMeetingSocket`，将 `handleStartMeeting`、`handleAssignTask`、`handleEndMeeting` 改为调用 hook 方法
- [x] 6.2 将 `agents`、`chatMessages`、`tasks` 状态来源从本地 mock 改为 hook 返回的后端数据
- [x] 6.3 修改 `MeetingChatPanel.tsx`，支持流式消息渲染（逐步追加 delta 文本）
- [x] 6.4 修改 `TaskAssignPanel.tsx`，任务派发后等待后端确认再更新 UI
- [x] 6.5 修改 `office-team/types.ts`，对齐后端协议定义的 Agent 和 Task 类型

---

## Task 7: 后端测试
- [x] 为会议模式核心模块编写单元测试
- [x] 验证前后端协议一致性

### Task 7 子步骤
- [x] 7.1 创建 `backend/tests/test_meeting.py`，测试 `MeetingSession` 生命周期（创建、Agent 初始化、结束、清理）
- [x] 7.2 测试协议类型枚举值和数据类序列化
- [x] 7.3 测试 `MeetingSession` 任务管理和消息记录
- [x] 7.4 测试完整生命周期（start → add_task → update_status → stop → cleanup）

---

## Task Dependencies
- Task 2 依赖 Task 1（会议会话需要协议类型定义）
- Task 3 依赖 Task 1, 2（协调器需要协议类型和会话管理）
- Task 4 依赖 Task 1, 2, 3（服务端集成需要所有后端模块）
- Task 5 依赖 Task 1（前端 hook 需要协议类型定义）
- Task 6 依赖 Task 5（前端改造需要 hook）
- Task 7 依赖 Task 2, 3, 4（测试需要后端实现完成）
- Task 1 可立即开始，无依赖
- Task 5 可与 Task 2, 3, 4 并行推进（前后端独立开发）
