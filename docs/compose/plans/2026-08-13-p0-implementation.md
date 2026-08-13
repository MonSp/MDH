# P0 阶段实施计划（工作流真执行 / 审查 LLM 通道 / 审批真等待 / 债务清理）

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实产品发展方向 P0 优先级——让五大支柱"名副其实"：工作流节点真实执行并写文件、双引擎合并使暂停/取消真正生效、审查智能体接入 LLM 通道、审批实现真阻塞等待、清理 parallel 死代码。

**Architecture:** 五处互不耦合的改造：① WorkflowEngine 新增 `start_workflow()`（注册 asyncio.Task 到 `_running_tasks`，pause/cancel 可真中断）；② MeetingCoordinator 支持注入共享 WorkflowEngine（server 传入全局实例），REST 与会议工作流同引擎；③ `_execute_workflow_node` 重写为 LLM + AgentToolset 工具循环（代码块写文件、工具调用），核心循环提取为可测的 `_run_agent_execution_loop`；④ CriticAgent 新增 `review_with_llm`（规则兜底 + LLM 补充），ReviewPipeline 接入；⑤ 审批阶段用 ApprovalManager 的 `request_approval` + `wait_for_decision` 实现真阻塞，超时默认通过。

**Tech Stack:** Python 3.11 + asyncio + pytest（`cd backend && python -m pytest`）

## Global Constraints

- 测试运行：`cd backend && python -m pytest tests/<file>::<test> -v`；全套回归：`cd backend && python -m pytest tests/ -q --timeout=10`
- 不引入新依赖；不新增配置文件；不改 `mock-sso/`（untracked，归属待定）
- 保留 `backend/tests/test_e2e_parallel.py` 与 `test_parallel_modules.py`（其实际覆盖 KeyManager/MessageQueue/AgentPool 存活代码）
- LLM 调用统一现有模式：`Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])` + `await model.reply(msg)` + `_extract_text(response)` + `LLM_FALLBACK_TEMPLATE` 兜底（自 `agent` / `protocol` 导入）
- 现有测试基线（PRE-EXISTING 若失败须单独标注，不视为本计划回归）

---

### Task 1: WorkflowEngine.start_workflow（暂停/取消真正生效）

**Covers:** S2.4（支柱 3 并行执行）
<!-- 让 execute 后的工作流可被 pause/cancel 真正中断：把执行包装为 asyncio.Task 并注册进 _running_tasks -->

**Files:**
- Modify: `backend/workflow_engine.py:105`（execute_workflow 附近新增方法）
- Test: `backend/tests/test_workflow_engine.py`

**Interfaces:**
- Consumes: 既有 `self._running_tasks: Dict[str, asyncio.Task]`（workflow_engine.py:39）、`execute_workflow(execution_id)`（:105）
- Produces: `start_workflow(execution_id: str) -> asyncio.Task`——供 Task 2 的会议路径与 REST execute 端点使用

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_workflow_engine.py` 末尾）

```python
async def test_start_workflow_can_be_cancelled(workflow_engine, sample_workflow_definition):
    """start_workflow 启动的任务可被 cancel_workflow 真正中断"""

    async def slow_executor(node, input_data):
        await asyncio.sleep(60)
        return {"result": "slow"}

    for dept in ("dept-frontend", "dept-backend", "dept-qa"):
        workflow_engine.register_node_executor(dept, slow_executor)

    execution = workflow_engine.create_workflow(sample_workflow_definition)
    task = workflow_engine.start_workflow(execution.execution_id)

    await asyncio.sleep(0.1)
    await workflow_engine.cancel_workflow(execution.execution_id)

    with pytest.raises(asyncio.CancelledError):
        await task
    assert execution.execution_id not in workflow_engine._running_tasks
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_workflow_engine.py::test_start_workflow_can_be_cancelled -v`
Expected: FAIL — `AttributeError: 'WorkflowEngine' object has no attribute 'start_workflow'`

- [ ] **Step 3: 实现**（在 `backend/workflow_engine.py` 的 `execute_workflow` 方法之后插入）

```python
    def start_workflow(self, execution_id: str) -> asyncio.Task:
        """启动工作流执行并注册为可中断任务（pause/cancel 真正生效）"""
        task = asyncio.create_task(self.execute_workflow(execution_id))
        self._running_tasks[execution_id] = task
        task.add_done_callback(lambda t: self._running_tasks.pop(execution_id, None))
        return task
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_workflow_engine.py::test_start_workflow_can_be_cancelled -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/workflow_engine.py backend/tests/test_workflow_engine.py
git commit -m "feat(workflow): add start_workflow for truly cancellable execution"
```

---

### Task 2: 双引擎合并（注入共享 WorkflowEngine）

**Covers:** S2.4（支柱 3 并行执行；局限 L2）
<!-- server 全局引擎注入 MeetingCoordinator，会议工作流与 REST 同一引擎；会议路径改用 start_workflow -->

**Files:**
- Modify: `backend/meeting_coordinator.py:105-107`（引擎初始化）、`:1362-1423`（`_execute_workflow` 执行段）
- Modify: `backend/server.py:1262-1272`（MeetingCoordinator 构造）、`:2228-2238`（REST execute 端点）
- Test: `backend/tests/test_workflow_integration.py`

**Interfaces:**
- Consumes: Task 1 的 `WorkflowEngine.start_workflow(execution_id)`
- Produces: `MeetingCoordinator(..., workflow_engine: Optional[WorkflowEngine] = None)`；server 侧 `workflow_engine` 全局实例（server.py:2191）注入所有 coordinator

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_workflow_integration.py` 末尾）

```python
async def test_meeting_coordinator_accepts_injected_engine(meeting_coordinator):
    """MeetingCoordinator 支持注入外部共享引擎"""
    from workflow_engine import WorkflowEngine
    shared = WorkflowEngine()
    coordinator = meeting_coordinator
    # 模拟注入：直接以构造参数重建会破坏 fixture 状态，改走属性注入路径验证
    from meeting_coordinator import MeetingCoordinator
    injected = MeetingCoordinator(
        meeting_session=coordinator.meeting,
        provider=coordinator.provider,
        model_name=coordinator.model_name,
        api_key=coordinator.api_key,
        base_url=coordinator.base_url or "",
        workflow_engine=shared,
    )
    assert injected.workflow_engine is shared
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_workflow_integration.py::test_meeting_coordinator_accepts_injected_engine -v`
Expected: FAIL — `TypeError: __init__() got an unexpected keyword argument 'workflow_engine'`

- [ ] **Step 3: 实现**

3a. `backend/meeting_coordinator.py:54-65` 构造签名加参数：

```python
    def __init__(
        self,
        meeting_session: MeetingSession,
        provider: str,
        model_name: str,
        api_key: str,
        base_url: str = "",
        data_dir: str = "data",
        workspace=None,
        agent_pool: Optional[AgentPool] = None,
        max_iterations: int = 3,
        workflow_engine: Optional[WorkflowEngine] = None,
    ):
```

3b. `backend/meeting_coordinator.py:105-107` 替换：

```python
        # WorkflowEngine 初始化（可由外部注入共享实例，保证 REST 可管理会议工作流）
        self.workflow_engine = workflow_engine or WorkflowEngine()
        self._setup_workflow_engine()
```

3c. `backend/server.py:1262-1272` MeetingCoordinator 构造增加 `workflow_engine=workflow_engine`（server.py:2191 的全局实例）。

3d. `backend/meeting_coordinator.py` `_execute_workflow`（:1385-1392 区域）执行段替换：

```python
            # 启动工作流执行（注册任务，支持暂停/取消真正生效）
            task = self.workflow_engine.start_workflow(execution.execution_id)
            try:
                await task
            except asyncio.CancelledError:
                cancelled_status = self.workflow_engine.get_workflow_status(execution.execution_id)
                cancelled_msg = f"工作流已取消: {cancelled_status.status.value}"
                await self._msg(ceo_id, cancelled_msg)
                self.meeting.add_message("agent", cancelled_msg, ceo_id)
                return {
                    "execution_id": execution.execution_id,
                    "status": "cancelled",
                    "results": cancelled_status.results,
                }
```

3e. `backend/server.py` REST execute 端点（:2228-2238）改为：

```python
            execution_id = path_params["execution_id"]
            task = workflow_engine.start_workflow(execution_id)
            await task
            execution = workflow_engine.get_workflow_status(execution_id)
            return await wf_execution_response(execution)  # 沿用现有返回构造
```

> 注：端点原实现直接 `await workflow_engine.execute_workflow(execution_id)`；改为 `start_workflow` 后 pause/cancel 可中断该请求级执行。若端点现有响应构造逻辑不同，保持原响应结构不变，仅替换执行启动方式。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_workflow_integration.py tests/test_workflow_engine.py -v`
Expected: PASS（新增用例 + 既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/server.py backend/tests/test_workflow_integration.py
git commit -m "refactor(workflow): inject shared WorkflowEngine into MeetingCoordinator"
```

---

### Task 3: 工作流节点真执行（LLM + 工具 + 写文件）

**Covers:** S2.4（支柱 3 并行执行；局限 L2）
<!-- _execute_workflow_node 从"只产文本"改为"工具执行 + 产物落盘"，核心循环提取为可测方法 -->

**Files:**
- Modify: `backend/meeting_coordinator.py:156-202`（`_execute_workflow_node` 重写 + 新增辅助方法）
- Test: `backend/tests/test_workflow_integration.py`

**Interfaces:**
- Consumes: `AgentToolset`（`backend/agent_toolset.py`，构造参数 `agent_id/agent_role/workspace_root`）、`extract_code_blocks`（`backend/code_extractor.py:9`，格式 ` ```filename.ext\ncontent\n``` `）、`self._workspace.root_path`
- Produces: `_run_agent_execution_loop(model, prompt, agent_toolset, max_tool_rounds=5) -> Dict[str, Any]`（`result/files_written/tool_outputs`）、`_extract_tool_calls_from_text(text) -> List[Dict]`（静态）；`_execute_workflow_node` 返回值增加 `files_written` 与 `tool_outputs`

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_workflow_integration.py` 末尾）

```python
async def test_run_agent_execution_loop_writes_code_block(meeting_coordinator, tmp_path):
    """执行循环把 LLM 输出的代码块写入工作区文件"""
    from agent_toolset import create_agent_toolset
    toolset = create_agent_toolset(
        agent_id="node-1", agent_role="executor", workspace_root=str(tmp_path)
    )

    class FakeModel:
        async def reply(self, conversation):
            return Msg(name="assistant", role="assistant",
                       content=[{"type": "text", "text": "```out.txt\nhello workflow\n```\n完成。"}])

    result = await meeting_coordinator._run_agent_execution_loop(
        FakeModel(), "请执行任务", toolset
    )
    assert "out.txt" in result["files_written"]
    assert (tmp_path / "out.txt").read_text() == "hello workflow"


def test_extract_tool_calls_from_text():
    """从 LLM 文本提取工具调用 JSON"""
    text = '先做 A，然后 {"tool": "write_file", "arguments": {"path": "a.txt", "content": "1"}} 再收尾。'
    calls = meeting_coordinator._extract_tool_calls_from_text(text)
    assert len(calls) == 1
    assert calls[0]["tool"] == "write_file"


async def test_run_agent_execution_loop_no_tool_no_blocks(meeting_coordinator):
    """无工具无代码块时返回纯文本结果（不崩溃）"""
    class FakeModel:
        async def reply(self, conversation):
            return Msg(name="assistant", role="assistant",
                       content=[{"type": "text", "text": "方案完成。"}])

    result = await meeting_coordinator._run_agent_execution_loop(FakeModel(), "请执行", None)
    assert result["result"] == "方案完成。"
    assert result["files_written"] == []
```

> 注意：`Msg` 已在 `test_workflow_integration.py` 头部 import（fixture 依赖）；若未 import，Step 3 补 `from agentscope.message import Msg`。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_workflow_integration.py -k "run_agent_execution_loop or extract_tool_calls" -v`
Expected: FAIL — `AttributeError: 'MeetingCoordinator' object has no attribute '_run_agent_execution_loop'`

- [ ] **Step 3: 实现**

3a. `backend/meeting_coordinator.py` 新增两个方法（放在 `_execute_workflow_node` 之前）：

```python
    async def _run_agent_execution_loop(
        self,
        model,
        prompt: str,
        agent_toolset,
        max_tool_rounds: int = 5,
    ) -> Dict[str, Any]:
        """LLM + 工具执行循环：代码块写文件、工具调用、产物收集"""
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        conversation = [msg]
        files_written: List[str] = []
        tool_outputs: List[Dict[str, Any]] = []
        last_text = ""

        if agent_toolset:
            agent_toolset.list_directory(".")

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

            if not code_blocks and agent_toolset:
                tool_calls = self._extract_tool_calls_from_text(last_text)
                for call in tool_calls:
                    tc = agent_toolset.execute(call["tool"], call.get("arguments", {}))
                    tool_outputs.append({"tool": call["tool"], "success": tc.success, "output": tc.output})

            conversation.append(
                Msg(name="assistant", role="assistant", content=[{"type": "text", "text": last_text}])
            )
            if files_written or tool_outputs:
                break
            if "完成" in last_text or "done" in last_text.lower():
                break

        return {"result": last_text, "files_written": files_written, "tool_outputs": tool_outputs}

    @staticmethod
    def _extract_tool_calls_from_text(text: str) -> List[Dict[str, Any]]:
        """从 LLM 文本提取工具调用 JSON（{"tool": "...", "arguments": {...}}）"""
        import re as _re

        calls: List[Dict[str, Any]] = []
        pattern = _re.compile(r'\{[^{}]*"tool"\s*:\s*"[^"]+"[^{}]*\}')
        for match in pattern.findall(text):
            try:
                parsed = json.loads(match)
                if isinstance(parsed, dict) and parsed.get("tool"):
                    calls.append(parsed)
            except Exception:
                continue
        return calls
```

3b. `backend/meeting_coordinator.py:156-202` `_execute_workflow_node` 重写：

```python
    async def _execute_workflow_node(self, node: WorkflowNode, input_data: dict) -> dict:
        """执行工作流节点：LLM + 工具调用 + 产物写入工作区"""
        self.logger.info("执行工作流节点: %s (部门: %s)", node.node_id, node.dept_id)

        role_map = {
            "dept-frontend": AgentRole.EXECUTOR,
            "dept-backend": AgentRole.EXECUTOR,
            "dept-qa": AgentRole.REVIEWER,
            "dept-devops": AgentRole.MONITOR,
            "dept-data": AgentRole.EXECUTOR,
            "dept-docs": AgentRole.COORDINATOR,
            "dept-fullstack": AgentRole.EXECUTOR,
        }
        role = role_map.get(node.dept_id, AgentRole.EXECUTOR)
        model = self._get_model(role)

        agent_toolset = None
        if self._workspace:
            from agent_toolset import create_agent_toolset

            agent_toolset = create_agent_toolset(
                agent_id=node.node_id,
                agent_role=role.value,
                workspace_root=self._workspace.root_path,
            )

        tool_prompt = f"\n\n{agent_toolset.get_system_prompt()}" if agent_toolset else ""
        prompt = (
            f"请执行以下任务：\n"
            f"任务描述：{node.task_description}\n"
            f"输入数据：{json.dumps(input_data, ensure_ascii=False)}\n"
            f"{tool_prompt}\n\n"
            f"需要产出文件时，用代码块输出：```文件名\n内容\n```；需要调用工具时输出 JSON："
            f'{{"tool": "工具名", "arguments": {{...}}}}。'
        )

        try:
            loop_result = await self._run_agent_execution_loop(model, prompt, agent_toolset)
        except Exception as e:
            self.logger.warning("工作流节点执行失败: %s", e)
            loop_result = {
                "result": LLM_FALLBACK_TEMPLATE.format(role=node.dept_id, content_type="执行结果"),
                "files_written": [],
                "tool_outputs": [],
            }

        return {
            "result": loop_result["result"],
            "node_id": node.node_id,
            "dept_id": node.dept_id,
            "files_written": loop_result["files_written"],
            "tool_outputs": loop_result["tool_outputs"],
        }
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_workflow_integration.py -k "run_agent_execution_loop or extract_tool_calls or workflow" -v`
Expected: PASS（新增用例 + `test_workflow_engine_integration` 既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/tests/test_workflow_integration.py
git commit -m "feat(workflow): workflow nodes execute tools and write workspace files"
```

---

### Task 4: CriticAgent LLM 审查通道（规则兜底 + LLM 补充）

**Covers:** S2.4（支柱 4 审查智能体；局限 L7）
<!-- CriticAgent 新增异步 LLM 审查：规则检查保留为兜底，LLM 失败自动降级 -->

**Files:**
- Modify: `backend/collaboration/critic_agent.py`
- Modify: `backend/review_pipeline.py:57-60`（critic 调用段）
- Test: `backend/tests/test_review_pipeline.py`

**Interfaces:**
- Consumes: `self._get_model(role)`（review_pipeline 构造参数）、`AgentRole`（`backend/protocol.py`）、`_extract_text`（`backend/agent.py`）
- Produces: `CriticAgent.review_with_llm(task_context, get_model_fn, stage="review") -> CriticResult`（async）；`CriticResult.details` 增加 `llm_findings`/`rule_findings`

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_review_pipeline.py` 末尾）

```python
class _FindingMsg:
    def __init__(self, text):
        self._text = text

    @property
    def content(self):
        return [{"type": "text", "text": self._text}]

async def test_review_with_llm_merges_findings(pipeline):
    """LLM 审查 findings 与规则 findings 合并"""
    async def llm_reply(conversation):
        return _FindingMsg('[{"finding": "缺少回滚方案", "severity": "high"}]')

    pipeline._get_model = lambda role: type("M", (), {"reply": llm_reply})()
    result = await pipeline._critic.review_with_llm(
        {"task_description": "重构登录模块", "requirements": []},
        get_model_fn=pipeline._get_model,
        stage="review",
    )
    assert "缺少回滚方案" in result.findings
    assert result.details["llm_findings"][0]["severity"] == "high"

async def test_review_with_llm_fallback_on_llm_error(pipeline):
    """LLM 失败时回退到纯规则结果，不崩溃"""
    async def failing_reply(conversation):
        raise RuntimeError("llm down")

    pipeline._get_model = lambda role: type("M", (), {"reply": failing_reply})()
    result = await pipeline._critic.review_with_llm(
        {"task_description": "重构登录模块", "requirements": []},
        get_model_fn=pipeline._get_model,
        stage="review",
    )
    assert isinstance(result.findings, list)
    assert result.details is None or "llm_findings" not in result.details
```

> 注：现有 fixture `pipeline` 构造 `ReviewPipeline(get_model_fn, meeting, planner=...)`；上述测试直接覆盖 `pipeline._get_model`。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_review_pipeline.py -k "review_with_llm" -v`
Expected: FAIL — `AttributeError: 'CriticAgent' object has no attribute 'review_with_llm'`

- [ ] **Step 3: 实现**

3a. `backend/collaboration/critic_agent.py` 顶部 import 增加：

```python
import logging
from agentscope.message import Msg
from protocol import AgentRole
```

3b. `backend/collaboration/critic_agent.py` 类内新增方法（放在 `review` 之后）：

```python
    async def review_with_llm(
        self,
        task_context: Dict[str, Any],
        get_model_fn,
        stage: str = "review",
    ) -> CriticResult:
        """规则审查 + LLM 补充审查（LLM 失败时回退纯规则）"""
        logger = logging.getLogger("critic_agent")
        rule_result = self.review(task_context, stage=stage)

        try:
            model = get_model_fn(AgentRole.REVIEWER)
        except Exception as e:
            logger.warning("Critic 获取模型失败: %s", e)
            return rule_result

        prompt = (
            "你是审查智能体（Critic）。请审查以下任务上下文，找出漏洞、被忽略的需求域、"
            "矛盾约束与风险。\n"
            f"任务上下文：{json.dumps(task_context, ensure_ascii=False)}\n\n"
            '请以 JSON 数组返回发现，每项为 {"finding": "...", "severity": "low|medium|high|critical"}。'
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

        try:
            response = await model.reply(msg)
            from agent import _extract_text
            text = _extract_text(response)
            llm_findings = self._parse_llm_findings(text)
        except Exception as e:
            logger.warning("Critic LLM 审查失败: %s", e)
            return rule_result

        merged = CriticResult(
            findings=rule_result.findings + [f["finding"] for f in llm_findings],
            severity=self._merge_severity(rule_result.severity, llm_findings),
            timestamp=datetime.now().isoformat(),
            stage=stage,
            details={
                "llm_findings": llm_findings,
                "rule_findings": rule_result.findings,
            },
        )
        return merged

    @staticmethod
    def _parse_llm_findings(text: str) -> List[Dict[str, str]]:
        """解析 LLM 返回的 JSON 数组，容错提取"""
        import re as _re

        findings: List[Dict[str, str]] = []
        match = _re.search(r'\[.*\]', text, _re.DOTALL)
        if not match:
            return findings
        try:
            parsed = json.loads(match.group(0))
        except Exception:
            return findings
        if not isinstance(parsed, list):
            return findings
        for item in parsed:
            if isinstance(item, dict) and item.get("finding"):
                findings.append({
                    "finding": str(item["finding"]),
                    "severity": str(item.get("severity", "medium")),
                })
        return findings

    @staticmethod
    def _merge_severity(rule_severity: str, llm_findings: List[Dict[str, str]]) -> str:
        """合并严重程度：取最严重值"""
        order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        current = order.get(rule_severity, 0)
        for f in llm_findings:
            sev = f.get("severity", "medium")
            if order.get(sev, 0) > current:
                current = order[sev]
        return next(k for k, v in order.items() if v == current)
```

3c. `backend/review_pipeline.py` critic 调用段（:57-60 区域）替换：

```python
        # 1. CriticAgent 自动审查（规则兜底 + LLM 补充；失败时跳过，不阻断审查流程）
        try:
            critic_result = await self._critic.review_with_llm(
                {
                    "task_description": task_description,
                    "requirements": [],
                    "success_criteria": [],
                },
                get_model_fn=self._get_model,
                stage="review",
            )
            logger.info("Critic审查: severity=%s, findings=%d", critic_result.severity, len(critic_result.findings))
        except Exception as e:
            logger.warning("CriticAgent失败，跳过: %s", e, exc_info=True)
            critic_result = CriticResult(severity="unknown", findings=[])
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_review_pipeline.py tests/test_critic_agent.py tests/test_review_integration.py -v`
Expected: PASS（新增用例 + 既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/collaboration/critic_agent.py backend/review_pipeline.py backend/tests/test_review_pipeline.py
git commit -m "feat(review): add LLM review channel to CriticAgent with rule fallback"
```

---

### Task 5: 审批真阻塞等待（ApprovalManager 接入会议流程）

**Covers:** S2.4（横向审批诚实化；局限 L7）
<!-- 审批阶段从"自动通过"改为 request_approval + wait_for_decision 真等待，超时默认通过 -->

**Files:**
- Modify: `backend/meeting_coordinator.py`（构造签名 + 审批阶段）
- Modify: `backend/server.py:1262-1272`（传入 `approval_manager`）
- Test: 新建 `backend/tests/test_approval_wait.py`

**Interfaces:**
- Consumes: `ApprovalManager.request_approval(requester_id, operation, description, risk_level, confidence, send_fn, timeout) -> PendingApproval`、`wait_for_decision(request_id, timeout) -> dict`（`backend/approval_manager.py`）、`RiskLevel`（`backend/protocol.py`）
- Produces: `MeetingCoordinator(..., approval_manager: Optional[ApprovalManager] = None, approval_timeout: float = 300.0)`；审批阶段 `approved` 分支后继续原执行流程

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_approval_wait.py`）

```python
"""审批真阻塞等待：ApprovalManager 等待人工决策，超时抛 TimeoutError"""

import asyncio

import pytest

from approval_manager import ApprovalManager
from protocol import RiskLevel


async def test_approval_manager_wait_and_respond():
    """request_approval 后 wait_for_decision 阻塞，handle_response 解除"""
    manager = ApprovalManager()

    async def send_fn(payload):
        return None

    approval = await manager.request_approval(
        requester_id="agent-executor",
        operation="task_execution",
        description="执行高风险任务",
        risk_level=RiskLevel.HIGH,
        confidence=0.8,
        send_fn=send_fn,
    )

    async def respond():
        await asyncio.sleep(0.05)
        await manager.handle_response(approval.id, True, "同意", send_fn)

    task = asyncio.create_task(respond())
    decision = await manager.wait_for_decision(approval.id, timeout=5.0)
    await task

    assert decision["approved"] is True
    assert decision["request_id"] == approval.id


async def test_approval_manager_timeout_raises():
    """超时后 wait_for_decision 抛 TimeoutError（由调用方按配置默认通过）"""
    manager = ApprovalManager()

    async def send_fn(payload):
        return None

    approval = await manager.request_approval(
        requester_id="agent-executor",
        operation="task_execution",
        description="测试",
        risk_level=RiskLevel.MEDIUM,
        confidence=0.5,
        send_fn=send_fn,
    )

    with pytest.raises(asyncio.TimeoutError):
        await manager.wait_for_decision(approval.id, timeout=0.05)
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && python -m pytest tests/test_approval_wait.py -v`
Expected: 若 `ApprovalManager` 机制已可用则两用例直接 PASS（此时本任务核心为会议流程接线，以 3c 集成验收为准）；若存在签名不符则按实际错误修正测试。任务验收标准：`handle_response` 解除等待 + 超时抛 TimeoutError 两项行为必须为真。

- [ ] **Step 3: 实现**

3a. `backend/meeting_coordinator.py` 顶部 import 增加（若已存在则跳过）：

```python
from approval_manager import ApprovalManager
```

3a'. `backend/meeting_coordinator.py` 构造签名加参数（Task 2 已加 `workflow_engine`，此处仅追加两项）：

```python
        max_iterations: int = 3,
        workflow_engine: Optional[WorkflowEngine] = None,
        approval_manager: Optional[ApprovalManager] = None,
        approval_timeout: float = 300.0,
    ):
```

3b. `backend/meeting_coordinator.py` `__init__` 体（`self._max_iterations = max_iterations` 之后）加：

```python
        self._approval_manager = approval_manager
        self._approval_timeout = approval_timeout
```

3c. `backend/meeting_coordinator.py` 审批阶段（风险等级判定后的 `approval_request` dict 构造 + `coordinator_auto_approve`，约 :848-866）替换为：

```python
        # 创建审批请求并真阻塞等待（超时按配置默认通过，防单用户场景阻塞）
        if self._approval_manager:
            from protocol import RiskLevel

            risk_map = {
                "low": RiskLevel.LOW,
                "medium": RiskLevel.MEDIUM,
                "high": RiskLevel.HIGH,
                "critical": RiskLevel.CRITICAL,
            }
            approval = await self._approval_manager.request_approval(
                requester_id=target_agent_id,
                operation="task_execution",
                description=enhanced_description[:200],
                risk_level=risk_map.get(risk_level, RiskLevel.MEDIUM),
                confidence=0.8,
                send_fn=lambda payload: on_message(
                    "coordinator",
                    f"[审批请求] {payload.get('request', {}).get('description', '')}",
                    "",
                ),
            )
            try:
                decision = await self._approval_manager.wait_for_decision(
                    approval.id, timeout=self._approval_timeout
                )
                approved = bool(decision.get("approved", True))
                reason = decision.get("reason", "")
            except asyncio.TimeoutError:
                approved = True
                reason = "审批超时，默认通过"
        else:
            approved = True
            reason = "未配置审批管理器，自动通过"

        approve_msg = (
            f"项目经理：任务执行审批通过（{reason}）。" if reason and approved else
            f"项目经理：任务执行审批被拒绝（{reason}）。" if reason else
            "项目经理：任务执行审批通过。"
        )
        await self._msg(coordinator_id, approve_msg)
        self.meeting.add_message("agent", approve_msg, coordinator_id)
```

> 注：原 `approval_request` dict（:848-861）仅用于推送展示，已被 `request_approval` 的 `send_fn` 推送替代；删除原 dict 构造与 `on_message("[审批请求]...")` 直推行（保留风险等级展示消息 `coordinator_approve_text`）。

3d. `backend/server.py` MeetingCoordinator 构造（:1262-1272）增加参数（构造前确保会话审批管理器存在）：

```python
                if not session._approval_manager:
                    session._approval_manager = ApprovalManager()

                coordinator = MeetingCoordinator(
                    meeting_session=meeting,
                    provider=session.provider,
                    model_name=session.model_name or "",
                    api_key=session.api_key,
                    base_url=session.base_url or "",
                    workspace=workspace,
                    agent_pool=agent_pool,
                    max_iterations=msg.get("max_iterations", 3),
                    workflow_engine=workflow_engine,
                    approval_manager=session._approval_manager,
                )
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && python -m pytest tests/test_approval_wait.py -v && python -m pytest tests/test_meeting_coordinator_router.py -q`
Expected: PASS（审批等待用例 + 协调器路由既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/server.py backend/tests/test_approval_wait.py
git commit -m "feat(approval): blocking human approval wait with timeout default-approve"
```

---

### Task 6: 死代码清理（parallel 模块）

**Covers:** S2.4（横向债务治理；局限 L8）
<!-- 删除互为唯一引用方的两个 parallel 模块；保留测存活代码的两个测试文件；mock-sso 不动 -->

**Files:**
- Delete: `backend/parallel_discussion_manager.py`、`backend/parallel_meeting_coordinator.py`
- Test: 全仓 grep 验证 + 后端全量回归

**Interfaces:**
- Consumes: 无（删除对象）；保留 `backend/tests/test_e2e_parallel.py`、`test_parallel_modules.py`（覆盖 KeyManager/MessageQueue/AgentPool 存活代码）

- [ ] **Step 1: 确认引用范围**

Run: `cd backend && grep -rn "parallel_discussion_manager\|parallel_meeting_coordinator" --include="*.py" .`
Expected: 仅命中两文件自身及其互 import（`parallel_meeting_coordinator.py:13` import parallel_discussion_manager）；无其他生产 import

- [ ] **Step 2: 执行删除**

```bash
git rm backend/parallel_discussion_manager.py backend/parallel_meeting_coordinator.py
```

- [ ] **Step 3: 验证无残留引用**

Run: `cd backend && grep -rn "parallel_discussion_manager\|parallel_meeting_coordinator\|ParallelDiscussionManager\|ParallelMeetingCoordinator" --include="*.py" .`
Expected: 无输出（mock-sso 目录不在 backend 下，不受影响）

- [ ] **Step 4: 全量回归**

Run: `cd backend && python -m pytest tests/ -q --timeout=10`
Expected: PASS（或仅有可标注的 PRE-EXISTING 失败）

- [ ] **Step 5: 提交**

```bash
git add -u backend/
git commit -m "chore: remove dead parallel discussion/meeting coordinator modules"
```

---

## 自检备注（Self-Review）

- **Spec coverage**：T1/T2/T3 → 支柱 3 并行执行（L2）；T4 → 支柱 4 审查（L7）；T5 → 横向审批（L7）；T6 → 横向债务治理（L8）。全部对应分析文档 S2.4 产品发展方向 P0 项。
- **已知限制（记录而非回避）**：共享引擎注入后，多会议并发时节点执行器归属最近注册的协调器（单用户本地形态可接受）；审批超时默认通过为有意的防阻塞策略。
- **明确不做的**：mock-sso/ 镜像（untracked 待定）、`test_e2e_parallel.py`/`test_parallel_modules.py`（覆盖存活代码）、投票策略激活（非 P0）、DAG 去硬编码与 artifact 化（P1）。
