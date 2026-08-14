# P2 残余补完计划（failover 消费点扩展 / 持久化异步锁）

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 补齐 P2 阶段"刻意保留"的两项未完成项：① failover 机制扩展到全部 `_get_model` 消费点；② `persist_execution` per-execution 异步锁串行化并发落盘。使 P2 无任何保留项。

**Architecture:** ① 把 `_mark_model_failed` 的触发机制从"仅 `_execute_workflow_node` 执行路径"下沉为可复用辅助——`MeetingCoordinator._call_model(model, role, prompt)` 统一包装（try/except → `_mark_model_failed(role)` → 返回文本/抛错），改造 decompose_task、handle_critical_blocker、semantic 相关调用；ReviewPipeline 增加 `on_model_error` 回调（构造注入），reviewer/monitor/coordinator 三个 LLM 调用点 except 时回调。② `WorkflowEngine.persist_execution` 改 async + `self._persist_locks: Dict[str, asyncio.Lock]`（per-execution），6 个调用点中 5 个 async 改 `await persist_execution`，create_workflow（同步）走内部 `_persist_execution_sync`（创建时独占无需锁）。

**Tech Stack:** Python 3.11（backend，`/usr/bin/python3` + pytest）

## Global Constraints

- backend：`cd backend && /usr/bin/python3 -m pytest tests/<file> -q`（不加 `--timeout`）；全量 `tests/ -q`
- 不引入新依赖；不改 mock-sso；`backend/companion_log.json` 勿提交
- 基线（main@6630450）：backend 948 passed / 1 skipped；worktree 缺未跟踪技能文件时另有 1 PRE-EXISTING 失败
- 行号以实际代码为准

---

### Task 1: failover 扩展到全部 _get_model 消费点

**Covers:** P2-T4 复审 I2（未接线消费点）

**Files:**
- Modify: `backend/meeting_coordinator.py`（新增 `_call_model` 统一辅助 + decompose_task/handle_critical_blocker 改造；构造 ReviewPipeline 时传 `on_model_error`）
- Modify: `backend/review_pipeline.py`（`ReviewPipeline.__init__` 加 `on_model_error`；reviewer/monitor/coordinator 三个 LLM 调用点 except 时回调）
- Test: `backend/tests/test_review_pipeline.py`、`backend/tests/test_meeting_coordinator_router.py`

**Interfaces:**
- Consumes: `_mark_model_failed(role)`（meeting_coordinator.py:428-434）、`ReviewPipeline.__init__`（review_pipeline.py:34-40）、`_reviewer_review/_monitor_evaluate/_coordinator_summarize` 的 except 分支
- Produces: `MeetingCoordinator._call_model(model, role, prompt, fallback: str = "") -> str`（`await model.reply(Msg(...))` 包 try/except → `_mark_model_failed(role)` + warning → 抛错（调用方兜底）或返回 fallback——以现有各调用点 fallback 语义为准，统一为"回调标记 + re-raise，调用方保留原 fallback"）；`ReviewPipeline.__init__(..., on_model_error: Optional[Callable[[AgentRole], None]] = None)`；三个 LLM 调用点 except 时 `if self._on_model_error: self._on_model_error(AgentRole.REVIEWER/MONITOR/COORDINATOR)`

- [x] **Step 1: 写失败测试**
  - `test_review_pipeline.py`：构造 pipeline 带 `on_model_error` spy；`_reviewer_review` 的 model.reply 抛异常 → spy 被调（role=REVIEWER）且 fallback 文本返回（现有 fallback 行为保持）；monitor/coordinator 同理（可参数化或单测 reviewer 加 monitor）。
  - `test_meeting_coordinator_router.py`：`decompose_task` 的 model.reply 抛异常 → `_mark_model_failed` 被调（mock 或 spy 现有 `_models` 驱逐断言）；`handle_critical_blocker` 同理。
- [x] **Step 2: 运行确认失败**：`on_model_error` 参数不存在 / 消费点未回调。
- [x] **Step 3: 实现**
  3a. `meeting_coordinator.py` 新增 `_call_model`（或就地改造 decompose_task :437-451 / handle_critical_blocker :730-741 的 model.reply except 加 `self._mark_model_failed(role)`——先读两处实际代码，若结构简单则就地加，避免新抽象；若多处重复则抽 `_call_model`）。
  3b. `review_pipeline.py`：`__init__` 加 `on_model_error`；`_reviewer_review`（:146-170）/`_monitor_evaluate`（:187-210）/`_coordinator_summarize`（:228-250）的 `except Exception` 分支在构造 fallback 前调 `self._on_model_error(AgentRole.REVIEWER/MONITOR/COORDINATOR)`（AgentRole 已 import）。
  3c. `meeting_coordinator.py` 构造 ReviewPipeline 处（:154-158）传 `on_model_error=self._mark_model_failed`。
- [x] **Step 4: 验证**：`cd backend && /usr/bin/python3 -m pytest tests/test_review_pipeline.py tests/test_meeting_coordinator_router.py -q`；全量 `tests/ -q`（948 不回归）。
- [x] **Step 5: 提交**：`git add backend/meeting_coordinator.py backend/review_pipeline.py backend/tests/ && git commit -m "feat(resilience): extend model failover to all LLM consumers"`

---

### Task 2: persist_execution per-execution 异步锁

**Covers:** P2-T1 复审并发竞态（last-writer-wins）

**Files:**
- Modify: `backend/workflow_engine.py`（`persist_execution` async + `_persist_locks`；调用点调整）
- Test: `backend/tests/test_durable_execution.py`

**Interfaces:**
- Consumes: `persist_execution`（workflow_engine.py:125-146，同步原子写）、6 个调用点（create_workflow :109 同步；_execute_node 完成/失败、execute_workflow 终态/Cancelled/Exception、pause、cancel 均 async）
- Produces: `async def persist_execution(execution_id) -> bool`（内部 `lock = self._persist_locks.setdefault(execution_id, asyncio.Lock()); async with lock:` 包 `_persist_execution_sync`）；`_persist_execution_sync(execution_id) -> bool`（原原子写逻辑）；`create_workflow` 保持同步并调 `_persist_execution_sync`（创建时独占，无需锁）；其余 5 个 async 调用点改 `await self.persist_execution(...)`；`self._persist_locks` 在 `__init__` 初始化

- [x] **Step 1: 写失败测试**（test_durable_execution.py 追加）：
  - `test_persist_execution_is_async_locked`：模拟并发节点完成（两个 task 同时 `await persist_execution`）→ 两次都成功、最终落盘含两节点状态、`_persist_locks` 无泄漏（execution 完成后清理——若加清理则断言；或保留条目仅当再次落盘复用）；
  - 现有 `test_execution_persisted_to_disk` 等（直接调 persist_execution 处）需改为 `await`——检查现有测试中直接调 `persist_execution(` 的用例并同步改。
- [x] **Step 2: 运行确认失败**：`persist_execution` 现为同步方法（`TypeError: 'bool' object is not awaitable` 或调用点未 await）。
- [x] **Step 3: 实现**：按 Interfaces；`create_workflow` 的落盘保持同步 `_persist_execution_sync`（其调用发生在创建时，无并发）；确认其余 5 个调用点均位于 async 上下文（读代码核实）；`_persist_locks` 条目保留（后续复用，避免重复创建；如需清理则在 execute 终态后 pop——以最小实现为准并在 docstring 注明）。
- [x] **Step 4: 验证**：`cd backend && /usr/bin/python3 -m pytest tests/test_durable_execution.py tests/test_workflow_engine.py -q`；全量 `tests/ -q`。
- [x] **Step 5: 提交**：`git add backend/workflow_engine.py backend/tests/test_durable_execution.py && git commit -m "feat(workflow): per-execution async lock for concurrent persistence"`

---

## 自检备注

- **Spec coverage**：T1 → P2-T4 I2（failover 消费点）；T2 → P2-T1 并发竞态。对应分析文档 P3 表中两项"刻意保留/替代"的闭环。
- **已知取舍（记录而非回避）**：T1 的 `_call_model` 是否抽取以实际代码重复度为准（不强制新抽象）；T2 的 `_persist_locks` 条目保留策略（不清理 vs 终态清理）以最小实现为准并文档化；semantic_analyzer 与 discussion 引擎的模型调用点若不经 coordinator（无 `_mark_model_failed` 可达性）则标注"不适用"并在计划中说明。
- **明确不做的**：cancel_request 死代码清理（与本次无关）、audit 粘性降级（已做）、P3 其余项。
- **环境**：main@6630450 基线（backend 948 / orchestrator 154 / loop-engineering 16 / 前端 1632）；worktree 缺未跟踪技能文件致 2 个 PRE-EXISTING 失败。