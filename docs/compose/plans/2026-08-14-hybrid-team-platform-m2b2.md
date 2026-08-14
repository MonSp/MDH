# [M2b-2] 人+agent 混合团队平台 · 把关 UI（前后端接线）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 M2 里程碑的**把关 UI 前后端接线**（设计文档 `docs/compose/specs/2026-08-14-hybrid-team-platform-design.md` 的 M2"把关 UI"验收）：把关请求的 `approver/taskId/gateId` 上下文贯通后端 → WS → 前端面板，让员工在审批面板看到"谁把关、哪个任务"并完成决定闭环。

**Architecture:** 三任务前后端配合：(1) 后端 `ApprovalManager.get_pending_requests()` 输出补 `taskId/gateId`（`approver` 已在 M2b-1 T3 补齐）——一处修改同时喂 WS `pending_approvals` 与 REST `/api/gates/pending` 两条路径；(2) 前端 `meetingProtocol.ts`/`useMeetingSocket.ts` 消息类型与状态透传三字段（可选字段向后兼容）；(3) `ApprovalPanel` 渲染 gate 上下文（approver 徽章 + task/gate 标签）+ 新增组件测试（用 `react-dom/client` + `act`，零新依赖）。

**Tech Stack:** Python 3.11 · React 18 + TypeScript + Vite · vitest（jsdom）+ pytest 9.1.1（asyncio_mode=auto）

## Global Constraints

- **后端测试**：`/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（工作目录 `backend/`）。
- **前端测试**：在 worktree 内 `npx vitest run <file>`（**首个任务前需在 worktree 执行 `npm ci`**——worktree 无 node_modules；测试入口按 `vitest.config.ts` include `src/**/*.test.ts`）。不用主仓库 node_modules 解析 worktree 源码。
- **零新依赖**：前端组件测试用 `react-dom/client` + `react-dom/test-utils`（act）——**不得向 package.json 添加 @testing-library**（先 grep 确认未预装；已预装则可复用既有模式）；后端不新增包。
- **代码风格**：前端 TS 类型加可选字段（`taskId?: string` 等，向后兼容）；后端 snake_case 内部、camelCase wire（`taskId`/`gateId`/`approver`）。
- **不要动**：`OfficeTeamMode.tsx` 的挂载与 `useApproval` 队列语义（onApprove/onReject → sendApprovalResponse 既有链路不动）；`meeting_coordinator.py` 审批调用点；`get_pending_requests` 既有键（只追加，不删除）。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；既有 churn（package-lock.json、skill_packs/*/system_prompt.md 等）绝不提交。
- **已知基线**：`test_skill_packs_structure.py` 为 PRE-EXISTING（勿处理）；`test_performance.py` 为 flaky；前端基线 1632 passed（M2b-2 前）。

---

### Task 1: 后端 pending 输出补全 taskId/gateId

**Covers:** S3-1（把关点引擎数据完整性）、S2-4

**Files:**
- Modify: `backend/approval_manager.py`（`get_pending_requests` :280-294）
- Test: `backend/tests/test_gate_engine.py`（追加）

**Interfaces:**
- Consumes: `PendingApproval.task_id`/`gate_id`（M1 交付）。
- Produces: `get_pending_requests()` 返回 dict 追加 `taskId`/`gateId` 键（既有键 id/requesterId/operation/description/riskLevel/confidence/status/createdAt/approver 不变）；WS `pending_approvals` 与 REST `/api/gates/pending` 自动获得新字段（两端点均消费该函数）。Task 2/3 前端透传与展示依赖。

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_gate_engine.py`）

```python
async def test_pending_requests_include_task_gate_and_approver():
    manager = ApprovalManager()
    await manager.request_gate(
        requester_id="a", operation="op", description="d",
        task_id="task-1", gate_id="gate-1", approver="emp-1",
    )
    pending = manager.get_pending_requests()
    assert len(pending) == 1
    assert pending[0]["taskId"] == "task-1"
    assert pending[0]["gateId"] == "gate-1"
    assert pending[0]["approver"] == "emp-1"
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_gate_engine.py -v`
Expected: FAIL——`KeyError: 'taskId'`（当前输出无 taskId/gateId）。

- [ ] **Step 3: 实现**

读 `backend/approval_manager.py` 的 `get_pending_requests`（:280-294，返回 dict 列表），在返回 dict 内追加（与 approver 同层）：

```python
            "taskId": a.task_id,
            "gateId": a.gate_id,
```

（`a` 为 `PendingApproval` 实例；保持既有键不变，仅追加。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_gate_engine.py tests/test_node_gate_hook.py tests/test_minutes_endpoint.py -q`
Expected: 新用例 + 既有回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/approval_manager.py backend/tests/test_gate_engine.py
git commit -m "feat(hybrid): expose taskId and gateId in pending approval requests"
```

---

### Task 2: 前端消息类型与 WS 状态透传（taskId/gateId/approver）

**Covers:** S2-4（员工把关）、S5-M2

**Files:**
- Modify: `src/modules/meetingProtocol.ts`（`ApprovalRequestInfo` :122-131）
- Modify: `src/hooks/useMeetingSocket.ts`（`PendingApprovalInfo` :130-139 + handlers :692-755）
- Test: `src/__tests__/useMeetingSocket.test.ts`（追加，先读该文件 L530-685 既有审批断言模式）

**Interfaces:**
- Consumes: Task 1 的 WS payload（`pending_approvals` 与 `human_approval_request` 的 request dict 现含 taskId/gateId/approver）。
- Produces: `ApprovalRequestInfo`/`PendingApprovalInfo` 加可选 `taskId?: string; gateId?: string; approver?: string`；`useMeetingSocket` 的 `pendingApprovals` Map 条目携带三字段（handlers 原样透传）。

- [ ] **Step 1: 写失败测试**（追加到 `src/__tests__/useMeetingSocket.test.ts`，仿 L595-637 status 透传用例模式）

```tsx
it("透传 taskId/gateId/approver 到 pending 状态", async () => {
  const { result } = setupHook()
  emitMsg({
    type: "human_approval_request",
    request: {
      id: "req-9",
      requesterId: "agent-minutes",
      operation: "node_gate",
      description: "纪要待确认",
      riskLevel: "medium",
      confidence: 0.8,
      status: "pending",
      createdAt: 123,
      taskId: "draft",
      gateId: "draft:review",
      approver: "emp-1",
    },
  })
  const pending = result.current.pendingApprovals.get("req-9")
  expect(pending?.taskId).toBe("draft")
  expect(pending?.gateId).toBe("draft:review")
  expect(pending?.approver).toBe("emp-1")
})
```

（先读 useMeetingSocket.test.ts 的 `setupHook`/`emitMsg` helper 与 `pendingApprovals` 状态访问方式，按既有模式写。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/useMeetingSocket.test.ts -t "透传"`（worktree 内；如未 npm ci 先执行 `npm ci`）
Expected: FAIL——类型/断言不通过（字段不存在为 undefined）。

- [ ] **Step 3: 实现**

`src/modules/meetingProtocol.ts` `ApprovalRequestInfo`（:122-131）追加可选字段：

```ts
  taskId?: string
  gateId?: string
  approver?: string
```

`src/hooks/useMeetingSocket.ts` `PendingApprovalInfo`（:130-139）追加同三字段（可选）；`human_approval_request` handler（:692-718）与 `pending_approvals` handler（:735-755）把 request dict 的新字段存入 Map 条目（原样透传，无字段时 undefined）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/useMeetingSocket.test.ts`
Expected: 新用例 + 既有审批用例（含 status 透传、响应删除）全绿（既有总数 1632 基线不变或 +1）。

- [ ] **Step 5: 提交**

```bash
git add src/modules/meetingProtocol.ts src/hooks/useMeetingSocket.ts src/__tests__/useMeetingSocket.test.ts
git commit -m "feat(hybrid): thread gate approver/task/gate fields through approval ws state"
```

---

### Task 3: ApprovalPanel gate 上下文展示 + 组件测试

**Covers:** S5-M2（把关 UI）、S2-4

**Files:**
- Modify: `src/components/office-team/ApprovalPanel.tsx`（本地类型 :3-11 + 渲染 :59-97）
- Test: `src/components/office-team/ApprovalPanel.test.tsx`（新建——**先 grep 确认 @testing-library/react 是否已装**；未装则用 `react-dom/client` + `act`，零新依赖）

**Interfaces:**
- Consumes: Task 2 的 `PendingApprovalInfo`（经 useMeetingSocket → OfficeTeamMode → ApprovalPanel props）。
- Produces: ApprovalPanel 卡片显示 gate 上下文——approver 徽章（"由 {approver} 把关"，无 approver 显示"系统把关"）+ taskId/gateId 标签（有则显示）；既有 approve/reject 行为不变（onApprove(id, reason)）。

- [ ] **Step 1: 写失败测试**（新建 `src/components/office-team/ApprovalPanel.test.tsx`）

```tsx
import { act } from "react-dom/test-utils"
import { createRoot } from "react-dom/client"
import ApprovalPanel from "./ApprovalPanel"

function renderPanel(props: Parameters<typeof ApprovalPanel>[0]) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<ApprovalPanel {...props} />))
  return { host, unmount: () => act(() => root.unmount()) }
}

it("展示 gate 把关人、任务与把关点", () => {
  const pending = new Map([["req-1", {
    id: "req-1", requesterId: "agent-minutes", operation: "node_gate",
    description: "纪要待确认", riskLevel: "medium", confidence: 0.8,
    createdAt: 123, status: "pending",
    taskId: "draft", gateId: "draft:review", approver: "emp-1",
  }]])
  const { host, unmount } = renderPanel({ pendingApprovals: pending, onApprove: () => {}, onReject: () => {} })
  expect(host.textContent).toContain("emp-1")
  expect(host.textContent).toContain("draft")
  expect(host.textContent).toContain("draft:review")
  unmount()
})

it("无 approver 时显示系统把关", () => {
  const pending = new Map([["req-2", {
    id: "req-2", requesterId: "a", operation: "op", description: "d",
    riskLevel: "low", confidence: 0.5, createdAt: 1,
  }]])
  const { host, unmount } = renderPanel({ pendingApprovals: pending, onApprove: () => {}, onReject: () => {} })
  expect(host.textContent).toContain("系统把关")
  unmount()
})
```

（以实际组件签名/导入为准——先读 ApprovalPanel.tsx；若 @testing-library/react 已装，用 `render`/`screen` 更简洁。断言语义必须保留：approver/task/gate 可见、无 approver 回落。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/office-team/ApprovalPanel.test.tsx`
Expected: FAIL——approver/taskId 文本未渲染。

- [ ] **Step 3: 实现**

`src/components/office-team/ApprovalPanel.tsx`：本地 `PendingApproval` 类型（:3-11）追加可选 `taskId?/gateId?/approver?`；卡片区（:59-97）在 requesterId 行附近渲染：approver 徽章 `{p.approver ? `由 ${p.approver} 把关` : "系统把关"}`；`p.taskId`/`p.gateId` 有值时渲染小标签。既有 riskBadge/description/置信度/理由输入/批准拒绝按钮不变。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/office-team/ApprovalPanel.test.tsx src/__tests__/useMeetingSocket.test.ts`
Expected: 新组件测试 + 既有 hook 测试全绿。

- [ ] **Step 5: 提交**

```bash
git add src/components/office-team/ApprovalPanel.tsx src/components/office-team/ApprovalPanel.test.tsx
git commit -m "feat(hybrid): approval panel shows gate approver, task and gate context"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→S3-1/S2-4（pending 数据完整性）；T2→S2-4/S5-M2（WS 透传）；T3→S5-M2/S2-4（把关 UI 展示）。M2"把关 UI"验收达成；真实模型执行链路（试点）与员工目录解析（M2b-2 后续或另立）不在本计划。
- **无占位符**：全部步骤含可运行代码与预期输出；前端测试涉及"以既有模式为准"处均给出具体位置与目标行为。
- **类型一致性**：`taskId/gateId/approver` 三字段在后端 pending dict（camelCase）、WS payload、`PendingApprovalInfo`/`ApprovalRequestInfo`（可选）、ApprovalPanel 展示四层一致；`get_pending_requests` 既有键不变（只追加）。
