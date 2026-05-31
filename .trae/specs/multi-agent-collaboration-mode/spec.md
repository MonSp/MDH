# 多Agent合作模式 Spec

## Why
当前系统只支持单Agent执行用户指令，无法处理复杂任务分解和多Agent协作。用户需要一个能够自动规划、分工和协调多个Agent共同完成复杂任务的可视化协作模式。

## What Changes
- 新增多Agent合作模式，支持用户通过对话发起自动化任务
- 实现任务规划器，自动将复杂任务分解为子任务
- 创建多个专业化Agent（如规划Agent、执行Agent、监控Agent）
- 开发可视化界面展示Agent协作过程和任务状态
- 支持Agent间通信和任务协调机制

## Impact
- Affected specs: agent-core-modules
- Affected code: 
  - `src/App.tsx` - 主应用逻辑
  - `src/components/ConversationStream.tsx` - 对话流展示
  - `src/modules/` - 新增规划器和协调器模块
  - `backend/agentscope/src/agentscope/agent/` - Agent类扩展

## ADDED Requirements
### Requirement: 多Agent协作框架
系统 SHALL 提供一个支持多Agent协作的框架，允许用户通过自然语言发起复杂任务，系统自动分解任务并协调多个Agent共同完成。

#### Scenario: 用户发起复杂任务
- **WHEN** 用户输入"帮我完成一个网站重构项目"
- **THEN** 系统自动创建规划Agent，分解任务为前端重构、后端重构、测试等子任务，并分配给相应的专业Agent执行

### Requirement: 可视化协作界面
系统 SHALL 提供一个可视化界面，实时展示多Agent协作过程、任务状态和进度。

#### Scenario: 查看协作过程
- **WHEN** 多个Agent正在执行任务
- **THEN** 用户可以看到任务分解图、Agent状态、执行进度和实时通信内容

### Requirement: 任务规划与分配
系统 SHALL 包含一个智能规划器，能够分析用户需求并自动分配任务给合适的Agent。

#### Scenario: 自动任务分配
- **WHEN** 规划Agent分析出需要前端和后端开发
- **THEN** 系统自动将前端任务分配给前端Agent，后端任务分配给后端Agent

## MODIFIED Requirements
### Requirement: 现有对话系统
现有对话系统需要扩展以支持多Agent协作模式，包括模式切换、Agent选择和协作状态展示。

## REMOVED Requirements
无

## Technical Implementation
### 核心组件
1. **TaskPlanner** - 任务规划器，负责分析用户需求并生成任务计划
2. **AgentCoordinator** - Agent协调器，负责管理Agent间通信和任务分配
3. **MultiAgentConversation** - 多Agent对话管理，支持多Agent同时参与对话
4. **CollaborationVisualizer** - 协作可视化组件，展示Agent协作过程

### 数据流
用户输入 → TaskPlanner分析 → 生成任务计划 → AgentCoordinator分配 → 多Agent并行执行 → 结果汇总 → 用户展示

### 界面设计
- 主界面增加"协作模式"切换按钮
- 左侧显示任务分解和Agent状态面板
- 中间显示实时对话和协作过程
- 右侧显示任务进度和结果汇总