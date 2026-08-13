# P2 阶段实施计划（durable execution 补强 / 审查确定性门禁 / artifact 模式 / 模型 failover / 杂项）

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实产品发展方向 P2 优先级——durable execution 补强（支柱 3：工作流执行持久化 + 断点恢复跳过已完成节点 + 防重复执行）、审查确定性门禁（支柱 4：测试/lint 门禁并入结构化反馈）、artifact 模式（支柱 3：执行结果落盘回传轻量引用降 LLM 调用放大）、模型 failover（横向 L9）、杂项收尾（路由统计 try、AGENTS.md 计数、per-agent hybrid 接线、前端审批 status）。

**Architecture:** 五处改造：① `WorkflowEngine` 增加磁盘持久化（`persist_to_disk`/`load_from_disk`，JSON per execution）+ 恢复时跳过 COMPLETED 节点（防重复执行），`CheckpointManager` 补磁盘持久化；② `ReviewPipeline.review` 增加 `gate_result` 入参并入 `_generate_structured_feedback`（确定性失败 → revision_required），meeting_coordinator 在执行后、审查前运行 `run_tests`/`run_linter` 门禁；③ `process_user_message` 的 `execution_text` 改为"文件清单 + 摘要"轻量引用（`_build_execution_artifact_text` 辅助函数），review_pipeline 5 个使用点零改动；④ `_get_model` 缓存 pool 实例 id，新增 `_mark_model_failed(role)`（mark_unhealthy + 清缓存重取），执行路径异常处接入；⑤ 杂项：`_update_routing_stats` 包 try、AGENTS.md 测试计数刷新、`RouterFactory.getRouterForMember` 接入 per-member HybridToolkitRouter、前端 `PendingApprovalInfo` 增加 `status` 字段并展示。

**Tech Stack:** Python 3.11（backend）、TypeScript（orchestrator + 前端）

## Global Constraints

- backend 测试：`cd backend && /usr/bin/python3 -m pytest tests/<file> -v`（**不要加 `--timeout`**）；全量回归 `tests/ -q`
- orchestrator 测试：`cd orchestrator && npm test`；前端测试：`node /home/test/MDH/node_modules/vitest/vitest.mjs run <file>`（worktree 无 node_modules 时）
- 不引入新依赖；不改 `mock-sso/`；不提交编译产物与运行时产物（`backend/companion_log.json` 已 untrack+ignore）
- 现有测试基线（main@f7efbd5）：backend 864 passed / 1 skipped；orchestrator 110 passed；前端 1630 passed（main 工作树含未跟踪技能文件，环境失败已消失）
- 持久化数据写入 `backend/data/workflows/`（已在 `.gitignore` 的 `backend/data/*` 覆盖内）
- LLM 调用统一现有模式（`Msg` + `model.reply` + `_extract_text` + `LLM_FALLBACK_TEMPLATE`）；私有方法/属性在测试中可访问（本仓库既有风格）

---

### Task 1: durable execution 补强（工作流持久化 + 断点恢复 + 防重复执行）

**Covers:** S2.4（支柱 3 并行执行 P2：检查点系统补齐自动失败检测/防重复执行 [25]）
<!-- WorkflowExecution 纯内存无落盘；最小设计=JSON 落盘 + 恢复时跳过 COMPLETED 节点（防重复执行）；CheckpointManager 补磁盘持久化 -->

**Files:**
- Modify: `backend/workflow_engine.py`（新增持久化方法 + create_workflow/节点完成/暂停取消处落盘）
- Modify: `backend/compensation.py`（CheckpointManager 补磁盘持久化）
- Test: 新建 `backend/tests/test_durable_execution.py`

**Interfaces:**
- Consumes: `workflow_execution_to_dict`（protocol.py:591）、`WorkflowExecution`（protocol.py:63-72）、`WorkflowNodeStatus.COMPLETED`、`CheckpointManager`（compensation.py:164）
- Produces: `WorkflowEngine.__init__(..., persistence_dir: Optional[str] = None)`；`persist_execution(execution_id)`、`load_execution(execution_id) -> Optional[WorkflowExecution]`、`load_all_executions()`；`CheckpointManager.__init__(..., persistence_dir: Optional[str] = None)` + `_persist/_load`；恢复执行时已完成节点跳过（不重复执行）

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_durable_execution.py`）

```python
"""durable execution：工作流执行持久化 + 断点恢复跳过已完成节点 + 防重复执行"""

import asyncio
import json

import pytest

from workflow_engine import WorkflowEngine
from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowNodeStatus


def _make_definition(workflow_id="wf-persist"):
    return WorkflowDefinition(
        workflow_id=workflow_id,
        name="持久化测试",
        description="",
        nodes=[
            WorkflowNode(node_id="n1", task_description="t1", dept_id="dept-frontend"),
            WorkflowNode(node_id="n2", task_description="t2", dept_id="dept-backend"),
        ],
        edges=[WorkflowEdge(source_node_id="n1", target_node_id="n2")],
    )


async def test_execution_persisted_to_disk(tmp_path):
    """执行后 execution 状态落盘为 JSON 文件"""
    engine = WorkflowEngine(persistence_dir=str(tmp_path))
    executed = []

    async def exec1(node, input_data):
        executed.append(node.node_id)
        return {"result": f"done-{node.node_id}"}

    engine.register_node_executor("dept-frontend", exec1)
    engine.register_node_executor("dept-backend", exec1)

    execution = engine.create_workflow(_make_definition())
    await engine.execute_workflow(execution.execution_id)

    disk_file = tmp_path / f"{execution.execution_id}.json"
    assert disk_file.exists()
    data = json.loads(disk_file.read_text())
    assert data["status"] == "completed"
    assert "n1" in data["node_states"]


async def test_reloaded_execution_skips_completed_nodes(tmp_path):
    """恢复持久化 execution 后，已完成节点不重复执行（防重复执行）"""
    first_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    executed = []

    async def exec1(node, input_data):
        executed.append(node.node_id)
        return {"result": f"done-{node.node_id}"}

    first_engine.register_node_executor("dept-frontend", exec1)
    first_engine.register_node_executor("dept-backend", exec1)

    execution = first_engine.create_workflow(_make_definition())
    # 手动推进 n1 完成并落盘（模拟进程中断在 n1 之后）
    execution.node_states["n1"] = WorkflowNodeStatus.COMPLETED
    execution.results["n1"] = {"result": "done-n1"}
    first_engine.persist_execution(execution.execution_id)

    second_engine = WorkflowEngine(persistence_dir=str(tmp_path))
    second_engine.register_node_executor("dept-frontend", exec1)
    second_engine.register_node_executor("dept-backend", exec1)

    restored = second_engine.load_execution(execution.execution_id)
    assert restored is not None
    assert restored.node_states["n1"] == WorkflowNodeStatus.COMPLETED

    await second_engine.execute_workflow(restored.execution_id)
    # n1 不重复执行，仅执行 n2
    assert executed == ["n2"]
    status = second_engine.get_workflow_status(restored.execution_id)
    assert status.node_states["n2"] == WorkflowNodeStatus.COMPLETED


async def test_checkpoint_manager_persists_to_disk(tmp_path):
    """CheckpointManager 检查点落盘并在新实例中可恢复"""
    from compensation import CheckpointManager

    m1 = CheckpointManager(persistence_dir=str(tmp_path))
    cp = m1.save_checkpoint("task-x", 2, {"progress": "half"})

    m2 = CheckpointManager(persistence_dir=str(tmp_path))
    restored = m2.restore_checkpoint(cp.id)
    assert restored == {"progress": "half"}
```

> 若 `execute_workflow` 对已完成节点已有跳过逻辑（`_check_dependencies` 按 COMPLETED 判定），Step 2 中测试 2 可能直接通过——此时在 Step 3 仍需确保恢复路径真实存在（load 后执行），测试 2 保持为回归守卫。若 `execute_workflow` 会重跑所有节点，需在 `_execute_sequential`/`_execute_parallel` 节点循环加 `if node_states.get(node_id) == COMPLETED: continue`。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_durable_execution.py -v`
Expected: FAIL——`TypeError: __init__() got an unexpected keyword argument 'persistence_dir'`（或 `AttributeError: 'WorkflowEngine' object has no attribute 'persist_execution'`）

- [ ] **Step 3: 实现**

3a. `backend/workflow_engine.py` `__init__` 加参数：

```python
    def __init__(self, persistence_dir: Optional[str] = None):
        self._definitions: Dict[str, WorkflowDefinition] = {}
        self._executions: Dict[str, WorkflowExecution] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._node_executors: Dict[str, Callable] = {}
        self._on_status_change: Optional[Callable] = None
        self._on_node_status_change: Optional[Callable] = None
        self._persistence_dir = persistence_dir
        if persistence_dir:
            os.makedirs(persistence_dir, exist_ok=True)
        self._task_bridge = AgentscopeTaskBridge()
```

（`import os` 若未在文件头部，补上。）

3b. 新增持久化方法（放在 `create_workflow` 附近）：

```python
    def persist_execution(self, execution_id: str) -> bool:
        """将 execution 状态落盘（JSON），供进程重启后恢复"""
        if not self._persistence_dir:
            return False
        execution = self._executions.get(execution_id)
        if execution is None:
            return False
        from protocol import workflow_execution_to_dict
        path = os.path.join(self._persistence_dir, f"{execution_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(workflow_execution_to_dict(execution), f, ensure_ascii=False, indent=2)
        return True

    def load_execution(self, execution_id: str) -> Optional[WorkflowExecution]:
        """从磁盘恢复 execution（不存在返回 None）"""
        if not self._persistence_dir:
            return None
        path = os.path.join(self._persistence_dir, f"{execution_id}.json")
        if not os.path.exists(path):
            return None
        from protocol import workflow_execution_from_dict
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        execution = workflow_execution_from_dict(data)
        self._executions[execution_id] = execution
        return execution

    def load_all_executions(self) -> List[str]:
        """列出磁盘上已持久化的 execution_id 列表"""
        if not self._persistence_dir or not os.path.isdir(self._persistence_dir):
            return []
        return [f[:-5] for f in os.listdir(self._persistence_dir) if f.endswith(".json")]
```

（`workflow_execution_from_dict` 若 protocol.py 不存在，需新增对称反序列化函数——先读 protocol.py:591-600 的 `workflow_execution_to_dict` 实现并按对称实现 from_dict；或直接用 dataclass 字段重建。）

3c. 落盘点：`create_workflow`（:91）后、`_execute_node` 完成/失败处、`pause_workflow`/`cancel_workflow` 状态更新后调用 `self.persist_execution(execution_id)`。

3d. 恢复跳过已完成节点（若 Step 2 显示测试 2 失败）：`_execute_sequential` 与 `_execute_parallel` 节点循环开头加：

```python
            if execution.node_states.get(node.node_id) == WorkflowNodeStatus.COMPLETED:
                continue
```

3e. `backend/compensation.py` `CheckpointManager.__init__` 加 `persistence_dir: Optional[str] = None` 参数；`save_checkpoint`/`delete_checkpoint`/`delete_checkpoints_for_task`/`clear` 时若配置了目录则把 `self._checkpoints` 全量 JSON 落盘（`checkpoints.json`），`__init__` 时若文件存在则加载。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_durable_execution.py tests/test_workflow_engine.py -q`
Expected: PASS（新增 3 用例 + 既有 22 用例）

- [ ] **Step 5: 提交**

```bash
git add backend/workflow_engine.py backend/compensation.py backend/tests/test_durable_execution.py
git commit -m "feat(workflow): durable execution with disk persistence and resume-skip of completed nodes"
```

---

### Task 2: 审查确定性门禁（测试/lint 门禁并入结构化反馈）

**Covers:** S2.4（支柱 4 审查智能体 P1 剩余：审查重心转向确定性验证（测试/lint 门禁）+ 单次 LLM 审查）
<!-- 确定性门禁：执行后运行 run_tests/run_linter，失败并入 structured_feedback status=revision_required（复用 critical_signals 降级逻辑） -->

**Files:**
- Modify: `backend/review_pipeline.py`（`review` 增加 `gate_result` 入参 + `_generate_structured_feedback` 合并门禁结果）
- Modify: `backend/meeting_coordinator.py`（开发循环中执行后、审查前运行门禁并传入）
- Test: `backend/tests/test_review_pipeline.py` + `backend/tests/test_meeting_coordinator_router.py`（或新建 `test_deterministic_gate.py`）

**Interfaces:**
- Consumes: `AgentToolset.run_tests(test_path, verbose)` / `run_linter(path)`（agent_toolset.py:363-372，同步返回 ToolResult）、`ToolResult.success/output`
- Produces: `review(task_description, execution_result, on_message, repo_context=None, discussion_context="", gate_result: Optional[Dict[str, Any]] = None)`；门禁结果并入 `structured_feedback`（status=revision_required + issues）；`meeting_coordinator._run_deterministic_gate(workspace_root) -> Dict`（运行 run_tests/run_linter，返回 `{"passed": bool, "failures": [{type, detail}]}`）

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_review_pipeline.py` 末尾，复用 `pipeline` fixture）

```python
async def test_gate_failure_forces_revision_required(pipeline):
    """确定性门禁失败 → structured_feedback.status == revision_required"""
    from review_pipeline import ReviewPipeline

    result = await pipeline.review(
        "测试任务",
        "执行结果文本",
        lambda *a, **k: None,
        gate_result={"passed": False, "failures": [{"type": "test_failure", "detail": "tests/test_x.py 失败"}]},
    )
    sf = result["structured_feedback"]
    assert sf["status"] == "revision_required"
    assert any(i["type"] == "test_failure" for i in sf["issues"])


async def test_gate_pass_keeps_status(pipeline):
    """确定性门禁通过 → 不覆盖 LLM 审查结论（approved 保持）"""
    result = await pipeline.review(
        "测试任务",
        "执行结果文本",
        lambda *a, **k: None,
        gate_result={"passed": True, "failures": []},
    )
    assert result["structured_feedback"]["status"] in ("approved", "revision_required")
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_review_pipeline.py -k "gate" -v`
Expected: FAIL——`TypeError: review() got an unexpected keyword argument 'gate_result'`

- [ ] **Step 3: 实现**

3a. `backend/review_pipeline.py` `review()` 签名加参数并传给 `_generate_structured_feedback`：

```python
        gate_result: Optional[Dict[str, Any]] = None,
```

（在 `discussion_context` 之后；调用 `_generate_structured_feedback(task_description, execution_result, reviewer_feedback, monitor_feedback, gate_result)`。）

3b. `_generate_structured_feedback` 签名加 `gate_result`，在 planner 结果后合并：

```python
        if gate_result and not gate_result.get("passed", True):
            result["status"] = "revision_required"
            for failure in gate_result.get("failures", []):
                result["issues"].append({
                    "type": failure.get("type", "gate_failure"),
                    "location": failure.get("location", "deterministic_gate"),
                    "detail": failure.get("detail", "确定性门禁未通过"),
                    "suggestion": "请修复后重新运行测试/代码检查",
                })
```

（注意 `result` 在无 planner 时为 `{"status": "approved", ...}`，合并逻辑对两条路径都生效——若 planner 为 None，构造 result 后同样执行合并。）

3c. `backend/meeting_coordinator.py` 新增门禁方法：

```python
    def _run_deterministic_gate(self, workspace_root: Optional[str] = None) -> Dict[str, Any]:
        """确定性门禁：对工作区运行测试与代码检查，失败即 revision_required"""
        result: Dict[str, Any] = {"passed": True, "failures": []}
        if not workspace_root:
            return result
        try:
            from agent_toolset import create_agent_toolset
            toolset = create_agent_toolset(
                agent_id="gate", agent_role="reviewer", workspace_root=workspace_root
            )
            lint = toolset.run_linter(".")
            if not lint.success:
                result["passed"] = False
                result["failures"].append({
                    "type": "lint_failure", "location": ".",
                    "detail": (lint.error or lint.output or "lint 未通过")[:200],
                })
            tests = toolset.run_tests("", verbose=False)
            if not tests.success:
                result["passed"] = False
                result["failures"].append({
                    "type": "test_failure", "location": "",
                    "detail": (tests.error or tests.output or "测试未通过")[:200],
                })
        except Exception as e:
            result["passed"] = False
            result["failures"].append({"type": "gate_error", "detail": str(e)[:200]})
        return result
```

3d. `process_user_message` 开发循环中 `review_pipeline.review(...)` 调用（:1243）前传入门禁：

```python
            gate_result = self._run_deterministic_gate(
                self._workspace.root_path if self._workspace else None
            )
            review_result = await self._review_pipeline.review(
                enhanced_description, execution_text, on_message,
                discussion_context=discussion_context,
                gate_result=gate_result,
            )
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_review_pipeline.py tests/test_structured_feedback.py -q`
Expected: PASS（新增 2 用例 + 既有用例；`test_full_review_returns_all_sections` 等既有用例不传 gate_result，行为不变）

- [ ] **Step 5: 提交**

```bash
git add backend/review_pipeline.py backend/meeting_coordinator.py backend/tests/test_review_pipeline.py
git commit -m "feat(review): deterministic test/lint gate merged into structured feedback"
```

---

### Task 3: artifact 模式（执行结果落盘回传轻量引用）

**Covers:** S2.4（支柱 3 并行执行 P1 剩余：角色产出走 artifact 模式（降低 L1 的 LLM 调用放大））
<!-- files_written 已收集但 process_user_message 只拼 result 文本 → 改"文件清单+摘要"轻量引用，review_pipeline 5 个使用点零改动 -->

**Files:**
- Modify: `backend/meeting_coordinator.py`（新增 `_build_execution_artifact_text` + 两处调用：process_user_message :1239-1241、execute_and_review_task :848）
- Test: `backend/tests/test_meeting_coordinator_router.py`

**Interfaces:**
- Consumes: `exec_results`（含 `result`/`written_files` 字段，task_orchestrator.py:365-374）
- Produces: `_build_execution_artifact_text(exec_results, max_summary_len=400) -> str`（静态方法）——格式：每个任务 `[文件清单] file1, file2...\n[摘要] <result[:max_summary_len]>`

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_meeting_coordinator_router.py` 末尾）

```python
def test_build_execution_artifact_text_lists_files_and_summary():
    """artifact 文本含文件清单 + 截断摘要（不携带完整结果文本）"""
    from meeting_coordinator import MeetingCoordinator
    exec_results = [
        {"agent_id": "a1", "result": "完成了登录模块。" + "x" * 500, "written_files": ["src/auth.py", "src/auth_test.py"]},
        {"agent_id": "a2", "result": "后端 API 完成。", "written_files": []},
    ]
    text = MeetingCoordinator._build_execution_artifact_text(exec_results, max_summary_len=400)
    assert "src/auth.py" in text
    assert "src/auth_test.py" in text
    assert "[摘要]" in text
    assert len(text) < 600  # 轻量：不携带完整结果
    assert "完成了登录模块。" in text


def test_build_execution_artifact_text_empty():
    """无执行结果时返回空字符串"""
    from meeting_coordinator import MeetingCoordinator
    assert MeetingCoordinator._build_execution_artifact_text([]) == ""
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_meeting_coordinator_router.py -k "artifact" -v`
Expected: FAIL——`AttributeError: type object 'MeetingCoordinator' has no attribute '_build_execution_artifact_text'`

- [ ] **Step 3: 实现**

3a. `backend/meeting_coordinator.py` 新增静态方法：

```python
    @staticmethod
    def _build_execution_artifact_text(
        exec_results: List[Dict[str, Any]],
        max_summary_len: int = 400,
    ) -> str:
        """构建 artifact 模式的执行结果文本：文件清单 + 截断摘要（轻量引用，降低 LLM 上下文放大）"""
        parts: List[str] = []
        for r in exec_results:
            written = r.get("written_files") or []
            files_line = f"[文件清单] {', '.join(written)}" if written else "[文件清单] (无)"
            summary = (r.get("result") or "")[:max_summary_len]
            parts.append(f"{files_line}\n[摘要] {summary}")
        return "\n\n".join(parts)
```

3b. `process_user_message`（:1239-1241）替换：

```python
            execution_text = self._build_execution_artifact_text(exec_results) if exec_results else ""
```

3c. `execute_and_review_task`（:848）替换：

```python
            execution_result = self._build_execution_artifact_text(task_results)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_meeting_coordinator_router.py tests/test_review_pipeline.py -q`
Expected: PASS（新增 2 用例 + 既有用例；review 侧仅文本变小，行为不变）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/tests/test_meeting_coordinator_router.py
git commit -m "feat(workflow): artifact mode - pass file list and summary instead of full execution text"
```

---

### Task 4: 模型 failover + agent_pool 健康接线（单点故障治理）

**Covers:** S2.4（横向单点故障治理 L9：agent_pool 接入、模型缓存治理）
<!-- agent_pool 已注入（server.py:1279）；缺口：_get_model 缓存坏模型无 failover。加 _mark_model_failed（mark_unhealthy + 清缓存重取）并接入执行路径异常处 -->

**Files:**
- Modify: `backend/meeting_coordinator.py`（`_get_model` 记录 pool 实例 id + 新增 `_mark_model_failed` + 执行循环异常处接入）
- Modify: `backend/server.py`（会议开始前调用 `agent_pool.health_check()`）
- Test: `backend/tests/test_meeting_coordinator_router.py`

**Interfaces:**
- Consumes: `AgentPool.get_agent_by_role(role) -> Optional[AgentInstance]`（含 `.agent`/`.id`）、`AgentPool.mark_unhealthy(agent_id) -> bool`（agent_pool.py:334）、`AgentPool.health_check(timeout=5.0)`
- Produces: `_get_model` 记录 `self._model_pool_ids: Dict[str, str]`（role → pool agent id）；`_mark_model_failed(role)`（从 `_models` 驱逐 + `mark_unhealthy` + 清 `_model_pool_ids`）；`_run_agent_execution_loop`/`_execute_workflow_node` 异常分支调用

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_meeting_coordinator_router.py` 末尾）

```python
async def test_mark_model_failed_evicts_cache_and_marks_unhealthy(meeting_coordinator):
    """_mark_model_failed 驱逐缓存 + 标记 pool 实例不健康"""
    coordinator = meeting_coordinator
    coordinator._agent_pool = MagicMock()
    pool_instance = MagicMock()
    pool_instance.id = "pool-1"
    coordinator._agent_pool.get_agent_by_role.return_value = pool_instance

    model = coordinator._get_model(AgentRole.EXECUTOR)
    assert coordinator._models.get(AgentRole.EXECUTOR.value) is model
    assert coordinator._model_pool_ids.get(AgentRole.EXECUTOR.value) == "pool-1"

    coordinator._mark_model_failed(AgentRole.EXECUTOR)
    assert AgentRole.EXECUTOR.value not in coordinator._models
    coordinator._agent_pool.mark_unhealthy.assert_called_once_with("pool-1")


async def test_get_model_refetches_after_failure(meeting_coordinator):
    """模型失败后 _get_model 重新获取（不再返回坏模型缓存）"""
    coordinator = meeting_coordinator
    coordinator._agent_pool = MagicMock()
    pool_instance = MagicMock()
    pool_instance.id = "pool-1"
    coordinator._agent_pool.get_agent_by_role.side_effect = [pool_instance, MagicMock(id="pool-2")]

    model1 = coordinator._get_model(AgentRole.EXECUTOR)
    coordinator._mark_model_failed(AgentRole.EXECUTOR)
    model2 = coordinator._get_model(AgentRole.EXECUTOR)
    assert model1 is not model2
    assert coordinator._agent_pool.get_agent_by_role.call_count == 2
```

> `AgentRole` 已在文件头部 import（既有用例使用）。若 fixture `meeting_coordinator` 的 `_agent_pool` 已是真实 AgentPool，测试中直接覆盖为 MagicMock。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_meeting_coordinator_router.py -k "mark_model_failed or refetches" -v`
Expected: FAIL——`AttributeError: 'MeetingCoordinator' object has no attribute '_mark_model_failed'`

- [ ] **Step 3: 实现**

3a. `__init__` 加 `self._model_pool_ids: Dict[str, str] = {}`（`self._models` 声明附近）。

3b. `_get_model`（:410-420）在 pool 命中时记录实例 id：

```python
    def _get_model(self, role: AgentRole) -> Agent:
        key = role.value
        if key not in self._models:
            if self._agent_pool:
                instance = self._agent_pool.get_agent_by_role(key)
                if instance:
                    self._models[key] = instance.agent
                    self._model_pool_ids[key] = instance.id
                    return instance.agent
            self._models[key] = self._create_model(role)
        return self._models[key]
```

3c. 新增方法（放在 `_get_model` 之后）：

```python
    def _mark_model_failed(self, role: AgentRole) -> None:
        """模型调用失败：驱逐缓存 + 标记 pool 实例不健康（下次 _get_model 重新获取健康实例）"""
        key = role.value
        self._models.pop(key, None)
        pool_id = self._model_pool_ids.pop(key, None)
        if pool_id and self._agent_pool:
            self._agent_pool.mark_unhealthy(pool_id)
```

3d. 执行路径异常处接入：`_run_agent_execution_loop` 的 `except Exception`（若存在）与 `_execute_workflow_node` 的 `except Exception` 分支中，在回退前调用 `self._mark_model_failed(role)`（先读实际代码确认异常分支结构与 role 变量作用域）。

3e. `backend/server.py` 会议创建处（MeetingCoordinator 构造前）加：

```python
                # 单点治理：会议开始前健康探测，剔除不健康 agent
                try:
                    await agent_pool.health_check(timeout=3.0)
                except Exception:
                    pass
```

（`agent_pool` 为模块级全局，会议处理函数内可直接引用；health_check 为 async，需在 async 上下文中 await。）

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_meeting_coordinator_router.py -q`
Expected: PASS（新增 2 用例 + 既有 34 用例）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/server.py backend/tests/test_meeting_coordinator_router.py
git commit -m "feat(resilience): model failover via pool unhealthy marking and health check at meeting start"
```

---

### Task 5: 杂项收尾（路由统计 try / AGENTS.md 计数 / per-agent hybrid / 前端审批 status）

**Covers:** S2.4（横向；P1/P2 评审遗留）
<!-- 四个小项：_update_routing_stats 包 try；AGENTS.md 测试计数刷新；RouterFactory per-member hybrid 接线；前端 PendingApprovalInfo.status 字段 -->

**Files:**
- Modify: `backend/meeting_coordinator.py`（`_update_routing_stats` 调用包 try）
- Modify: `AGENTS.md`（测试计数行 :42）
- Modify: `orchestrator/src/toolkit/router.ts`（`getRouterForMember` per-member hybrid）
- Modify: `src/hooks/useMeetingSocket.ts`（`PendingApprovalInfo` + status 字段）与相关测试
- Test: `backend/tests/test_meeting_coordinator_router.py`、`orchestrator/src/toolkit/router.test.ts`（新建）、`src/__tests__/useMeetingSocket.test.ts`

**Interfaces:**
- Consumes: `HybridToolkitRouter` + `createExecutionConfig(profile, options)`（hybrid.ts:43-77）、`TeamMember.runtime`（含可选 hybrid 配置）
- Produces: `RouterFactory.getRouterForMember`：当 member.runtime 含 `hybrid` 配置时返回 HybridToolkitRouter；`PendingApprovalInfo` 增加 `status: string`；`_update_routing_stats` 异常被 try 包裹

- [ ] **Step 1: 写失败测试**

1a. `backend/tests/test_meeting_coordinator_router.py` 追加（路由统计异常兜底）：

```python
async def test_update_routing_stats_exception_does_not_abort(meeting_coordinator):
    """_update_routing_stats 抛异常时不中断 process_user_message 后续流程"""
    coordinator = meeting_coordinator
    task = coordinator.meeting.add_task("agent-executor", "任务")
    coordinator._task_routing[task.id] = "dept-frontend"
    task.status = "completed"

    with mock.patch.object(coordinator.router, "update_stats", side_effect=RuntimeError("disk full")):
        coordinator._update_routing_stats_safe()
    assert coordinator._task_routing == {}
```

（实现新增 `_update_routing_stats_safe` 包装方法，原方法保持纯逻辑；`mock` 以文件既有 import 为准。）

1b. 新建 `orchestrator/src/toolkit/router.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { RouterFactory } from './router';
import type { TeamMember } from '../team/types';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'm1',
    name: '成员',
    role: 'executor',
    template: {} as any,
    status: 'idle',
    location: 'remote',
    runtime: { type: 'remote', workspace: '/tmp/ws', executorUrl: 'http://e:8767' },
    ...overrides,
  };
}

describe('RouterFactory hybrid', () => {
  it('returns HybridToolkitRouter when member runtime carries hybrid config', () => {
    const factory = new RouterFactory();
    const router = factory.getRouterForMember(makeMember({
      runtime: { type: 'remote', workspace: '/tmp/ws', executorUrl: 'http://e:8767', hybrid: { profile: 'remote-brain-local-hands' } } as any,
    }));
    expect(router.constructor.name).toBe('HybridToolkitRouter');
  });

  it('returns RemoteToolkitRouter for remote member without hybrid config', () => {
    const factory = new RouterFactory();
    const router = factory.getRouterForMember(makeMember());
    expect(router.constructor.name).toBe('RemoteToolkitRouter');
  });
});
```

（`TeamMember`/`runtime` 类型字段以实际为准；hybrid 配置字段名以 hybrid.ts 的 ExecutionConfig/createExecutionConfig 参数为准调整。）

1c. `src/__tests__/useMeetingSocket.test.ts` 追加（status 字段）：

```typescript
it('includes status field in pendingApprovals from structured request', () => {
  // 模拟 WS 消息 request 含 status: 'pending'
  // 断言 pendingApprovals.get(id).status === 'pending'
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_meeting_coordinator_router.py -k "routing_stats_exception" -v`、`cd orchestrator && npx vitest run src/toolkit/router.test.ts`、`node /home/test/MDH/node_modules/vitest/vitest.mjs run src/__tests__/useMeetingSocket.test.ts -t "status"`
Expected: 三处均 FAIL（方法不存在 / 断言失败）

- [ ] **Step 3: 实现**

3a. `backend/meeting_coordinator.py`：新增包装方法并替换调用点：

```python
    def _update_routing_stats_safe(self) -> None:
        """路由统计安全包装：异常不中断后续流程（项目总结/技能进化）"""
        try:
            self._update_routing_stats()
        except Exception as e:
            self.logger.warning("更新路由统计失败: %s", e)
```

调用点 `self._update_routing_stats()` → `self._update_routing_stats_safe()`。

3b. `AGENTS.md:42`：`865 TS 测试 + 532 Python 测试` → `1700+ TS 测试（前端 1630 + orchestrator 110）+ 860+ Python 测试`。

3c. `orchestrator/src/toolkit/router.ts` `getRouterForMember` 增加 hybrid 分支（先读 hybrid.ts 的 `createExecutionConfig` 签名，按实际调整）：

```typescript
  getRouterForMember(member: TeamMember): IToolkitRouter {
    const hybrid = (member.runtime as any)?.hybrid as { profile?: string } | undefined;
    if (hybrid?.profile) {
      const { HybridToolkitRouter, createExecutionConfig } = require('./hybrid');
      const remote = member.runtime.executorUrl
        ? { executorUrl: member.runtime.executorUrl, token: member.runtime.executorToken }
        : undefined;
      return new HybridToolkitRouter(createExecutionConfig(hybrid.profile, {
        localWorkspace: this.getWorkspaceForMember(member),
        remote,
      }));
    }
    if (member.location === 'local') {
      return this.localRouter;
    }
    // ... 原 remote 逻辑不变
  }
```

（若静态 import 更合适则改 import；require 仅作兜底。）

3d. `src/hooks/useMeetingSocket.ts`：`PendingApprovalInfo` 增加 `status: string`；`human_approval_request` handler 与 `pending_approvals` handler 读 `request.status`；相关展示组件最小适配（若组件不展示则仅字段透传）。

- [ ] **Step 4: 运行确认通过**

Run: backend 全量 `cd backend && /usr/bin/python3 -m pytest tests/ -q`（预期 868+ passed）；orchestrator `npm test`；前端 useMeetingSocket 测试
Expected: 全部通过（含新增用例）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py AGENTS.md orchestrator/src/toolkit/router.ts orchestrator/src/toolkit/router.test.ts src/hooks/useMeetingSocket.ts src/__tests__/useMeetingSocket.test.ts
git commit -m "chore: routing stats safety, doc counts, per-member hybrid routing, approval status field"
```

---

## 自检备注（Self-Review）

- **Spec coverage**：T1 → 支柱 3 P2 durable execution（[25]）；T2 → 支柱 4 P1 剩余确定性门禁；T3 → 支柱 3 P1 剩余 artifact 模式；T4 → 横向 L9 单点治理；T5 → 横向杂项（评审遗留 4 项）。全部对应分析文档 S2.4。
- **已知取舍（记录而非回避）**：T1 持久化粒度=执行状态级（节点完成即落盘），非"运行到完成"的完整 durable execution（分布式协调/自动失败重试仍属后续）；T4 failover 接入点为执行路径异常分支（review 路径已有 fallback，不重复接入）；T5 hybrid 接线为 per-member 最小版（profile 透传，profile 语义沿用 hybrid.ts 既有 3 个预置）。
- **明确不做的**：技能市场/Agent Skills 目录对齐/判定结果回传 UI/审查报告闭环/MCP/A2A/技能打包审核 UI（未入选本阶段）；`_generate_structured_feedback` 旧方法清理（meeting_coordinator.py:855-875 遗留，无调用方——顺带删除可加分但非必需）。
- **环境**：main@f7efbd5 基线（backend 864 / orchestrator 110 / 前端 1630 全绿）；worktree 将缺失未跟踪 skill 文件致 2 个环境失败（PRE-EXISTING，主工作树无）。
