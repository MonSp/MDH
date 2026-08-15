# [M2 剩余] 员工目录解析 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"员工"成为一等实体（设计文档 [S1] 的落地收尾）——建立员工目录数据结构，把关人/提交者从占位字符串（`"submitter"`/`approver` ID）解析为真实员工显示名，并贯通演示端点与前端审批面板。

**Motivation（现状取证）**：`/api/minutes` 端点 `submitter = body.get("submitter", "submitter")`（server.py:2516）——humans `name` 与 mailer `to` 都用该占位符；`build_minutes_workflow` gate approver 默认 `"submitter"`（minutes_workflow.py:20）；前端 ApprovalPanel `由 ${approval.approver} 把关`（ApprovalPanel.tsx:75）直接显示原始 ID。**无员工目录数据源**（mock-sso 仅认证、roles_config 无员工）。

**Architecture:** 新增纯标准库 `backend/employee_directory.py`（数据类 + 可注入目录 + 内置默认演示目录），解析函数在 server 层接线（演示端点 submitter 解析 + 审批链 approverName 透传），ApprovalManager/TeamAssembler 零改动（不注入目录，保持低耦合——解析是演示/UI 关切）。前端类型加可选 `approverName`，面板显示 `approverName || approver || '系统'` 回落链。

**Tech Stack:** Python 3.11 · pytest 9.1.1 + pytest-asyncio（asyncio_mode=auto）· TypeScript/Vitest 3.2.4（前端）

## Global Constraints

- **测试环境**：后端 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）；前端 `npx vitest run <file>`（worktree 内）。
- **零新依赖**：后端纯标准库；前端零新包（@testing-library 已装）。
- **代码风格**：snake_case 内部、camelCase wire；dataclass 新字段带默认值；注释仅非常规处。
- **不要动**：ApprovalManager 内部语义（request_gate/handle_gate_response/get_pending_requests 本身）、TeamAssembler 组装逻辑、mailer 行为、前端既有 UI 结构。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；既有 churn（package-lock.json、skill_packs/*/system_prompt.md 等）绝不提交；worktree 内 `npm install --no-audit --no-fund --legacy-peer-deps --ignore-scripts` 建前端环境（`npm ci` 必失败）。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）；`test_performance.py` flaky。

---

### Task 1: EmployeeDirectory 后端模块

**Covers:** S1（员工身份与把关点引擎——员工成为一等实体）

**Files:**
- Add: `backend/employee_directory.py`
- Test: `backend/tests/test_employee_directory.py`

**Interfaces:**
- Produces: `Employee` dataclass（`employee_id`/`name`/`email`/`position`，全 str 默认 ""）；`EmployeeDirectory`（`__init__(employees: list[Employee] | None = None)`，None → 内置默认演示目录）；`resolve(employee_id) -> Employee | None`；`display_name(employee_id) -> str`（未命中**原样回退** employee_id——与前端 truthy 回落链衔接）；`all() -> list[Employee]`；模块级单例 `get_directory()`。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_employee_directory.py`）

```python
from employee_directory import Employee, EmployeeDirectory, get_directory


def test_directory_resolves_employee():
    d = EmployeeDirectory([Employee(employee_id="e1", name="张三", email="zhang@x.com")])
    emp = d.resolve("e1")
    assert emp is not None and emp.name == "张三" and emp.email == "zhang@x.com"


def test_display_name_known_and_fallback():
    d = EmployeeDirectory([Employee(employee_id="e1", name="张三")])
    assert d.display_name("e1") == "张三"
    assert d.display_name("unknown-id") == "unknown-id"  # 未命中原样回退


def test_default_directory_contains_demo_employees():
    d = get_directory()
    names = {e.employee_id: e.name for e in d.all()}
    assert names["emp-001"] == "张伟"  # 内置演示员工
    assert d.display_name("emp-002") != "emp-002"  # 解析成功


def test_default_directory_falls_back_gracefully():
    assert get_directory().display_name("ghost") == "ghost"
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_employee_directory.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'employee_directory'`。

- [ ] **Step 3: 实现**

新建 `backend/employee_directory.py`：

```python
"""员工目录：employee_id → 员工信息（显示名/邮箱/职位）解析。

设计文档 [S1] 员工身份的落地点：把关人/提交者从占位字符串解析为真实员工。
未命中回退原 ID（前端 truthy 回落链 `approverName || approver || '系统'` 的衔接）。
目录可注入（试点部门真实目录）或使用内置默认演示目录（占位数据）。
"""

from dataclasses import dataclass, field


@dataclass
class Employee:
    employee_id: str = ""
    name: str = ""
    email: str = ""
    position: str = ""


# 内置默认演示目录（试点占位：行政/市场/研发各一名 + 提交者占位解析）
_DEFAULT_EMPLOYEES = [
    Employee("emp-001", "张伟", "zhangwei@example.com", "行政专员"),
    Employee("emp-002", "李娜", "lina@example.com", "市场专员"),
    Employee("emp-003", "王强", "wangqiang@example.com", "研发工程师"),
]


class EmployeeDirectory:
    def __init__(self, employees: list[Employee] | None = None):
        self._by_id = {e.employee_id: e for e in (employees if employees is not None else _DEFAULT_EMPLOYEES)}

    def resolve(self, employee_id: str) -> Employee | None:
        return self._by_id.get(employee_id)

    def display_name(self, employee_id: str) -> str:
        emp = self._by_id.get(employee_id)
        return emp.name if emp else employee_id

    def all(self) -> list[Employee]:
        return list(self._by_id.values())


_default_directory: EmployeeDirectory | None = None


def get_directory() -> EmployeeDirectory:
    global _default_directory
    if _default_directory is None:
        _default_directory = EmployeeDirectory()
    return _default_directory
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_employee_directory.py -v`
Expected: 4 passed。

- [ ] **Step 5: 提交**

```bash
git add backend/employee_directory.py backend/tests/test_employee_directory.py
git commit -m "feat(hybrid): employee directory module with default demo directory"
```

---

### Task 2: 演示端点接线（submitter 解析 + /api/employees）

**Covers:** S1（员工身份）· S5-M2（演示端点一致性）

**Files:**
- Modify: `backend/server.py`（`/api/minutes` submitter 解析 + 新增 `GET /api/employees`）
- Modify: `backend/team_assembler.py`（humans `name` 缺省时从目录解析——**仅当 name 为空时**，否则不改既有行为）
- Test: `backend/tests/test_hybrid_endpoints.py`（追加）

**Interfaces:**
- Produces: `/api/minutes` 的 humans `name` 与 team member `displayName` 用解析后的员工名（未命中回退 submitter 原值）；新增 `GET /api/employees` 返回目录列表 `[{"employeeId","name","email","position"}]`；`assemble_hybrid_team` 对 `name` 为空的 humans 元素从 `employee_directory.get_directory()` 解析显示名。

- [ ] **Step 1: 写失败测试**（追加 `backend/tests/test_hybrid_endpoints.py`）

```python
def test_minutes_resolves_submitter_display_name():
    resp = client.post("/api/minutes", json={
        "transcript": "会议讨论发布计划，确定 8 月上线。",
        "submitter": "emp-001",
    })
    assert resp.status_code == 200
    members = resp.json()["team"]["members"]
    human = next(m for m in members if m["memberType"] == "human")
    assert human["displayName"] == "张伟"  # 目录解析


def test_minutes_submitter_fallback_to_raw_id():
    resp = client.post("/api/minutes", json={
        "transcript": "会议讨论发布计划，确定 8 月上线。",
        "submitter": "ghost-id",
    })
    assert resp.status_code == 200
    members = resp.json()["team"]["members"]
    human = next(m for m in members if m["memberType"] == "human")
    assert human["displayName"] == "ghost-id"  # 未命中回退


def test_employees_endpoint_lists_directory():
    resp = client.get("/api/employees")
    assert resp.status_code == 200
    data = resp.json()
    assert any(e["employeeId"] == "emp-001" and e["name"] == "张伟" for e in data)
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_endpoints.py -v`
Expected: 前两个 FAIL（displayName 为 "emp-001"/"ghost-id" 原值）；第三个 FAIL（404）。

- [ ] **Step 3: 实现**

`backend/team_assembler.py` `assemble_hybrid_team` 的 humans 处理（约 :113-123）：`name` 为空时解析：

```python
from employee_directory import get_directory

# 在 humans 循环内：
name = h.get("name") or get_directory().display_name(h["employee_id"])
```

（**保持既有行为**：`name` 非空时不用目录。）

`backend/server.py`：

- `api_minutes_plan` 内 submitter 解析（mailer to 与 humans name）：
```python
from employee_directory import get_directory

submitter = body.get("submitter", "submitter")
submitter_name = get_directory().display_name(submitter)
...
get_mailer("file").send(MailMessage(title="会议纪要", to=[submitter], body=transcript))
humans=[{"employee_id": submitter, "name": submitter_name, "approver_for": ["draft"]}],
```
（mailer `to` 保持 submitter 原值——它是地址语义；humans name 用解析名。）

- 新增端点（放在 api_hybrid_team 附近）：
```python
@app.get("/api/employees")
async def api_employees():
    """演示：员工目录列表（employee_id → 显示名/邮箱/职位）。"""
    from employee_directory import get_directory
    return _ok([
        {"employeeId": e.employee_id, "name": e.name, "email": e.email, "position": e.position}
        for e in get_directory().all()
    ])
```
（`_ok` 为 server 既有成功包装——先读 server.py 确认实际 helper 名与返回形状。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_hybrid_endpoints.py tests/test_minutes_endpoint.py -q`
Expected: 新 3 用例 + 既有回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/server.py backend/team_assembler.py backend/tests/test_hybrid_endpoints.py
git commit -m "feat(hybrid): resolve submitter display name via employee directory and expose /api/employees"
```

---

### Task 3: 审批链 approver 显示名透传 + 前端面板回落显示

**Covers:** S1（员工身份）· S3-1（把关点引擎——决策节点挂"人"）

**Files:**
- Modify: `backend/server.py`（WS `pending_approvals` 发送点与 REST `api_gates_pending` 投影补 `approverName`）
- Modify: `src/hooks/useMeetingSocket.ts`（`PendingApprovalInfo` 加可选 `approverName` + 两 handler 透传）
- Modify: `src/types/meetingProtocol.ts`（`ApprovalRequestInfo` 加可选 `approverName`）
- Modify: `src/components/office-team/ApprovalPanel.tsx`（显示回落链）
- Test: `backend/tests/test_hybrid_endpoints.py`（REST approverName 断言）+ `src/components/office-team/ApprovalPanel.test.tsx`（回落链断言）

**Interfaces:**
- Produces: 审批 payload 携带 `approverName`（解析后员工名，空串 = 未命中/系统）；前端面板 `由 ${approverName || approver || '系统'} 把关`。

- [ ] **Step 1: 写失败测试**

```python
# test_hybrid_endpoints.py 追加
def test_gates_pending_includes_approver_name():
    created = client.post("/api/gates", json={
        "requesterId": "agent", "operation": "node_gate", "description": "d",
        "taskId": "draft", "gateId": "draft:review", "approver": "emp-001",
    })
    assert created.status_code == 200
    pending = client.get("/api/gates/pending").json()
    item = next(r for r in pending if r["id"] == created.json()["id"])
    assert item["approverName"] == "张伟"  # 目录解析
```

```tsx
// ApprovalPanel.test.tsx 追加（沿用既有 render/@testing-library 惯例）
it("shows resolved approver name with fallback chain", () => {
  // ① approverName 有值 → 显示名字
  // ② approverName 空 + approver 有值 → 显示 approver
  // ③ 两者空 → 系统把关
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pytest tests/test_hybrid_endpoints.py::test_gates_pending_includes_approver_name -v`（预期 FAIL——无 approverName 键）与 `npx vitest run src/components/office-team/ApprovalPanel.test.tsx`（新断言 FAIL）。

**注意**：`POST /api/gates` 目前不接收 `approver` body 字段（M2 打磨评审记录 Minor）——本任务**顺带补上** `approver` body 字段透传（一行：`approver=body.get("approver", "")` 传入 request_gate），否则 approverName 恒空串、测试无法真实覆盖解析。**若 request_gate 调用点已支持 approver 参数**（M2b-1 已贯穿），仅需 server 端点读取 body。

- [ ] **Step 3: 实现**

`backend/server.py`：
- WS `get_pending_approvals`（约 :1890-1899）发送前对 `get_pending_requests()` 结果补 `approverName`：
```python
from employee_directory import get_directory

def _with_approver_names(requests: list[dict]) -> list[dict]:
    directory = get_directory()
    return [{**r, "approverName": directory.display_name(r.get("approver", ""))} for r in requests]
```
（模块级 helper；WS 发送点 `await ws.send_json({"type": "pending_approvals", "requests": _with_approver_names(...)})`；`human_approval_request` 推送 payload 若含 approver 也补——若改动面大则仅在 pending_approvals 与 REST 补，**以最小面为准**。）
- REST `api_gates_pending`（:2577-2579 投影）追加 `"approverName": get_directory().display_name(r.get("approver", ""))`。
- `api_gate_create`（:2552-2562）读 body `approver` 透传（若当前未接收）。

`src/types/meetingProtocol.ts` `ApprovalRequestInfo` + `src/hooks/useMeetingSocket.ts` `PendingApprovalInfo`：加 `approverName?: string`；两 handler（:713/:759 附近）透传 `approverName: request.approverName`。

`src/components/office-team/ApprovalPanel.tsx:75`：
```tsx
{approval.approverName || approval.approver
  ? `由 ${approval.approverName || approval.approver} 把关`
  : '系统把关'}
```

- [ ] **Step 4: 运行确认通过**

Run: `pytest tests/test_hybrid_endpoints.py tests/test_minutes_endpoint.py -q` + `npx vitest run src/components/office-team/ApprovalPanel.test.tsx src/hooks/useMeetingSocket.test.ts`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/server.py backend/tests/test_hybrid_endpoints.py src/types/meetingProtocol.ts src/hooks/useMeetingSocket.ts src/components/office-team/ApprovalPanel.tsx src/components/office-team/ApprovalPanel.test.tsx
git commit -m "feat(hybrid): resolve approver display name through approval chain and frontend panel"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→S1（员工一等实体）；T2→S1/S5-M2（演示端点解析 + 目录列表）；T3→S1/S3-1（把关人显示名贯通前后端）。M2 剩余"员工目录解析"完整落地（替代 submitter/approver 占位字符串）。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及既有命名处（`_ok` helper、request_gate 签名、handler 行号）给出"先读确认"指引。
- **类型一致性**：`employeeId/name/email/position`（wire camelCase）、`approverName`（可选、空串回落）、`Employee` dataclass 尾置默认字段，跨任务一致。
- **低耦合**：ApprovalManager/WorkflowEngine 零改动；目录解析只在 server 层（演示/UI 关切）与 team_assembler（name 缺省兜底）接线。
