# P2 阶段实施计划 — 精确代码事实（P0/P1 已合并，main@b0132e8 基线）

> 提取日期: 2026-08-13 | 工作目录: /home/test/MDH | 只读取证，未修改任何源码
> 基线核实：`b0132e8 test(frontend): verify structured human_approval_request handling`；
> 当前工作树 HEAD=f7efbd5，与 b0132e8 相比仅 docs 变更（无代码差异），所有行号基于当前工作树。

---

## A. durable execution 补强（支柱3 P2：检查点系统补齐自动失败检测/防重复执行）

### A1. backend/compensation.py 检查点机制全文概要

**文件: backend/compensation.py**（共 231 行）

- `Checkpoint` dataclass (:33-39)：`id` / `task_id` / `step_index` / `state_snapshot: dict` / `created_at`
- `CompensationEngine` (:42-161)：`record_failure`(:49)、`find_compensatable_tasks`(:64)、`register_handler`(:106)、`execute_compensation`(:115)、`get_compensation_log`(:147)、`get_failure_history`(:150)、`add_listener`(:153)、`remove_listener`(:156)、`clear`(:159)
- `CheckpointManager` (:164-231) —— **纯内存实现，无磁盘持久化**

```python
# backend/compensation.py:164-231
class CheckpointManager:
    def __init__(self, max_per_task: int = 10):
        self._checkpoints: Dict[str, List[Checkpoint]] = {}      # task_id -> List[Checkpoint]，内存 dict
        self._max_per_task = max_per_task

    def save_checkpoint(self, task_id: str, step_index: int, state: dict) -> Checkpoint:   # :169
    def get_latest_checkpoint(self, task_id: str) -> Optional[Checkpoint]:                  # :193
    def get_checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]:                   # :199
    def get_checkpoints_for_task(self, task_id: str) -> List[Checkpoint]:                   # :206
    def restore_checkpoint(self, checkpoint_id: str) -> Optional[dict]:                     # :210
    def delete_checkpoint(self, checkpoint_id: str) -> bool:                                # :216
    def delete_checkpoints_for_task(self, task_id: str) -> int:                             # :226
    def clear(self) -> None:                                                                # :230
```

- **持久化位置**：`self._checkpoints` 内存 dict（:166）。无文件/DB 落盘。重启即丢。
- **无自动失败检测**：`CompensationEngine` 的 `record_failure` 只在显式调用时记录；没有定时器/监控循环探测失败。
- **无防重复执行**：`save_checkpoint` 按 `task_id+step_index` 追加（:183），不校验是否已存在同 step 的记录。

### A2. backend/workflow_engine.py WorkflowExecution 持久化现状

**`_executions` 写入/读取点（全部内存，无磁盘持久化）**：
```python
# backend/workflow_engine.py:36-45  __init__
        self._executions: Dict[str, WorkflowExecution] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._node_executors: Dict[str, Callable] = {}

# 写入点（唯一）：:91  create_workflow
        self._executions[execution_id] = execution

# 读取点：execute_workflow(:111)、pause_workflow(:648)、resume_workflow(:671)、
#         cancel_workflow(:692)、retry_node(:721)、get_workflow_status(:765)、
#         get_workflow_visualization(:780)
```
- 已核对：workflow_engine.py **无任何 `json.dump`/`save`/`persist`/文件 IO**。重启后 `_executions` 为空，执行状态全部丢失。
- `get_workflow_visualization`(:771-791) 通过 `workflow_execution_to_dict`（protocol.py:591-600）序列化，可作为落盘序列化基础。

**WorkflowExecution dataclass（protocol.py:63-72）**：
```python
@dataclass
class WorkflowExecution:
    """工作流执行实例"""
    execution_id: str
    workflow_id: str
    status: WorkflowExecutionStatus = WorkflowExecutionStatus.CREATED
    started_at: str = ""
    completed_at: str | None = None
    node_states: dict = field(default_factory=dict)  # node_id -> WorkflowNodeStatus
    results: dict = field(default_factory=dict)  # node_id -> result
```
（`WorkflowExecutionStatus` 枚举 protocol.py:22-29：created/running/paused/completed/failed/cancelled；`WorkflowNodeStatus` :13-19：pending/running/completed/failed/skipped）

### A3. server.py checkpoint_save / checkpoint_restore WS 处理（逐字代码）

**文件: backend/server.py:1914-1956**
```python
            # === 检查点系统 ===
            elif msg_type == "checkpoint_save":
                task_id = msg.get("taskId", "")
                step_index = msg.get("stepIndex", 0)
                state = msg.get("state", {})

                if not session._checkpoint_manager:
                    from compensation import CheckpointManager
                    session._checkpoint_manager = CheckpointManager()

                checkpoint = session._checkpoint_manager.save_checkpoint(task_id, step_index, state)

                await session.send_and_buffer({
                    "type": "checkpoint_saved",
                    "checkpoint": {
                        "id": checkpoint.id,
                        "taskId": checkpoint.task_id,
                        "stepIndex": checkpoint.step_index,
                        "createdAt": checkpoint.created_at,
                    },
                    "sequence_no": session.next_sequence(),
                })

            elif msg_type == "checkpoint_restore":
                checkpoint_id = msg.get("checkpointId", "")

                if not session._checkpoint_manager:
                    from compensation import CheckpointManager
                    session._checkpoint_manager = CheckpointManager()

                state = session._checkpoint_manager.restore_checkpoint(checkpoint_id)
                if state is None:
                    await session.send_error(f"检查点 {checkpoint_id} 不存在")
                else:
                    checkpoint = session._checkpoint_manager.get_checkpoint(checkpoint_id)
                    await session.send_and_buffer({
                        "type": "checkpoint_restored",
                        "checkpointId": checkpoint_id,
                        "taskId": checkpoint.task_id if checkpoint else "",
                        "stepIndex": checkpoint.step_index if checkpoint else 0,
                        "state": state,
                        "sequence_no": session.next_sequence(),
                    })
```
- 相关：`get_checkpoints`(:1958-1985)、`checkpoint_delete`(:1987-1999)、会议快照 `save_meeting_snapshot`(:2016-2041)、`restore_meeting_snapshot`(:2043-2075)。
- `session._checkpoint_manager` 在会议创建时初始化（server.py:1306-1308：`from compensation import CheckpointManager; session._checkpoint_manager = CheckpointManager()`）。

### A4. meeting_coordinator.py 中检查点/恢复相关调用

**结论：完全没有。** 已 grep 全文件 `checkpoint|Checkpoint|compensation|Compensation|CheckpointManager|save_checkpoint`，meeting_coordinator.py、review_pipeline.py、task_orchestrator.py、workflow_engine.py 均 0 匹配（grep exit 1）。会议/审查/工作流执行全程未调用 CheckpointManager 或 CompensationEngine。`CheckpointManager` 仅被 server.py 的 WS 消息直接使用。

### A5. 结论：最小可行设计

现有结构下（A1-A4 事实）：
1. **persist execution state**：`WorkflowExecution` 已可被 `workflow_execution_to_dict`（protocol.py:591）序列化；新增 `WorkflowEngine.save_to_disk/load_from_disk`（JSON 文件，key=execution_id），在 `create_workflow`(:91)、`_execute_node` 完成/失败（:379-381/:400-402）、`pause/cancel`（:655/:703）处落盘。
2. **重启/恢复时跳过已完成节点**：`_execute_sequential`(:186-198) 与 `_execute_parallel`(:217-246) 的节点循环中，对 `node_states[node_id] == COMPLETED` 直接 `continue`；`_check_dependencies`(:474-502) 已按 `COMPLETED` 判定。加载持久化 execution 后即可天然跳过已完成节点。
3. **自动失败检测**：将持久化定时落盘与 `CompensationEngine.record_failure` 挂钩；或复用 `get_workflow_status` + `_running_tasks` 心跳。`CheckpointManager` 需补 `state_snapshot` 中携带节点状态并做磁盘持久化。

---

## B. 审查确定性门禁（支柱4 P1 剩余：测试/lint 门禁 + 单次 LLM 审查）

### B1. backend/review_pipeline.py review() 完整流程与 _generate_structured_feedback 现状

**注意：任务描述所述行号 `:733-764` 为旧版本行号；当前 `_generate_structured_feedback` 在 review_pipeline.py:251-280（文件共 282 行）。**

**review() 完整流程（backend/review_pipeline.py:40-128）**：
```python
    async def review(
        self,
        task_description: str,
        execution_result: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        repo_context: Optional[Dict[str, Any]] = None,
        discussion_context: str = "",
    ) -> Dict[str, Any]:
```
流程步骤（逐字注释，:63-114）：
1. `CriticAgent 自动审查（规则兜底 + LLM 补充）` — `self._critic.review_with_llm(...)` (:64-73)，失败降级 `CriticResult(severity="unknown", findings=[])` (:77)
2. `GroundingAgent 自动接地` — `self._grounding.verify({... "conclusions": [{"text": execution_result[:200]}] ...})` (:81-89)
3. `Reviewer LLM审查` — `self._reviewer_review(task_description, execution_result, on_message, discussion_context)` (:96-98)
4. `Monitor评估` — `self._monitor_evaluate(...)` (:101-103)
5. `Coordinator总结` — `self._coordinator_summarize(...)` (:106-108)
6. `结构化验收反馈` — `self._generate_structured_feedback(task_description, execution_result, reviewer_feedback, monitor_feedback)` (:111-113)
返回 dict（:115-128）：`critic_result` / `grounding_result` / `reviewer_feedback` / `monitor_feedback` / `coordinator_summary` / `structured_feedback`。

**_generate_structured_feedback（review_pipeline.py:251-280）现状**：
```python
    def _generate_structured_feedback(
        self,
        task_description: str,
        execution_result: str,
        reviewer_feedback: str = "",
        monitor_feedback: str = "",
    ) -> Dict[str, Any]:
        """生成结构化验收反馈，整合 LLM 审查意见"""
        if self._planner:
            subtask = SubTask(
                name=task_description[:100],
                description=task_description,
            )
            result = self._planner.generate_review_feedback(
                task=subtask,
                output=execution_result,
                context={"reviewer_feedback": reviewer_feedback, "monitor_feedback": monitor_feedback},
            )
            # 如果 LLM 审查发现了严重问题但 planner 关键词匹配未捕获，降级为 revision_required
            if result.get("status") == "approved" and reviewer_feedback:
                critical_signals = ["严重", "致命", "阻塞", "critical", "fatal", "blocker", "必须修复", "不能发布"]
                if any(sig in reviewer_feedback.lower() for sig in critical_signals):
                    result["status"] = "revision_required"
                    result["issues"].append({
                        "type": "logic_error",
                        "location": "reviewer",
                        "detail": "审查者发现严重问题",
                        "suggestion": reviewer_feedback[:200],
                    })
            return result

        return {"status": "approved", "issues": [], "max_iterations": 3}
```
（meeting_coordinator.py:855-875 另有一份旧 `_generate_structured_feedback` 遗留方法，无调用方——`generate_structured_feedback` 仅 review_pipeline.py:111 调用。）

### B2. 执行结果的文件产物如何跟踪

**A. `_run_agent_execution_loop`（meeting_coordinator.py:189-232）返回 `files_written` / `tool_outputs`**：
```python
# backend/meeting_coordinator.py:189-232（节选签名与返回）
    async def _run_agent_execution_loop(
        self,
        model,
        prompt: str,
        agent_toolset,
        max_tool_rounds: int = 5,
    ) -> Dict[str, Any]:
        """LLM + 工具执行循环：代码块写文件、工具调用、产物收集"""
        ...
        files_written: List[str] = []
        tool_outputs: List[Dict[str, Any]] = []
        ...
        return {"result": last_text, "files_written": files_written, "tool_outputs": tool_outputs}   # :232
```

**B. process_user_message 审查时只传 `result` 文本，files_written 未传递（meeting_coordinator.py:1218-1250 逐字）**：
```python
            try:
                exec_results = await self.execute_assigned_tasks()     # TaskOrchestrator.execute 返回
                execution_results = exec_results

                # 通知执行结果
                for er in exec_results:
                    await on_message(er["agent_id"], er["result"], "")
                    # 报告写入的文件
                    written = er.get("written_files", [])
                    if written:
                        file_msg = f"[第{dev_iter}轮] 已写入 {len(written)} 个文件: {', '.join(written)}"
                        await on_message(er["agent_id"], file_msg, "")
            except Exception as e:
                ...
                exec_results = []
            ...
            execution_text = ""                                        # :1239-1241
            if exec_results:
                execution_text = "\n\n".join([r.get("result", "") for r in exec_results])

            try:
                review_result = await self._review_pipeline.review(     # :1244-1247
                    enhanced_description, execution_text, on_message,
                    discussion_context=discussion_context,
                )
```
- 关键缺口：`execution_text` 只拼接 `r.get("result","")`，**files_written 列表被丢弃**（仅用于 UI 播报 :1226-1229 和 `_generate_project_summary` :1525-1551）。
- `execute_and_review_task`（:830-853）同样只取 `task_results[0]["result"]`（:848），不传 files。

**C. TaskOrchestrator 返回的完整文件产物字段（backend/task_orchestrator.py:365-374）**：
```python
                results.append({
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": last_text,
                    "written_files": written_files,
                    "code_blocks_count": len(extract_code_blocks(last_text)),
                    "tool_calls": all_tool_results,
                    "verification": verification_results,
                    "agent_role": role.value,
                })
```

### B3. AgentToolset 的 run_tests / run_linter 签名（backend/agent_toolset.py:363-372）

```python
    def run_tests(self, test_path: str = "", verbose: bool = False) -> ToolResult:
        """运行测试"""
        args = {"verbose": verbose}
        if test_path:
            args["test_path"] = test_path
        return self.execute("run_tests", args)

    def run_linter(self, path: str = ".") -> ToolResult:
        """运行代码检查"""
        return self.execute("run_linter", {"path": path})
```
- 均为同步方法，返回 `ToolResult`（含 `success` / `output` / `error`），可被确定性门禁同步调用。
- 角色权限：`reviewer` 拥有 `run_tests`/`run_linter`（roles_config.yaml，test_agent_toolset.py:29 `test_reviewer_can_run_tests`）。

### B4. 结论：确定性门禁插入点

- 在 `process_user_message` 开发循环中 `review_pipeline.review(...)` 调用前（meeting_coordinator.py:1243），或 review_pipeline.py `_generate_structured_feedback`(:251) 之前，插入确定性门禁：
  1. 通过 `self._tool_executor`/`AgentToolset` 调用 `run_tests()` / `run_linter(path)`（签名见 B3），拿到 `ToolResult.success`。
  2. 结果并入 `structured_feedback`：`status=revision_required` + `issues.append({"type":"test/lint_failure", ...})`；与现有 critical_signals 降级逻辑（:270-279）同构。
- 门禁为同步、无 LLM，符合"单次 LLM 审查"降本目标（测试/lint 失败时 reviewer LLM 意见仍保留，但确定性失败直接驱动迭代）。

---

## C. artifact 模式（支柱3 P1 剩余：角色产出落盘回传轻量引用）

### C1. `_run_agent_execution_loop`（meeting_coordinator.py:189-232）返回结构与 files_written 收集

```python
# backend/meeting_coordinator.py:196-232（核心逐字）
        """LLM + 工具执行循环：代码块写文件、工具调用、产物收集"""
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        conversation = [msg]
        files_written: List[str] = []
        tool_outputs: List[Dict[str, Any]] = []
        last_text = ""

        from code_extractor import extract_code_blocks

        for _ in range(max_tool_rounds + 1):
            response = await model.reply(conversation)
            last_text = _extract_text(response)

            code_blocks = extract_code_blocks(last_text)
            if code_blocks and agent_toolset:
                for block in code_blocks:
                    wf = agent_toolset.write_file(block["filename"], block["content"])
                    if wf.success:
                        files_written.append(block["filename"])
                    else:
                        self.logger.warning("工作流节点写文件失败: %s", block["filename"])

            if not code_blocks and agent_toolset:
                tool_calls = self._extract_tool_calls_from_text(last_text)
                for call in tool_calls:
                    tc = agent_toolset.execute(call["tool"], call.get("arguments", {}))
                    tool_outputs.append({"tool": call["tool"], "success": tc.success, "output": tc.output})
            ...
        return {"result": last_text, "files_written": files_written, "tool_outputs": tool_outputs}
```
- 已具备文件清单（`files_written`）与工具调用摘要（`tool_outputs`）收集能力；唯一调用方 `_execute_workflow_node`(:329) 会把二者并入节点返回（:338-344）。

### C2. process_user_message 执行结果如何传给 review_pipeline.review（:1239-1250 逐字）

```python
            execution_text = ""
            if exec_results:
                execution_text = "\n\n".join([r.get("result", "") for r in exec_results])

            try:
                review_result = await self._review_pipeline.review(
                    enhanced_description, execution_text, on_message,
                    discussion_context=discussion_context,
                )
            except Exception as e:
                self.logger.warning("第 %d 轮审查失败: %s", dev_iter, e)
                review_result = {"status": "skipped", "reason": str(e)}
```

### C3. review_pipeline 中 execution_result 的使用点（LLM prompt 拼接）

| 位置 | 代码 |
|------|------|
| review_pipeline.py:83 | `"conclusions": [{"text": execution_result[:200]}]`（GroundingAgent） |
| review_pipeline.py:155 | `f"执行结果：{execution_result}\n\n"`（_reviewer_review prompt，:152-162） |
| review_pipeline.py:195 | `f"执行结果：{execution_result}\n"`（_monitor_evaluate prompt，:192-203） |
| review_pipeline.py:234 | `f"执行结果：{execution_result}\n"`（_coordinator_summarize prompt，:231-238） |
| review_pipeline.py:266 | `output=execution_result`（_generate_structured_feedback → planner.generate_review_feedback） |

### C4. 结论：artifact 模式的插入点

- 执行端：`_run_agent_execution_loop` 已产出 `files_written` 清单；落盘产物已在 workspace（`self._workspace.root_path`）。
- 传递端：`process_user_message` :1239-1241 把 `execution_text` 替换为 `"文件清单(files_written) + LLM 生成的摘要(last_text[:N])"` 的轻量引用文本，随 `review(...)` 的 `execution_result` 参数传入。
- 消费端：review_pipeline 的 5 个使用点（C3 表）不做改动——由于只是 prompt 文本替换，`execution_result` 天然变小。GroundingAgent 的 `execution_result[:200]`(:83) 正好作为摘要切片。文件内容如需审查可改为传 repo 路径，由 reviewer/monitor 用 `read_file` 工具按需读取（当前 review_pipeline 无工具集，需在 P2 补 read_file 权限）。

---

## D. 单点故障治理（L9：agent_pool 接入 + 模型缓存 failover）

### D1. backend/agent_pool.py 公开接口

**文件: backend/agent_pool.py**（共 505 行）
- `AgentConfig` dataclass (:22-33)：`id`/`name`/`role`/`capabilities`/`system_prompt`/`provider`/`model_name`/`api_key`/`base_url`
- `AgentInstance` dataclass (:36-47)：`agent: Agent` + `healthy: bool` / `error_count` / `use_count` / `last_used` / `last_health_check`

```python
# backend/agent_pool.py:90-116  __init__
    def __init__(
        self,
        key_manager: KeyManager,
        role_prompts: Optional[Dict[str, str]] = None,
        max_instances_per_role: int = 3
    ):
        self._agents: Dict[str, List[AgentInstance]] = {}
        self._round_robin_index: Dict[str, int] = {}
        self._agents_by_id: Dict[str, AgentInstance] = {}
```
- `create_team(team_template) -> List[str]` (:171-210)
- `get_agent_by_id(agent_id) -> Optional[AgentInstance]` (:224-234)
- `get_agent_by_role(role) -> Optional[AgentInstance]` (:236-269) —— **轮询负载均衡 + 健康过滤**：健康 agent 列表为空时自动重置全部为 healthy（:254-259），轮询选择（:262-267）
- `get_agents_by_capability` (:271-285)、`get_all_agents` (:287-289)
- `async health_check(timeout=5.0) -> Dict[str, bool]` (:291-332) —— 逐实例 `agent.reply(ping)` 超时探测，标记 `healthy`/`error_count`
- `mark_unhealthy(agent_id) -> bool` (:334-350)、`scale_up` (:352-401)、`scale_down` (:403-426)、`remove_agent` (:428-448)、`get_pool_status` (:450-487)、`clear` (:489-494)、`update_role_prompt` (:496-505)

### D2. server.py 创建 agent_pool 的位置与注入核实

```python
# backend/server.py:135-137（全局单例）
# Agent 池（全局单例，支持复用和负载均衡）
key_manager = KeyManager()
agent_pool = AgentPool(key_manager=key_manager, max_instances_per_role=2)
```

- MeetingCoordinator 构造：**server.py:1272-1283，已注入 `agent_pool=agent_pool`（:1279）**：
```python
                coordinator = MeetingCoordinator(
                    meeting_session=meeting,
                    provider=session.provider,
                    model_name=session.model_name or "",
                    api_key=session.api_key,
                    base_url=session.base_url or "",
                    workspace=workspace,
                    agent_pool=agent_pool,                       # :1279 已注入
                    max_iterations=msg.get("max_iterations", 3),
                    workflow_engine=workflow_engine,
                    approval_manager=session._approval_manager,
                )
```
- AgentBridge 懒初始化两处亦注入：server.py:1830-1833（bridge_register_agent）、:1853-1856（bridge_message）。
- **核实结论：P0 证据"未注入"已过时——`agent_pool` 现在已注入 MeetingCoordinator 与 AgentBridge。**

### D3. meeting_coordinator._get_model / _create_model 现状与 _models 生命周期

```python
# backend/meeting_coordinator.py:378-408  _create_model（逐字签名，实际行号 378 而非任务描述的 :236-266）
    def _create_model(self, role: AgentRole) -> Agent:
        reg = PROVIDER_REGISTRY.get(self.provider)
        if reg is None:
            raise ValueError(f"不支持的模型提供商: {self.provider}")
        ...
        session = _Session()
        session.api_key = self.api_key
        session.base_url = self.base_url
        credential = reg["credential_cls"](**reg["credential_kwargs"](session))
        formatter = reg["formatter_cls"]()
        model_name = self.model_name or reg["default_model"]
        model = reg["model_cls"](
            credential=credential,
            model=model_name,
            stream=True,
            formatter=formatter,
        )
        agent = Agent(
            name=role.value,
            system_prompt=AGENT_ROLE_PROMPTS[role],
            model=model,
        )
        return agent

# backend/meeting_coordinator.py:410-420  _get_model（实际行号 410，任务描述 :268-278 为旧版）
    def _get_model(self, role: AgentRole) -> Agent:
        key = role.value
        if key not in self._models:
            # 优先从 AgentPool 获取（支持复用和负载均衡）
            if self._agent_pool:
                instance = self._agent_pool.get_agent_by_role(key)
                if instance:
                    self._models[key] = instance.agent
                    return instance.agent
            self._models[key] = self._create_model(role)
        return self._models[key]
```
- `_models: Dict[str, Agent]`（:118）**生命周期 = 进程内、无失效/驱逐机制、无 clear 调用**；`agent_pool` 实例只被 `_get_model` 首次缺键时查询，之后命中 `_models` 缓存直接返回（复用同一 agent，不再轮询）。
- 构造参数（meeting_coordinator.py:80-93）：`agent_pool: Optional[AgentPool] = None`（:88），保存于 `self._agent_pool`（:117）。

### D4. 结论：接线 agent_pool + 模型获取 failover 的最小设计

1. `agent_pool` 接线已完成（D2 核实）。**剩余缺口是 failover**：
   - `_get_model`（:410-420）在 `instance.agent.reply` 抛错时无重试/failover 路径；`_models` 缓存会把坏 agent 永久缓存。
   - 最小设计：在 `_get_model` 中为缓存命中增加健康检查——捕获 `model.reply` 异常时 `self._agent_pool.mark_unhealthy(...)`（agent_pool.py:334）+ 从 `_models` 删除该 key + 重新 `get_agent_by_role`（自动轮询到下一健康实例，agent_pool.py:252-259 自动重置逻辑兜底）。
   - 单点故障治理：`AgentPool.health_check`（:291）可在 server 启动/会议开始前异步调用，剔除不健康实例。

---

## E. 杂项

### E1. _update_routing_stats 调用点是否在 try 块外

**文件: backend/meeting_coordinator.py:1293-1294（在开发 for 循环之后、try/except 之外，P1 评审 minor 属实）**
```python
        # 更新路由统计（修复自适应学习断链）
        self._update_routing_stats()
```
- 上下文：位于 `for dev_iter in range(1, max_dev_iterations+1):`(:1212) 循环结束后的方法体顶层缩进（第 4 层），不在任何 try/except 内；上方最近的 try 是 :1218-1232（执行）与 :1243-1250（审查），均已闭合。
- `_update_routing_stats` 定义（:776-788）：消费即删，`self.router.update_stats(dept_id, success=task.status == "completed")`。
- 风险：若 `_update_routing_stats` 抛异常（如 router 写 JSON 失败），`process_user_message` 后面的项目总结/技能进化（:1297-1328）将不执行。P2 建议包 try/except 或移到 finally。

### E2. AGENTS.md 测试计数行

```markdown
# AGENTS.md:42
| 测试 | Vitest (TS) + pytest (Python) | 865 TS 测试 + 532 Python 测试 |
```
- docs/integration-test-report.md:52：`### 1. 测试覆盖率提升 (308 → 865 TS + 532 Python)` —— 计数一致。
- AGENTS.md:1011-1016 测试覆盖率表（Stmts/Branch/Funcs）：src/modules 84.39%/87.85%/85.02%，src/hooks 92.86%/75.36%/91.66%。

### E3. HybridToolkitRouter 与 RouterFactory 接线现状（P1 T4 核实）

**HybridToolkitRouter 存在且完整（orchestrator/src/toolkit/hybrid.ts:43-77）**：
```typescript
export class HybridToolkitRouter implements IToolkitRouter {
  private local: LocalToolkitRouter;
  private remote: RemoteToolkitRouter | null;
  private config: ExecutionConfig;

  constructor(config: ExecutionConfig) {
    this.config = config;
    this.local = new LocalToolkitRouter();
    this.remote = config.remote ? new RemoteToolkitRouter(config.remote) : null;
  }

  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    const router = this.resolveRouter(toolName);
    const targetWorkspace = this.isLocalTool(toolName) ? this.config.localWorkspace : workspace;
    return router.execute(toolCall, targetWorkspace);
  }

  private resolveRouter(toolName: string): IToolkitRouter {
    if (FILE_TOOLS.has(toolName)) {
      return this.config.files === 'local' || !this.remote ? this.local : this.remote;
    }
    if (CMD_TOOLS.has(toolName) || GIT_TOOLS.has(toolName)) {
      return this.config.commands === 'local' || !this.remote ? this.local : this.remote;
    }
    return this.remote ?? this.local;
  }
  ...
}
```
- **接线现状：hybrid 仅作为 CLI 级 `defaultRouter`（协调器级操作）**，`cli.ts:59-65` 在传入 `--profile` 时创建 `HybridToolkitRouter` 作为 `defaultRouter`；`coordinator.ts:83,99` 仅用于协调器级操作（创建工作区等）。
- **per-agent 路由未接 hybrid（P1 T4 属实）**：`RouterFactory.getRouterForMember`（orchestrator/src/toolkit/router.ts:17-40）仍是 **local/remote 二选一**：
```typescript
  getRouterForMember(member: TeamMember): IToolkitRouter {
    if (member.location === 'local') {
      return this.localRouter;
    }
    const url = member.runtime.executorUrl || '';
    if (!this.remoteRouters.has(url)) {
      this.remoteRouters.set(url, new RemoteToolkitRouter({...}));
    }
    return this.remoteRouters.get(url)!;
  }
```
- `coordinator.ts:449-458` `createAgents` 用 `routerFactory.getRouterForMember(...)` 为每个 RoleAgent 分配 router——即 per-agent 仍二选一，HybridToolkitRouter 未被 getRouterForMember 引用。
- 测试：`orchestrator/src/toolkit/hybrid.test.ts`（5 个 it：remote-brain-local-hands 写/读本地、local-full、custom、createExecutionConfig），但覆盖的是 HybridToolkitRouter 单测，无 per-agent 接线测试。
- **结论**：per-agent 工具类型路由（files local + commands remote 等）需在 `RouterFactory.getRouterForMember` 接入 `HybridToolkitRouter`（按 member 的 tools 配置构造 ExecutionConfig）才能打通。

### E4. 前端 useMeetingSocket.ts 消费 approval request 的 status 字段情况（P1 评审 minor 核实）

**确认属实：前端未读 `status` 字段。**

- 后端发送包含 `status`：approval_manager.py:91-103
```python
            await send_fn({
                "type": "human_approval_request",
                "request": {
                    "id": approval.id,
                    "requesterId": approval.requester_id,
                    "operation": approval.operation,
                    "description": approval.description,
                    "riskLevel": approval.risk_level.value,
                    "confidence": approval.confidence,
                    "status": approval.status.value,      # 后端已发 status
                    "createdAt": approval.created_at,
                },
            })
```
- 前端 `PendingApprovalInfo` 接口**无 status 字段**（src/hooks/useMeetingSocket.ts:130-138）：仅 `id/requesterId/operation/description/riskLevel/confidence/createdAt`。
- 前端 `human_approval_request` handler（:691-714）只读上述字段，忽略 `request.status`；`pending_approvals` handler（:733+）同。P2 修法：在 `PendingApprovalInfo` 增加 `status`，并在渲染 ApprovalPanel 时展示。

---

## 测试现状清单（与 P2 五改造点相关）

| 测试文件 | 测试数 | 覆盖点 | P2 缺口 |
|---------|--------|--------|---------|
| backend/tests/test_workflow_engine.py | 22 | create/execute/parallel/mixed/pause/resume/cancel/retry/topo/条件跳过/回调 | 无持久化、无重启恢复、无防重复执行测试 |
| backend/tests/test_workflow_integration.py | 18 | 语义分析→DAG→engine 集成、_run_agent_execution_loop | 无检查点集成 |
| backend/tests/test_review_pipeline.py | 14 | review 全流程、critical 降级、LLM fallback、LLM findings 合并 | 无确定性门禁（test/lint）测试 |
| backend/tests/test_review_integration.py | 7 | ReviewPipeline 含 critic/grounding、coordinator 子模块委托 | 无 artifact 引用传递测试 |
| backend/tests/test_structured_feedback.py | 9 | status 类型、max_iterations、fallback、空/有效 output | 无 test/lint 结果并入 status |
| backend/tests/test_agent_pool.py | 18 | create_team、轮询、健康过滤、scale、capability、health_check | 无 `_get_model` failover 测试 |
| backend/tests/test_agent_toolset.py | 23 | 角色工具权限、run_tests、read/write、tool_descriptions | run_tests/run_linter 无门禁语义测试 |
| backend/tests/test_meeting_coordinator_router.py | 32 | 路由统计、routing_table、讨论 stance、工作流回调 | 无 _update_routing_stats 异常路径测试 |
| **无** compensation/checkpoint 专属测试 | 0 | CheckpointManager/CompensationEngine 无直接测试（仅 protocol.py 的 n_roundtrip 间接） | 需新建 test_checkpoint.py / test_durable_execution.py |

**结论汇总（A-E 可行性）**：
- A 可行：现有内存状态 + 序列化函数齐备，加磁盘 JSON 落盘 + 恢复时跳过 COMPLETED 节点即可；CheckpointManager 需补持久化与自动失败检测。
- B 可行：确定性门禁在 review 前插入 run_tests/run_linter（同步 ToolResult），并入 structured_feedback status。
- C 可行：files_written 已收集、未传递，改 execution_text 拼接为"文件清单+摘要"即可，review_pipeline 5 个使用点零改动。
- D 接线已完成、failover 缺口明确：_get_model 缓存坏模型需 mark_unhealthy + 清除缓存重取。
- E 三处 minor 均核实：_update_routing_stats 在 try 外、前端未读 approval status、per-agent hybrid 未接。
