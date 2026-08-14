# P3 阶段实施计划（session log 真相源 / 快照评测门禁）

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 落实 P3 优先级两项（dsh 理念吸收）：① session log 真相源——append-only 结构化事件日志作为模型上下文投影源；② 快照/评测门禁——keyless snapshot replay + 场景评测接入 CI 门禁。

**Architecture:** ① 以 `MeetingSession.add_message`（backend 全部 35 处消息写点的唯一汇入，meeting.py:245-254）为统一写入口，追加结构化 `SessionEvent`（补 `event_type/phase/actor/span_id`）并以 JSONL append-only 持久化（复用 workflow_engine 原子写思想），新增 `deriveMessages()` 投影接口；改造 4 个 LLM 上下文入口（讨论/审查/经验注入）从事件流投影；会议快照与安全审计并入事件流。② orchestrator `runScenario` 将确定性校验结果（文件 hash + verifyCommands + qualityChecks）补存进 checkpoint（keyless 快照）；loop-engineering 新增 replay 层（`replay.ts` + `main.ts replay` + npm script）无 key 回放比对并串联 `runCiGate`；backend 912 个确定性 pytest 经适配器喂入同一门禁体系。

**Tech Stack:** Python 3.11（backend，`/usr/bin/python3` + pytest）、TypeScript（orchestrator + loop-engineering，vitest）

## Global Constraints

- backend：`cd backend && /usr/bin/python3 -m pytest tests/<file> -q`（不加 `--timeout`）；全量 `tests/ -q`
- orchestrator/loop-engineering：`npm test` / `npx vitest run <file>`（worktree 无 node_modules 时用主仓库 `node /home/test/MDH/node_modules/vitest/vitest.mjs run <file>`）
- 不引入新依赖（loop-engineering 若需测试框架，仅加 vitest devDependency）；不改 mock-sso；`backend/companion_log.json` 勿提交
- 持久化数据写 `backend/data/session_logs/`（已被 `backend/data/*` gitignore 覆盖）
- 基线（main@9bdf06f）：backend 913 passed / 1 skipped；orchestrator 125 passed；前端 1632 passed；loop-engineering 无测试框架
- 行号以实际代码为准（历史行号已多次偏移）

---

### Task 1: SessionEvent 事件流（统一写入口 + 持久化 + 投影接口）

**Covers:** P3 session log 真相源（dsh 借鉴）
<!-- MeetingSession.add_message 追加结构化事件 + JSONL 持久化 + deriveMessages 投影接口，所有现有写点零改动 -->

**Files:**
- Modify: `backend/meeting.py`（`MeetingSession` 扩展）
- Test: `backend/tests/test_meeting.py`（既有）+ 新增 `backend/tests/test_session_log.py`

**Interfaces:**
- Consumes: `MeetingSession.add_message(role, content, agent_id=None)`（meeting.py:245-254）、`uuid`/`time`（已 import）
- Produces: `SessionEvent` dataclass（`event_id/event_type/role/content/agent_id/phase/actor/span_id/timestamp`）；`SessionEventType` 枚举（`user_message/agent_message/discussion/execution/review/approval/experience_injection/tool/audit`，另含 `system` 供非 user/agent 角色推断回退——见 Step 3b，共 10 成员）；`MeetingSession.__init__(meeting_id, session_log_dir: Optional[str] = None)`；`add_message(...)` 追加事件并 JSONL 持久化（append 即写，断点可续读）；`deriveMessages(event_types=None, window=None, max_content_len=None) -> List[dict]`（从事件流投影为消息列表，兼容现有 `messages` 结构 `{id, role, content, agent_id, timestamp}`）；`load_events()` 静态/类方法（重载持久化事件）；`messages` 属性保持（投影或内存镜像）

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_session_log.py`）

```python
"""SessionEvent 事件流：统一写入口 + JSONL 持久化 + 投影接口"""

import json

from meeting import MeetingSession


def test_add_message_writes_structured_event(tmp_path):
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    msg = m.add_message("agent", "你好", "agent-1")
    assert msg["role"] == "agent"
    # 事件已持久化
    log_file = tmp_path / "m1.jsonl"
    assert log_file.exists()
    line = json.loads(log_file.read_text().strip().splitlines()[-1])
    assert line["event_type"] in ("agent_message", "user_message")
    assert line["agent_id"] == "agent-1"


def test_reload_events_from_disk(tmp_path):
    m1 = MeetingSession("m1", session_log_dir=str(tmp_path))
    m1.add_message("agent", "A", "agent-1")
    m1.add_message("user", "B", None)

    m2 = MeetingSession("m1", session_log_dir=str(tmp_path))
    events = m2.load_events()
    assert len(events) == 2
    assert events[0]["content"] == "A"


def test_derive_messages_projects_from_events(tmp_path):
    m = MeetingSession("m1", session_log_dir=str(tmp_path))
    m.add_message("agent", "发言一", "agent-1")
    m.add_message("agent", "发言二", "agent-2")
    msgs = m.deriveMessages(window=1, max_content_len=100)
    assert len(msgs) == 1
    assert msgs[0]["content"] == "发言二"
    assert set(msgs[0]) >= {"id", "role", "content", "agent_id", "timestamp"}


def test_no_dir_falls_back_to_memory(tmp_path):
    m = MeetingSession("m2")  # 无 session_log_dir → 纯内存（向后兼容）
    m.add_message("agent", "X", "agent-1")
    assert len(m.messages) == 1
    assert m.load_events() == []
```

- [ ] **Step 2: 运行确认失败**：预期 `TypeError: __init__() got an unexpected keyword argument 'session_log_dir'` / 无 `deriveMessages`。
- [ ] **Step 3: 实现**：
  3a. `meeting.py` 新增 `SessionEventType` 枚举与 `SessionEvent` dataclass（含 `event_type` 默认 `"agent_message"`）；`MeetingSession.__init__` 加 `session_log_dir: Optional[str] = None`（目录存在则 `makedirs`），`self._session_log_dir`。
  3b. `add_message`：构造消息 dict（现有结构）后，追加 `SessionEvent` 记录（`event_type` 由 role 推断：`"user"`→`user_message`、`"agent"`→`agent_message`、其余→`"system"`；`phase/actor/span_id` 可选空），若 `session_log_dir` 则 JSONL append（`with open(path, "a") as f: f.write(json.dumps(event) + "\n")`，IOError 静默降级内存）；保持现有返回与 `messages` 追加行为不变。
  3c. `deriveMessages(event_types=None, window=None, max_content_len=None)`：从内存事件（或 `load_events()` 重载）投影，过滤 event_types、取最近 window 条、内容截断，返回 `{id, role, content, agent_id, timestamp}` 列表；无持久化时从内存事件投影。
  3d. `load_events()`：从 JSONL 逐行读取（损坏行跳过），返回事件 dict 列表。
- [ ] **Step 4: 验证**：`cd backend && /usr/bin/python3 -m pytest tests/test_session_log.py tests/test_meeting.py -q`；全量 `tests/ -q`（既有 913 用例不回归——`add_message` 签名与 `messages` 结构不变）。
- [ ] **Step 5: 提交**：`git add backend/meeting.py backend/tests/test_session_log.py && git commit -m "feat(session): append-only SessionEvent log with deriveMessages projection"`

---

### Task 2: LLM 上下文投影接入（讨论/审查/经验注入）

**Covers:** P3 session log 投影（dsh 借鉴）
<!-- 4 个 LLM 上下文入口从即时拼装改为 deriveMessages 事件投影 -->

**Files:**
- Modify: `backend/discussion_manager.py`（串行讨论 previous_context :79-96、coordinator 总结 :151-156）
- Modify: `backend/mixed_location_discussion.py`（并行讨论 `_build_previous_context` :290-311、prompt :241-255）
- Modify: `backend/meeting_coordinator.py`（`_extract_discussion_decisions` :1559-1586 改投影；`_build_execution_artifact_text` 保持，但输入可来自事件）
- Modify: `backend/task_orchestrator.py`（`_get_experience_context` :488-513 保持经验注入，评估是否改事件投影——**本期最小**：仅讨论与审查决策改投影，经验注入保留现有实现并注明）
- Test: `backend/tests/test_mixed_location_discussion.py`、`backend/tests/test_meeting_coordinator_router.py`

**Interfaces:**
- Consumes: `MeetingSession.deriveMessages`（Task 1）、`discussion_results`/`discussions` 现有结构
- Produces: `MixedLocationDiscussion`/`DiscussionManager` 的 previous_context 构造改用 `deriveMessages(window=10, max_content_len=80)`（保留既有 10 条/80 字语义）；`MeetingCoordinator._extract_discussion_decisions` 改用投影事件（保留 support/modify 过滤与 8 条/120 字语义）；经验注入（meeting_coordinator :1182-1202、task_orchestrator :488-513）保持现状（注明本期不改）

- [ ] **Step 1: 写失败测试**（追加到 `test_mixed_location_discussion.py` / `test_meeting_coordinator_router.py`）：

```python
async def test_parallel_discussion_context_from_events(meeting_coordinator):
    """并行讨论 previous_context 从 SessionEvent 投影（保留最近 10 条/80 字语义）"""
    coordinator = meeting_coordinator
    coordinator.meeting.add_message("agent", "讨论观点一" * 30, "agent-1")  # >80 字
    coordinator.meeting.add_message("agent", "讨论观点二", "agent-2")
    # 构造讨论并断言 context 包含观点二且截断
    ...
```

（以既有 discussion 测试的 fixture 结构为准；验收：previous_context 来源为事件投影、语义与现有一致。）

- [ ] **Step 2: 运行确认失败**：现有实现仍从 discussions 列表拼接。
- [ ] **Step 3: 实现**：按 Interfaces 改造 4 处（讨论串行/并行 previous_context、`_extract_discussion_decisions`）；先读各处实际代码，`deriveMessages` 投影后保持输出文本形状不变（避免下游 prompt 语义漂移）；经验注入两处加注释"本期保留现有实现，P3 后续可事件化"。
- [ ] **Step 4: 验证**：`cd backend && /usr/bin/python3 -m pytest tests/test_mixed_location_discussion.py tests/test_meeting_coordinator_router.py tests/test_review_pipeline.py -q`；全量 `tests/ -q`。
- [ ] **Step 5: 提交**：`git add backend/discussion_manager.py backend/mixed_location_discussion.py backend/meeting_coordinator.py backend/tests/ && git commit -m "feat(session): project LLM contexts from SessionEvent log (discussion, review decisions)"`

---

### Task 3: 会议快照与审计并入事件流

**Covers:** P3 session log 完善
<!-- 会议快照改事件投影；安全审计并入事件流 -->

**Files:**
- Modify: `backend/server.py`（save_meeting_snapshot :2022 的 `messages[-50:]` 与 restore :2072 整表替换 → 事件投影）
- Modify: `backend/security.py`（`_log_audit` 追加审计事件；`_audit_log` 可选持久化）
- Modify: `backend/meeting.py`（SessionEventType 增加 `audit`）
- Test: `backend/tests/test_session_log.py`、`backend/tests/test_security.py`（若存在）

**Interfaces:**
- Consumes: `deriveMessages(window=50)`、`SecurityMiddleware._log_audit`（security.py:182-203）
- Produces: 快照 payload 的 `messages` 改为 `deriveMessages(window=50)` 投影（结构不变）；`_log_audit` 在内存 append 外追加 `SessionEvent(event_type="audit", ...)` 事件（经 `MeetingSession` 或独立 audit JSONL——以实现最简为准，若 SecurityMiddleware 无 MeetingSession 引用，则独立写 `backend/data/session_logs/audit.jsonl`）

- [ ] **Step 1: 写失败测试**（test_session_log.py 追加）：

```python
def test_audit_event_persisted(tmp_path):
    from security import SecurityMiddleware
    mw = SecurityMiddleware()
    # 若可注入日志路径则断言 audit 事件写入；否则降级为结构断言
    ...
```

- [ ] **Step 2: 运行确认失败**：审计无持久化事件。
- [ ] **Step 3: 实现**：按 Interfaces；先读 server.py 快照/恢复与 security.py 实际代码。
- [ ] **Step 4: 验证**：`cd backend && /usr/bin/python3 -m pytest tests/test_session_log.py tests/test_meeting.py -q`；全量 `tests/ -q`。
- [ ] **Step 5: 提交**：`git add backend/server.py backend/security.py backend/meeting.py backend/tests/ && git commit -m "feat(session): snapshot projection and audit events into session log"`

---

### Task 4: keyless 快照记录（orchestrator runScenario 补存确定性校验结果）

**Covers:** P3 快照/评测门禁（dsh 借鉴）
<!-- runScenario 将确定性校验结果（文件 hash/verifyCommands/qualityChecks）补存 checkpoint → 无 key 可重放快照 -->

**Files:**
- Modify: `orchestrator/src/loop/loop.ts`（`runScenario` :401-459 与 checkpoint 写出 :563-565）
- Create: `orchestrator/src/loop/snapshot.ts`
- Test: 新建 `orchestrator/src/loop/loop.test.ts`

**Interfaces:**
- Consumes: `runScenario`（需 DEEPSEEK_API_KEY，真实会议全链）、checkpoint 结构（`results[].filesCreated/testOutput/issues`）、`verifyFiles/verifyCommands/qualityChecks`
- Produces: `snapshot.ts` 的 `buildScenarioSnapshot(scenario, runResults) -> Snapshot`（文件 sha256 hash + verifyCommands exitCode/stdoutHash + qualityChecks passed）与 `runKeylessChecks(scenario, workspace) -> Snapshot`（纯确定性不调 LLM）；`runScenario` 增加 `keyless` 选项（跳过模型循环）；checkpoint `results[]` 每项补存 `snapshot` 字段（向后兼容）

- [ ] **Step 1: 写失败测试**（新建 `orchestrator/src/loop/loop.test.ts`，含 `snapshot.ts` 纯函数测试）：

```typescript
import { describe, it, expect } from 'vitest';
import { buildScenarioSnapshot, runKeylessChecks } from './snapshot';

describe('scenario snapshot', () => {
  it('builds deterministic snapshot with sha256 file hashes', () => {
    const snapshot = buildScenarioSnapshot(
      { verifyFiles: ['src/app.py'], verifyCommands: ['python -m py_compile src/app.py'], qualityChecks: [] } as any,
      { files: { 'src/app.py': 'print(1)' } },
    );
    expect(snapshot.files['src/app.py'].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('runKeylessChecks passes with real files and commands in tmp dir', async () => {
    // tmp 目录写文件 → runKeylessChecks(scenario, tmp) → passed 全 true
  });
});
```

- [ ] **Step 2: 运行确认失败**：`buildScenarioSnapshot`/`runKeylessChecks` 不存在。
- [ ] **Step 3: 实现**：`snapshot.ts`（sha256 文件 hash、verifyCommands exitCode/stdoutHash、qualityChecks passed；`runKeylessChecks` 文件存在性 + readFile 非空 + verifyCommands 执行）；`loop.ts` 的 `runScenario` 加 `keyless` 选项与 snapshot 序列化（归一化：非确定性输出不入快照）。
- [ ] **Step 4: 验证**：`cd orchestrator && npx vitest run src/loop/loop.test.ts`；全量 `npm test`（125 不回归）。
- [ ] **Step 5: 提交**：`git add orchestrator/src/loop/snapshot.ts orchestrator/src/loop/loop.ts orchestrator/src/loop/loop.test.ts && git commit -m "feat(loop): keyless scenario snapshot with deterministic check hashing"`

---

### Task 5: 快照回放 + CI 门禁串联（loop-engineering replay 层）

**Covers:** P3 快照/评测门禁
<!-- replay 无 key 回放比对 + runCiGate 串联 + loop:ci 入口 -->

**Files:**
- Create: `loop-engineering/src/replay/replay.ts`、`loop-engineering/src/main.ts`（+replay 命令）
- Modify: `loop-engineering/src/ci/gate.ts`（+replay 门禁）、`loop-engineering/package.json`（+replay script + vitest devDependency）、`orchestrator/package.json`（`loop:ci` 串联 replay）
- Test: 新建 `loop-engineering/src/replay/replay.test.ts`

**Interfaces:**
- Consumes: checkpoint 快照（Task 4）、`loadBaseline/updateBaseline`（baseline.ts）、`getDb`（db.ts）、`runCiGate`（gate.ts）
- Produces: `diffSnapshot(snapshot, actual) -> Diff[]`（纯函数）；`replayScenario(snapshot, workspacePath) -> Diff[]`（重跑确定性校验 → diff）；`main.ts` 命令 `replay`（遍历含 snapshot 的 checkpoint 回放，diff 非空 exit 1）；`runCiGate` 增加 replay 门禁段（快照存在时回放，diff 非空 FAIL）

- [ ] **Step 1: 写失败测试**（新建 `loop-engineering/src/replay/replay.test.ts`）：

```typescript
import { describe, it, expect } from 'vitest';
import { diffSnapshot } from './replay';

describe('replay diff', () => {
  it('empty diff when snapshot matches', () => {
    const snap = { files: { 'a.txt': { hash: 'h1', size: 2 } } };
    const actual = { files: { 'a.txt': { hash: 'h1', size: 2 } } };
    expect(diffSnapshot(snap as any, actual as any)).toEqual([]);
  });
  it('reports file hash mismatch', () => {
    const snap = { files: { 'a.txt': { hash: 'h1', size: 2 } } };
    const actual = { files: { 'a.txt': { hash: 'h2', size: 3 } } };
    expect(diffSnapshot(snap as any, actual as any).length).toBe(1);
  });
});
```

（vitest 加 devDependency：`cd loop-engineering && npm i -D vitest`——先确认 workspace 网络/registry 可用；不可用则以主仓库 `node /home/test/MDH/node_modules/vitest/vitest.mjs run <file>` 复用。）

- [ ] **Step 2: 运行确认失败**：`diffSnapshot` 不存在。
- [ ] **Step 3: 实现**：`replay.ts`（diffSnapshot 纯函数 + replayScenario 重跑确定性校验）；`main.ts` COMMANDS 加 `"replay"`；`gate.ts` `runCiGate` 加 replay 门禁段；两处 package.json 脚本。
- [ ] **Step 4: 验证**：`cd loop-engineering && npx vitest run src/replay/replay.test.ts`；`npx tsx src/main.ts replay`（空 checkpoints → exit 0）；orchestrator `npm test` 不回归。
- [ ] **Step 5: 提交**：`git add loop-engineering/src/replay/ loop-engineering/src/main.ts loop-engineering/src/ci/gate.ts loop-engineering/package.json orchestrator/package.json && git commit -m "feat(loop): keyless snapshot replay with CI gate integration"`

---

## 自检备注（Self-Review）

- **Spec coverage**：T1-T3 → session log 真相源（dsh 借鉴：统一写入口、投影接口、快照/审计并入）；T4-T5 → 快照/评测门禁（dsh 借鉴：keyless snapshot、replay、CI 串联）。对应分析文档 P3 表"dsh 借鉴"前两项。
- **已知取舍（记录而非回避）**：T2 经验注入两处本期保留现有实现（事件化列 P3 后续）；T3 审计事件独立 JSONL（SecurityMiddleware 无 MeetingSession 引用，注入成本高）；T5 backend pytest 适配器列为后续（replay 层为主交付）；双 baseline 目录合并与 SCENARIO_META/registry 不一致列入后续治理。
- **明确不做的**：subagent 委托、配置层插件化、守卫/超时、判定结果回传 UI、审查报告闭环、MCP、HITL（未入选本阶段）；`MeetingSession.messages` 结构不破坏（912 用例依赖）。
- **环境**：main@9bdf06f 基线（backend 913 / orchestrator 125 / 前端 1632）；worktree 缺未跟踪技能文件致 2 个 PRE-EXISTING 失败；loop-engineering 无测试框架（vitest 需确认可用）。
