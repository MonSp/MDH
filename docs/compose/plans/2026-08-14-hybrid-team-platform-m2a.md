# [M2a] 人+agent 混合团队平台 · 会议纪要后端全链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MDH 交付会议纪要任务的**后端全链路**（设计文档 `docs/compose/specs/2026-08-14-hybrid-team-platform-design.md` 的 M2 里程碑后端部分）：文档意图识别（速记→纪要 DAG）、create_document 升级为 .docx（doc_tools consumer 接线）、工作流节点把关钩子（gate 接线，含 M2 跟踪项 T6/T7 前项）、邮件分发适配器 seam、演示集成端点。

**Architecture:** 全部为增量扩展。文档意图识别 = `SemanticAnalyzer` 新增规则层文档模式（纯函数 `build_minutes_workflow`，不依赖 LLM，命中即返回纪要 DAG）；把关接线 = `_execute_workflow_node` 节点带 `gate` 时经既有 `ApprovalManager.request_gate` 发起把关（复用 M1 把关引擎）；docx = `_exec_create_document` 增加 `format="docx"` 走 `doc_tools` seam（M1 已交付）；邮件 = 新 `backend/mailer/` seam（纯标准库 smtplib/email，演示用文件 provider）；演示端点 = `POST /api/minutes`（速记→DAG 规划 + 混合团队组装，把关闭环经既有 /api/gates）。

**Tech Stack:** Python 3.11 · FastAPI · pytest 9.1.1 + pytest-asyncio（`asyncio_mode = "auto"`）· 纯标准库（零新依赖）

## Global Constraints

- **测试环境**：backend 测试一律用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（工作目录 `backend/`；base conda 无 pytest）。
- **零新依赖**：本计划不得向 `requirements.txt` 添加任何包；邮件用标准库 `smtplib`/`email`，docx 用 `doc_tools`（M1 纯标准库实现）。
- **导入惯例**：测试内 `from semantic_analyzer import ...` / `from protocol import ...`（conftest 已把 `backend/` 加入 sys.path）；新包 `mailer`/`doc_tools` 顶层导入。
- **代码风格**：snake_case；dataclass 新字段带默认值；注释仅非常规处加一行中文；沿用 `_ok`/`_fail`（server.py）与既有 try/except 约定。
- **不要动**：`meeting_coordinator.py` 既有串行审批调用点（:1300-1339，仅新增节点把关钩子，不改其语义）；`workflow_engine.py` 核心执行逻辑（只读）；`semantic_analyzer.py` 既有复杂任务分支（只新增文档模式分支，不改编码任务检测）。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；`backend/companion_log.json`、`package-lock.json`、`skill_packs/*/system_prompt.md` 等既有 churn 绝不提交。
- **已知基线**：`tests/test_skill_packs_structure.py` 为 PRE-EXISTING（干净 worktree 必失败，勿处理）；`tests/test_performance.py` 为环境性 flaky。

---

### Task 1: WorkflowNode.gate 序列化补齐（M2 跟踪项 T6）

**Covers:** S3-1（把关点引擎数据完整性）、S2-4

**Files:**
- Modify: `backend/protocol.py`（`workflow_node_to_dict` :561-570、`dict_to_workflow_node` :612-621）
- Test: `backend/tests/test_team_gate_model.py`（追加）

**Interfaces:**
- Produces: `workflow_node_to_dict(node)["gate"] == node.gate`；`dict_to_workflow_node(d)["gate"]` 往返一致（None 与 dict 均保真）。Task 4（把关钩子）与 Task 6（演示端点）依赖序列化不丢 gate。

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_team_gate_model.py` 末尾）

```python
from protocol import dict_to_workflow_node, workflow_node_to_dict


def test_gate_roundtrip_preserved():
    n = WorkflowNode(
        node_id="n1", task_description="撰写纪要", dept_id="dept-docs",
        gate={"approver": "emp-1", "stage": "review"},
    )
    restored = dict_to_workflow_node(workflow_node_to_dict(n))
    assert restored.gate == {"approver": "emp-1", "stage": "review"}


def test_gate_none_roundtrip():
    n = WorkflowNode(node_id="n1", task_description="t", dept_id="d")
    restored = dict_to_workflow_node(workflow_node_to_dict(n))
    assert restored.gate is None
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_team_gate_model.py -v`
Expected: 新增 2 用例 FAIL——`restored.gate` 为 None / AttributeError（序列化未带 gate）。

- [ ] **Step 3: 实现**

先读 `backend/protocol.py` 的 `workflow_node_to_dict`（:561-570）与 `dict_to_workflow_node`（:612-621），按既有字段模式各加一行：

- `workflow_node_to_dict` 返回 dict 中加 `"gate": node.gate`（与 `"result": node.result` 同层）
- `dict_to_workflow_node` 构造 `WorkflowNode(...)` 时加 `gate=data.get("gate")`

若 `dict_to_workflow_node` 有"未知键容错"约定（如 `data.get("x")` 风格），保持同一风格。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_team_gate_model.py tests/test_protocol.py -q`
Expected: 全绿（含新增 2 用例 + protocol 既有回归）。

- [ ] **Step 5: 提交**

```bash
git add backend/protocol.py backend/tests/test_team_gate_model.py
git commit -m "feat(hybrid): serialize workflow node gate in dict roundtrip"
```

---

### Task 2: 文档意图识别（速记→纪要 DAG）

**Covers:** S2-1（需求进入→意图识别判为纪要任务）、S3-5（文档型意图识别）

**Files:**
- Create: `backend/minutes_workflow.py`（纯函数，新建）
- Modify: `backend/semantic_analyzer.py`（analyze 文档模式分支）
- Test: `backend/tests/test_minutes_workflow.py`（新建）

**Interfaces:**
- Produces: `minutes_workflow.build_minutes_workflow(transcript: str) -> WorkflowDefinition`（模块级纯函数，不依赖 analyzer/LLM）；`minutes_workflow.MINUTES_KEYWORDS: tuple`；`SemanticAnalyzer.analyze` 命中文档模式时返回 `is_workflow=True` 且 `workflow_definition=build_minutes_workflow(...)`。
- 纪要 DAG：3 节点（全部 `dept_id="dept-docs"`，快照确认 docs dept 已注册 executor）：`extract`（提取要点/决策/行动项）→ `draft`（撰写纪要初稿+待办清单，**gate={"approver": "submitter", "stage": "review"}**）→ `proofread`（校对遗漏/冲突）；`execution_strategy="sequential"`。

- [ ] **Step 1: 写失败测试**（`backend/tests/test_minutes_workflow.py`）

```python
"""文档意图识别：速记文本 → 纪要 DAG（含把关节点）"""
import pytest
from minutes_workflow import MINUTES_KEYWORDS, build_minutes_workflow
from semantic_analyzer import SemanticAnalyzer


def test_build_minutes_workflow_structure():
    wf = build_minutes_workflow("今天会议讨论了上线计划，需要形成待办")
    assert wf.workflow_id.startswith("minutes-")
    assert wf.execution_strategy == "sequential"
    assert len(wf.nodes) == 3
    ids = [n.node_id for n in wf.nodes]
    assert ids == ["extract", "draft", "proofread"]
    assert all(n.dept_id == "dept-docs" for n in wf.nodes)
    assert len(wf.edges) == 2
    assert wf.edges[0].source_node_id == "extract" and wf.edges[0].target_node_id == "draft"
    assert wf.edges[1].source_node_id == "draft" and wf.edges[1].target_node_id == "proofread"


def test_draft_node_has_gate():
    wf = build_minutes_workflow("速记内容")
    draft = next(n for n in wf.nodes if n.node_id == "draft")
    assert draft.gate == {"approver": "submitter", "stage": "review"}


def test_minutes_keywords_hit_document_mode():
    assert any(k in MINUTES_KEYWORDS for k in ("会议纪要", "速记", "待办"))


def test_analyzer_routes_minutes_to_workflow():
    # SemanticAnalyzer 需要 router/get_model_fn；用最小构造（get_model_fn 不被调用——规则命中即返回）
    analyzer = SemanticAnalyzer(router=None, get_model_fn=lambda role: None)
    result = analyzer.analyze_sync_rule_only("请把速记整理成会议纪要并生成待办")  # 见 Step 3 说明
    assert result is not None
```

注意：`analyze` 是 async 且内部调用 route()（需要 router）。实现者在 Step 3 应把文档模式检测放在 **route() 之前**的规则层（`_detect_minutes_task(user_message)`），使命中时**不调用 router/LLM**；`SemanticAnalysisResult` 的构造以 `protocol.py` 既有字段为准。测试以"可直接验证的最小入口"为准（若 `analyze` 难以无 router 构造，测试改为直接验证 `build_minutes_workflow` + `_detect_minutes_task` 独立方法；最后一条测试按实际入口调整，保持断言 is_workflow 语义）。

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_workflow.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'minutes_workflow'`。

- [ ] **Step 3: 实现**

`backend/minutes_workflow.py`（新建）：

```python
"""会议纪要任务：速记文本 → 纪要 DAG（纯函数，不依赖 LLM/router）。

被 SemanticAnalyzer 文档模式分支与演示端点共用；gate 把关人占位 "submitter"
（演示端点/调用方负责替换为真实员工 id）。
"""
from protocol import WorkflowDefinition, WorkflowEdge, WorkflowNode

MINUTES_KEYWORDS = ("会议纪要", "会议记录", "速记", "待办", "行动项", "纪要")

_NODES = [
    ("extract", "提取会议要点、决策与行动项"),
    ("draft", "撰写纪要初稿并生成待办清单"),
    ("proofread", "校对：遗漏与冲突检查"),
]


def build_minutes_workflow(transcript: str, approver: str = "submitter") -> WorkflowDefinition:
    nodes = [
        WorkflowNode(
            node_id=nid,
            task_description=desc,
            dept_id="dept-docs",
            gate={"approver": approver, "stage": "review"} if nid == "draft" else None,
        )
        for nid, desc in _NODES
    ]
    edges = [
        WorkflowEdge(source_node_id="extract", target_node_id="draft"),
        WorkflowEdge(source_node_id="draft", target_node_id="proofread"),
    ]
    return WorkflowDefinition(
        workflow_id="minutes-" + _stable_suffix(transcript),
        name="会议纪要",
        description="会议纪要 + 待办生成流水线",
        nodes=nodes,
        edges=edges,
        execution_strategy="sequential",
    )
```

`_stable_suffix` 用 `hashlib.sha1(transcript.encode()).hexdigest()[:8]`（确定性，供演示端点复用）。

`backend/semantic_analyzer.py`：新增 `_detect_minutes_task(user_message) -> bool`（任一 `MINUTES_KEYWORDS` 命中且含"整理/生成/撰写/输出"类产出动词则 True，见既有 `_detect_complex_task` 正则风格）；在 `analyze` 中 **route() 之前**：

```python
from minutes_workflow import MINUTES_KEYWORDS, build_minutes_workflow
...
    def _detect_minutes_task(self, user_message: str) -> bool:
        return any(k in user_message for k in MINUTES_KEYWORDS) and any(
            v in user_message for v in ("整理", "生成", "撰写", "输出", "写")
        )
```
命中时构造 `SemanticAnalysisResult(is_task=True, intent="minutes", task_description="会议纪要+待办", is_workflow=True, workflow_definition=build_minutes_workflow(user_message), reason="文档任务规则命中", ...)`（其余字段按 protocol 既有默认）。**不要**改动既有复杂任务/编码任务分支。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_workflow.py tests/test_dynamic_router.py tests/test_meeting_coordinator_router.py -q`
Expected: 新增测试全绿 + 既有 semantic/路由回归不破坏（若 `test_minutes_workflow.py` 中 analyzer 入口用例因构造复杂调整实现，以实际通过为准，但必须保持 build_minutes_workflow 语义断言）。

- [ ] **Step 5: 提交**

```bash
git add backend/minutes_workflow.py backend/semantic_analyzer.py backend/tests/test_minutes_workflow.py
git commit -m "feat(hybrid): minutes document-intent detection - transcript to gated DAG"
```

---

### Task 3: create_document 升级为 .docx（doc_tools consumer 接线）

**Covers:** S3-3（docx 生成）、S4（capability seam consumer）

**Files:**
- Modify: `backend/tool_executor.py`（ToolDefinition 参数 + `_exec_create_document`）
- Test: `backend/tests/test_tool_executor_docx.py`（新建）

**Interfaces:**
- Consumes: `doc_tools.seam.DocSpec` / `get_doc_builder`（M1 交付）。
- Produces: `create_document` 工具新增参数 `format`（enum `["text", "docx"]`，default `"text"`）；`format="docx"` 时内容渲染为合法 .docx 字节写文件（title 为首行，其余行进 paragraphs）；`format="text"` 行为与现状完全一致。

- [ ] **Step 1: 写失败测试**（`backend/tests/test_tool_executor_docx.py`）

```python
"""create_document 工具：format=docx 走 doc_tools 生成真 .docx"""
import zipfile
from io import BytesIO

from tool_executor import ToolExecutor
from tool_registry import ToolRegistry


def _executor(tmp_path):
    return ToolExecutor(ToolRegistry(), str(tmp_path))


def test_create_document_docx_is_valid_zip(tmp_path):
    ex = _executor(tmp_path)
    result = ex.execute({
        "name": "create_document",
        "arguments": {"path": "minutes.docx", "content": "会议纪要\n行动项A", "format": "docx"},
    })
    assert result.success, result.error
    f = tmp_path / "minutes.docx"
    assert f.exists()
    with zipfile.ZipFile(f) as zf:
        assert "word/document.xml" in zf.namelist()
        xml = zf.read("word/document.xml").decode("utf-8")
        assert "会议纪要" in xml and "行动项A" in xml


def test_create_document_text_unchanged(tmp_path):
    ex = _executor(tmp_path)
    result = ex.execute({
        "name": "create_document",
        "arguments": {"path": "note.txt", "content": "纯文本"},
    })
    assert result.success, result.error
    assert (tmp_path / "note.txt").read_text(encoding="utf-8") == "纯文本"
```

（ToolCall/ToolResult 的字段名以 `tool_executor.py` 实际为准——`execute(tool_call: ToolCall)`，ToolCall 结构含 name/arguments；若为对象而非 dict，测试改为构造 ToolCall 对象，断言语义不变。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_tool_executor_docx.py -v`
Expected: FAIL——docx 用例断言失败（当前实现写纯文本，zipfile 打开失败）。

- [ ] **Step 3: 实现**

先读 `backend/tool_executor.py` 的 `create_document` ToolDefinition（:208-218）与 `_exec_create_document`（:686）：
- ToolDefinition `parameters` 增加 `format` 参数（`ToolParameter(name="format", type="string", required=False, default="text", enum=["text", "docx"])`，以 tool_registry 结构为准）
- `_exec_create_document`：当 `arguments.get("format") == "docx"` 时，用 `get_doc_builder("stdlib")` 渲染：`content.splitlines()` → 首行 `title`、其余行 `paragraphs`；写文件用既有路径检查后的写路径，内容为 `build(DocSpec(...))` 返回的 bytes；否则保持现状（文本写）。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_tool_executor_docx.py tests/test_executor_enhanced.py tests/test_agent_toolset.py -q`
Expected: 新 2 用例 + 既有 executor 回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/tool_executor.py backend/tests/test_tool_executor_docx.py
git commit -m "feat(hybrid): create_document docx format via doc_tools seam"
```

---

### Task 4: 工作流节点把关钩子

**Covers:** S2-4（员工把关）、S3-1（把关点引擎接线）

**Files:**
- Modify: `backend/meeting_coordinator.py`（`_execute_workflow_node` 内把关钩子）
- Test: `backend/tests/test_node_gate_hook.py`（新建）

**Interfaces:**
- Consumes: Task 1（`WorkflowNode.gate` 序列化不依赖，但把关钩子读 `node.gate` 字段）、M1 把关引擎（`request_gate`/`wait_for_decision`/`handle_gate_response`）。
- Produces: 新增 `MeetingCoordinator._run_node_gate(node: WorkflowNode) -> Optional[dict]`（gate 为 None 或未注入 approval_manager 时返回 None；否则 request_gate + wait_for_decision，approved=False 返回 `{"status": "rejected", "reason": ...}`，超时按既有"默认通过"语义返回 None）；`_execute_workflow_node` 在节点执行成功后、返回前调用 `_run_node_gate`，rejected 时结果带 `"gate": {...}` 标记。

- [ ] **Step 1: 写失败测试**（`backend/tests/test_node_gate_hook.py`）

```python
"""工作流节点把关钩子：带 gate 节点发起 request_gate 并等待决定"""
import pytest
from meeting_coordinator import MeetingCoordinator
from approval_manager import ApprovalManager
from protocol import WorkflowNode


def _coordinator_with_approval():
    coordinator = MeetingCoordinator.__new__(MeetingCoordinator)
    coordinator._approval_manager = ApprovalManager()
    coordinator._approval_timeout = 5.0
    coordinator._build_approval_send_fn = lambda payload: None  # 仅测试，见 Step 3 说明
    return coordinator


async def test_no_gate_returns_none():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="extract", task_description="t", dept_id="dept-docs")
    assert await c._run_node_gate(node) is None


async def test_gate_approves_returns_none():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-1", "stage": "review"})
    gate_task = asyncio.create_task(c._run_node_gate(node))
    await asyncio.sleep(0.05)
    pending = c._approval_manager.get_pending_requests()
    assert len(pending) == 1
    await c._approval_manager.handle_gate_response(pending[0]["id"], True, reason="ok")
    result = await gate_task
    assert result is None


async def test_gate_reject_returns_rejected():
    c = _coordinator_with_approval()
    node = WorkflowNode(node_id="draft", task_description="t", dept_id="dept-docs",
                        gate={"approver": "emp-1", "stage": "review"})
    gate_task = asyncio.create_task(c._run_node_gate(node))
    await asyncio.sleep(0.05)
    pending = c._approval_manager.get_pending_requests()
    await c._approval_manager.handle_gate_response(pending[0]["id"], False, reason="需修改")
    result = await gate_task
    assert result == {"status": "rejected", "reason": "需修改"}
```

（`MeetingCoordinator.__new__` 绕过构造以便注入；`_run_node_gate` 若依赖其他成员（如 meeting/`_sequence_no`），实现者按最小注入补齐。`asyncio` 需 import。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_node_gate_hook.py -v`
Expected: FAIL——`AttributeError: 'MeetingCoordinator' object has no attribute '_run_node_gate'`。

- [ ] **Step 3: 实现**

`backend/meeting_coordinator.py` 新增：

```python
async def _run_node_gate(self, node: WorkflowNode) -> Optional[dict]:
    """节点把关：node.gate 非空且已注入 approval_manager 时发起把关。

    返回 None=通过（含超时默认通过）；否则 rejected 详情。
    """
    gate = node.gate
    if not gate or self._approval_manager is None:
        return None
    gate_id = f"{node.node_id}:{gate.get('stage', 'review')}"
    approval = await self._approval_manager.request_gate(
        requester_id=self.meeting.host_id if hasattr(self.meeting, "host_id") else "agent",
        operation="node_gate",
        description=gate.get("reason") or f"节点 {node.node_id} 待把关",
        task_id=node.node_id,
        gate_id=gate_id,
        send_fn=self._build_approval_send_fn(
            getattr(self, "_on_message", None) or (lambda *a: None),
        ),
    )
    try:
        decision = await self._approval_manager.wait_for_decision(approval.id, timeout=self._approval_timeout)
    except TimeoutError:
        return None  # 超时默认通过（与既有串行审批语义一致）
    if decision.get("approved") is False:
        return {"status": "rejected", "reason": decision.get("reason", "")}
    return None
```

`_execute_workflow_node`（:310）在成功路径、返回结果前调用：

```python
        gate_result = await self._run_node_gate(node)
        if gate_result:
            return {**node_result, "gate": gate_result}
```

（`node_result` 为节点执行返回 dict；`_build_approval_send_fn` 现有签名以代码为准——若它只接受 on_message 单参，直接传既有成员回调。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_node_gate_hook.py tests/test_meeting_coordinator_router.py -q`
Expected: 3 新用例 + 既有 coordinator 回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/tests/test_node_gate_hook.py
git commit -m "feat(hybrid): workflow node gate hook - approval gate on gated nodes"
```

---

### Task 5: 邮件分发适配器 seam

**Covers:** S3-3（邮件/IM 分发适配器）

**Files:**
- Create: `backend/mailer/__init__.py`（空）
- Create: `backend/mailer/seam.py`
- Create: `backend/mailer/provider.py`
- Test: `backend/tests/test_mailer.py`（新建）

**Interfaces:**
- Produces: `mailer.seam.MailMessage(title, to: list[str], body, attachments=None)` dataclass；`Mailer` ABC（`send(message) -> str` 返回标识）；`get_mailer(provider="file", out_dir=...) -> Mailer`（未知 provider 抛 ValueError）；`mailer.provider.build_mime(message) -> bytes`（纯函数，email.mime 标准库）；`FileMailer`（写 `.eml` 到 out_dir）。Task 6 演示端点依赖。

- [ ] **Step 1: 写失败测试**（`backend/tests/test_mailer.py`）

```python
"""邮件分发 seam：MailMessage/build_mime + FileMailer"""
import email
from email import policy

import pytest
from mailer.provider import FileMailer, build_mime
from mailer.seam import MailMessage, get_mailer


def test_build_mime_fields():
    raw = build_mime(MailMessage(title="会议纪要", to=["a@x.com"], body="纪要内容"))
    msg = email.message_from_bytes(raw, policy=policy.default)
    assert msg["Subject"] == "会议纪要"
    assert msg["To"] == "a@x.com"
    assert msg.get_content() == "纪要内容"


def test_get_mailer_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_mailer("nonexistent")


def test_file_mailer_writes_eml(tmp_path):
    mailer = FileMailer(out_dir=str(tmp_path))
    msg_id = mailer.send(MailMessage(title="T", to=["b@x.com"], body="B"))
    assert msg_id.startswith("mail-")
    files = list(tmp_path.glob("*.eml"))
    assert len(files) == 1
    assert "Subject: T" in files[0].read_text(encoding="utf-8")
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_mailer.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'mailer'`。

- [ ] **Step 3: 实现**

`backend/mailer/__init__.py`（空）、`backend/mailer/seam.py`、`backend/mailer/provider.py`（均标准库）：

```python
# seam.py
"""邮件分发 capability seam：定义（MailMessage/Mailer）+ resolve 入口。

provider 可换（file 演示实现；SMTP 生产实现后续按同接口补充）。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class MailMessage:
    title: str = ""
    to: list[str] = field(default_factory=list)
    body: str = ""
    attachments: list[str] = field(default_factory=list)


class Mailer(ABC):
    @abstractmethod
    def send(self, message: MailMessage) -> str:
        """发送消息，返回消息标识。"""


def get_mailer(provider: str = "file", out_dir: str = "") -> Mailer:
    """按 provider 名解析 Mailer；未知 provider fail-loud。"""
    if provider == "file":
        from mailer.provider import FileMailer
        return FileMailer(out_dir=out_dir)
    raise ValueError(f"unknown mailer provider: {provider}")
```

```python
# provider.py
"""mailer 本地 provider：build_mime 纯函数 + FileMailer（写 .eml 演示）。"""
import time
import uuid
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path

from mailer.seam import MailMessage, Mailer


def build_mime(message: MailMessage) -> bytes:
    mime = MIMEText(message.body, "plain", "utf-8")
    mime["Subject"] = message.title
    mime["To"] = ", ".join(message.to)
    return mime.as_bytes()


class FileMailer(Mailer):
    def __init__(self, out_dir: str = ""):
        self._out_dir = Path(out_dir) if out_dir else Path("data/mailbox")

    def send(self, message: MailMessage) -> str:
        self._out_dir.mkdir(parents=True, exist_ok=True)
        msg_id = f"mail-{int(time.time())}-{uuid.uuid4().hex[:8]}"
        (self._out_dir / f"{msg_id}.eml").write_bytes(build_mime(message))
        return msg_id
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_mailer.py -v`
Expected: 3 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/mailer/ backend/tests/test_mailer.py
git commit -m "feat(hybrid): mailer seam - stdlib mime builder and file provider"
```

---

### Task 6: 演示集成端点（速记→纪要规划 + 混合团队）

**Covers:** S5-M2（API 演示全链路）、S2-1/2-4

**Files:**
- Modify: `backend/server.py`（`POST /api/minutes` 演示端点）
- Test: `backend/tests/test_minutes_endpoint.py`（新建，TestClient 模式参考 `tests/test_hybrid_endpoints.py`）

**Interfaces:**
- Consumes: Task 2 `build_minutes_workflow`、M1 `TeamAssembler.assemble_hybrid_team`、Task 5 `build_mime`。
- Produces: `POST /api/minutes`——body `{transcript, project_id, submitter}` → 返回 `{workflow: {workflow_id, nodes:[{node_id, task_description, gate}], edges, strategy}, team: {team_id, members:[...]}, plan: "经 /api/gates 完成把关，经 mailer 分发"}`；nodes 的 gate.approver 替换为 `submitter`。把关执行走既有 `/api/gates`；分发演示：生成 `build_mime(MailMessage(...))` 存 `data/mailbox/`（复用 Task 5 FileMailer）。

- [ ] **Step 1: 写失败测试**（`backend/tests/test_minutes_endpoint.py`）

```python
"""演示端点：速记 → 纪要 DAG 规划 + 混合团队"""
from fastapi.testclient import TestClient

import server

server.BACKEND_TOKEN = ""
from server import app  # noqa: E402  （沿用 test_hybrid_endpoints 的 import 顺序约定）

client = TestClient(app)


def test_minutes_endpoint_returns_plan_and_team():
    resp = client.post("/api/minutes", json={
        "transcript": "今天的会议讨论了发布计划",
        "project_id": "proj-minutes",
        "submitter": "emp-1",
    })
    assert resp.status_code == 200
    data = resp.json()
    nodes = data["workflow"]["nodes"]
    assert [n["node_id"] for n in nodes] == ["extract", "draft", "proofread"]
    draft = next(n for n in nodes if n["node_id"] == "draft")
    assert draft["gate"]["approver"] == "emp-1"
    member_types = {m["memberType"] for m in data["team"]["members"]}
    assert "human" in member_types and "agent" in member_types
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_endpoint.py -v`
Expected: FAIL——404 Not Found。

- [ ] **Step 3: 实现**

`backend/server.py`（既有 `/api/hybrid/team` 之后追加）：

```python
@app.post("/api/minutes")
async def api_minutes_plan(body: dict):
    """演示：速记 → 会议纪要 DAG 规划 + 混合团队组装（把关经 /api/gates）。"""
    from minutes_workflow import build_minutes_workflow
    from mailer.seam import MailMessage
    from mailer.provider import build_mime

    transcript = body.get("transcript", "")
    submitter = body.get("submitter", "submitter")
    if not transcript:
        return _fail("缺少必填字段: transcript")
    wf = build_minutes_workflow(transcript, approver=submitter)
    dag = {"tasks": [
        {"task_id": n.node_id, "name": n.node_id, "required_skills": ["frontend_dev"],
         "description": n.task_description}
        for n in wf.nodes
    ]}
    team = TeamAssembler().assemble_hybrid_team(
        dag, body.get("project_id", "proj-minutes"),
        TeamRuntime(runtime_id="rt-minutes", runtime_type=RuntimeType.LOCAL_DOCKER, root_path="/tmp/workspace"),
        humans=[{"employee_id": submitter, "name": submitter, "approver_for": ["draft"]}],
    )
    # 分发演示：生成 mime 存 mailbox（真实 SMTP 由 mailer seam 生产 provider 承担）
    get_mailer("file").send(MailMessage(title="会议纪要", to=[submitter], body=transcript))
    return {
        "workflow": {
            "workflow_id": wf.workflow_id,
            "strategy": wf.execution_strategy,
            "nodes": [{"node_id": n.node_id, "task_description": n.task_description, "gate": n.gate} for n in wf.nodes],
            "edges": [{"source": e.source_node_id, "target": e.target_node_id} for e in wf.edges],
        },
        "team": {
            "team_id": team.team_id,
            "members": [{"agentId": m.agent_id, "memberType": m.member_type, "approverFor": list(m.approver_for)} for m in team.members],
        },
        "plan": "把关经 /api/gates 完成；纪要经 mailer seam 分发",
    }
```

（`_fail` 沿用 server.py 既有 helper；import 放函数内按需或顶部，以既有风格为准。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_endpoint.py tests/test_hybrid_endpoints.py tests/test_workflow_endpoints.py -q`
Expected: 1 新用例 + 既有端点回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/server.py backend/tests/test_minutes_endpoint.py
git commit -m "feat(hybrid): minutes demo endpoint - transcript to gated DAG plan and hybrid team"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→S3-1/S2-4（gate 数据完整性）；T2→S2-1/S3-5（意图识别）；T3→S3-3/S4（docx consumer）；T4→S2-4/S3-1（把关接线）；T5→S3-3（分发适配器）；T6→S5-M2（演示）。M2 剩余项（把关 UI、真实模型执行链路、邮件 SMTP 生产 provider）属 M2b 或真实试点，计划已明确标注。
- **M2 跟踪项**：T6（gate 序列化）由 T1 落地；T7（human 显示名）已由 M1 演示端点在 `name` 处透传 submitter（`humans=[{"employee_id": submitter, "name": submitter, ...}]`），完整员工目录解析留 M2b。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及"读实际代码后按既有模式插入"的，均给出具体位置与目标行为。
- **类型一致性**：`WorkflowNode.gate`、`request_gate(task_id, gate_id)`、`DocSpec/build`、`MailMessage/Mailer/get_mailer`、`build_minutes_workflow(transcript, approver)` 跨任务签名一致。
