# [M1] 人+agent 混合团队平台 · 引擎底座 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MDH 建立"人+agent 混合团队"引擎底座（设计文档 `docs/compose/specs/2026-08-14-hybrid-team-platform-design.md` 的 M1 里程碑）：员工/把关点数据模型、混合团队组装、把关点引擎、文档工具 seam（docx 生成）、演示 API。

**Architecture:** 复用现有五支柱引擎，全部为增量：human 成员建模为 `TeamMember(member_type="human")`（把关人，不参与 team_role 查询）；把关点引擎 = `ApprovalManager` 扩展（`request_gate`/`handle_gate_response` + requested/decided 成对审计，为后续 session-log 折叠留底）；文档工具 seam = `backend/doc_tools/` 包（定义 DocSpec/DocBuilder 抽象 + 纯标准库 OOXML provider，零新依赖）；server.py 增加演示 REST 端点（组队 + 把关），会话内审批接线不动。

**Tech Stack:** Python 3.11 · FastAPI · pytest 9.1.1 + pytest-asyncio 1.4.0（`backend/pyproject.toml` 已配 `asyncio_mode = "auto"`，async 测试无需装饰器）

## Global Constraints

- **测试环境**：backend 测试一律用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（工作目录 `backend/`；base conda 无 pytest）。pytest 9.1.1 + pytest-asyncio 1.4.0。
- **零新依赖**：本计划不得向 `requirements.txt` 添加任何包；docx 生成用纯标准库（zipfile + XML）。
- **导入惯例**：测试内 `from approval_manager import ApprovalManager`（conftest.py 已把 `backend/` 加入 sys.path）；不写 `from backend.xxx`。
- **代码风格**：snake_case 字段；dataclass 新字段带默认值追加在末尾；human 成员的 `team_role` 传 `""`（空串，不参与 `get_member_by_team_role`）；注释默认不写，仅非常规处加一行中文。
- **不要动**：`meeting_coordinator.py` 的既有审批调用点（L1307-1323）、server.py 的会话级 `_approval_manager`（L1876 等）、roles_config.yaml 结构、`tool_executor.py` 的 create_document（Electron 专属，本计划不动）。
- **提交纪律**：每任务一个 commit（`feat(hybrid): ...`）；只 `git add` 本任务文件；`backend/companion_log.json`、`package-lock.json`、`skill_packs/*/system_prompt.md` 等既有 churn 绝不提交。
- **测试文件命名**：`backend/tests/test_<主题>.py`。

---

### Task 1: 员工与把关点数据模型

**Covers:** S3-1（员工身份与把关点引擎的数据基础）

**Files:**
- Modify: `backend/team.py`（TeamMember 追加字段）
- Modify: `backend/protocol.py`（WorkflowNode 追加 gate 字段）
- Test: `backend/tests/test_team_gate_model.py`（新建）

**Interfaces:**
- Produces: `TeamMember(..., member_type: str = "agent", approver_for: tuple = ())`；human 成员约定 `member_type="human"`、`team_role=""`；`WorkflowNode(..., gate: Optional[dict] = None)`（gate 形如 `{"approver": str, "stage": str}`，M2 消费）。

- [ ] **Step 1: 写失败测试**

```python
"""员工/把关点数据模型：human 成员与节点 gate"""
from protocol import WorkflowNode
from team import AgentLocation, TeamMember


def test_agent_member_defaults():
    m = TeamMember(agent_id="a1", role_name="executor", team_role="Executor", location=AgentLocation.LOCAL)
    assert m.member_type == "agent"
    assert m.approver_for == ()


def test_human_member_fields():
    m = TeamMember(
        agent_id="emp-1",
        role_name="employee",
        team_role="",
        location=AgentLocation.LOCAL,
        member_type="human",
        approver_for=("task-1", "task-2"),
    )
    assert m.member_type == "human"
    assert m.approver_for == ("task-1", "task-2")


def test_workflow_node_gate():
    n = WorkflowNode(
        node_id="n1",
        task_description="撰写会议纪要",
        dept_id="dept-doc",
        gate={"approver": "emp-1", "stage": "review"},
    )
    assert n.gate == {"approver": "emp-1", "stage": "review"}


def test_workflow_node_gate_default_none():
    n = WorkflowNode(node_id="n1", task_description="t", dept_id="d")
    assert n.gate is None
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_team_gate_model.py -v`
Expected: FAIL——`TypeError: __init__() got an unexpected keyword argument 'member_type'` 等（字段不存在）。

- [ ] **Step 3: 实现**

`backend/team.py` 的 `TeamMember` dataclass 末尾追加两字段（保持 `skill_pack_id`/`status` 之后的顺序）：

```python
@dataclass
class TeamMember:
    agent_id: str
    role_name: str
    team_role: str            # human 成员传 ""，不参与 team_role 查询
    location: AgentLocation
    skill_pack_id: str = ""
    status: str = "idle"
    member_type: str = "agent"   # "agent" | "human"（human=现实员工，作为把关人）
    approver_for: tuple = ()     # human 成员负责把关的 task_id 列表
```

`backend/protocol.py` 的 `WorkflowNode` 追加（放在 `result` 之后）：

```python
    gate: Optional[dict] = None   # 把关点描述 {"approver": str, "stage": str}；None=无把关
```

若 `protocol.py` 未导入 `Optional`，在文件顶部 `from typing import Optional`（或与文件既有 typing 导入合并）。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_team_gate_model.py -v`
Expected: PASS 4 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/team.py backend/protocol.py backend/tests/test_team_gate_model.py
git commit -m "feat(hybrid): employee/gate data model - human team member and workflow node gate"
```

---

### Task 2: 混合团队组装

**Covers:** S3-4（混合团队组装器）

**Files:**
- Modify: `backend/team_assembler.py`
- Test: `backend/tests/test_hybrid_team_assembly.py`（新建）

**Interfaces:**
- Consumes: Task 1 的 `TeamMember(member_type=..., approver_for=...)`。
- Produces: `TeamAssembler.assemble_hybrid_team(dag: dict, project_id: str, runtime: TeamRuntime, humans: list[dict]) -> Team`；`humans` 元素形如 `{"employee_id": str, "name": str, "approver_for": list[str]}`。既有 `assemble_from_dag` 签名不变（向后兼容）。

- [ ] **Step 1: 写失败测试**

```python
"""混合团队组装：agent 成员 + human 把关成员"""
import yaml
import pytest
from team import RuntimeType, TeamRuntime
from team_assembler import TeamAssembler


@pytest.fixture
def runtime():
    return TeamRuntime(runtime_id="rt-1", runtime_type=RuntimeType.LOCAL_DOCKER, root_path="/tmp/workspace")


@pytest.fixture
def roles_config(tmp_path):
    config = {
        "base_roles": {
            "coordinator": {
                "name": "产品经理", "team_role": "Coordinator",
                "tools": ["read_file"], "dangerous_tools": [],
                "skills": ["task_decomposition"], "prompt_template": "coordinator",
            },
            "executor": {
                "name": "文档撰写员", "team_role": "Executor",
                "tools": ["read_file", "write_file"], "dangerous_tools": [],
                "skills": ["frontend_dev"], "prompt_template": "executor",
            },
        }
    }
    path = tmp_path / "roles_config.yaml"
    path.write_text(yaml.dump(config), encoding="utf-8")
    return str(path)


DAG = {
    "tasks": [
        {"task_id": "task-1", "name": "撰写纪要", "required_skills": ["frontend_dev"], "description": "从速记生成纪要"},
    ]
}


def test_hybrid_team_has_agent_and_human_members(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(
        DAG, "proj-1", runtime,
        humans=[{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    )
    agents = [m for m in team.members if m.member_type == "agent"]
    humans = [m for m in team.members if m.member_type == "human"]
    assert len(agents) >= 1
    assert len(humans) == 1
    assert humans[0].agent_id == "emp-1"
    assert humans[0].approver_for == ("task-1",)
    assert humans[0].team_role == ""


def test_hybrid_team_without_humans_is_pure_agent(runtime, roles_config):
    assembler = TeamAssembler(roles_config_path=roles_config)
    team = assembler.assemble_hybrid_team(DAG, "proj-1", runtime, humans=[])
    assert len(team.members) >= 1
    assert all(m.member_type == "agent" for m in team.members)
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_team_assembly.py -v`
Expected: FAIL——`AttributeError: 'TeamAssembler' object has no attribute 'assemble_hybrid_team'`。

- [ ] **Step 3: 实现**

`backend/team_assembler.py`：确认文件头已导入 `TeamMember`、`AgentLocation`（若只导入 `Team`/`TeamRuntime`，补上），然后新增方法（放在 `assemble_from_dag` 之后）：

```python
def assemble_hybrid_team(
    self,
    dag: dict,
    project_id: str,
    runtime: TeamRuntime,
    humans: list[dict],
) -> Team:
    """组混合团队：agent 成员按既有逻辑选取，human 成员作为把关人加入。

    humans 元素: {"employee_id": str, "name": str, "approver_for": [task_id, ...]}
    """
    team = self.assemble_from_dag(dag, project_id, runtime)
    for h in humans:
        team.add_member(TeamMember(
            agent_id=h["employee_id"],
            role_name="employee",
            team_role="",  # human 成员不参与 team_role 查询
            location=AgentLocation.LOCAL,
            member_type="human",
            approver_for=tuple(h.get("approver_for", [])),
        ))
    return team
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_team_assembly.py -v`
Expected: PASS 2 passed。再跑既有回归：`/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_team_assembler.py -q` Expected: 全绿（旧签名未动）。

- [ ] **Step 5: 提交**

```bash
git add backend/team_assembler.py backend/tests/test_hybrid_team_assembly.py
git commit -m "feat(hybrid): hybrid team assembly with human gate members"
```

---

### Task 3: 把关点引擎

**Covers:** S3-1（把关点引擎）、S2-4（员工把关）

**Files:**
- Modify: `backend/approval_manager.py`
- Test: `backend/tests/test_gate_engine.py`（新建）

**Interfaces:**
- Consumes: Task 1 数据模型不依赖；本任务自洽。
- Produces: `PendingApproval` 追加 `task_id: str = ""`、`gate_id: str = ""`；`request_approval(..., task_id="", gate_id="")`（WS payload request 内追加 `taskId`/`gateId`）；新增 `request_gate(requester_id, operation, description, task_id="", gate_id="", risk_level=..., confidence=..., send_fn=None, timeout=None) -> PendingApproval`、`handle_gate_response(request_id, approved, reason="", send_fn=None) -> bool`、`get_gate_audit(gate_id="") -> list`。

- [ ] **Step 1: 写失败测试**

```python
"""把关点引擎：request_gate/handle_gate_response 成对审计 + task/gate 关联"""
import pytest
from approval_manager import ApprovalManager


async def test_request_approval_carries_gate_fields():
    manager = ApprovalManager()
    approval = await manager.request_approval(
        requester_id="agent-minutes",
        operation="minutes_draft",
        description="撰写会议纪要初稿",
        task_id="task-1",
        gate_id="gate-1",
    )
    assert approval.task_id == "task-1"
    assert approval.gate_id == "gate-1"


async def test_request_gate_pairs_audit_events():
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="agent-minutes",
        operation="minutes_review",
        description="纪要待确认",
        task_id="task-1",
        gate_id="gate-1",
    )
    assert pending.gate_id == "gate-1"
    audit = manager.get_gate_audit("gate-1")
    assert [e["event"] for e in audit] == ["gate/requested"]
    assert audit[0]["task_id"] == "task-1"

    ok = await manager.handle_gate_response(pending.id, True, reason="内容无误")
    assert ok is True
    events = [e["event"] for e in manager.get_gate_audit("gate-1")]
    assert events == ["gate/requested", "gate/decided"]
    decided = manager.get_gate_audit("gate-1")[-1]
    assert decided["approved"] is True
    assert decided["reason"] == "内容无误"
    assert decided["gate_id"] == "gate-1"


async def test_gate_audit_filter_empty_returns_all():
    manager = ApprovalManager()
    await manager.request_gate(requester_id="a", operation="op", description="d", gate_id="g1")
    await manager.request_gate(requester_id="a", operation="op", description="d", gate_id="g2")
    assert len(manager.get_gate_audit()) == 2
    assert len(manager.get_gate_audit("g1")) == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_gate_engine.py -v`
Expected: FAIL——`TypeError: request_approval() got an unexpected keyword argument 'task_id'`、`AttributeError: ... has no attribute 'request_gate'`。

- [ ] **Step 3: 实现**

`backend/approval_manager.py` 三处修改：

(1) `PendingApproval` dataclass 追加（`_future` 之前或之后均可，带默认值）：

```python
    task_id: str = ""
    gate_id: str = ""
```

(2) `request_approval` 签名追加 `task_id: str = "", gate_id: str = ""`，构造 `PendingApproval(...)` 时传入 `task_id=task_id, gate_id=gate_id`，并在发送 payload 的 `request` dict 内追加两键（L92-103 的 dict）：

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
                        "status": approval.status.value,
                        "createdAt": approval.created_at,
                        "taskId": approval.task_id,
                        "gateId": approval.gate_id,
                    },
                })
```

(3) `__init__` 追加 `self._gate_audit: list = []`，并在类中新增三个方法（放在 `wait_for_decision` 之后）：

```python
async def request_gate(
    self,
    requester_id: str,
    operation: str,
    description: str,
    task_id: str = "",
    gate_id: str = "",
    risk_level: RiskLevel = RiskLevel.MEDIUM,
    confidence: float = 0.5,
    send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
    timeout: Optional[float] = None,
) -> PendingApproval:
    """把关点请求：复用 request_approval，并记录 gate/requested 审计事件。"""
    pending = await self.request_approval(
        requester_id=requester_id,
        operation=operation,
        description=description,
        risk_level=risk_level,
        confidence=confidence,
        send_fn=send_fn,
        timeout=timeout,
        task_id=task_id,
        gate_id=gate_id,
    )
    self._gate_audit.append({
        "event": "gate/requested",
        "request_id": pending.id,
        "gate_id": gate_id,
        "task_id": task_id,
    })
    return pending


async def handle_gate_response(
    self,
    request_id: str,
    approved: bool,
    reason: str = "",
    send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> bool:
    """把关点决定：复用 handle_response，并记录 gate/decided 审计事件。"""
    resolved = await self.handle_response(request_id, approved, reason=reason, send_fn=send_fn)
    gate_id, task_id = "", ""
    for req in self.get_history():
        if req.id == request_id:
            gate_id, task_id = req.gate_id, req.task_id
            break
    self._gate_audit.append({
        "event": "gate/decided",
        "request_id": request_id,
        "gate_id": gate_id,
        "task_id": task_id,
        "approved": approved,
        "reason": reason,
    })
    return resolved


def get_gate_audit(self, gate_id: str = "") -> list:
    """把关点审计事件（requested/decided 成对）；gate_id 为空返回全部。"""
    if not gate_id:
        return list(self._gate_audit)
    return [e for e in self._gate_audit if e.get("gate_id") == gate_id]
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_gate_engine.py tests/test_approval_wait.py -q`
Expected: PASS（3 新 + 既有 approval 测试全绿）。

- [ ] **Step 5: 提交**

```bash
git add backend/approval_manager.py backend/tests/test_gate_engine.py
git commit -m "feat(hybrid): gate engine - paired gate audit on top of approval manager"
```

---

### Task 4: 文档工具 seam（纯标准库 docx 生成）

**Covers:** S3-3（文档工具集/docx 生成）、S4-capability seam

**Files:**
- Create: `backend/doc_tools/__init__.py`
- Create: `backend/doc_tools/seam.py`
- Create: `backend/doc_tools/builder.py`
- Test: `backend/tests/test_doc_builder.py`（新建）

**Interfaces:**
- Produces: `doc_tools.seam.DocSpec(title="", paragraphs=[], bullets=[], tables=[])`；`doc_tools.seam.DocBuilder`（抽象，`build(spec) -> bytes`）；`doc_tools.seam.get_doc_builder(provider="stdlib") -> DocBuilder`；`doc_tools.builder.StdlibDocxBuilder`。M2 的 create_document 工具 seam consumer 依赖这些。

- [ ] **Step 1: 写失败测试**

```python
"""文档工具 seam：DocSpec/DocBuilder + 纯标准库 docx 生成"""
import zipfile
from io import BytesIO

import pytest
from doc_tools.builder import StdlibDocxBuilder
from doc_tools.seam import DocBuilder, DocSpec, get_doc_builder


def test_get_doc_builder_stdlib():
    builder = get_doc_builder("stdlib")
    assert isinstance(builder, DocBuilder)
    assert isinstance(builder, StdlibDocxBuilder)


def test_get_doc_builder_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_doc_builder("nonexistent")


def test_build_returns_valid_docx_zip():
    spec = DocSpec(title="会议纪要", paragraphs=["段落一"], bullets=["行动项A"])
    data = get_doc_builder("stdlib").build(spec)
    assert isinstance(data, bytes)
    with zipfile.ZipFile(BytesIO(data)) as zf:
        names = zf.namelist()
        assert "word/document.xml" in names
        assert "[Content_Types].xml" in names
        assert "_rels/.rels" in names
        xml = zf.read("word/document.xml").decode("utf-8")
        assert "会议纪要" in xml
        assert "段落一" in xml
        assert "行动项A" in xml


def test_build_table_and_escaping():
    spec = DocSpec(
        title="T",
        paragraphs=["<未转义&测试>"],
        tables=[["列A", "列B"], ["1", "2"]],
    )
    xml = _document_xml(get_doc_builder("stdlib").build(spec))
    assert "&lt;未转义&amp;测试&gt;" in xml
    assert "<w:tbl>" in xml
    assert xml.count("<w:tr>") == 2


def _document_xml(data: bytes) -> str:
    with zipfile.ZipFile(BytesIO(data)) as zf:
        return zf.read("word/document.xml").decode("utf-8")
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_doc_builder.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'doc_tools'`。

- [ ] **Step 3: 实现**

创建 `backend/doc_tools/__init__.py`（空文件）。

`backend/doc_tools/seam.py`：

```python
"""文档工具 capability seam：Service Definition（DocBuilder）+ resolve 入口。

provider 可换（stdlib 当前实现；未来 e2b/远端 provider 走同一接口），
consumer（M2 的 create_document 工具）只依赖本模块类型。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class DocSpec:
    title: str = ""
    paragraphs: list[str] = field(default_factory=list)
    bullets: list[str] = field(default_factory=list)
    tables: list[list[str]] = field(default_factory=list)


class DocBuilder(ABC):
    @abstractmethod
    def build(self, spec: DocSpec) -> bytes:
        """把 DocSpec 渲染为 .docx 字节流。"""


def get_doc_builder(provider: str = "stdlib") -> DocBuilder:
    """按 provider 名解析 DocBuilder 实现；未知 provider fail-loud。"""
    if provider == "stdlib":
        from doc_tools.builder import StdlibDocxBuilder
        return StdlibDocxBuilder()
    raise ValueError(f"unknown doc builder provider: {provider}")
```

`backend/doc_tools/builder.py`（纯标准库最小 OOXML，无 numbering 依赖——bullet 用 "• " 前缀）：

```python
"""纯标准库 .docx 生成器：zipfile + 手写 OOXML，零第三方依赖。

M1 最小实现：标题/段落/bullet(• 前缀)/表格；真实 Word 可打开。
"""
import zipfile
from io import BytesIO
from xml.sax.saxutils import escape

from doc_tools.seam import DocBuilder, DocSpec

_CONTENT_TYPES = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    b'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    b'<Default Extension="xml" ContentType="application/xml"/>'
    b'<Override PartName="/word/document.xml" '
    b'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    b'</Types>'
)
_RELS = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    b'<Relationship Id="rId1" '
    b'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    b'Target="word/document.xml"/>'
    b'</Relationships>'
)


class StdlibDocxBuilder(DocBuilder):
    def build(self, spec: DocSpec) -> bytes:
        parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
        parts.append('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>')
        if spec.title:
            parts.append(
                f'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
                f'<w:r><w:t>{escape(spec.title)}</w:t></w:r></w:p>'
            )
        for para in spec.paragraphs:
            parts.append(f'<w:p><w:r><w:t>{escape(para)}</w:t></w:r></w:p>')
        for bullet in spec.bullets:
            parts.append(f'<w:p><w:r><w:t>{escape("• " + bullet)}</w:t></w:r></w:p>')
        if spec.tables:
            rows = []
            for row in spec.tables:
                cells = "".join(
                    f'<w:tc><w:p><w:r><w:t>{escape(cell)}</w:t></w:r></w:p></w:tc>'
                    for cell in row
                )
                rows.append(f"<w:tr>{cells}</w:tr>")
            parts.append(f'<w:tbl>{"".join(rows)}</w:tbl>')
        parts.append("</w:body></w:document>")

        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", _CONTENT_TYPES)
            zf.writestr("_rels/.rels", _RELS)
            zf.writestr("word/document.xml", "".join(parts).encode("utf-8"))
        return buf.getvalue()
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_doc_builder.py -v`
Expected: PASS 4 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/doc_tools/ backend/tests/test_doc_builder.py
git commit -m "feat(hybrid): document tool seam with stdlib docx builder"
```

---

### Task 5: 演示 API（组队 + 把关）

**Covers:** S5-M1 验收（"API 可演示组队与把关"）

**Files:**
- Modify: `backend/server.py`（新增演示端点；不碰会话级审批接线）
- Test: `backend/tests/test_hybrid_endpoints.py`（新建，TestClient 模式参考 `tests/test_workflow_endpoints.py`）

**Interfaces:**
- Consumes: Task 2 的 `TeamAssembler.assemble_hybrid_team`、Task 3 的 `request_gate`/`handle_gate_response`/`get_pending_requests`。
- Produces: REST 端点 `POST /api/hybrid/team`、`POST /api/gates`、`GET /api/gates/pending`、`POST /api/gates/{request_id}/decide`（模块级 `_demo_gate_manager`，仅演示用，会话内审批不改）。

- [ ] **Step 1: 写失败测试**

```python
"""演示 API：混合组队 + 把关点"""
from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def test_hybrid_team_endpoint():
    resp = client.post("/api/hybrid/team", json={
        "project_id": "proj-demo",
        "dag": {
            "tasks": [
                {"task_id": "task-1", "name": "撰写纪要", "required_skills": ["frontend_dev"], "description": "从速记生成纪要"},
            ]
        },
        "humans": [{"employee_id": "emp-1", "name": "张三", "approver_for": ["task-1"]}],
    })
    assert resp.status_code == 200
    data = resp.json()
    member_types = {m["memberType"] for m in data["members"]}
    assert "human" in member_types
    assert "agent" in member_types
    human = next(m for m in data["members"] if m["memberType"] == "human")
    assert human["agentId"] == "emp-1"
    assert human["approverFor"] == ["task-1"]


def test_gate_create_pending_and_decide():
    resp = client.post("/api/gates", json={
        "requesterId": "agent-minutes",
        "operation": "minutes_review",
        "description": "纪要待确认",
        "taskId": "task-1",
        "gateId": "gate-1",
    })
    assert resp.status_code == 200
    request_id = resp.json()["id"]
    assert resp.json()["gateId"] == "gate-1"

    pending = client.get("/api/gates/pending").json()
    assert any(r["id"] == request_id for r in pending)

    decided = client.post(f"/api/gates/{request_id}/decide", json={"approved": True, "reason": "无误"})
    assert decided.status_code == 200
    assert decided.json()["resolved"] is True

    pending_after = client.get("/api/gates/pending").json()
    assert all(r["id"] != request_id for r in pending_after)
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_endpoints.py -v`
Expected: FAIL——`404 Not Found`（端点不存在）。

- [ ] **Step 3: 实现**

`backend/server.py`：文件顶部（`app = FastAPI(...)` 之后、其他路由附近）加模块级演示管理器：

```python
# M1 演示：把关点引擎（仅演示用；会话内审批接线保持不变）
_demo_gate_manager = ApprovalManager()
```

确认 `server.py` 已导入 `ApprovalManager`、`TeamAssembler`、`TeamRuntime`（按需补 import），然后追加四个端点：

```python
@app.post("/api/hybrid/team")
async def api_hybrid_team(body: dict):
    """演示：组装人+agent 混合团队。body: {project_id, dag, humans}"""
    from team import RuntimeType, TeamRuntime
    dag = body["dag"]
    runtime = TeamRuntime(
        runtime_id=f"rt-{body.get('project_id', 'demo')}",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/workspace",
    )
    team = TeamAssembler().assemble_hybrid_team(
        dag, body.get("project_id", "demo"), runtime, body.get("humans", []),
    )
    return {
        "team_id": team.team_id,
        "members": [
            {
                "agentId": m.agent_id,
                "roleName": m.role_name,
                "teamRole": m.team_role,
                "memberType": m.member_type,
                "approverFor": list(m.approver_for),
            }
            for m in team.members
        ],
    }


@app.post("/api/gates")
async def api_gate_create(body: dict):
    """演示：创建把关点请求（等价于会议内的审批请求）"""
    approval = await _demo_gate_manager.request_gate(
        requester_id=body.get("requesterId", "agent-demo"),
        operation=body.get("operation", "unknown_operation"),
        description=body.get("description", ""),
        task_id=body.get("taskId", ""),
        gate_id=body.get("gateId", ""),
    )
    return {
        "id": approval.id,
        "taskId": approval.task_id,
        "gateId": approval.gate_id,
        "status": approval.status.value,
    }


@app.get("/api/gates/pending")
async def api_gates_pending():
    """演示：查看待处理把关请求"""
    return [{
        "id": r.id,
        "requesterId": r.requester_id,
        "operation": r.operation,
        "taskId": r.task_id,
        "gateId": r.gate_id,
        "status": r.status.value,
    } for r in _demo_gate_manager.get_pending_requests()]


@app.post("/api/gates/{request_id}/decide")
async def api_gate_decide(request_id: str, body: dict):
    """演示：对把关请求做出决定"""
    resolved = await _demo_gate_manager.handle_gate_response(
        request_id, bool(body.get("approved", False)), reason=body.get("reason", ""),
    )
    return {"resolved": resolved}
```

注意：若 `server.py` 顶层未导入 `ApprovalManager`/`TeamAssembler`，把 import 加在文件顶部既有 import 区（与其他 `from approval_manager import ...` 同类）。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_endpoints.py -v`
Expected: PASS 2 passed。回归：`/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_workflow_endpoints.py tests/test_approval_wait.py tests/test_gate_engine.py -q` Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/server.py backend/tests/test_hybrid_endpoints.py
git commit -m "feat(hybrid): demo API for hybrid team assembly and gate decisions"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→S3-1；T2→S3-4；T3→S3-1+S2-4；T4→S3-3+S4；T5→S5-M1。S1/S2-1..7 数据流与 S6 对标不产生本里程碑代码任务（M2 覆盖 S2-2/3/5/6/7 的执行与分发环节；M3 覆盖沉淀闭环 S2-6/7 与 S5-M3）；本计划明确只交付 M1。
- **无占位符**：全部步骤含可运行代码与预期输出。
- **类型一致性**：`TeamMember(member_type/approver_for)`、`WorkflowNode.gate`、`DocSpec/DocBuilder.build/get_doc_builder`、`request_gate/handle_gate_response/get_gate_audit` 在 T1-T5 间签名一致。
