# 自适应协作链路 - 设计规格

## 设计目标

1. **最小侵入**：新增模块为主，现有模块仅做最小改动（server.py 新增路由分支、meeting.py 新增模板参数、project_manager.py 新增轻量方法）
2. **复用优先**：简单路径最大化复用现有 agent.py 的 run_agent_stream + _build_browser_tools
3. **安全降级**：复杂度判定不确定时走复杂路径，简单路径失败时自动升级
4. **统一接口**：前端只需发送 unified_message，系统内部自动分流

## 模块划分

### 新增模块

#### 1. ComplexityClassifier（复杂度判定器）
**文件**：`backend/complexity_classifier.py`

```
ComplexityClassifier
├── classify(message: str) -> ComplexityResult
├── _rule_classify(message: str) -> ComplexityResult | None
├── _llm_classify(message: str) -> ComplexityResult
└── _is_simple_pattern(message: str) -> bool
```

**数据结构**：
```python
@dataclass
class ComplexityResult:
    level: str  # "simple" | "complex"
    confidence: float  # 0.0 - 1.0
    reason: str
    method: str  # "rule" | "llm"
```

**规则引擎逻辑**：
- 简单模式匹配：单步浏览器指令（打开/搜索/点击/填写/截图）、单文件操作、无多步骤连词
- 复杂模式匹配：多步骤连词（首先...然后...最后）、跨部门关键词（前端+后端+测试）、动词计数>=3
- 置信度计算：匹配到简单模式 → confidence=0.9；匹配到复杂模式 → confidence=0.95；都不匹配 → confidence=0.3 → 触发LLM

#### 2. SimpleExecutor（简单执行引擎）
**文件**：`backend/simple_executor.py`

```
SimpleExecutor
├── execute(session: Session, content: str, on_progress: Callable) -> SimpleResult
├── _create_lightweight_project(session: Session) -> str
├── _create_assistant_team(session: Session) -> MeetingSession
├── _run_task(session: Session, content: str, on_progress: Callable) -> str
├── _lightweight_review(result: str, tool_calls: list) -> ReviewResult
└── _upgrade_to_complex(session: Session, content: str) -> dict
```

**数据结构**：
```python
@dataclass
class SimpleResult:
    success: bool
    result: str
    project_id: str
    review_passed: bool
    retry_with_complex: bool
    tool_calls: list

@dataclass
class ReviewResult:
    passed: bool
    checks: dict  # {"tool_errors": bool, "screenshot_ok": bool, "result_non_empty": bool}
    reason: str
```

**执行流程**：
1. 创建轻量项目容器（调用 ProjectManager.create_lightweight_project）
2. 创建助理团队（MeetingSession.start with PERSONAL_ASSISTANT_TEMPLATE）
3. 调用 run_agent_stream 执行任务
4. 收集执行过程中的工具调用结果
5. 执行轻量验收
6. 验收通过 → 返回结果；验收失败 → 升级到复杂路径

### 修改模块

#### 3. MeetingSession（会议会话）
**文件**：`backend/meeting.py`

**改动**：
- 新增 `PERSONAL_ASSISTANT_TEMPLATE` 常量
- `start()` 方法新增可选参数 `team_template: list = None`，默认使用 `DEFAULT_MEETING_AGENTS`

```python
PERSONAL_ASSISTANT_TEMPLATE = [
    {
        "id": "agent-assistant",
        "name": "私人助理",
        "role": AgentRole.EXECUTOR,
        "capabilities": ["browser_automation", "file_operation", "code_generation", "frontend_dev", "backend_dev"],
    },
]

class MeetingSession:
    def start(self, team_template: list = None) -> None:
        template = team_template or DEFAULT_MEETING_AGENTS
        self.agents = []
        for agent_def in template:
            # ... 现有逻辑
```

#### 4. ProjectManager（项目管理器）
**文件**：`backend/project_manager.py`

**改动**：
- 新增 `create_lightweight_project()` 方法

```python
def create_lightweight_project(self, name: str, brief: dict) -> Project:
    """创建轻量项目容器（不实例化员工）"""
    project_id = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    project = Project(
        project_id=project_id,
        name=name,
        status=PROJECT_STATUS_RUNNING,  # 直接标记为运行中
        brief={**brief, "mode": "lightweight"},
        created_at=now,
    )
    
    # 仅创建项目目录和 metadata.json
    project_dir = self._get_project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    self._save_project(project)
    self._projects[project_id] = project
    
    return project
```

#### 5. Server（WebSocket 服务器）
**文件**：`backend/server.py`

**改动**：
- 新增 `unified_message` 消息类型处理分支
- 新增 `_complexity_classifier` 和 `_simple_executor` 实例

```python
# 模块级初始化
_complexity_classifier = ComplexityClassifier(get_model_fn=...)
_simple_executor = SimpleExecutor(project_manager=project_manager)

# ws_handler 中新增分支
elif msg_type == "unified_message":
    content = msg.get("content", "")
    if not content:
        continue
    
    # 1. 复杂度判定
    complexity = _complexity_classifier.classify(content)
    await ws.send_json({"type": "complexity_result", "level": complexity.level, "confidence": complexity.confidence})
    
    if complexity.level == "simple" and complexity.confidence >= 0.7:
        # ===== 简单路径 =====
        result = await _simple_executor.execute(session, content, send_progress)
        if result.retry_with_complex:
            # 升级到复杂路径
            result = await _simple_executor.upgrade_to_complex(session, content)
        await ws.send_json({"type": "task_result", "path_used": "simple", **asdict(result)})
    else:
        # ===== 复杂路径 =====
        await ws.send_json({"type": "path_selected", "path": "complex"})
        
        # ① 创建正式项目
        project = project_manager.create_project(
            name=f"任务-{content[:20]}",
            brief={"source": "unified_message", "original_message": content}
        )
        
        # ② 组建多角色团队（6人）
        meeting_id = str(uuid.uuid4())[:8]
        meeting = MeetingSession(meeting_id)
        meeting.start()  # 使用 DEFAULT_MEETING_AGENTS 初始化6个Agent
        session.meeting_session = meeting
        session.meeting_mode = True
        
        # ③ 启动会议协调器
        coordinator = MeetingCoordinator(
            meeting_session=meeting,
            provider=session.provider,
            model_name=session.model_name or "",
            api_key=session.api_key,
            base_url=session.base_url or "",
        )
        session._meeting_coordinator = coordinator
        
        await ws.send_json({
            "type": "meeting_started",
            "meeting_id": meeting_id,
            "agents": meeting.get_agents_dict(),
        })
        
        # ④-⑦ 语义分析 → 任务分配/讨论 → 执行 → 审查
        result = await coordinator.process_user_message(content, send_agent_message)
        # ... 处理结果并返回
```

## 数据流

```
用户消息 (unified_message)
    │
    ▼
ComplexityClassifier.classify()
    │
    ├── simple (confidence >= 0.7)
    │       │
    │       ▼
    │   SimpleExecutor.execute()
    │       │
    │       ├── ① 创建轻量项目: create_lightweight_project()
    │       ├── ② 创建助理团队: MeetingSession.start(PERSONAL_ASSISTANT_TEMPLATE)
    │       │                  → 仅1个Executor Agent
    │       ├── ③ 直接执行: run_agent_stream()（跳过会议）
    │       ├── ④ 轻量验收: _lightweight_review()
    │       │       │
    │       │       ├── passed → 返回结果 (path_used: "simple")
    │       │       └── failed → upgrade_to_complex()
    │       │
    │       └── 返回结果
    │
    └── complex (或 confidence < 0.7)
            │
            ▼
        ① 创建正式项目: ProjectManager.create_project()
            │
            ▼
        ② 组建多角色团队: MeetingSession.start(DEFAULT_MEETING_AGENTS)
           → CEO + 架构师 + 开发 + DevOps + QA + 项目经理（6人）
            │
            ▼
        ③ 启动会议: MeetingCoordinator 初始化
            │
            ▼
        ④ 语义分析: SemanticAnalyzer.analyze()
            │
            ├── workflow → 创建工作流 → 多节点顺序/并行执行
            ├── task → auto_assign_task() → 指派给最合适的Agent
            └── discussion → run_discussion() → 多角色讨论达成共识
            │
            ▼
        ⑤ 任务执行: TaskOrchestrator.execute()
            │
            ▼
        ⑥ 多轮审查: ReviewPipeline.review()
           → CriticAgent审查 + GroundingAgent接地
           → Reviewer审查 + Monitor评估 + Coordinator总结
            │
            ▼
        ⑦ 返回结果 (path_used: "complex")
```

## 失败处理策略

| 失败场景 | 处理方式 |
|---------|---------|
| 规则引擎无法判定 | confidence=0.3，触发LLM分类 |
| LLM 分类超时/异常 | 默认走复杂路径（宁重勿轻） |
| 简单路径工具执行失败 | _lightweight_review 检测到 error，触发升级 |
| 简单路径截图失败 | _lightweight_review 检测到截图缺失，触发升级 |
| 升级到复杂路径失败 | 返回错误消息给用户，记录日志 |
| 轻量项目创建失败 | 捕获异常，降级到复杂路径 |

## 质量控制

1. **单元测试**：ComplexityClassifier 的规则引擎覆盖20+简单模式和20+复杂模式
2. **集成测试**：端到端测试简单路径和复杂路径的完整流程
3. **性能测试**：简单路径延迟<10秒，复杂路径延迟与现有系统持平
4. **准确率测试**：50条测试用例，复杂度判定准确率>=90%
5. **降级测试**：模拟各种失败场景，验证自动升级机制
