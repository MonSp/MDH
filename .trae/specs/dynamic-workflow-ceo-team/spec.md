# Dynamic Workflow CEO团队构建 Spec

## Why
当前CEO Agent的任务指派是单步静态路由：用户输入需求 → CEO语义分析 → DynamicRouter路由到单个部门。这种模式无法处理跨部门协作的复杂任务，例如"设计数据库schema（架构部）→ 实现后端API（后端部）→ 开发前端界面（前端部）→ 编写测试用例（测试部）"。需要引入dynamic workflow理念，让CEO能够动态构建跨部门工作流，实现更灵活的团队协作。

## What Changes
- 新增WorkflowEngine工作流引擎，支持动态工作流定义和执行
- 扩展CEO Agent的语义分析能力，能够识别跨部门复杂任务并生成工作流
- 实现工作流节点（WorkflowNode）和工作流边（WorkflowEdge）的数据结构
- 支持工作流的顺序执行、并行执行和条件分支
- 实现工作流状态管理和监控
- **集成agentscope现有Task系统**：复用Task类的依赖关系机制（blocks/blocked_by），扩展为完整的工作流执行引擎
- 在TechTowerView 3D大楼看板中可视化工作流执行状态

## Impact
- Affected specs: ceo-agent-auto-assign, multi-agent-collaboration-mode
- Affected code: backend/meeting_coordinator.py, backend/protocol.py, backend/dynamic_router.py, src/components/WorkflowPanel.tsx, src/components/OfficeTeamMode.tsx, src/hooks/useMeetingSocket.ts
- Affected agentscope modules: `third_party/agentscope/src/agentscope/state/_task.py`, `third_party/agentscope/src/agentscope/tool/_task/`

## ADDED Requirements

### Requirement: WorkflowEngine 工作流引擎
系统 SHALL 提供工作流引擎，支持动态工作流的定义、执行和管理。

#### Scenario: CEO生成工作流
- **WHEN** 用户输入跨部门复杂需求（包含多个步骤或依赖关系）
- **THEN** CEO Agent分析需求，生成工作流定义（包含节点、边、执行策略）

#### Scenario: 工作流执行
- **WHEN** 工作流被触发执行
- **THEN** 系统按照工作流定义依次执行节点，处理节点间的依赖关系

#### Scenario: 并行执行
- **WHEN** 工作流包含无依赖关系的节点
- **THEN** 系统并行执行这些节点以提高效率

#### Scenario: 条件分支
- **WHEN** 工作流节点包含条件判断
- **THEN** 系统根据条件结果选择执行路径

### Requirement: WorkflowNode 工作流节点
系统 SHALL 支持定义工作流节点，每个节点代表一个可执行的任务单元。

#### Scenario: 节点定义
- **WHEN** 定义工作流节点
- **THEN** 节点包含任务描述、负责部门（dept_id）、输入/输出规范、执行状态

#### Scenario: 节点执行
- **WHEN** 节点被触发执行
- **THEN** 负责部门的领导智能体接收任务描述和输入，规划并分配给员工执行

### Requirement: WorkflowEdge 工作流边
系统 SHALL 支持定义工作流边，表示节点间的依赖关系。

#### Scenario: 依赖关系
- **WHEN** 定义工作流边
- **THEN** 边包含源节点、目标节点、条件表达式（可选）

#### Scenario: 数据传递
- **WHEN** 源节点执行完成
- **THEN** 源节点的输出自动传递给目标节点作为输入

### Requirement: 工作流状态管理
系统 SHALL 提供工作流状态管理，支持工作流的暂停、恢复、取消和重试。

#### Scenario: 状态查询
- **WHEN** 用户查询工作流状态
- **THEN** 系统返回工作流的整体进度、各节点执行状态、已完成/待执行节点列表

#### Scenario: 暂停与恢复
- **WHEN** 用户暂停工作流
- **THEN** 系统停止执行新节点，已完成节点保持状态；用户恢复后继续执行

#### Scenario: 失败重试
- **WHEN** 工作流节点执行失败
- **THEN** 系统支持重试该节点或跳过该节点继续执行

### Requirement: 工作流可视化（独立弹窗组件）
系统 SHALL 提供独立的WorkflowPanel弹窗组件，在对话触发工作流执行后自动弹出。

#### Scenario: 工作流弹窗触发
- **WHEN** 用户通过对话触发CEO生成并执行工作流
- **THEN** 系统自动弹出WorkflowPanel，展示工作流DAG结构和执行状态

#### Scenario: 工作流节点状态展示
- **WHEN** 工作流正在执行
- **THEN** 各节点以颜色区分状态（pending=灰色, running=蓝色, completed=绿色, failed=红色），运行中节点带脉冲动效

#### Scenario: 工作流控制
- **WHEN** 工作流正在执行或已暂停
- **THEN** 用户可通过弹窗中的按钮暂停、恢复、取消工作流，或重试失败节点

## MODIFIED Requirements

### Requirement: CEO Agent语义分析
CEO Agent的语义分析能力需要扩展，支持识别跨部门复杂任务并生成工作流。

#### Scenario: 复杂任务识别
- **WHEN** 用户输入包含多个步骤或依赖关系的需求
- **THEN** CEO Agent识别为复杂任务，生成工作流定义而非简单指派

#### Scenario: 工作流生成
- **WHEN** CEO Agent识别为复杂任务
- **THEN** CEO Agent调用DynamicRouter分析各部门能力，生成工作流定义

### Requirement: MeetingCoordinator集成
MeetingCoordinator需要集成WorkflowEngine，支持工作流的创建和执行。

#### Scenario: 工作流触发
- **WHEN** CEO Agent生成工作流定义
- **THEN** MeetingCoordinator调用WorkflowEngine创建工作流并触发执行

#### Scenario: 工作流监控
- **WHEN** 工作流执行过程中
- **THEN** MeetingCoordinator接收工作流状态更新并推送给前端

### Requirement: DynamicRouter扩展
DynamicRouter需要扩展，支持为工作流节点选择最佳部门。

#### Scenario: 多部门路由
- **WHEN** 工作流包含多个节点
- **THEN** DynamicRouter为每个节点独立选择最佳部门

## REMOVED Requirements
无

## ADDED Requirements (技术实现细节)

### Requirement: agentscope Task系统集成
系统 SHALL 集成agentscope现有的Task系统，复用其依赖关系机制。

#### Scenario: 任务依赖关系复用
- **WHEN** 定义工作流节点依赖关系
- **THEN** 使用agentscope Task类的 `blocks` 和 `blocked_by` 字段表示依赖

#### Scenario: 任务状态映射
- **WHEN** 工作流节点状态变化
- **THEN** 映射到agentscope Task的 `state` 字段（pending, in_progress, completed）

#### Scenario: 工具集成
- **WHEN** 工作流执行过程中
- **THEN** 使用agentscope的TaskCreate、TaskUpdate等工具管理任务状态

### Requirement: WorkflowEngine 数据结构
系统 SHALL 定义以下数据结构：

```python
@dataclass
class WorkflowNodeStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class WorkflowExecutionStatus(Enum):
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class WorkflowNode:
    node_id: str
    task_description: str
    dept_id: str  # 负责部门ID
    input_spec: Dict[str, Any]
    output_spec: Dict[str, Any]
    status: WorkflowNodeStatus
    result: Optional[Dict[str, Any]]

@dataclass
class WorkflowEdge:
    source_node_id: str
    target_node_id: str
    condition: Optional[str]  # 条件表达式

@dataclass
class WorkflowDefinition:
    workflow_id: str
    name: str
    description: str
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    execution_strategy: str  # sequential, parallel, mixed

@dataclass
class WorkflowExecution:
    execution_id: str
    workflow_id: str
    status: WorkflowExecutionStatus
    started_at: str
    completed_at: Optional[str]
    node_states: Dict[str, WorkflowNodeStatus]
    results: Dict[str, Any]
```

### Requirement: WorkflowEngine API
系统 SHALL 提供以下API：

- `create_workflow(definition: WorkflowDefinition) -> WorkflowExecution`
- `execute_workflow(execution_id: str) -> None`
- `pause_workflow(execution_id: str) -> None`
- `resume_workflow(execution_id: str) -> None`
- `cancel_workflow(execution_id: str) -> None`
- `retry_node(execution_id: str, node_id: str) -> None`
- `get_workflow_status(execution_id: str) -> WorkflowExecution`
- `get_workflow_visualization(execution_id: str) -> Dict[str, Any]`

### Requirement: 工作流执行策略
系统 SHALL 支持以下执行策略：

- **sequential**: 节点按顺序依次执行
- **parallel**: 无依赖关系的节点并行执行
- **mixed**: 混合策略，支持并行和条件分支
