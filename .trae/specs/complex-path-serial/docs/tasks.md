# 复杂路径串行流程 - 任务清单

## 里程碑

### M1: 核心重构
- 完成 process_user_message 串行流程重构
- 完成 _enhance_task_description 实现
- 完成 server.py 适配

### M2: 测试验证
- 完成单元测试
- 完成集成测试
- 完成回归测试

## 任务清单

### T1: 重构 process_user_message 为串行流程
- **优先级**：高
- **依赖**：无
- **描述**：将 `process_user_message` 从三选一逻辑改为串行流程：讨论→分派→审查
- **验收标准**：复杂任务调用时，按顺序执行讨论→分派→审查
- **涉及文件**：`backend/meeting_coordinator.py`

### T2: 实现 _enhance_task_description 方法
- **优先级**：高
- **依赖**：T1
- **描述**：新增方法，整合讨论结果到任务描述
- **验收标准**：讨论结果正确整合到任务描述中
- **涉及文件**：`backend/meeting_coordinator.py`

### T3: 将审查结果合并到返回值
- **优先级**：高
- **依赖**：T1
- **描述**：将 `execute_and_review_task` 的结果合并到 `process_user_message` 的返回值
- **验收标准**：返回值包含 review_result 字段
- **涉及文件**：`backend/meeting_coordinator.py`

### T4: 更新 server.py 适配新返回值
- **优先级**：高
- **依赖**：T1, T3
- **描述**：更新 `server.py` 的 `unified_message` 处理逻辑，适配新的返回值格式
- **验收标准**：server.py 正确处理包含所有阶段结果的返回值
- **涉及文件**：`backend/server.py`

### T5: 编写单元测试
- **优先级**：中
- **依赖**：T1, T2, T3
- **描述**：编写 process_user_message 串行流程的单元测试
- **验收标准**：测试覆盖串行执行顺序、讨论结果传递、审查结果合并
- **涉及文件**：`backend/tests/test_process_user_message.py`

### T6: 编写集成测试
- **优先级**：中
- **依赖**：T4
- **描述**：编写端到端集成测试，验证完整流程
- **验收标准**：复杂任务端到端执行正确
- **涉及文件**：`backend/tests/test_serial_flow.py`

### T7: 回归测试
- **优先级**：中
- **依赖**：T4
- **描述**：验证工作流模式和简单路径不受影响
- **验收标准**：工作流模式和简单路径功能正常
- **涉及文件**：`backend/tests/test_regression.py`

## 完成定义

- [ ] process_user_message 重构为串行流程
- [ ] _enhance_task_description 方法实现
- [ ] 审查结果合并到返回值
- [ ] server.py 适配新返回值
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 工作流模式回归测试通过
- [ ] 简单路径回归测试通过
