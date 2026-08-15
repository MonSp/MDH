# [T26] OfficeTeamMode 未解构引用修复 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 T26 预存在缺陷——`src/components/OfficeTeamMode.tsx` 引用 `meetingPhase`/`meetingStartTime`/`deleteTask` 但未从 `useMeetingSocket` 解构（TS2304，office/meeting 渲染分支的潜在运行时 `ReferenceError`）。

**Motivation（现状取证）**：`useMeetingSocket` 返回值对象**含**这三项（useMeetingSocket.ts:1123-1125）；`OfficeTeamMode.tsx:210/211/272/337` 在 JSX 中使用它们（MeetingRoomView 渲染分支），但组件解构清单（:57-95）缺这三名——tsc --noEmit 报 5× TS2304。vitest 不捕获（esbuild 不 typecheck，默认 tower 视图不渲染该分支）。

**Architecture:** 纯前端一行式修复：解构清单补三个名字（hook 已返回，行为即恢复）。无后端、无数据流改动。

**Tech Stack:** TypeScript · Vitest 3.2.4

## Global Constraints

- **验证**：`npx tsc --noEmit` 后 `src/components/OfficeTeamMode.tsx` 不再报 TS2304（该文件 0 新增错误；全仓 662 预存在错误为已知基线，仅需确认本文件三个名字的错误消失）；`npx vitest run src/components/__tests__/OfficeTeamMode.approval.test.tsx src/__tests__/useMeetingSocket.test.ts src/components/office-team/ApprovalPanel.test.tsx` 全绿（54）。
- **不要动**：hook 返回值、JSX 引用、styles、其它文件。
- **提交纪律**：git add 只加本任务文件；package-lock.json modified 为已知 churn。
- **已知基线**：后端 `tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）。

---

### Task 1: OfficeTeamMode 解构补三名字

**Covers:** 前端类型正确性（消除潜在运行时 ReferenceError）

**Files:**
- Modify: `src/components/OfficeTeamMode.tsx`（解构清单补三名字）

- [ ] **Step 1: 验证当前失败状态**

Run: `npx tsc --noEmit 2>&1 | grep "OfficeTeamMode" | head -8`
Expected: 5× TS2304（`meetingPhase` ×3、`meetingStartTime` ×1、`deleteTask` ×1——以实际为准）。

- [ ] **Step 2: 实现**

读 `src/components/OfficeTeamMode.tsx` 的 useMeetingSocket 解构清单（约 :57-95），在合适位置补三名字（与 hook 返回顺序/组件语义一致，如放在审批或检查点附近）：

```tsx
    meetingPhase,
    meetingStartTime,
    deleteTask,
```

- [ ] **Step 3: 验证通过**

Run: `npx tsc --noEmit 2>&1 | grep "OfficeTeamMode" | head -8`（预期无输出——该文件 TS2304 消失）与 `npx vitest run src/components/__tests__/OfficeTeamMode.approval.test.tsx src/__tests__/useMeetingSocket.test.ts src/components/office-team/ApprovalPanel.test.tsx`（预期 54 passed）。

- [ ] **Step 4: 提交**

```bash
git add src/components/OfficeTeamMode.tsx
git commit -m "fix(hybrid): destructure meetingPhase/meetingStartTime/deleteTask in office panel"
```

---

## Self-Review 结论

- **Spec 覆盖**：T26 缺陷消除（hook 返回三值已确认，补解构即恢复行为；office/meeting 渲染分支不再潜在 ReferenceError）。
- **无占位符**：验证命令与预期输出明确。
- **类型一致性**：解构名与 hook 返回值逐字一致（useMeetingSocket.ts:1123-1125）。
