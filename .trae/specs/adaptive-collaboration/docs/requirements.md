# 自适应协作链路 - 需求规格

## 目标

实现自适应协作链路，使系统能够根据用户输入的任务复杂度，自动分流到简单（单Agent私人助理直接执行）或复杂（多Agent团队会议协作）执行路径。用户始终只需自然语言描述意图，系统自动适配最合适的执行路径，保持对话体验连贯且高效。

## 范围

### 包含
- 复杂度判定引擎（规则引擎 + LLM 语义分析两层策略）
- 轻量项目容器（精简版项目创建，不实例化员工）
- 单人助理团队模板（1个Executor Agent，复用浏览器工具集）
- 直接执行引擎（跳过会议，直接调用 run_agent_stream）
- 轻量验收机制（工具状态码 + 截图校验）
- 统一消息入口（unified_message WebSocket 消息类型）
- 简单→复杂的自动升级重试机制

### 不包含
- 现有复杂路径的修改（保持 MeetingCoordinator 全链路不变）
- 前端 UI 改造（仅需支持 unified_message 消息类型）
- 新的工具开发（复用现有 _build_browser_tools）
- 项目管理模块的重构（仅新增轻量创建方法）

## 功能要求

### FR-1: 复杂度判定引擎
系统 SHALL 提供两层复杂度判定机制：
1. **规则引擎层**：基于正则表达式匹配简单模式（单步浏览器操作、文件处理指令）和复杂模式（多步骤描述、跨部门关键词、动词计数>=3），毫秒级响应。
2. **LLM 语义分析层**：当规则引擎置信度低于阈值时，调用 CEO Agent 进行精确分类，输出 simple/complex 及置信度。
3. **降级策略**：判定结果置信度低于0.7时，默认走复杂路径（宁重勿轻）。

### FR-2: 轻量项目容器
当判定为简单任务时，系统 SHALL 创建轻量项目容器：
- 生成唯一 project_id
- 创建 projects_dir/{project_id}/metadata.json
- metadata 中标记 mode='lightweight'
- 不创建 employees/ 和 logs/ 目录
- 不调用 SkillRegistry.clone()
- 创建耗时不超过1秒

### FR-3: 单人助理团队
当判定为简单任务时，系统 SHALL 创建单人助理团队：
- 仅包含1个 Executor Agent（id: agent-assistant）
- Agent 角色为 EXECUTOR，具备浏览器操作、文件读写能力
- 复用 agent.py 的 _build_browser_tools 工具集
- 不创建 CEO/Planner/Monitor/Reviewer/Coordinator 角色

### FR-4: 直接执行引擎
当简单任务的助理团队创建完成后，系统 SHALL：
- 跳过会议讨论阶段（不调用 MeetingCoordinator）
- 直接调用 agent.py 的 run_agent_stream() 执行任务
- 实时流式推送执行进度到前端
- 执行过程中支持工具调用（浏览器操作、文件操作等）

### FR-5: 轻量验收机制
当简单任务执行完成后，系统 SHALL 自动进行轻量验收：
- 检查工具调用返回值中是否有 error 字段
- 检查截图是否成功获取（get_screenshot 工具返回非空）
- 检查最终结果文本是否为空
- 验收通过：返回结果给用户
- 验收失败：设置 retry_with_complex=True，自动升级到复杂路径重试

### FR-6: 统一消息入口
系统 SHALL 支持 unified_message WebSocket 消息类型：
- 前端发送 {"type": "unified_message", "content": "用户消息", ...}
- 系统自动调用 ComplexityClassifier.classify() 判定复杂度
- simple → SimpleExecutor.execute()
- complex → 现有 start_meeting + meeting_message 流程
- 返回结构化结果，包含 path_used 字段标识使用了哪条路径

### FR-7: 自动升级重试
当简单路径验收失败时，系统 SHALL：
- 自动创建正式项目（ProjectManager.create_project）
- 组建完整6人团队（MeetingSession.start()）
- 将原始用户消息作为 meeting_message 发送给 MeetingCoordinator
- 向前端发送 {"type": "path_upgrade", "from": "simple", "to": "complex"} 通知

## 验收标准

### AC-1: 简单任务快速执行
当用户发送单步浏览器操作指令（如"打开百度搜索Python"）时，系统 SHALL 在3秒内创建轻量项目、分配单人助理、开始执行并推送首个进度消息，且不启动会议讨论。

### AC-2: 复杂任务完整流程
当用户发送跨部门复杂指令（如"先设计数据库，再开发API，最后测试"）时，系统 SHALL 按以下步骤执行：
1. 创建正式项目（ProjectManager.create_project）
2. 组建多角色团队（6人：CEO + 架构师 + 开发 + DevOps + QA + 项目经理）
3. 启动会议协调器（MeetingCoordinator 初始化）
4. 语义分析（CEO 分析意图，选择执行模式）
5. 任务分配或讨论（工作流/自动指派/多角色讨论）
6. 任务执行（TaskOrchestrator 调度各 Agent 执行子任务）
7. 多轮审查（CriticAgent + GroundingAgent + Reviewer + Monitor + Coordinator）
8. 返回汇总报告

### AC-3: 复杂度判定准确性
基于包含50条测试用例的测试集（25条简单+25条复杂），复杂度判定引擎的准确率 SHALL 不低于90%（45/50）。误判时 SHALL 自动降级到复杂路径。

### AC-4: 简单任务延迟
简单任务端到端延迟（从收到 unified_message 到返回最终结果）SHALL 不超过10秒，其中项目创建不超过1秒。

### AC-5: 统一入口透明性
前端发送 unified_message 消息后，系统 SHALL 自动选择执行路径并返回结果，返回消息中 SHALL 包含 path_used 字段（值为 "simple" 或 "complex"），前端无需关心内部路由细节。

### AC-6: 升级重试机制
当简单路径执行失败（验收不通过）时，系统 SHALL 在5秒内自动升级到复杂路径重新执行，并向前端发送 path_upgrade 通知消息。
