# [T23] 审批推送 approverName 闭环 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭 T23（员工目录解析评审 Important 观察）——live UI 把关人显示名闭环：审批请求推送（`human_approval_request`）即时携带解析后的 `approverName`（后端发送点注入），并在办公团队面板挂载时拉取已富化的 `pending_approvals` 兜底（覆盖无推送路径与历史项）。

**Motivation（现状取证）**：`approval_manager.request_approval`（approval_manager.py:104-119）构造的 `human_approval_request` payload 含 `approver`（原始 ID）但无 `approverName`；node gate 路径经 `_build_approval_send_fn`（meeting_coordinator.py:69-76）→ `CeoAgent._send_fn`（ceo_agent.py:195-199，`delta=="approval" and isinstance(text, dict)` 直接透传）→ ws.send_json；WS `request_approval` handler（server.py:1908-1930）不传 send_fn（无推送，需前端拉取）。前端 `getPendingApprovals`（useMeetingSocket.ts:1035-1036）已定义但 `OfficeTeamMode`（:64 解构）未调用——`pending_approvals` 通道（T3 已富化 `_with_approver_names`）只有客户端拉取才送达。

**Architecture:** 保持 T3 的低耦合边界（ApprovalManager 零改动）：后端在**发送包装点**（`CeoAgent._send_fn` approval 分支）注入 `request.approverName`（`employee_directory.get_directory().display_name`）；前端在 `OfficeTeamMode` 挂载时调用一次 `getPendingApprovals()` 拉取兜底。两条路径互为补充：推送即时显示解析名，拉取覆盖无推送/历史项。

**Tech Stack:** Python 3.11 · pytest 9.1.1 · TypeScript/Vitest 3.2.4 · @testing-library/react

## Global Constraints

- **测试环境**：后端 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）；前端 `npx vitest run <file>`（worktree 根）。
- **零新依赖**：前后端均零新包。
- **不要动**：`ApprovalManager`（含 request_approval/request_gate payload 构造）、`_build_approval_send_fn` 契约、前端既有 UI 结构。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；package-lock.json modified 为已知 churn（git add 具体路径）；worktree 前端 `npm install --no-audit --no-fund --legacy-peer-deps --ignore-scripts`（`npm ci` 必失败）。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）；`test_performance.py` flaky。

---

### Task 1: 后端审批推送注入 approverName（ceo_agent._send_fn）

**Covers:** S3-1（把关点引擎——决策节点挂人，把关人显示名即时推送）

**Files:**
- Modify: `backend/ceo_agent.py`（`_create_send_fn` 内 approval 分支，约 :195-199）
- Test: `backend/tests/test_ceo_send_fn_approver_name.py`（新建）

**Interfaces:**
- Produces: `CeoAgent._create_send_fn(send_message)` 返回的 `send` 闭包在 `delta=="approval" and isinstance(text, dict)` 分支透传前，向 `text["request"]`（dict）注入 `approverName = get_directory().display_name(request.get("approver", ""))`——approver 为空/未命中时注入回退值（原 ID 或 ""，与 display_name 语义一致）；不改变非 approval 分支。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_ceo_send_fn_approver_name.py`）

```python
import asyncio

from ceo_agent import CeoAgent


def _make_agent(collector):
    agent = CeoAgent.__new__(CeoAgent)

    class FakeSession:
        def __init__(self):
            self._seq = 0

        def next_sequence(self):
            self._seq += 1
            return self._seq

    agent._session = FakeSession()
    send = agent._create_send_fn(collector)
    return send


def test_approval_push_injects_approver_name():
    sent = {}

    async def collector(payload):
        sent["payload"] = payload

    send = _make_agent(collector)
    asyncio.run(send("coordinator", {
        "type": "human_approval_request",
        "request": {"id": "r1", "approver": "emp-001", "operation": "node_gate"},
    }, "approval"))

    request = sent["payload"]["request"]
    assert request["approverName"] == "张伟"  # 目录解析


def test_approval_push_no_approver_keeps_empty_name():
    sent = {}

    async def collector(payload):
        sent["payload"] = payload

    send = _make_agent(collector)
    asyncio.run(send("coordinator", {
        "type": "human_approval_request",
        "request": {"id": "r2", "operation": "node_gate"},
    }, "approval"))

    assert sent["payload"]["request"]["approverName"] == ""  # 空 approver → 空串


def test_approval_push_unknown_approver_falls_back_to_raw_id():
    sent = {}

    async def collector(payload):
        sent["payload"] = payload

    send = _make_agent(collector)
    asyncio.run(send("coordinator", {
        "type": "human_approval_request",
        "request": {"id": "r3", "approver": "ghost-id", "operation": "node_gate"},
    }, "approval"))

    assert sent["payload"]["request"]["approverName"] == "ghost-id"  # 未命中回退原 ID
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_ceo_send_fn_approver_name.py -v`
Expected: 三个 FAIL——`KeyError: 'approverName'`（当前透传不注入）。

- [ ] **Step 3: 实现**

读 `backend/ceo_agent.py` `_create_send_fn`（约 :185-215）的 approval 分支（:195-199）：

```python
            if delta == "approval" and isinstance(text, dict):
                payload = dict(text)
                request = payload.get("request")
                if isinstance(request, dict) and "approverName" not in request:
                    from employee_directory import get_directory
                    request = dict(request)
                    request["approverName"] = get_directory().display_name(request.get("approver", ""))
                    payload["request"] = request
                payload.setdefault("sequence_no", self._session.next_sequence())
                await send_message(payload)
                return
```

（保持既有透传语义：非 approval 分支与透传键零改动；`"approverName" not in request` 防重复注入。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_ceo_send_fn_approver_name.py tests/test_meeting_coordinator.py -q`
Expected: 3 新用例 + 既有回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/ceo_agent.py backend/tests/test_ceo_send_fn_approver_name.py
git commit -m "feat(hybrid): inject approver display name into approval push at send wrapper"
```

---

### Task 2: 前端办公面板挂载拉取 pending_approvals（getPendingApprovals 接线）

**Covers:** S3-1（把关点引擎——live UI 把关人显示名兜底通道）

**Files:**
- Modify: `src/components/OfficeTeamMode.tsx`（挂载时调用 `getPendingApprovals()`）
- Test: `src/components/__tests__/OfficeTeamMode.approval.test.tsx`（新建，mock useMeetingSocket）

**Interfaces:**
- Produces: `OfficeTeamMode` 挂载时（既有 useEffect 内或新增 effect）调用一次 `getPendingApprovals()`——服务端回已富化 `pending_approvals`（`_with_approver_names`），覆盖无推送路径（WS request_approval）与历史 pending；不改变 ApprovalPanel 渲染逻辑。

- [ ] **Step 1: 写失败测试**（新建 `src/components/__tests__/OfficeTeamMode.approval.test.tsx`）

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getPendingApprovals = vi.fn()
const useMeetingSocketMock = vi.fn(() => ({
  pendingApprovals: new Map(),
  getPendingApprovals,
  // useMeetingSocket 其余返回值：按组件实际解构补最小 stub（读组件解构清单，缺失项给空/哑值）
  agents: [], tasks: [], chatMessages: [], isMeetingActive: false, lastWorkflow: null,
  agendaState: null, workspace: null, toolCallLogs: [], clearWorkflow: vi.fn(),
  startMeeting: vi.fn(), sendMeetingMessage: vi.fn(), endMeeting: vi.fn(),
  sendAgendaAction: vi.fn(), sendToolCall: vi.fn(), sendWorkspaceAction: vi.fn(),
  activeProposal: null, votes: [], voteResults: null, createProposal: vi.fn(),
  castVote: vi.fn(), evaluateConsensus: vi.fn(), clearVotes: vi.fn(),
  sendApprovalResponse: vi.fn(),
  // 检查点/审计/迭代 等其余返回值按需 stub
  checkpoints: [], restoredState: null, saveCheckpoint: vi.fn(), restoreCheckpoint: vi.fn(),
  getCheckpoints: vi.fn(), deleteCheckpoint: vi.fn(), clearRestoredState: vi.fn(),
  auditLog: [], getAuditLog: vi.fn(), maxIterations: 3, setMaxIterations: vi.fn(),
  adjustAgentWeight: vi.fn(),
}))

vi.mock('../hooks/useMeetingSocket', () => ({ default: useMeetingSocketMock }))

describe('OfficeTeamMode 审批拉取', () => {
  beforeEach(() => {
    getPendingApprovals.mockClear()
  })

  it('挂载时调用 getPendingApprovals 拉取已富化审批列表', () => {
    render(<OfficeTeamMode wsRef={{ current: null }} onBackToSingle={() => {}} />)
    expect(getPendingApprovals).toHaveBeenCalled()
  })
})
```

（**实现者注意**：mock 的 stub 需覆盖组件实际解构的全部 useMeetingSocket 返回值——先读 OfficeTeamMode.tsx:57-95 解构清单补齐；若组件渲染依赖其它 props（pendingApprovalCount/onOpenApproval）也一并给默认值。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/__tests__/OfficeTeamMode.approval.test.tsx`
Expected: FAIL——`expect(getPendingApprovals).toHaveBeenCalled()` 未调用（当前未接线）。

- [ ] **Step 3: 实现**

读 `src/components/OfficeTeamMode.tsx` 的既有 `useEffect`（:161 附近）或新增 effect：

```tsx
  useEffect(() => {
    getPendingApprovals()
  }, [getPendingApprovals])
```

（若 :161 既有 effect 合适也可并入——以读代码后最小改动为准；注意 `getPendingApprovals` 是 useCallback 稳定引用，effect 依赖安全。）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/__tests__/OfficeTeamMode.approval.test.tsx src/__tests__/useMeetingSocket.test.ts src/components/office-team/ApprovalPanel.test.tsx`
Expected: 新用例 + 既有 53 用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/components/OfficeTeamMode.tsx src/components/__tests__/OfficeTeamMode.approval.test.tsx
git commit -m "feat(hybrid): pull enriched pending approvals on office panel mount"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→S3-1（把关人显示名即时推送）；T2→S3-1（live UI 兜底拉取）。T23 完整闭环——推送路径注入 + 拉取路径兜底，前端回落链（`approverName || approver || '系统'`）最终兜底。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及组件解构清单/既有 effect 处以"先读代码"指引。
- **类型一致性**：`approverName`（可选、空串回落）与 T3 契约一致；`get_directory().display_name` 同源解析。
- **低耦合**：ApprovalManager/`_build_approval_send_fn` 契约零改动；后端注入在发送包装点（UI 关切层），前端拉取复用已富化通道。
