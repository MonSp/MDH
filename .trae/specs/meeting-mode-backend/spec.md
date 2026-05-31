# 多智能体会议模式后端接口与协调器 Spec

## Why
前端已完成了多智能体会议模式的完整 UI（`OfficeTeamMode.tsx` + `office-team/` 组件群），但当前所有会议逻辑（Agent 响应、任务分配、讨论消息）均为前端 mock 数据。后端 `backend/collaboration/` 模块已有基础协作原语（`CollaborativeAgent`、`PlannerAgent`、`ExecutorAgent`、`CommunicationManager`），但未接入 WebSocket 服务端，也未与前端建立会议模式的实时通信协议。需要补齐后端会议模式接口和协调器，实现前后端联通。

## What Changes
- 在 `backend/server.py` 中新增会议模式 WebSocket 消息协议（`start_meeting`、`end_meeting`、`meeting_message`、`task_assign`、`agent_status_update` 等）
- 新建 `backend/meeting.py` 会议会话管理器，管理会议生命周期（创建、讨论、任务派发、结束）
- 新建 `backend/meeting_coordinator.py` 多智能体会议协调器，使用 LLM 驱动 Agent 讨论与任务分解
- 扩展 `backend/session.py` 支持会议会话绑定
- 修改前端 `OfficeTeamMode.tsx` 及 `office-team/` 子组件，通过 WebSocket 对接后端会议协议，替换 mock 逻辑
- 前端新增 WebSocket 消息处理 hook，桥接后端会议事件与 UI 状态

## Impact
- Affected specs: `multi-agent-collaboration-mode`、`office-agent-collaboration`（后端部分的延伸）
- Affected code: `backend/server.py`、`backend/session.py`、`backend/meeting.py`（新建）、`backend/meeting_coordinator.py`（新建）、`backend/collaboration/`（增强）、`src/components/OfficeTeamMode.tsx`、`src/components/office-team/` 子组件

## ADDED Requirements

### Requirement: 会议模式 WebSocket 协议
系统 SHALL 提供基于 WebSocket 的会议模式通信协议，支持以下消息类型：

#### Scenario: 前端发起会议
- **WHEN** 前端发送 `{"type": "start_meeting"}` 消息
- **THEN** 后端创建会议会话，初始化多 Agent 协调器，返回 `{"type": "meeting_started", "meeting_id": "...", "agents": [...]}` 消息

#### Scenario: 前端发送会议讨论消息
- **WHEN** 前端发送 `{"type": "meeting_message", "content": "..."}` 消息
- **THEN** 后端将消息分发给各 Agent，Agent 通过 LLM 生成讨论回复，通过流式 `{"type": "agent_message", "agent_id": "...", "content": "...", "delta": "..."}` 消息回传前端

#### Scenario: 前端派发任务
- **WHEN** 前端发送 `{"type": "task_assign", "agent_id": "...", "description": "..."}` 消息
- **THEN** 后端将任务分配给指定 Agent，返回 `{"type": "task_assigned", "task_id": "...", "agent_id": "...", "status": "assigned"}` 消息

#### Scenario: 前端结束会议
- **WHEN** 前端发送 `{"type": "end_meeting"}` 消息
- **THEN** 后端结束会议，汇总任务状态，返回 `{"type": "meeting_ended", "summary": {...}}` 消息

### Requirement: 会议会话管理器
系统 SHALL 提供 `MeetingSession` 类，管理单次会议会议的完整生命周期。

#### Scenario: 会议创建与 Agent 初始化
- **WHEN** 收到 `start_meeting` 请求
- **THEN** 系统创建 `MeetingSession` 实例，根据预设角色创建 Agent（Planner、Executor、Monitor、Reviewer、Coordinator），每个 Agent 具有 LLM 调用能力

#### Scenario: 会议状态同步
- **WHEN** 会议进行中
- **THEN** 系统实时向前端推送 Agent 状态变化（`agent_status_update`），包括 Agent 状态（idle/working/meeting）、当前任务等

#### Scenario: 会议结束与清理
- **WHEN** 收到 `end_meeting` 请求或会议超时
- **THEN** 系统停止所有 Agent 活动，汇总会议结果，清理会话资源

### Requirement: 多智能体会议协调器
系统 SHALL 提供 `MeetingCoordinator` 类，驱动多 Agent 进行有组织的讨论和任务分解。

#### Scenario: LLM 驱动的任务分解
- **WHEN** 用户在会议中提出任务描述
- **THEN** Planner Agent 通过 LLM 分析任务，生成结构化的子任务列表和依赖关系，以流式消息推送给前端

#### Scenario: 多 Agent 讨论
- **WHEN** 会议进入讨论阶段
- **THEN** 各角色 Agent 根据自身专长（规划/执行/监控/审查）轮流发言，讨论内容通过 WebSocket 流式推送

#### Scenario: 智能任务分配
- **WHEN** 任务分解完成后
- **THEN** Coordinator Agent 根据各 Executor Agent 的能力和当前负载，自动分配子任务

### Requirement: 前端会议模式 WebSocket 集成
前端 SHALL 通过 WebSocket 与后端会议模式联通，替换现有 mock 逻辑。

#### Scenario: 前端发起真实会议
- **WHEN** 用户点击"开始会议"
- **THEN** 前端通过 WebSocket 发送 `start_meeting`，接收后端返回的 Agent 列表并渲染

#### Scenario: 前端接收 Agent 讨论消息
- **WHEN** 后端推送 `agent_message` 流式消息
- **THEN** 前端实时渲染 Agent 讨论气泡，支持流式打字效果

#### Scenario: 前端派发任务到后端
- **WHEN** 用户选择 Agent 并输入任务描述
- **THEN** 前端发送 `task_assign` 到后端，接收 `task_assigned` 确认后更新 UI

## MODIFIED Requirements

### Requirement: Session 扩展
现有 `Session` 类需扩展支持会议会话绑定，允许一个 WebSocket 连接同时管理单 Agent 会话和多 Agent 会议会话。

## REMOVED Requirements
无
