# 自适应协作链路 - 任务清单

## 里程碑

### M1: 核心引擎（复杂度判定 + 简单执行）
- 完成 ComplexityClassifier 实现
- 完成 SimpleExecutor 核心逻辑
- 完成 MeetingSession 模板参数化
- 完成 ProjectManager 轻量创建方法

### M2: 集成与路由
- 完成 server.py unified_message 路由
- 完成简单→复杂升级重试机制
- 完成单元测试

### M3: 测试与验收
- 完成集成测试
- 完成准确率测试（50条用例）
- 完成性能测试
- 完成降级测试

## 任务清单

### T1: 实现 ComplexityClassifier 类
- **优先级**：高
- **依赖**：无
- **描述**：新建 `backend/complexity_classifier.py`，实现 ComplexityClassifier 类，包含 classify()、_rule_classify()、_llm_classify() 方法
- **验收标准**：单元测试覆盖简单/复杂/边界场景，准确率>=90%
- **涉及文件**：`backend/complexity_classifier.py`（新建）

### T2: 实现规则引擎 _rule_classify()
- **优先级**：高
- **依赖**：T1
- **描述**：在 ComplexityClassifier 中实现规则引擎，覆盖浏览器操作、文件处理、多步骤、跨部门等模式
- **验收标准**：覆盖20+简单模式和20+复杂模式，误判率<10%
- **涉及文件**：`backend/complexity_classifier.py`

### T3: 实现 LLM 分类 _llm_classify()
- **优先级**：高
- **依赖**：T1
- **描述**：在 ComplexityClassifier 中实现 LLM 分类，调用 CEO Agent 进行精确分类
- **验收标准**：调用 CEO Agent，输出 JSON 格式分类结果，超时3秒自动降级
- **涉及文件**：`backend/complexity_classifier.py`

### T4: 实现 ProjectManager.create_lightweight_project()
- **优先级**：高
- **依赖**：无
- **描述**：在 ProjectManager 中新增 create_lightweight_project() 方法，仅创建目录+metadata.json
- **验收标准**：仅创建 metadata.json，不创建员工实例，创建耗时<1秒
- **涉及文件**：`backend/project_manager.py`

### T5: 实现 PERSONAL_ASSISTANT_TEMPLATE 和 MeetingSession.start() 参数化
- **优先级**：高
- **依赖**：无
- **描述**：在 meeting.py 中新增 PERSONAL_ASSISTANT_TEMPLATE 常量，修改 start() 方法支持 team_template 参数
- **验收标准**：支持 team_template 参数，默认值为 DEFAULT_MEETING_AGENTS，传入 PERSONAL_ASSISTANT_TEMPLATE 时仅创建1个 Agent
- **涉及文件**：`backend/meeting.py`

### T6: 实现 SimpleExecutor 类
- **优先级**：高
- **依赖**：T4, T5
- **描述**：新建 `backend/simple_executor.py`，实现 SimpleExecutor 类，包含 execute()、_create_lightweight_project()、_create_assistant_team()、_run_task() 方法
- **验收标准**：端到端执行简单任务，延迟<10秒
- **涉及文件**：`backend/simple_executor.py`（新建）

### T7: 实现 _lightweight_review() 轻量验收
- **优先级**：高
- **依赖**：T6
- **描述**：在 SimpleExecutor 中实现 _lightweight_review() 方法，检查工具状态码、截图存在性、结果非空
- **验收标准**：检查工具返回值无 error、截图成功获取、结果文本非空
- **涉及文件**：`backend/simple_executor.py`

### T8: 在 server.py 中实现 unified_message 路由
- **优先级**：高
- **依赖**：T1, T6
- **描述**：在 server.py 的 ws_handler 中新增 unified_message 消息类型处理分支
- **验收标准**：前端发送 unified_message，系统自动选择路径并返回结果
- **涉及文件**：`backend/server.py`

### T9: 实现简单→复杂的自动升级重试
- **优先级**：中
- **依赖**：T6, T7, T8
- **描述**：在 SimpleExecutor 中实现 _upgrade_to_complex() 方法，简单路径验收失败时自动走复杂路径
- **验收标准**：简单路径验收失败时自动走复杂路径，发送 path_upgrade 通知
- **涉及文件**：`backend/simple_executor.py`, `backend/server.py`

### T10: 编写 ComplexityClassifier 单元测试
- **优先级**：中
- **依赖**：T1, T2, T3
- **描述**：编写 ComplexityClassifier 的单元测试，覆盖简单/复杂/边界场景
- **验收标准**：测试覆盖率>=90%，50条测试用例准确率>=90%
- **涉及文件**：`backend/tests/test_complexity_classifier.py`（新建）

### T11: 编写 SimpleExecutor 集成测试
- **优先级**：中
- **依赖**：T6, T7, T8, T9
- **描述**：编写 SimpleExecutor 的集成测试，覆盖端到端执行和升级重试场景
- **验收标准**：简单路径端到端延迟<10秒，升级重试机制正常工作
- **涉及文件**：`backend/tests/test_simple_executor.py`（新建）

### T12: 编写 unified_message 端到端测试
- **优先级**：中
- **依赖**：T8, T9
- **描述**：编写 unified_message 的端到端测试，覆盖简单路径和复杂路径
- **验收标准**：前端发送 unified_message，系统正确选择路径并返回结果
- **涉及文件**：`backend/tests/test_unified_message.py`（新建）

## 完成定义

- [ ] 所有代码已提交并通过代码审查
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 复杂度判定准确率>=90%（50条测试用例）
- [ ] 简单任务端到端延迟<10秒
- [ ] 简单→复杂升级重试机制正常工作
- [ ] 前端发送 unified_message 能正确触发自适应链路
- [ ] 现有复杂路径功能不受影响（回归测试通过）
