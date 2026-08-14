# [M2b-1] 人+agent 混合团队平台 · 后端收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 M2 里程碑的**后端收尾**（设计文档 `docs/compose/specs/2026-08-14-hybrid-team-platform-design.md` 的 M2b 后端部分 + 评审登记项 T9/T10/T11/T7）：DAG 级把关强制力（把关拒绝中止下游）、演示端点输入加固、`_detect_minutes_task` 死代码清理与关键词复用、把关 approver 透传、human 显示名、SMTP 邮件 provider。

**Architecture:** 全部为既有模块的增量。把关强制力 = `workflow_engine._execute_node` 在 executor 返回后检查结果 `gate.status == "rejected"` → 节点置 FAILED（**复用引擎既有 FAILED→下游 SKIPPED 的中止机制与 retry_node 重试**，零新状态）；输入加固 = server.py 演示端点 `try/except → _fail`；死代码清理 = `_detect_minutes_task` 简化为 `has_verb and has_minutes`（当前 `has_co_trigger` 是死逻辑）+ 关键词元组迁至 `minutes_workflow` 复用；approver 透传 = `request_gate`/`PendingApproval`/payload 加可选 `approver` 字段；human 显示名 = `TeamMember.display_name` + 组装/端点透传；SMTP = `mailer` seam 加 `SmtpMailer`（transport 注入可测，smtplib 标准库）。

**Tech Stack:** Python 3.11 · FastAPI · pytest 9.1.1 + pytest-asyncio（`asyncio_mode = "auto"`）· 纯标准库（零新依赖）

## Global Constraints

- **测试环境**：backend 测试一律用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（工作目录 `backend/`；base conda 无 pytest）。
- **零新依赖**：本计划不得向 `requirements.txt` 添加任何包；SMTP 用标准库 `smtplib`。
- **导入惯例**：测试内 `from workflow_engine import ...` / `from protocol import ...`（conftest 已把 `backend/` 加入 sys.path）。
- **代码风格**：snake_case；dataclass 新字段带默认值追加在末尾；注释仅非常规处加一行中文。
- **不要动**：`workflow_engine.py` 的状态枚举与三策略调度（:281-431）本身——只加 `_execute_node` 内的 gate 检查；`approval_manager.py` 既有方法签名（只加带默认值的新参数）；会议串行审批调用点（:1300-1339）。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；既有 churn（package-lock.json、skill_packs/*/system_prompt.md、companion_log.json 等）绝不提交。
- **已知基线**：`tests/test_skill_packs_structure.py` 为 PRE-EXISTING（干净 worktree 必失败，勿处理）；`tests/test_performance.py` 为环境性 flaky。

---

### Task 1: DAG 级把关强制力（T9）

**Covers:** S2-4（员工把关的强制力）、S5-M2

**Files:**
- Modify: `backend/workflow_engine.py`（`_execute_node` :461-523 内 gate 检查）
- Test: `backend/tests/test_workflow_gate_enforcement.py`（新建）

**Interfaces:**
- Consumes: 节点结果 dict 约定 `{"gate": {"status": "rejected", "reason": ...}}`（M2a-T4 `_run_node_gate` 产出）。
- Produces: executor 返回结果含 `gate.status == "rejected"` 时，`_execute_node` 置节点 FAILED（结果原样入 `results`）；否则维持 COMPLETED。**依赖既有机制**：FAILED 上游 → 下游 SKIPPED（sequential `_check_dependencies` / parallel `_propagate_skip`）；`retry_node` 可对 gate-rejected 节点重试。

- [ ] **Step 1: 写失败测试**（`backend/tests/test_workflow_gate_enforcement.py`，先读 `tests/test_workflow_engine.py` 了解 WorkflowEngine 构造与 executor 注册的既有模式，仿照之）

```python
"""把关强制力：gate 拒绝的节点置 FAILED，下游中止，execution FAILED；可重试"""
import pytest
from protocol import WorkflowDefinition, WorkflowEdge, WorkflowNode, WorkflowNodeStatus
from workflow_engine import WorkflowEngine


def _chain_definition():
    return WorkflowDefinition(
        workflow_id="wf-gate",
        name="gate",
        description="gate 链路",
        nodes=[
            WorkflowNode(node_id="draft", task_description="撰写", dept_id="dept-docs",
                         gate={"approver": "emp-1", "stage": "review"}),
            WorkflowNode(node_id="proofread", task_description="校对", dept_id="dept-docs"),
        ],
        edges=[WorkflowEdge(source_node_id="draft", target_node_id="proofread")],
        execution_strategy="sequential",
    )


async def test_gate_rejection_fails_node_and_skips_downstream():
    engine = WorkflowEngine()

    async def rejected_executor(node, input_data):
        return {"gate": {"status": "rejected", "reason": "需修改"}}

    async def proofread_executor(node, input_data):
        return {"result": "校对结果"}

    engine.register_node_executor("dept-docs", rejected_executor)  # 若按 dept 注册
    execution = engine.create_workflow(_chain_definition())
    await engine.execute_workflow(execution.execution_id)
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.FAILED
    assert status.node_states["proofread"] == WorkflowNodeStatus.SKIPPED
    assert status.execution_status.value == "FAILED"
    assert status.results["draft"]["gate"]["status"] == "rejected"
```

（若 register_node_executor 是 per-dept 单注册、上述两 executor 需不同 dept，则以既有测试模式为准调整——例如用两个 dept 或直接测 `_execute_node`。**断言语义必须保留**：拒绝→FAILED、下游不执行（SKIPPED）、execution FAILED、结果含 gate 拒绝详情。再补：`test_gate_approved_stays_completed`——executor 返回 `{"gate": {"status": "approved"}}` → 节点 COMPLETED 下游执行；`test_gate_rejected_node_retryable`——rejected 后改 executor 返回成功，`retry_node` 重跑 → 节点 COMPLETED。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_workflow_gate_enforcement.py -v`
Expected: FAIL——`draft` 节点为 COMPLETED 而非 FAILED（当前引擎不消费 gate）。

- [ ] **Step 3: 实现**

读 `backend/workflow_engine.py` 的 `_execute_node`（:461-523），在 `result = await executor(node, input_data)` 之后、写 `node_states[node_id]=COMPLETED` 之前插入：

```python
        gate_rejected = (
            isinstance(result, dict)
            and isinstance(result.get("gate"), dict)
            and result["gate"].get("status") == "rejected"
        )
        if gate_rejected:
            results[node_id] = result
            node_states[node_id] = WorkflowNodeStatus.FAILED
            node.status = WorkflowNodeStatus.FAILED
            node.result = result
            logger.info("节点 %s 把关拒绝，置 FAILED: %s", node_id, result["gate"].get("reason", ""))
        else:
            results[node_id] = result
            node_states[node_id] = WorkflowNodeStatus.COMPLETED
            node.status = WorkflowNodeStatus.COMPLETED
            node.result = result
```

（保持 `results`/`node_states`/`node.result` 三处同步的既有风格；拒绝路径不抛异常——让引擎按 FAILED 节点正常收尾：下游 SKIPPED、execution FAILED、可 retry。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_workflow_gate_enforcement.py tests/test_workflow_engine.py tests/test_workflow_integration.py -q`
Expected: 新用例 + 既有 workflow 回归全绿（COMPLETED 路径行为不变）。

- [ ] **Step 5: 提交**

```bash
git add backend/workflow_engine.py backend/tests/test_workflow_gate_enforcement.py
git commit -m "feat(hybrid): gate rejection fails node and aborts downstream in workflow engine"
```

---

### Task 2: 演示端点输入加固（T10）

**Covers:** S5-M1/M2（演示端点健壮性）

**Files:**
- Modify: `backend/server.py`（`/api/minutes` 与 `/api/hybrid/team`）
- Test: `backend/tests/test_minutes_endpoint.py`、`backend/tests/test_hybrid_endpoints.py`（各追加）

**Interfaces:**
- Produces: 两个演示端点对**非预期输入类型**（非字符串 transcript/submitter、非 dict dag）返回 `_fail(str(exc))` 而非未捕获 500；既有字段缺失错误路径不变。

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_minutes_endpoint.py` 与 `backend/tests/test_hybrid_endpoints.py`）

```python
# test_minutes_endpoint.py 追加
def test_minutes_endpoint_non_string_transcript_returns_error():
    resp = client.post("/api/minutes", json={"transcript": 123, "project_id": "p", "submitter": "emp-1"})
    assert resp.status_code != 500
    assert "error" in resp.json()

# test_hybrid_endpoints.py 追加
def test_hybrid_team_non_dict_dag_returns_error():
    resp = client.post("/api/hybrid/team", json={"project_id": "p", "dag": "not-a-dict", "humans": []})
    assert resp.status_code != 500
    assert "error" in resp.json()
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_endpoint.py tests/test_hybrid_endpoints.py -v`
Expected: 新 2 用例 FAIL——500（未捕获 AttributeError/TypeError）。

- [ ] **Step 3: 实现**

`backend/server.py`：`api_minutes_plan` 与 `api_hybrid_team` 的函数体包 `try/except Exception as exc: return _fail(str(exc))`（保持 `_fail` 既有约定与既有缺字段分支）。**只在函数体内包住业务逻辑**，import 保持顶部/函数内既有风格。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_endpoint.py tests/test_hybrid_endpoints.py tests/test_workflow_endpoints.py -q`
Expected: 新 2 用例 + 既有端点回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/server.py backend/tests/test_minutes_endpoint.py backend/tests/test_hybrid_endpoints.py
git commit -m "fix(hybrid): demo endpoints fail structured on non-string input"
```

---

### Task 3: 文档检测死代码清理 + 关键词复用 + gate approver 透传（T11 前两项）

**Covers:** S3-5（文档意图识别）、S3-1（把关引擎）

**Files:**
- Modify: `backend/minutes_workflow.py`（导出 `MINUTES_FAMILY`/`MINUTES_VERBS`）
- Modify: `backend/semantic_analyzer.py`（`_detect_minutes_task` 简化 + 复用）
- Modify: `backend/approval_manager.py`（`PendingApproval.approver` + `request_approval`/`request_gate` 可选 `approver` + payload + 审计）
- Modify: `backend/meeting_coordinator.py`（`_run_node_gate` 传 `approver=gate.get("approver")`）
- Test: `backend/tests/test_minutes_workflow.py`、`backend/tests/test_gate_engine.py`、`backend/tests/test_node_gate_hook.py`（追加）

**Interfaces:**
- Produces: `minutes_workflow.MINUTES_FAMILY: tuple`、`minutes_workflow.MINUTES_VERBS: tuple`；`_detect_minutes_task` 行为不变（`has_verb and has_minutes`，去除 `has_co_trigger` 死逻辑）但改用复用元组；`request_gate(..., approver: str = "")` 与 `request_approval(..., approver: str = "")` 可选参数（默认 "" 向后兼容），`PendingApproval.approver`、payload `request.approver`、gate/requested 审计含 approver；`_run_node_gate` 传 `approver=gate.get("approver", "")`。

- [ ] **Step 1: 写失败测试**

```python
# test_gate_engine.py 追加
async def test_request_gate_carries_approver():
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="a", operation="op", description="d", task_id="t1", gate_id="g1",
        approver="emp-1",
    )
    assert pending.approver == "emp-1"
    assert manager.get_gate_audit("g1")[0]["approver"] == "emp-1"


async def test_request_approval_payload_has_approver():
    captured = {}
    async def send_fn(payload):
        captured.update(payload)
    manager = ApprovalManager()
    await manager.request_approval(
        requester_id="a", operation="op", description="d", approver="emp-1", send_fn=send_fn,
    )
    assert captured["request"]["approver"] == "emp-1"

# test_node_gate_hook.py 追加
async def test_run_node_gate_passes_approver():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-7", "stage": "review"})
    gate_task = asyncio.create_task(c._run_node_gate(node))
    await asyncio.sleep(0.05)
    pending = c._approval_manager.get_pending_requests()
    assert pending[0]["approver"] == "emp-7"
    await c._approval_manager.handle_gate_response(pending[0]["id"], True)
    await gate_task
```

（`test_minutes_workflow.py` 追加：`MINUTES_FAMILY`/`MINUTES_VERBS` 存在且 `_detect_minutes_task` 行为不回归——可复用既有 `test_dev_request_not_misrouted_to_minutes` 断言。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_gate_engine.py tests/test_node_gate_hook.py tests/test_minutes_workflow.py -v`
Expected: 新用例 FAIL——`approver` 参数不存在 / audit 无 approver。

- [ ] **Step 3: 实现**

`backend/minutes_workflow.py` 追加导出（保留既有 `MINUTES_KEYWORDS`）：

```python
MINUTES_FAMILY = ("会议纪要", "会议记录", "速记", "纪要")
MINUTES_VERBS = ("整理", "生成", "撰写", "输出", "写")
```

`backend/semantic_analyzer.py`：import 改为 `from minutes_workflow import MINUTES_FAMILY, MINUTES_VERBS`（若 `MINUTES_KEYWORDS` 不再被本文件使用则移除其 import）；`_detect_minutes_task` 简化为：

```python
def _detect_minutes_task(self, user_message: str) -> bool:
    """文档任务检测：纪要家族关键词 + 产出动词双匹配（确定性规则，命中即短路）。"""
    return any(v in user_message for v in MINUTES_VERBS) and any(
        k in user_message for k in MINUTES_FAMILY
    )
```

（行为与现有效果一致——`has_co_trigger` 恒被 `has_minutes` 蕴含，属死逻辑去除。）

`backend/approval_manager.py`：`PendingApproval` 追加 `approver: str = ""`；`request_approval` 签名追加 `approver: str = ""`（传构造 + payload `"approver": approval.approver`）；`request_gate` 签名追加 `approver: str = ""`（透传 + audit 事件加 `"approver": approver`）；`handle_gate_response` 的 decided audit 也从 history 反查补 `"approver"`。

`backend/meeting_coordinator.py`：`_run_node_gate` 的 `request_gate(...)` 调用加 `approver=gate.get("approver", "")`。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_gate_engine.py tests/test_node_gate_hook.py tests/test_minutes_workflow.py tests/test_approval_wait.py -q`
Expected: 新用例 + 既有回归全绿（默认 "" 向后兼容）。

- [ ] **Step 5: 提交**

```bash
git add backend/minutes_workflow.py backend/semantic_analyzer.py backend/approval_manager.py backend/meeting_coordinator.py backend/tests/test_gate_engine.py backend/tests/test_node_gate_hook.py backend/tests/test_minutes_workflow.py
git commit -m "feat(hybrid): simplify minutes detection, reuse keywords, thread gate approver through approval"
```

---

### Task 4: human 显示名（T7）

**Covers:** S3-1（人成为第一等实体）、S3-4（混合团队组装）

**Files:**
- Modify: `backend/team.py`（`TeamMember.display_name`）
- Modify: `backend/team_assembler.py`（`assemble_hybrid_team` 传 name → display_name）
- Modify: `backend/server.py`（两个演示端点成员响应加 displayName）
- Test: `backend/tests/test_team_gate_model.py`、`backend/tests/test_hybrid_team_assembly.py`、`backend/tests/test_hybrid_endpoints.py`、`backend/tests/test_minutes_endpoint.py`（追加）

**Interfaces:**
- Produces: `TeamMember.display_name: str = ""`（默认空，agent 成员不设）；`assemble_hybrid_team` 的 human 成员 `display_name=h.get("name", "")`；演示端点成员响应含 `displayName`。

- [ ] **Step 1: 写失败测试**

```python
# test_hybrid_team_assembly.py 追加
def test_hybrid_team_human_display_name(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(
        DAG, "proj-1", runtime,
        humans=[{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    )
    human = next(m for m in team.members if m.member_type == "human")
    assert human.display_name == "张三"

# test_hybrid_endpoints.py 追加
def test_hybrid_team_endpoint_returns_display_name():
    resp = client.post("/api/hybrid/team", json={
        "project_id": "proj-demo",
        "dag": {"tasks": [{"task_id": "task-1", "name": "撰写纪要", "required_skills": ["frontend_dev"], "description": "d"}]},
        "humans": [{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    })
    human = next(m for m in resp.json()["members"] if m["memberType"] == "human")
    assert human["displayName"] == "张三"
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_team_assembly.py tests/test_hybrid_endpoints.py -v`
Expected: FAIL——`AttributeError: 'TeamMember' object has no attribute 'display_name'` / 响应无 displayName。

- [ ] **Step 3: 实现**

`backend/team.py` `TeamMember` 末尾追加 `display_name: str = ""`；`backend/team_assembler.py` `assemble_hybrid_team` 的 human 构造加 `display_name=h.get("name", "")`；`backend/server.py` 的 `/api/hybrid/team` 与 `/api/minutes` 成员响应 dict 加 `"displayName": m.display_name`（agent 成员为空串，可接受）。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_team_gate_model.py tests/test_hybrid_team_assembly.py tests/test_hybrid_endpoints.py tests/test_minutes_endpoint.py -q`
Expected: 新用例 + 既有回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/team.py backend/team_assembler.py backend/server.py backend/tests/test_team_gate_model.py backend/tests/test_hybrid_team_assembly.py backend/tests/test_hybrid_endpoints.py backend/tests/test_minutes_endpoint.py
git commit -m "feat(hybrid): human member display name through assembly and demo endpoints"
```

---

### Task 5: SMTP 邮件 provider（mailer seam 生产补全）

**Covers:** S3-3（邮件分发适配器）

**Files:**
- Modify: `backend/mailer/seam.py`（`get_mailer` 支持 smtp）
- Modify: `backend/mailer/provider.py`（`SmtpMailer`，transport 注入可测）
- Test: `backend/tests/test_mailer.py`（追加）

**Interfaces:**
- Consumes: `build_mime`（M2a-T5 交付）。
- Produces: `SmtpMailer(host, port=25, username="", password="", transport=None)`——`send(message)` 用 `build_mime` 得 bytes，`transport` 注入时直接调用（测试用），否则经 `smtplib.SMTP` 发送（username 非空则 login）；返回 `mail-<ts>-<hex8>`；`get_mailer("smtp", host=..., port=..., username=..., password=...) -> SmtpMailer`，未知 provider 仍抛 ValueError。

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_mailer.py`）

```python
"""SMTP provider：transport 注入可测，缺省走 smtplib"""
import email
from email import policy

from mailer.provider import SmtpMailer
from mailer.seam import MailMessage, get_mailer


def test_smtp_mailer_send_via_injected_transport():
    captured = {}

    def fake_transport(raw: bytes):
        captured["raw"] = raw

    mailer = SmtpMailer(host="smtp.example.com", port=587, username="u", password="p",
                        transport=fake_transport)
    msg_id = mailer.send(MailMessage(title="T", to=["x@y.com"], body="B"))
    assert msg_id.startswith("mail-")
    msg = email.message_from_bytes(captured["raw"], policy=policy.default)
    assert msg["Subject"] == "T"
    assert msg["To"] == "x@y.com"


def test_get_mailer_smtp_provider():
    mailer = get_mailer("smtp", host="localhost", port=25)
    assert isinstance(mailer, SmtpMailer)
    assert mailer._host == "localhost" and mailer._port == 25
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_mailer.py -v`
Expected: FAIL——`ImportError: cannot import name 'SmtpMailer'`。

- [ ] **Step 3: 实现**

`backend/mailer/provider.py` 追加：

```python
import smtplib


class SmtpMailer(Mailer):
    """SMTP provider：transport 注入可测（缺省 smtplib.SMTP 实发）。"""

    def __init__(self, host: str, port: int = 25, username: str = "", password: str = "",
                 transport=None):
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._transport = transport

    def send(self, message: MailMessage) -> str:
        raw = build_mime(message)
        if self._transport is not None:
            self._transport(raw)
        else:
            with smtplib.SMTP(self._host, self._port) as server:
                if self._username:
                    server.login(self._username, self._password)
                from_addr = self._username or (message.to[0] if message.to else "")
                server.sendmail(from_addr, message.to, raw)
        return f"mail-{int(time.time())}-{uuid.uuid4().hex[:8]}"
```

`backend/mailer/seam.py` 的 `get_mailer` 扩展（保持 file 分支不变）：

```python
def get_mailer(provider: str = "file", out_dir: str = "", host: str = "",
               port: int = 25, username: str = "", password: str = "") -> Mailer:
    """按 provider 名解析 Mailer；未知 provider fail-loud。"""
    if provider == "file":
        from mailer.provider import FileMailer
        return FileMailer(out_dir=out_dir)
    if provider == "smtp":
        from mailer.provider import SmtpMailer
        return SmtpMailer(host=host, port=port, username=username, password=password)
    raise ValueError(f"unknown mailer provider: {provider}")
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_mailer.py tests/test_minutes_endpoint.py -q`
Expected: 5 passed（3 既有 + 2 新增）+ endpoint 回归。

- [ ] **Step 5: 提交**

```bash
git add backend/mailer/seam.py backend/mailer/provider.py backend/tests/test_mailer.py
git commit -m "feat(hybrid): smtp mailer provider with injectable transport"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→S2-4/S5-M2（把关强制力）；T2→S5（演示端点健壮性）；T3→S3-5/S3-1（检测清理 + approver）；T4→S3-1/S3-4（显示名）；T5→S3-3（SMTP）。评审登记项 T9/T10/T11 全部落地；T7（显示名）落地。M2b 剩余：前端把关 UI（M2b-2 独立计划）、真实模型执行链路（试点，非纯代码）、IM 适配器（未定）。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及"读实际代码后按既有模式"的，均给出具体位置与目标行为。
- **类型一致性**：`WorkflowNode.gate` 结构、`request_gate(approver=...)`、`TeamMember.display_name`、`SmtpMailer(transport=...)`、`get_mailer("smtp", ...)` 跨任务签名一致；`_execute_node` gate 检查读的是 T4 `_run_node_gate` 已产出的结果结构。
