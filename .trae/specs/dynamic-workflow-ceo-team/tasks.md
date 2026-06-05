# Tasks

## Phase 1: 工作流引擎核心数据结构

### Task 1: 定义工作流数据结构
- [ ] 1.1 在 `backend/protocol.py` 中新增 `WorkflowNodeStatus` 枚举（pending, running, completed, failed, skipped）
- [ ] 1.2 在 `backend/protocol.py` 中新增 `WorkflowExecutionStatus` 枚举（created, running, paused, completed, failed, cancelled）
- [ ] 1.3 在 `backend/protocol.py` 中新增 `WorkflowNode` 数据类（包含 node_id, task_description, dept_id, input_spec, output_spec, status, result）
- [ ] 1.4 在 `backend/protocol.py` 中新增 `WorkflowEdge` 数据类（包含 source_node_id, target_node_id, condition）
- [ ] 1.5 在 `backend/protocol.py` 中新增 `WorkflowDefinition` 数据类（包含 workflow_id, name, description, nodes, edges, execution_strategy）
- [ ] 1.6 在 `backend/protocol.py` 中新增 `WorkflowExecution` 数据类（包含 execution_id, workflow_id, status, started_at, completed_at, node_states, results）
- [ ] 1.7 在 `backend/protocol.py` 中新增序列化函数 `workflow_definition_to_dict()` 和 `workflow_execution_to_dict()`

---

## Phase 2: 工作流引擎实现

### Task 2: 实现 WorkflowEngine 核心类
- [x] 2.1 创建 `backend/workflow_engine.py`，实现 `WorkflowEngine` 类
- [x] 2.2 实现 `create_workflow(definition: WorkflowDefinition) -> WorkflowExecution` 方法
- [x] 2.3 实现 `execute_workflow(execution_id: str) -> None` 方法，支持顺序执行策略
- [x] 2.4 实现 `pause_workflow(execution_id: str) -> None` 方法
- [x] 2.5 实现 `resume_workflow(execution_id: str) -> None` 方法
- [x] 2.6 实现 `cancel_workflow(execution_id: str) -> None` 方法
- [x] 2.7 实现 `retry_node(execution_id: str, node_id: str) -> None` 方法
- [x] 2.8 实现 `get_workflow_status(execution_id: str) -> WorkflowExecution` 方法
- [x] 2.9 实现 `get_workflow_visualization(execution_id: str) -> Dict[str, Any]` 方法

### Task 2.5: 集成agentscope Task系统
- [x] 2.5.1 创建 `backend/agentscope_task_bridge.py`，实现 `AgentscopeTaskBridge` 类
- [x] 2.5.2 实现 `workflow_node_to_task(node: WorkflowNode) -> Task` 方法，将工作流节点转换为agentscope Task
- [x] 2.5.3 实现 `task_to_workflow_node(task: Task) -> WorkflowNode` 方法，反向转换
- [x] 2.5.4 实现 `sync_workflow_to_tasks(workflow: WorkflowExecution) -> List[Task]` 方法，同步工作流状态到Task列表
- [x] 2.5.5 实现 `update_task_dependencies(tasks: List[Task], edges: List[WorkflowEdge])` 方法，更新Task的blocks/blocked_by字段
- [x] 2.5.6 在 `WorkflowEngine` 中集成 `AgentscopeTaskBridge`，实现双向状态同步

### Task 3: 实现并行执行策略
- [x] 3.1 实现依赖关系解析器，构建节点依赖图
- [x] 3.2 实现拓扑排序算法，确定节点执行顺序
- [x] 3.3 实现并行执行逻辑，使用 asyncio.gather 并行执行无依赖节点
- [x] 3.4 实现节点间数据传递机制

### Task 4: 实现条件分支执行策略
- [x] 4.1 实现条件表达式解析器
- [x] 4.2 实现条件分支执行逻辑

---

## Phase 3: CEO Agent 工作流生成

### Task 5: 扩展 CEO Agent 语义分析
- [x] 5.1 修改 `backend/meeting_coordinator.py` 的 `semantic_analyze()` 方法
- [x] 5.2 新增复杂任务识别逻辑：检测用户输入是否包含多步骤或依赖关系
- [x] 5.3 新增工作流生成逻辑：当识别为复杂任务时，调用DynamicRouter分析各部门能力，生成 WorkflowDefinition
- [x] 5.4 修改 `SemanticAnalysisResult` 数据类，新增 `workflow_definition` 字段（可选）

### Task 6: 集成 WorkflowEngine 到 MeetingCoordinator
- [x] 6.1 在 `MeetingCoordinator.__init__()` 中初始化 WorkflowEngine 实例
- [x] 6.2 修改 `process_user_message()` 方法，支持工作流触发
- [x] 6.3 实现工作流执行监控，将状态更新推送给前端
- [x] 6.4 实现工作流完成后的结果汇总

---

## Phase 4: WebSocket 消息处理

### Task 7: 新增工作流相关消息类型
- [x] 7.1 在 `backend/protocol.py` 的 `MeetingMessageType` 枚举中新增 `WORKFLOW_CREATED` 消息类型
- [x] 7.2 在 `backend/protocol.py` 的 `MeetingMessageType` 枚举中新增 `WORKFLOW_STATUS_UPDATE` 消息类型
- [x] 7.3 在 `backend/protocol.py` 的 `MeetingMessageType` 枚举中新增 `WORKFLOW_COMPLETED` 消息类型
- [x] 7.4 在 `backend/protocol.py` 的 `MeetingMessageType` 枚举中新增 `WORKFLOW_NODE_STATUS_UPDATE` 消息类型

### Task 8: 修改 server.py 消息处理
- [x] 8.1 修改 `backend/server.py`，新增工作流相关消息的推送逻辑
- [x] 8.2 实现工作流状态更新的实时推送
- [x] 8.3 实现工作流节点状态更新的实时推送

---

## Phase 5: 前端工作流可视化（TechTowerView集成）

### Task 9: 前端类型定义与模块
- [x] 9.1 在 `src/modules/agentTypes.ts` 中新增 `WorkflowNode`, `WorkflowEdge`, `WorkflowDefinition`, `WorkflowExecution` 类型定义
- [x] 9.2 创建 `src/modules/workflowEngine.ts`：封装 WorkflowEngine API 调用
- [x] 9.3 修改 `src/hooks/useMeetingSocket.ts`，新增工作流相关消息的处理

### Task 10: TechTowerView工作流可视化
- [x] 10.1 在 `src/components/TechTowerView.tsx` 中新增工作流连线渲染（使用Line组件连接相关楼层）
- [x] 10.2 实现工作流节点状态颜色映射（pending=灰色, running=蓝色, completed=绿色, failed=红色）
- [x] 10.3 实现工作流执行时的数据流粒子加速效果
- [x] 10.4 新增工作流状态面板组件，展示当前工作流进度

### Task 11: 工作流控制交互
- [x] 11.1 在侧边面板中新增工作流控制按钮（暂停、恢复、取消、重试）
- [x] 11.2 实现点击工作流节点聚焦到对应楼层的功能
- [x] 11.3 实现工作流节点详情展示

---

## Phase 6: 测试与验证

### Task 12: 后端单元测试
- [x] 12.1 创建 `backend/tests/test_workflow_engine.py`：测试 WorkflowEngine 核心功能
- [x] 12.2 测试顺序执行策略
- [x] 12.3 测试并行执行策略
- [x] 12.4 测试条件分支执行策略
- [x] 12.5 测试工作流状态管理（暂停、恢复、取消、重试）
- [x] 12.6 测试节点间数据传递

### Task 13: 集成测试
- [x] 13.1 测试 CEO Agent 复杂任务识别和工作流生成
- [x] 13.2 测试 MeetingCoordinator 集成 WorkflowEngine
- [x] 13.3 测试 WebSocket 消息推送
- [x] 13.4 测试前端工作流可视化组件

---

## Task Dependencies

- Task 1（数据结构定义）可立即开始，无依赖
- Task 2（WorkflowEngine 核心）依赖 Task 1
- Task 2.5（agentscope集成）依赖 Task 1、Task 2
- Task 3（并行执行）依赖 Task 2、Task 2.5
- Task 4（条件分支）依赖 Task 2、Task 2.5
- Task 5（CEO Agent 扩展）依赖 Task 1
- Task 6（MeetingCoordinator 集成）依赖 Task 2、Task 2.5、Task 5
- Task 7（消息类型）依赖 Task 1
- Task 8（server.py 修改）依赖 Task 6、Task 7
- Task 9（前端类型）依赖 Task 1
- Task 10（TechTowerView可视化）依赖 Task 9
- Task 11（工作流控制）依赖 Task 10
- Task 12（后端测试）依赖 Task 2、Task 2.5、Task 3、Task 4
- Task 13（集成测试）依赖 Task 6、Task 8、Task 11

### 可并行执行的任务组
- **并行组 A**: Task 1 + Task 9（数据结构定义 + 前端类型定义）
- **串行依赖链**: Task 1 → Task 2 → Task 2.5 → Task 3/Task 4
- **串行依赖链**: Task 1 → Task 5 → Task 6
- **串行依赖链**: Task 1 → Task 7 → Task 8
- **串行依赖链**: Task 9 → Task 10 → Task 11
- **并行组 B**: Task 3 + Task 4（并行执行 + 条件分支，可并行开发）
- **并行组 C**: Task 12 + Task 13（后端测试 + 集成测试，可并行开发）
