# [M2 打磨] 剩余跟踪项收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收尾 M2 里程碑评审遗留的 4 个跟踪项：T17（REST `/api/gates/pending` 投影补全）、T14（关键词派生清理 + docstring 注记 + decided 审计 approver 断言）、T15（SMTP 生产加固）、T13（retry_node 单节点恢复语义文档化）。

**Architecture:** 全部为既有模块的小增量，无产品行为改变（除 T1 的演示端点响应字段补全与 T3 的 SMTP timeout 默认值）：T1 补 server.py 投影键；T2 派生 MINUTES_FAMILY 消除双元组漂移 + 补注记/断言；T3 SmtpMailer 加 timeout + monkeypatch smtplib 测试；T4 retry_node docstring 文档化。

**Tech Stack:** Python 3.11 · pytest 9.1.1 + pytest-asyncio（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（工作目录 `backend/`）。
- **零新依赖**：不新增包；SMTP 用标准库 smtplib。
- **代码风格**：snake_case 内部、camelCase wire（taskId/gateId/approver）；dataclass 新字段带默认值；注释仅非常规处。
- **不要动**：审批调用点语义、既有键（只追加）、`_run_node_gate` 行为、mailer 的 file 分支与 build_mime。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；既有 churn（package-lock.json、skill_packs/*/system_prompt.md 等）绝不提交。
- **已知基线**：`tests/test_skill_packs_structure.py` 为 PRE-EXISTING（勿处理）；`test_performance.py` 为 flaky。

---

### Task 1: REST /api/gates/pending 投影补全（T17）

**Covers:** S3-1（把关点引擎数据完整性）

**Files:**
- Modify: `backend/server.py`（`api_gates_pending` 投影，约 :2570-2578）
- Test: `backend/tests/test_hybrid_endpoints.py`（追加）

**Interfaces:**
- Consumes: `_demo_gate_manager.get_pending_requests()`（M2b2-T1 已输出 taskId/gateId/approver）。
- Produces: `/api/gates/pending` 响应条目含 `taskId`/`gateId`/`approver` 三键（与 get_pending_requests 对齐；既有 5 键 id/requesterId/operation/description/status 不变）。

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_hybrid_endpoints.py`）

```python
def test_gates_pending_returns_gate_context_fields():
    created = client.post("/api/gates", json={
        "requesterId": "agent-minutes", "operation": "node_gate",
        "description": "纪要待确认", "taskId": "draft", "gateId": "draft:review",
    })
    assert created.status_code == 200
    pending = client.get("/api/gates/pending").json()
    item = next(r for r in pending if r["id"] == created.json()["id"])
    assert item["taskId"] == "draft"
    assert item["gateId"] == "draft:review"
    assert "approver" in item
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_endpoints.py::test_gates_pending_returns_gate_context_fields -v`
Expected: FAIL——`KeyError: 'taskId'`（投影仅 5 键）。

- [ ] **Step 3: 实现**

读 `backend/server.py` 的 `api_gates_pending`（约 :2570-2578，对 `get_pending_requests()` 结果做投影），在投影 dict 内追加三键：

```python
        "taskId": r.get("taskId", ""),
        "gateId": r.get("gateId", ""),
        "approver": r.get("approver", ""),
```

（`r` 为 `get_pending_requests()` 返回的 dict；保持既有 5 键不变。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_endpoints.py tests/test_minutes_endpoint.py -q`
Expected: 新用例 + 既有端点回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/server.py backend/tests/test_hybrid_endpoints.py
git commit -m "fix(hybrid): expose gate context fields in REST pending endpoint projection"
```

---

### Task 2: 关键词派生清理 + docstring 注记 + decided 审计 approver 断言（T14）

**Covers:** S3-5（文档意图识别）、S3-1（把关审计）

**Files:**
- Modify: `backend/minutes_workflow.py`（`MINUTES_FAMILY` 派生）
- Modify: `backend/semantic_analyzer.py`（`_detect_minutes_task` docstring 权衡注记）
- Modify: `backend/tests/test_minutes_workflow.py`、`backend/tests/test_gate_engine.py`（追加）
- Test: 同文件

**Interfaces:**
- Produces: `MINUTES_FAMILY` 派生自 `MINUTES_KEYWORDS`（消除双元组漂移）；`_detect_minutes_task` docstring 记录权衡；`handle_gate_response` 后 decided 审计 approver 断言。

- [ ] **Step 1: 写失败测试**

```python
# test_minutes_workflow.py 追加
def test_minutes_family_derived_from_keywords():
    expected = tuple(k for k in MINUTES_KEYWORDS if k not in ("待办", "行动项"))
    assert MINUTES_FAMILY == expected

# test_gate_engine.py 追加
async def test_gate_decided_audit_includes_approver():
    manager = ApprovalManager()
    pending = await manager.request_gate(
        requester_id="a", operation="op", description="d",
        task_id="t1", gate_id="g1", approver="emp-1",
    )
    await manager.handle_gate_response(pending.id, True, reason="ok")
    decided = [e for e in manager.get_gate_audit("g1") if e["event"] == "gate/decided"]
    assert decided and decided[0]["approver"] == "emp-1"
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_workflow.py::test_minutes_family_derived_from_keywords tests/test_gate_engine.py::test_gate_decided_audit_includes_approver -v`
Expected: 派生断言 FAIL（当前 MINUTES_FAMILY 是并列字面量，值相等会 PASS？——若值恰好一致则改为断言"同一对象/单一来源"不可行；实际断言是值相等，当前并列定义值相同 → 会 PASS。**为让测试真正失败，断言改为检查实现方式**：读 `minutes_workflow.py` 源码字符串含"for k in MINUTES_KEYWORDS"？不优雅。改用：`assert MINUTES_FAMILY == tuple(k for k in MINUTES_KEYWORDS if k not in (...))` 作为**回归保护**（当前若已一致则直接 PASS，无红步骤——允许：本任务语义是防未来漂移，测试先行即可）。decided approver 断言当前应 FAIL（decided 审计是否已含 approver？M2b-1 T3 已实现 decided 从 _history 反查补 approver——若已含则 PASS。以实际为准：若 PASS 则说明已覆盖，仅保留回归）。

**实现者注意**：两个断言的"红"状态以实际代码为准——若某断言当前即 PASS，说明该保护已存在，保留为回归测试即可（文档化任务语义）。

- [ ] **Step 3: 实现**

`backend/minutes_workflow.py`：

```python
MINUTES_KEYWORDS = ("会议纪要", "会议记录", "速记", "待办", "行动项", "纪要")
# 派生而非并列维护：纪要家族 = 关键词元组去掉仅共现触发的"待办/行动项"
MINUTES_FAMILY = tuple(k for k in MINUTES_KEYWORDS if k not in ("待办", "行动项"))
MINUTES_VERBS = ("整理", "生成", "撰写", "输出", "写")
```

`backend/semantic_analyzer.py` `_detect_minutes_task` docstring 补权衡注记：

```python
    """文档任务检测：纪要家族关键词 + 产出动词双匹配（确定性规则，命中即短路）。

    权衡：纪要+写作类表述（如"把纪要写进周报"）仍可能命中，属可接受偏差；
    仅含"待办/行动项"而无纪要关键词的任务不触发（开发任务不被劫持）。
    """
```

（若 decided 审计 approver 反查在 M2b-1 已实现且测试 PASS，则仅保留断言。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_workflow.py tests/test_gate_engine.py tests/test_semantic_analyzer.py -q`
Expected: 全绿（新断言 + 既有回归）。

- [ ] **Step 5: 提交**

```bash
git add backend/minutes_workflow.py backend/semantic_analyzer.py backend/tests/test_minutes_workflow.py backend/tests/test_gate_engine.py
git commit -m "refactor(hybrid): derive minutes family from keywords, document detection tradeoff, assert decided approver"
```

---

### Task 3: SMTP 生产加固（T15）

**Covers:** S3-3（邮件分发适配器）

**Files:**
- Modify: `backend/mailer/provider.py`（`SmtpMailer` 加 timeout）
- Test: `backend/tests/test_mailer.py`（追加 monkeypatch smtplib 测试）

**Interfaces:**
- Produces: `SmtpMailer(..., timeout: float = 15.0)`（构造新增默认 15s 的 timeout，`smtplib.SMTP(host, port, timeout=self._timeout)`）；新增 monkeypatch `smtplib.SMTP` 的测试覆盖：timeout 传入、username 非空 → login 调用、username 空 → login 不调、from_addr 回退（username 或收件人首项）。STARTTLS 支持记录为已知边界（不实现）。

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_mailer.py`）

```python
"""SMTP 生产加固：timeout + monkeypatch smtplib 覆盖 login/from_addr 分支"""
from unittest import mock

from mailer.provider import SmtpMailer


def test_smtp_mailer_timeout_and_login_branches():
    calls = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls["ctor"] = (host, port, timeout)
            self._login = False

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def login(self, user, pwd):
            self._login = True
            calls["login"] = (user, pwd)

        def sendmail(self, from_addr, to_addrs, raw):
            calls["sendmail"] = (from_addr, list(to_addrs))

    with mock.patch("mailer.provider.smtplib.SMTP", FakeSMTP):
        mailer = SmtpMailer(host="h", port=587, username="u", password="p", timeout=7.0)
        mailer.send(MailMessage(title="T", to=["a@x.com"], body="B"))

    assert calls["ctor"] == ("h", 587, 7.0)
    assert calls["login"] == ("u", "p")
    assert calls["sendmail"][0] == "u"  # from_addr = username


def test_smtp_mailer_no_username_skips_login_and_falls_back_to_recipient():
    calls = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls["ctor"] = (host, port, timeout)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def login(self, *a):
            calls["login"] = a

        def sendmail(self, from_addr, to_addrs, raw):
            calls["sendmail"] = (from_addr, list(to_addrs))

    with mock.patch("mailer.provider.smtplib.SMTP", FakeSMTP):
        mailer = SmtpMailer(host="h", port=25, timeout=3.0)
        mailer.send(MailMessage(title="T", to=["a@x.com", "b@y.com"], body="B"))

    assert "login" not in calls  # username 空 → 不调 login
    assert calls["sendmail"][0] == "a@x.com"  # from_addr 回退到收件人首项
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_mailer.py -v`
Expected: FAIL——`TypeError: __init__() got an unexpected keyword argument 'timeout'`（当前 SmtpMailer 无 timeout）。

- [ ] **Step 3: 实现**

读 `backend/mailer/provider.py` 的 `SmtpMailer`（M2b-1 T5 交付）：`__init__` 加 `timeout: float = 15.0` 参数并存储 `self._timeout`；`send` 的 smtplib 分支改为 `smtplib.SMTP(self._host, self._port, timeout=self._timeout)`。保持 transport 注入分支与 file 分支不变。STARTTLS/SSL 支持在类 docstring 注明"已知边界：587 明文 login；真实服务商（Gmail/Office365）需 STARTTLS/SMTP_SSL，接入真实 SMTP 时评估"。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_mailer.py tests/test_minutes_endpoint.py -q`
Expected: 全绿（5 既有 + 2 新增 + endpoint 回归）。

- [ ] **Step 5: 提交**

```bash
git add backend/mailer/provider.py backend/tests/test_mailer.py
git commit -m "feat(hybrid): smtp mailer connect timeout and smtplib branch tests"
```

---

### Task 4: retry_node 单节点恢复语义文档化（T13）

**Covers:** S5-M2（工作流生命周期）

**Files:**
- Modify: `backend/workflow_engine.py`（`retry_node` docstring）
- Test: `backend/tests/test_workflow_gate_enforcement.py`（追加语义说明性断言，可选）

**Interfaces:**
- Produces: `retry_node` docstring 明确"仅恢复目标节点（FAILED/SKIPPED → PENDING → 重跑）；下游 SKIPPED 节点与 execution 状态不随 retry 恢复（需完整重跑或手动逐节点重试）"。

- [ ] **Step 1: 写失败测试（语义说明性，文档任务）**

文档任务无行为变更——不写失败测试。可选追加一个**语义锁定断言**（当前行为已如此，PASS 即锁定）：

```python
# test_workflow_gate_enforcement.py 追加
async def test_retry_node_recovers_only_target_node():
    """锁定 retry 语义：重试成功只恢复目标节点，下游 SKIPPED 与 execution 状态不变。"""
    engine = WorkflowEngine()
    calls = {"rejected": True}

    async def rejected_executor(node, input_data):
        if node.node_id == "draft" and calls["rejected"]:
            return {"gate": {"status": "rejected", "reason": "需修改"}}
        return {"result": f"{node.node_id} done"}

    engine.register_node_executor("dept-docs", rejected_executor)
    execution = engine.create_workflow(_chain_definition())
    await engine.execute_workflow(execution.execution_id)
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.FAILED
    assert status.node_states["proofread"] == WorkflowNodeStatus.SKIPPED

    calls["rejected"] = False
    await engine.retry_node(execution.execution_id, "draft")
    status = engine.get_workflow_status(execution.execution_id)
    assert status.node_states["draft"] == WorkflowNodeStatus.COMPLETED
    assert status.node_states["proofread"] == WorkflowNodeStatus.SKIPPED  # 下游不随 retry 恢复
```

（`_chain_definition` 复用该文件既有 fixture/helper；若命名不同以实际为准。此断言当前应 PASS——锁定既有语义。）

- [ ] **Step 2: 运行确认（锁定语义）**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_workflow_gate_enforcement.py -v`
Expected: 全部 PASS（新增断言锁定"仅恢复目标节点"语义）。

- [ ] **Step 3: 实现**

读 `backend/workflow_engine.py` 的 `retry_node`（约 :833-873），docstring 补充：

```python
    """重试失败/跳过节点：重置目标节点为 PENDING 后重跑。

    注意：仅恢复目标节点。下游因依赖不满足而 SKIPPED 的节点与 execution 终态
    不随本次重试恢复——需完整重跑（start_workflow）或手动逐节点重试下游。
    """
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_workflow_gate_enforcement.py tests/test_workflow_engine.py -q`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/workflow_engine.py backend/tests/test_workflow_gate_enforcement.py
git commit -m "docs(hybrid): document retry_node single-node recovery semantics"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→S3-1（REST 数据完整性）；T2→S3-5/S3-1（关键词/审计）；T3→S3-3（SMTP 加固）；T4→S5-M2（生命周期语义）。4 个跟踪项（T13/T14/T15/T17）全部覆盖；T6/T7/T9/T10/T11 已在 M2a/M2b 落地并标记 done。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及"以实际代码为准"处（T2 断言红态、T4 fixture 命名）给出明确指引。
- **类型一致性**：`taskId/gateId/approver`（wire camelCase）、`SmtpMailer(timeout=...)`、`MINUTES_FAMILY` 派生、`retry_node` 语义在各任务间一致。
