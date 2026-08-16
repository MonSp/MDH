# P1 实施计划 — 精确代码事实（P0 已合并，代码已更新）

> 提取日期: 2026-08-13 | 工作目录: /home/test/MDH | 只读取证，未修改任何文件
> 所有行号基于当前仓库工作树。

---

## A. 路由断链修复（自适应路由学习）

### A1. 复杂任务（串行流程）任务执行的完整路径

`MeetingCoordinator.process_user_message` 串行分支（非工作流）的执行链：
`process_user_message` → `auto_assign_task`（写 `self._task_routing`）→ 开发循环 `execute_assigned_tasks` → `self._task_orchestrator.execute()` → `_execute_sequential/_execute_parallel` → `self._router.update_stats(...)`。

**文件: backend/meeting_coordinator.py:769-774**（execute_assigned_tasks 委托链）
```python
    async def execute_assigned_tasks(self) -> List[Dict[str, Any]]:
        """执行已分配的任务（委托给TaskOrchestrator）

        WhyBuddy化：委托给TaskOrchestrator。
        """
        return await self._task_orchestrator.execute(on_progress=self._on_message)
```

**文件: backend/meeting_coordinator.py:776-799**（execute_and_review_task，已拆分给 ReviewPipeline）
```python
    async def execute_and_review_task(
        self,
        task_description: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """执行任务并审查（委托给ReviewPipeline）
        ...
        """
        task_results = await self.execute_assigned_tasks()
        for task_result in task_results:
            await on_message(task_result["agent_id"], task_result["result"], "")

        review_result = {}
        if task_results:
            execution_result = task_results[0]["result"]
            review_result = await self._review_pipeline.review(
                task_description, execution_result, on_message
            )

        return review_result, task_results
```

**实际生产路径：process_user_message 的开发循环（backend/meeting_coordinator.py:1158-1237）**（关键节选）
```python
        for dev_iter in range(1, max_dev_iterations + 1):
            # 执行
            ...
            try:
                exec_results = await self.execute_assigned_tasks()   # → TaskOrchestrator.execute
                execution_results = exec_results
                ...
            except Exception as e:
                self.logger.warning("第 %d 轮执行失败: %s", dev_iter, e)
                exec_results = []
            ...
            try:
                review_result = await self._review_pipeline.review(
                    enhanced_description, execution_text, on_message,
                    discussion_context=discussion_context,
                )
            ...
```

**TaskOrchestrator 构造（backend/meeting_coordinator.py:148-153）**
```python
        self._task_orchestrator = TaskOrchestrator(
            get_model_fn=self._get_model,
            meeting=self.meeting,
            router=self.router,
            workspace_root=workspace.root_path if workspace else None,
        )
```

**TaskOrchestrator.execute 签名（backend/task_orchestrator.py:158-173）**
```python
    async def execute(self, on_progress: Callable = None, parallel: bool = False) -> List[Dict[str, Any]]:
        """执行已分配的任务
        ...
        """
        assigned_tasks = [t for t in self._meeting.tasks if t.status == "assigned"]

        if parallel and len(assigned_tasks) > 1:
            return await self._execute_parallel(assigned_tasks, on_progress)
        return await self._execute_sequential(assigned_tasks, on_progress)
```

### A2. DynamicRouter.update_stats 签名与调用要求

**文件: backend/dynamic_router.py:444-471**
```python
    def update_stats(self, dept_id: str, success: bool) -> bool:
        """更新部门的任务统计数据

        Args:
            dept_id: 部门 ID
            success: 任务是否成功

        Returns:
            更新是否成功
        """
        with self._lock:
            entry = self._table.get(dept_id)
            if entry is None:
                logger.warning("更新统计失败: 部门 %s 不存在", dept_id)
                return False

            entry.total_tasks += 1
            if success:
                entry.successful_tasks += 1
            entry.success_rate = (
                entry.successful_tasks / entry.total_tasks
                if entry.total_tasks > 0
                else 0.0
            )
            entry.last_active = _now_iso()

        # 持久化
        return self.save_routing_table()
```
- 要求：`dept_id` 必须是路由表中已存在的部门，否则返回 False。当前表含 7 个部门：`dept-frontend, dept-backend, dept-fullstack, dept-qa, dept-devops, dept-data, dept-docs`（backend/data/routing_table.json）。

### A3. meeting_coordinator.py:730 附近 `_task_routing` 写入点

实际写入点在 **backend/meeting_coordinator.py:869-872**（`auto_assign_task` 内，非 730；730 行是 handle_critical_blocker 内部）：
```python
        # 记录路由部门，用于后续统计更新
        routing = self.last_routing_decision
        if routing and routing.selected_dept:
            self._task_routing[task.id] = routing.selected_dept
```
- `self._task_routing` 声明：**backend/meeting_coordinator.py:130** `self._task_routing: Dict[str, str] = {}  # task_id -> dept_id`
- `last_routing_decision`（backend/meeting_coordinator.py:169-172）委托给 `self._semantic_analyzer.last_routing_decision`（backend/semantic_analyzer.py:36-40，`_last_routing_decision` 在 analyze() 第 53-54 行由 `self._router.route(user_message)` 赋值）。
- **关键断链点**：meeting_coordinator._task_routing 只写不读——全文件仅 130/872 两处出现，从未被消费。

### A4. TaskOrchestrator.py:361-363, 380-382 update_stats 调用上下文

**成功分支（backend/task_orchestrator.py:357-363）**
```python
                self._meeting.update_task_status(task.id, "completed")
                self._meeting.update_agent_status(task.agent_id, MeetingAgentStatus.MEETING)
                
                # 更新路由统计
                dept_id = self._task_routing.get(task.id)
                if dept_id:
                    self._router.update_stats(dept_id, success=True)
```

**失败分支（backend/task_orchestrator.py:375-382）**
```python
            except Exception as e:
                logger.error("任务执行失败: task_id=%s error=%s", task.id, e)
                self._meeting.update_task_status(task.id, "failed")
                self._meeting.update_agent_status(task.agent_id, MeetingAgentStatus.MEETING)
                
                dept_id = self._task_routing.get(task.id)
                if dept_id:
                    self._router.update_stats(dept_id, success=False)
```

**TaskOrchestrator 自己的 `_task_routing` 来源（backend/task_orchestrator.py:100-156 assign 方法）**
```python
    async def assign(self, subtasks: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        ...
        for subtask in subtasks:
            task_text = (subtask.get("name", "") + " " + subtask.get("description", "")).lower()
            
            # 使用DynamicRouter路由
            routing_decision = self._router.route(task_text)
            
            # 构建回退链
            if routing_decision.candidate_depts:
                fallback_chain = RoutingFallbackBuilder.build_from_candidates(
                    routing_decision.candidate_depts
                )
                target_dept = fallback_chain.primary
            else:
                target_dept = routing_decision.selected_dept or "dept-fullstack"
            ...
            self._task_routing[task.id] = target_dept
```
- TaskOrchestrator._task_routing 声明：**backend/task_orchestrator.py:50** `self._task_routing: Dict[str, str] = {}`
- **第二断链点**：串行流程中 `auto_assign_task`（meeting_coordinator:1091）绕过 `TaskOrchestrator.assign()`，直接向 meeting 加 task；因此 TaskOrchestrator 的 `_task_routing` 为空 → `_execute_sequential` 中 `dept_id = self._task_routing.get(task.id)` 恒为 None → `update_stats` 永不触发。

### A5. 结论（断链机理与修复插入点）

- 断链：`meeting_coordinator._task_routing`（有数据）从未读；`task_orchestrator._task_routing`（有读取）从未被写入。两本字典割裂。
- 修复数据来源：`dept_id` 可从 `meeting_coordinator.last_routing_decision.selected_dept`（SemanticAnalyzer 缓存的路由决策）或 `auto_assign_task` 已写入的 `self._task_routing[task.id]` 获取；`success` 判定依据 `exec_results` 中 task 是否出现在 results 列表且无异常（orchestrator 抛异常才走 fail 分支）。
- 推荐插入点（二选一或并用）：
  1. `TaskOrchestrator.execute()` 完成后由 meeting_coordinator 统一兜底：遍历 `self._task_routing`，对每个已完成/失败 task 调用 `self.router.update_stats(dept_id, success)`。
  2. 在 `process_user_message` 开发循环退出后（`# 生成项目总结报告` 之前，meeting_coordinator.py:1239 附近）追加统一 update 循环。
- 现有测试 `test_meeting_coordinator_router.py` 已固化断链现状（见下方清单），改动后需同步更新断言。

---

## B. 技能闭环自动触发

### B1. experience_extractor.py 审核/写入签名

**approve_rule（backend/experience_extractor.py:405-424）**
```python
    def approve_rule(self, rule_id: str, reviewer_comment: str = "") -> bool:
        """批准规则

        Args:
            rule_id: 规则 ID
            reviewer_comment: 审核意见
        Returns:
            操作是否成功
        """
        rule = self._load_rule(rule_id)
        if rule is None:
            logger.warning("Cannot approve: rule %s not found", rule_id)
            return False

        rule.status = "approved"
        if reviewer_comment:
            rule.note = f"{rule.note}\n[审核意见] {reviewer_comment}"
        self._save_rule(rule)
        logger.info("Rule %s approved", rule_id)
        return True
```

**write_to_incremental_area（backend/experience_extractor.py:480-519）**
```python
    def write_to_incremental_area(self, rule: ExperienceRule) -> bool:
        """将审核通过的规则写入增量区

        Args:
            rule: 已批准的经验规则
        Returns:
            写入是否成功
        """
        if rule.status != "approved":
            logger.warning("Rule %s is not approved (status=%s), cannot write", rule.rule_id, rule.status)
            return False

        approved_dir = os.path.join(self._incremental_dir, "approved")
        os.makedirs(approved_dir, exist_ok=True)
        ...
        path = os.path.join(approved_dir, f"{rule.rule_id}.yaml")
        try:
            with open(path, "w", encoding="utf-8") as f:
                yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            logger.info("Rule %s written to incremental area", rule.rule_id)
            return True
```

- **pending 规则审核现状**：**没有批量审核方法**。只有逐条 `approve_rule` / `reject_rule`（426-444）/ `modify_rule`（446-476）。批量模式需自建：`get_pending_rules()`（580-586）→ for 循环 `approve_rule()` → for 循环 `write_to_incremental_area()`。`demo_full_cycle.py:153-181 demo_skill_evolution()` 已示范"全部采纳"模式：
```python
    pending = extractor.get_pending_rules()
    ...
    for rule in pending:
        extractor.approve_rule(rule.rule_id)
```

### B2. skill_packager.py merge_skills / full_package 签名

**merge_skills（backend/skill_packager.py:174-190）**
```python
    def merge_skills(self, base_skill_path: str, incremental_path: str) -> str:
        """合并基础技能包和增量区。

        Args:
            base_skill_path: 基础技能包路径（只读参考）
            incremental_path: 增量区路径

        Returns:
            合并后的临时目录路径
        ...
        """
```

**full_package（backend/skill_packager.py:591-597）**
```python
    def full_package(
        self,
        base_skill_path: str,
        incremental_path: str,
        project_id: str,
        skill_name: str,
    ) -> PackageResult:
        """完整打包流程。
        1. merge_skills 2. desensitize_check 3. generate_readme 4. package_zip 5. 清理临时文件
        ...
        """
```
- 所需参数：`base_skill_path`（基础技能包目录，如 `skill_packs/frontend_dev`）、`incremental_path`（增量区，如 `backend/data/experience`）、`project_id`、`skill_name`。
- `SkillPackager.__init__(self, output_dir: str)`（skill_packager.py:120-127）。
- `PackageResult`（skill_packager.py:102-111）：`package_path, readme_content, desensitize_report, diff_summary, skill_name, base_version, output_version`。

### B3. server.py /api/skills/package 与 /api/skills/evolve 完整实现

**/api/skills/package（backend/server.py:479-499）**
```python
@app.post("/api/skills/package")
async def package_skill(body: dict = Body(...)):
    try:
        base_skill_path = body["base_skill_path"]
        incremental_path = body["incremental_path"]
        project_id = body["project_id"]
        skill_name = body["skill_name"]
        result = skill_packager.full_package(
            base_skill_path=base_skill_path,
            incremental_path=incremental_path,
            project_id=project_id,
            skill_name=skill_name,
        )
        return _ok(_package_result_to_dict(result))
    except KeyError:
        return _fail("缺少必填字段: base_skill_path, incremental_path, project_id, skill_name")
    except FileNotFoundError as e:
        return _fail(str(e))
    except Exception as e:
        logger.exception("package_skill 失败")
        return _fail(str(e))
```

**/api/skills/evolve（backend/server.py:514-553）**
```python
@app.post("/api/skills/evolve")
async def evolve_skills(body: dict = Body(...)):
    """从项目结果中提取经验规则，触发技能进化"""
    try:
        project_id = body.get("project_id", "")
        task_description = body.get("task_description", "")
        discussion_results = body.get("discussion_results", [])
        review_result = body.get("review_result", {})
        execution_results = body.get("execution_results", [])

        if not project_id:
            return _fail("缺少 project_id")

        rules = experience_extractor.extract_from_meeting(
            project_id=project_id,
            task_description=task_description,
            discussion_results=discussion_results,
            review_result=review_result,
            execution_results=execution_results,
        )

        return _ok({
            "project_id": project_id,
            "rules_count": len(rules),
            "rules": [
                {
                    "rule_id": r.rule_id,
                    "trigger_condition": r.trigger_condition,
                    "action": r.action,
                    "note": r.note,
                    "rule_type": r.rule_type,
                    "status": r.status,
                    "keywords": r.keywords,
                }
                for r in rules
            ],
        })
    except Exception as e:
        logger.exception("evolve_skills 失败")
        return _fail(str(e))
```
- 全局实例（backend/server.py:115-126）：`skill_packager = SkillPackager(output_dir=backend/data/packages)`、`experience_extractor = ExperienceExtractor(incremental_dir=backend/data/experience)`。
- 相关 REST：`/api/experience/rules`（405）、`/api/experience/rules/pending`（415）、`/api/experience/rules/{rule_id}/approve`（425-435）、`/reject`（438）、`PUT /{rule_id}`（451）。

### B4. 会议/项目结束钩子

- **无 `end_meeting` 方法在 MeetingCoordinator 内**；会议结束在 server.py WebSocket 处理器中：
  **backend/server.py:1440-1465**
```python
            elif msg_type == "end_meeting":
                if not session.meeting_session:
                    await session.send_error("没有进行中的会议")
                    continue

                summary = session.meeting_session.get_summary()
                session.meeting_session.stop()
                session.meeting_session.cleanup()
                meeting_id = session.meeting_session.meeting_id
                session.clear_meeting()
                
                # 清理工作区
                if session._workspace_manager and session._workspace:
                    try:
                        session._workspace_manager.cleanup_workspace(session._workspace)
                        ...
```
- **串行任务完成天然钩子**（已存在技能提取代码）：**backend/meeting_coordinator.py:1252-1273**，即 `process_user_message` 开发循环结束、项目总结之后：
```python
        # 技能进化：从项目结果中提取经验规则
        try:
            from experience_extractor import ExperienceExtractor
            import os
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
            evolution_rules = extractor.extract_from_meeting(
                project_id=self.meeting.meeting_id,
                task_description=user_message,
                discussion_results=discussion_results,
                review_result=review_result,
                execution_results=execution_results,
            )
            if evolution_rules:
                evolution_text = (
                    f"项目经理：已从本次项目中提取 {len(evolution_rules)} 条经验规则，"
                    f"可在「技能进化」面板中查看和审核。"
                )
                await self._msg(coordinator_id, evolution_text)
                self.meeting.add_message("agent", evolution_text, coordinator_id)
        except Exception as e:
            self.logger.warning("技能进化提取失败: %s", e)
```
- **建议插入点**：此处（meeting_coordinator.py:1271 之后）追加"自动审核 pending → write_to_incremental_area → skill_packager.full_package"；或 server.py:1440 `end_meeting` 分支在 `session.meeting_session.stop()` 之前按 session 的 `_meeting_coordinator` 触发。注意 `end_meeting` 分支此刻尚无 coordinator 引用（需经 `session._meeting_coordinator` / `session._ceo_agent`）。
- MeetingSession 结束方法（backend/meeting.py）：`stop()`（178-181）、`get_summary()`（262）、`is_running()`（276）、`cleanup()`（279）。

### B5. 现有 pending 规则数量/来源

- 提取入口：`extract_from_meeting`（experience_extractor.py:606-719），产出规则 `status="pending_review"`，并立即 `self._save_rule(rule)`（714-716）**持久化到磁盘** `backend/data/experience/rules/<rule_id>.yaml`（`_save_rule` 136-156；`_rules_dir = incremental_dir/rules`，127-128）。**不是内存态**。
- 当前数据现状：`backend/data/experience/rules/` 共 115 个 YAML 文件；`pending_review` 80 个、`approved` 35 个（按字段检索统计）。`rules/approved` 子目录当前为空——**approved 规则并未调用 write_to_incremental_area 写增量**（`write_to_incremental_area` 写入的是 `incremental_dir/approved/`，注意与 `rules/` 是两个位置；pending/approved 规则都存在于 `rules/` 下）。
- 前端查询走 `/api/experience/rules/pending`（server.py:415-422）。

---

## C. DAG 去硬编码

### C1. semantic_analyzer.py _generate_workflow_definition 全文（:196-269）

```python
    def _generate_workflow_definition(self, user_message: str, routing_decision: RoutingDecision):
        """根据用户消息生成工作流定义"""
        import uuid
        from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowNodeStatus
        
        workflow_id = str(uuid.uuid4())[:8]
        nodes = []
        edges = []
        
        if '前端' in user_message or 'frontend' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="前端开发任务",
                dept_id="dept-frontend",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if '后端' in user_message or 'backend' in user_message or 'api' in user_message.lower():
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="后端开发任务",
                dept_id="dept-backend",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if '测试' in user_message or 'test' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="测试任务",
                dept_id="dept-qa",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if '部署' in user_message or 'deploy' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="部署任务",
                dept_id="dept-devops",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if not nodes and routing_decision.selected_dept:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description=user_message[:100],
                dept_id=routing_decision.selected_dept,
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if not nodes:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description=user_message[:100],
                dept_id="dept-fullstack",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        dept_order = ["dept-frontend", "dept-backend", "dept-qa", "dept-devops"]
        sorted_nodes = sorted(nodes, key=lambda n: dept_order.index(n.dept_id) if n.dept_id in dept_order else 999)
        
        for i in range(len(sorted_nodes) - 1):
            edges.append(WorkflowEdge(
                source_node_id=sorted_nodes[i].node_id,
                target_node_id=sorted_nodes[i + 1].node_id,
            ))
        
        return WorkflowDefinition(
            workflow_id=workflow_id,
            name=f"工作流-{user_message[:30]}",
            description=user_message,
            nodes=nodes,
            edges=edges,
            execution_strategy="mixed",
        )
```
- **硬编码点**：部门关键词分支（前端/后端/api/测试/部署）、`dept_order` 排序、`execution_strategy="mixed"` 固定、task_description 全为固定文案。

### C2. protocol.py WorkflowDefinition/Node/Edge 构造字段（backend/protocol.py:13-60）

```python
class WorkflowNodeStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class WorkflowNode:
    node_id: str
    task_description: str
    dept_id: str  # 负责部门ID
    input_spec: dict = field(default_factory=dict)
    output_spec: dict = field(default_factory=dict)
    status: WorkflowNodeStatus = WorkflowNodeStatus.PENDING
    result: dict | None = None

@dataclass
class WorkflowEdge:
    source_node_id: str
    target_node_id: str
    condition: str | None = None  # 条件表达式

@dataclass
class WorkflowDefinition:
    workflow_id: str
    name: str
    description: str
    nodes: List[WorkflowNode] = field(default_factory=list)
    edges: List[WorkflowEdge] = field(default_factory=list)
    execution_strategy: str = "sequential"  # sequential, parallel, mixed
```
- 附 `WorkflowExecutionStatus`（22-29）、`WorkflowExecution`（63-72：`execution_id, workflow_id, status, started_at, completed_at, node_states, results`）。

### C3. PlannerAgent 公开接口与输出格式（backend/collaboration/planner_agent.py）

公开方法（含行号）：
| 方法 | 行号 | 签名 |
|---|---|---|
| `plan_task` | 84 | `async def plan_task(self, task_description: str, context: Dict[str, Any] = None) -> TaskPlan` |
| `_decompose_task` | 94 | `def _decompose_task(self, task_description: str, context=None) -> List[SubTask]`（规则关键词匹配，非 LLM） |
| `register_child_agent` | 226 | `def register_child_agent(self, agent_id: str, agent: Any) -> None` |
| `assign_tasks` | 232 | `async def assign_tasks(self) -> Dict[str, List[str]]` |
| `update_subtask_status` | 332 | `async def update_subtask_status(self, subtask_id: str, status: TaskStatus, result=None, error=None) -> None` |
| `get_plan_status` | 363 | `def get_plan_status(self) -> Optional[Dict[str, Any]]` |
| `execute_plan` | 385 | `async def execute_plan(self) -> Dict[str, Any]` |
| `generate_review_feedback` | 417 | `def generate_review_feedback(self, task: SubTask, output: str, context=None) -> Dict[str, Any]` |

- 数据模型：`SubTask`（35-51：`id,name,description,status,priority,assigned_to,dependencies,result,error,created_at,started_at,completed_at,acceptance_criteria,required_skills,input_spec,output_spec`）、`TaskPlan`（54-62）。
- **复用评估**：`_decompose_task` 输出 `List[SubTask]`，SubTask 含 `required_skills/input_spec/output_spec/acceptance_criteria`，可桥接到 `WorkflowNode(input_spec=..., output_spec=...)`；但 `_decompose_task` 是**规则关键词驱动**（98 行起按"网站/web/前端"等硬编码分支），非 LLM，且产出的 dept 映射需自定义。**没有现成返回 WorkflowDefinition 的方法**。

### C4. meeting_coordinator 中 planner 现有使用

- 构造：**backend/meeting_coordinator.py:133** `self.planner = PlannerAgent(name="coordinator_planner")`
- 使用（生成结构化验收反馈）：**backend/meeting_coordinator.py:801-821**
```python
    def _generate_structured_feedback(
        self, task_description: str, execution_result: str
    ) -> Dict[str, Any]:
        """使用 PlannerAgent 生成结构化验收反馈，无 PlannerAgent 时降级。"""
        if self.planner:
            # 将任务描述转换为 SubTask 以便调用 generate_review_feedback
            subtask = SubTask(
                name=task_description[:100],
                description=task_description,
            )
            feedback = self.planner.generate_review_feedback(
                task=subtask,
                output=execution_result,
            )
        else:
            feedback = {
                "status": "approved",
                "issues": [],
                "max_iterations": 3,
            }
        return feedback
```
- 另注入 `ReviewPipeline`（meeting_coordinator.py:154-158 `planner=self.planner`）。

### C5. 现有测试 test_workflow_integration.py（backend/tests/test_workflow_integration.py）

| 测试 | 行号 | 与 C 相关断言 |
|---|---|---|
| `test_detect_complex_task` | 57-70 | `_detect_complex_task` 正则模式命中断言 |
| `test_generate_workflow_definition` | 74-93 | `_generate_workflow_definition("前端和后端一起开发", MockRoutingDecision)` → `workflow_def.workflow_id is not None`, `len(nodes)>=2`, `execution_strategy == "mixed"` |
| `test_semantic_analyze_workflow` | 97-105 | `semantic_analyze("首先设计数据库，然后实现API，最后测试")` → `is_task==True`, `is_workflow==True`, `workflow_definition is not None`, `len(nodes)>=2` |
| `test_workflow_engine_integration` | 109-138 | 手工构造 WorkflowDefinition 执行 `_execute_workflow`，结果含 execution_id/status |
| `test_process_user_message_workflow` | 142-156 | 工作流模式 process_user_message 返回 type |
| `test_workflow_engine_setup` | 157-163 | 引擎注册 executor/callback |
| `test_meeting_coordinator_accepts_injected_engine` | 165-182 | 注入共享引擎 |
| `test_execute_workflow_returns_cancelled_on_pause` | 183-222 | 暂停返回 cancelled |
| 其余 | 223-282 | `_run_agent_execution_loop` 相关 |

- 去硬编码影响：`test_generate_workflow_definition` 断言 `execution_strategy == "mixed"` 与 `len(nodes)>=2`，若改为真实 DAG 生成需同步更新。

---

## D. 混合执行真接线（TS 侧）

### D1. coordinator.ts createTeam / execute 关键段 + TeamMember 类型

**createTeam（orchestrator/src/team/coordinator.ts:403-420）—— location 硬编码 'local'，是"真接线"断点**
```typescript
  // ====== 团队创建（保留 meeting_started 事件和路由信息）======
  private createTeam(roleIds: string[], task: string, defaultRuntime?: { workspace: string; executorUrl?: string; executorToken?: string }): Team {
    const members: TeamMember[] = roleIds.map((roleId, i) => {
      const template = getTemplate(roleId);
      if (!template) throw new Error(`Unknown role: ${roleId}`);
      return {
        id: `member-${i}`,
        name: template.name,
        role: roleId,
        template,
        status: 'idle',
        location: 'local' as const,
        runtime: defaultRuntime
          ? { type: 'local' as const, workspace: defaultRuntime.workspace, executorUrl: defaultRuntime.executorUrl, executorToken: defaultRuntime.executorToken }
          : { type: 'local' as const, workspace: this.config.workspace },
      };
    });
    return { id: `team-${Date.now()}`, name: `task-${Date.now().toString(36)}`, description: task, members, leader: members[0] };
  }
```

**execute 签名（coordinator.ts:42-46）与团队组装调用（125-141）**
```typescript
  async execute(
    userMessage: string,
    selectedRoles: string[],
    onEvent?: EventHandler,
  ): Promise<string> {
    ...
    this.team = this.createTeam(rolesToUse, userMessage);
    onEvent?.({
      type: 'meeting_started',
      meetingId: this.team.id,
      agents: this.team.members.map(m => ({
        id: `agent-${m.role}`,
        ...
      })),
    });
    ...
    const agents = await this.createAgents(rolesToUse, workspace);
```
- **注意**：`execute` 参数只有 `(userMessage, selectedRoles, onEvent)`，**无 role_locations 参数**；`createTeam` 亦无 location 参数。

**createAgents 取 router（coordinator.ts:423-450）**
```typescript
  private async createAgents(roleIds: string[], workspace: string): Promise<RoleAgent[]> {
    return Promise.all(roleIds.map(async roleId => {
      const template = getTemplate(roleId);
      // 从 team 中查找该角色的 member（含 location/runtime 信息），找不到则默认 local
      const member = this.team?.members.find(m => m.role === roleId);
      const router = this.config.routerFactory.getRouterForMember({
        id: member?.id || `member-${roleId}`,
        roleName: template?.name || roleId,
        teamRole: (template?.team_role || 'Executor') as 'Coordinator' | 'Planner' | 'Executor' | 'Reviewer' | 'Monitor',
        location: member?.location || 'local',
        runtime: member?.runtime || { type: 'local', workspace },
        tools: template?.tools || [],
        dangerousTools: template?.dangerous_tools || [],
        status: 'idle',
      });
      return new RoleAgent({ id: `agent-${roleId}`, roleId, roleName: template?.name || roleId, systemPrompt: await buildSystemPrompt(roleId), tools: getToolsForRole(roleId), router, workspace, llm: this.config.llm });
    }));
  }
```

**TeamMember 类型（orchestrator/src/team/types.ts:19-27）—— 已含 location/runtime 字段**
```typescript
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  template: RoleTemplate;
  status: 'idle' | 'working' | 'speaking' | 'done';
  location: 'local' | 'remote';
  runtime: TeamMemberRuntime;
}
```
- `TeamRuntime` 重导出自 `./team.js`（types.ts:2），team.ts 中 `location: 'local' | 'remote'`（team.ts:32, 54）。
- `assembler.ts`（DAG 组装路径）已支持按 skill 取 location（assembler.ts:80-115，`memberLocation = skillLocations[primarySkill] || 'local'`）——说明 TeamMember.location/runtime 管线已通，**断点在 coordinator.execute 未接收前端 location**。

### D2. toolkit/router.ts / hybrid.ts 关键接口

**router.ts（orchestrator/src/toolkit/router.ts:6-39）**
```typescript
export interface IToolkitRouter {
  execute(toolCall: ToolCall, workspace: string): Promise<ToolResult>;
}

export class RouterFactory {
  private localRouter = new LocalToolkitRouter();
  private remoteRouters = new Map<string, RemoteToolkitRouter>();

  getRouterForMember(member: TeamMember): IToolkitRouter {
    if (member.location === 'local') {
      return this.localRouter;
    }
    // Remote: 缓存 RemoteToolkitRouter per executor URL
    const url = member.runtime.executorUrl || '';
    if (!this.remoteRouters.has(url)) {
      this.remoteRouters.set(url, new RemoteToolkitRouter({
        executorUrl: url,
        token: member.runtime.executorToken,
      }));
    }
    return this.remoteRouters.get(url)!;
  }

  getWorkspaceForMember(member: TeamMember): string {
    return member.runtime.workspace;
  }
}
```
- `RemoteToolkitRouter`（remote.ts）、`LocalToolkitRouter`（local.ts）。
- **hybrid.ts:43-77** `HybridToolkitRouter implements IToolkitRouter`：`execute()` 按工具类别（FILE_TOOLS/CMD_TOOLS/GIT_TOOLS）决定走 local/remote，`createExecutionConfig(profile, options)` 定义 3 个预置 profile（`local-full/remote-full/remote-brain-local-hands`）。当前 RouterFactory 未使用 HybridToolkitRouter（仅 local/remote 二选一）。

### D3. orchestrator 测试设施

- **orchestrator/package.json**：`"test": "vitest run"`；devDependencies 含 `vitest ^4.1.9`、`tsx`、`typescript`。
- **vitest.config.ts**：`test.include = ["src/**/*.test.ts"]`。
- 现有测试文件（`src/**/*.test.ts`）：
  - `src/team/assembler.test.ts`、`src/team/team.test.ts`
  - `src/toolkit/local.test.ts`、`src/toolkit/remote.test.ts`、`src/toolkit/hybrid.test.ts`
  - `src/skill/loader.test.ts`
  - `src/agent/__tests__/integration.test.ts`、`system-prompt.test.ts`、`role-agent.test.ts`、`tools.test.ts`
- 另有根目录 e2e 脚本（非 vitest）：`test-e2e.mjs`、`test-e2e-full.mjs`、`test-integration.mjs`、`test-hybrid.mjs`、`test-frontend-format.mjs`、`test-suite.ts`、`test-deep.ts`。
- **注意**：`src/team/coordinator.test.ts` **不存在**；目录下有编译产物 `src/team/coordinator.js`（dist 副本，含 `runAgentTask(executorMember...)` 旧逻辑，行号 259/608 有 location 默认值——是过时编译产物，改 TS 后需重新 build）。

### D4. 前端 roleLocations 发送链路

**CeoChatPanel.tsx:145** state 声明：
```typescript
  const [roleLocations, setRoleLocations] = useState<Record<string, 'local' | 'remote'>>({})
```
**CeoChatPanel.tsx:391-400**（sendToBackend 发送 `unified_message`，携带 role_locations）：
```typescript
    ws.send(JSON.stringify({
      type: 'unified_message',
      content,
      selected_roles: autoMode ? [] : selectedRoles,
      role_locations: autoMode ? {} : roleLocations,
      provider: localStorage.getItem('llm_provider') || undefined,
      model_name: localStorage.getItem('llm_model_name') || undefined,
      api_key: localStorage.getItem('deepseek_api_key') || undefined,
      base_url: localStorage.getItem('deepseek_base_url') || undefined,
    }))
```
- UI 位置选择（同文件 752、816）：`const loc = roleLocations[id] || 'local'` / `roleLocations[role.id] || 'local'`。
- **useAgentSystem.ts / useMeetingSocket.ts 中均无 role_locations**（grep 无匹配）。`useMeetingSocket.startMeeting`（182-191）发送 `start_meeting` 消息且**不含** role_locations。**链路断点：hooks 层不转发 role_locations。**

### D5. server.py start_meeting 的 role_locations 处理与 orchestrator 的关系

**backend/server.py:1141-1162**（unified_message 分支，供 CeoAgent 复杂路径用 role_locations）：
```python
                # 提取选中的角色（如果有）
                selected_roles = msg.get("selected_roles", [])
                role_locations = msg.get("role_locations", {})

                # 委托给CEO Agent处理
                if session._ceo_agent is None:
                    ...
                ceo = session._ceo_agent
                async def _run_ceo():
                    try:
                        result = await ceo.process_message(content, ws.send_json, selected_roles=selected_roles, role_locations=role_locations)
                        ...
```
- CeoAgent 侧：`process_message(..., role_locations=...)`（ceo_agent.py:216）、`_build_dag(selected_roles, roles_config, content, role_locations)`（ceo_agent.py:475），DAG task 带 `"location": role_locations.get(role_id, "local")`（ceo_agent.py:93）。**Python 后端 DAG 路径已消费 role_locations。**
- **server.py:1229 `start_meeting` 分支（会议路径）不读取 role_locations**——MeetingCoordinator 构造（1272-1283）无 location 参数。
- **orchestrator 侧：`orchestrator/src` 中无 roleLocations/role_locations 处理**（grep 仅命中 local/remote location 字段）。`orchestrator/src/server.ts:130` 处理 `unified_message` 时只读 `msg.selected_roles`（183-185），**不读 msg.role_locations**；`TeamCoordinator.execute` 也无该参数。**结论：TS orchestrator 需要新增 role_locations 入参传递 → createTeam 按角色 location 赋值 → createAgents 通过 getRouterForMember 走 remote。**

---

## E. 杂项收尾

### E1. run_project.py / demo_full_cycle.py 构造点与依赖

**backend/run_project.py:335-342**（coordinator 构造）：
```python
    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=provider,
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        workspace=workspace,
    )
```
- 依赖：`--api-key` **required=True**（run_project.py:407 `parser.add_argument("--api-key", required=True, help="LLM API Key")`）；`--base-url` 默认 `""`（408）、`--provider` 默认 `"deepseek"`（409）。**纯 CLI 参数，无环境变量回退**；入口 `main()`（418-456）→ `run(goal, team_size, api_key, base_url, provider, model_name, output_dir)`（273）。执行链：`coordinator.process_user_message(task_desc, tracker.track)`（380）。

**backend/demo_full_cycle.py:121-128**（coordinator 构造）：
```python
    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=provider,
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        workspace=workspace,
    )
```
- 依赖：`parse_args()`（30-36）：`--api-key required=True`、`--base-url` 默认 `https://api.deepseek.com`（33）、`--provider` 默认 `deepseek`（34）、`--model` 默认 `""`（35）。入口 `main()`（220）→ `run_project(title, task_desc, api_key, base_url, provider, model_name, project_tag)`（92）→ `coordinator.process_user_message(task_desc, collector.collect)`（135）。
- **两者均无 MeetingCoordinator 的 `workflow_engine` / `approval_manager` / `agent_pool` / `max_iterations` 参数**（使用默认值；与 server.py:1272-1283 的完整构造不同）。
- 两者执行后均有技能进化联动：demo_full_cycle 走 `demo_skill_evolution()`（153-181，全量 approve pending）与 `demo_verify_injection()`（186-215）。

### E2. companion_log.json 的 git 跟踪与 .gitignore 现状

- `git ls-files backend/companion_log.json` → **已跟踪**（返回该路径，且 `git status` 显示 ` M backend/companion_log.json`，有未提交修改）。
- 根 `.gitignore`（/home/test/MDH/.gitignore）相关条目：`5:backend/data/*`、`15:/companion_log.json`（仅根目录）、`18:data/workspaces/`。**没有 `backend/companion_log.json` 或 `backend/companion_log*` 条目**。
- `backend/.gitignore` **不存在**。
- 结论：`backend/companion_log.json` 是已跟踪文件；若需忽略需新增 `.gitignore` 条目（如 `backend/companion_log.json`）。

### E3. useMeetingSocket.ts 对 human_approval_request 的处理（:685-715）

**接收（backend/hooks 侧，useMeetingSocket.ts:691-716）**：
```typescript
        case 'human_approval_request': {
          // 收到人工审批请求
          const request = msg.request
          if (request) {
            setPendingApprovals(prev => {
              const next = new Map(prev)
              next.set(request.id, {
                id: request.id,
                requesterId: request.requesterId,
                operation: request.operation,
                description: request.description,
                riskLevel: request.riskLevel,
                confidence: request.confidence,
                createdAt: request.createdAt,
              })
              return next
            })
            setChatMessages(prev => [...prev, {
              role: 'boss' as const,
              content: `[审批请求] ${request.operation}: ${request.description} (风险: ${request.riskLevel})`,
              timestamp: Date.now(),
              _msgSubtype: 'feedback',
            }])
          }
          break
        }
```
**响应（useMeetingSocket.ts:1009-1016）**：
```typescript
  const sendApprovalResponse = useCallback((requestId: string, approved: boolean, reason: string = '') => {
    send({
      type: 'human_approval_response',
      requestId,
      approved,
      reason,
    })
  }, [send])
```
- 端到端链路（后端）：`approval_manager.request_approval(..., send_fn=_build_approval_send_fn(on_message))`（meeting_coordinator.py:1117-1124；`_build_approval_send_fn` 在 68-75 返回 `lambda payload: on_message("coordinator", payload, "approval")`）→ `wait_for_decision(approval.id, timeout=self._approval_timeout)`（1126-1128，超时默认通过 1131-1133）→ server.py 将 `human_approval_request` 推前端、接收 `human_approval_response`（server.py 处理分支）。
- 前端审批请求是结构化 `msg.request` 对象（不是聊天文本），审批面板依赖 `type == 'human_approval_request'`（server.py:69-74 注释明确）。

---

## 现有测试清单（与 P1 相关）

**Python（backend/tests/，54 个文件）**：
- `test_meeting_coordinator_router.py`：TestRouterStatsUpdate（265-375）——含 `test_stats_updated_on_task_success/failure`、`test_execute_tasks_updates_stats_on_success/failure`（310/326 断言 orchestrator._router.update_stats 调用）、`test_auto_assign_task_records_routing_dept`（328-342）、`test_no_stats_update_when_no_routing_dept`（344-358，固化断链）、`test_stats_persist_after_update`（360-375）。
- `test_dynamic_router.py`：265-295 update_stats 增删/持久化断言；415-419 `test_update_stats_then_route`。
- `test_workflow_integration.py`：见 C5。
- `test_experience_extractor.py`：33 个用例，覆盖 approve/reject/modify（198-244）、write_approved_rule（248）、retrieve 过滤 pending（305）、get_pending_rules/get_all_rules（358-377）、注入（399-431）。
- `test_skill_packager.py`：38 个用例，覆盖 merge_skills 5 种合并策略（118-211）、desensitize（223-315）、readme（339-388）、package_zip（403-442）、preview（459-485）、full_package 全流程（499-583）。
- 其他相关：`test_task_orchestrator_fix.py`、`test_split_modules.py`、`test_upgrade_injection.py`、`test_structured_feedback.py`、`test_planner_enhanced.py`、`test_meeting.py`。

**TS（orchestrator，vitest `npm test` / `vitest run`）**：
- `src/toolkit/local.test.ts`、`remote.test.ts`、`hybrid.test.ts`、`src/team/assembler.test.ts`、`team.test.ts`、`src/skill/loader.test.ts`、`src/agent/__tests__/{integration,system-prompt,role-agent,tools}.test.ts`。
- **无 coordinator.test.ts**（D 改造点需补）。

**前端**：`src/modules` 84.39% / `src/hooks` 92.86% 行覆盖（AGENTS.md 数据）；CeoChatPanel/useMeetingSocket 相关用例在 `src/` 下 vitest 套件。
