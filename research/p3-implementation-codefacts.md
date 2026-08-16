# P3 阶段实施计划 — 精确代码事实（P0-P2 已合并，main@9bdf06f 基线）

> 提取日期: 2026-08-13 | 工作目录: /home/test/MDH | 只读取证，未修改任何源码
> 基线：`git log -1` = `9bdf06f docs(analysis): mark P2 legacy closure delivered, check off closure plan`
> 所有行号基于当前工作树快照。

---

## A. session log 真相源（dsh 理念：append-only session log → 模型上下文投影）

### A1. backend/meeting.py `MeetingSession` 全貌（:149-282）

**文件: backend/meeting.py（共 282 行）**

```python
# backend/meeting.py:149-156  __init__
class MeetingSession:
    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        self.agents: list[MeetingAgentInfo] = []
        self.tasks: list[MeetingTaskInfo] = []
        self.messages: list[dict] = []
        self._running: bool = False
        self._created_at: float = time.time()
```

```python
# backend/meeting.py:245-254  add_message（唯一写消息入口，结构为普通 dict）
    def add_message(self, role: str, content: str, agent_id: str = None) -> dict:
        message = {
            "id": str(uuid.uuid4())[:8],
            "role": role,
            "content": content,
            "agent_id": agent_id,
            "timestamp": time.time(),
        }
        self.messages.append(message)
        return message
```

```python
# backend/meeting.py:262-274  get_summary（消息只计数，不参与内容）
    def get_summary(self) -> dict:
        completed_tasks = sum(1 for t in self.tasks if t.status == "completed")
        failed_tasks = sum(1 for t in self.tasks if t.status == "failed")
        pending_tasks = sum(1 for t in self.tasks if t.status == "pending")
        summary = MeetingSummary(
            total_agents=len(self.agents),
            total_tasks=len(self.tasks),
            completed_tasks=completed_tasks,
            failed_tasks=failed_tasks,
            pending_tasks=pending_tasks,
            messages_count=len(self.messages),
        )
        return meeting_summary_to_dict(summary)
```

- **`messages: list[dict]` 纯内存、无持久化**。全文件无任何文件/DB IO。
- `cleanup()`（:279-282）直接 `self.messages.clear()` 清空——重启即丢。
- 其它方法：`start`(:158) `stop`(:178) `add_agent`(:183) `get_agent`(:205) `update_agent_status`(:211) `add_task`(:217) `update_task_status`(:230) `delete_task`(:237) `get_agents_dict`(:256) `get_tasks_dict`(:259) `is_running`(:276)。
- 消息结构仅 `{id, role, content, agent_id, timestamp}` —— **无 event_type/phase/actor/llm_span 等结构化事件字段**，无法直接支撑"投影为模型上下文"（缺乏事件语义）。

### A2. meeting_coordinator.py 消息调用点（`_msg` / `add_message`）

**`_msg` 助手定义（唯一的前端+记录双写封装）**：
```python
# backend/meeting_coordinator.py:524-528
    async def _msg(self, agent_id: str, text: str) -> None:
        """发送消息给前端并记录到会议"""
        if self._current_on_message:
            await self._current_on_message(agent_id, text, "")
        self.meeting.add_message("agent", text, agent_id)
```

**调用点统计（rg 精确计数）**：
- `await self._msg(`（前端推送 + add_message 双写）：**31 处**
- `self.meeting.add_message(`（仅落会议记录，不推前端）：**28 处**（含 _msg 内 1 处）
- 汇总：meeting_coordinator.py **58 个消息写点**。

**31 处 `_msg(...)` 调用行号与上下文**（均在 `process_user_message` 复杂路径 :1078-1503 与收尾 :1759-1813 段）：

| 行号 | 上下文 |
|---|---|
| :757 | `handle_critical_blocker` 应急方案（planner） |
| :1099 | CEO 任务交接 `ceo_handoff_text` |
| :1110 | 项目经理需求确认 `confirmation_text` |
| :1128 | 语义分析发布 `analysis_text` |
| :1139 | 项目规划 `plan_text` |
| :1151 | 工作流定义 `workflow_text` |
| :1169 | 讨论召集 `coordinator_discuss_text` |
| :1198 | 历史经验注入通知 `coordinator_exp_text` |
| :1205 | 讨论整合 `coordinator_integrate_text` |
| :1216 | 投票通知 `coordinator_vote_text` |
| :1265 | 共识达成 `consensus_text` |
| :1270 | 共识否决 `reject_text` |
| :1276 | 任务分派 `coordinator_assign_text` |
| :1292 | 人工审批 `coordinator_approve_text` |
| :1327 | 审批结果 `approve_msg` |
| :1334 | 审查开始 `coordinator_review_text` |
| :1349 | 第 n 轮开发监督 `coordinator_exec_text` |
| :1370 | 第 n 轮质量审查（dev loop） |
| :1413 | 审查通过 `coordinator_pass_text` |
| :1419 | 审查驳回 `coordinator_fix_text` |
| :1447 | 项目总结 `coordinator_summary_text` |
| :1451 | 最终项目总结 `project_summary` |
| :1471 | 技能进化提示 `evolution_text` |
| :1490 | 技能打包提示 `finalize_text` |
| :1497 | 协调者报告 `coordinator_report_text` |
| :1502 | CEO 报告 `ceo_report_text` |
| :1759 | 工作区创建 `create_msg` |
| :1775 | 工作区取消 `cancelled_msg` |
| :1788 | 工作区完成 `complete_msg` |
| :1799 | 任务汇总 `summary_msg` |
| :1812 | 错误通知 `error_msg` |

**28 处直接 `add_message`**：:528（_msg 内）、:758（应急方案后，与 _msg 重复写）、:1064（CEO 任务分配原因，assign_task）、:1129/:1140/:1152/:1170/:1199/:1206/:1217/:1266/:1277/:1293/:1328/:1335/:1350/:1371/:1414/:1448/:1472/:1491/:1498/:1503（各 `_msg` 同点重复双写）、:1760/:1776/:1789/:1800/:1813（收尾段重复双写）。即**绝大多数直接 add_message 与 _msg 的 add_message 是同一文本的重复记录**。

**其它 add_message 写点（coordinator 之外，共 6 处）**：
- backend/review_pipeline.py：:175（reviewer 反馈）、:216（monitor 评估）、:251（coordinator 总结）
- backend/discussion_manager.py：:112（串行讨论各角色发言）、:165（coordinator 讨论总结）
- backend/agent_bridge.py：:254（TS↔Python 桥接消息）
- backend/meeting.py：:253（定义）

**消息流向（前端 `agent_message` 如何产生）**：
```
server.py:1338 meeting_message ──> :1365 ceo.handle_meeting_message(content, ws.send_json)
  └─ ceo_agent.py:679-691 process_user_message(content, send_progress)  send_progress=self._send_fn(send_message)
       └─ meeting_coordinator.py:1078 process_user_message → _msg (:524) → _current_on_message(agent_id, text, "")
            └─ ceo_agent.py:189-209 _send_fn 的 send()：构造 {"type":"agent_message","agentId","content","delta","sequence_no"}
                 └─ ws.send_json → 前端
```
- 同时 `_msg` 内独立调 `self.meeting.add_message("agent", text, agent_id)` —— **agent_message 前端推送与 meeting.messages 记录在同一函数内双写，天然可统一为一条 append-only 事件**。
- 前端展示面板：`src/components/office-team/` 下多个面板订阅 `agent_message`/`audit_log` 等 WS 消息。

### A3. 审计日志与检查点现状

**审计日志（AuditLogPanel 后端）** —— **纯内存，无持久化**：
```python
# backend/security.py:44-61  SecurityMiddleware.__init__ 部分
class SecurityMiddleware:
    def __init__(self) -> None:
        ...
        self._audit_log: List[AuditEntry] = []      # :59 内存列表，无磁盘
```
```python
# backend/security.py:138-151  get_audit_log（仅过滤，不落盘）
    def get_audit_log(self, agent_id=None, operation=None, risk_level=None) -> List[AuditEntry]:
        entries = self._audit_log
        ...
        return entries
```
```python
# backend/security.py:182-203  _log_audit（append 到内存列表）
    def _log_audit(self, agent_id, operation, target, capability, allowed, reason, signers) -> None:
        risk_level = self._determine_risk_level(capability)
        self._audit_log.append(AuditEntry(id=str(uuid.uuid4()), agent_id=..., ...))
```
- WS 接口（backend/server.py）：:2138 `get_audit_log` → :2157 `audit_log_list`；:2175 `log_audit` → :2189 `audit_log` 推送。`security_guard` 单例 :141。
- 前端：`src/components/office-team/AuditLogPanel.tsx`（props: `auditLog, onGetAuditLog`）。

**检查点（P2 durable）**：
```python
# backend/compensation.py:169-176  CheckpointManager.__init__（P3 前默认无 persistence_dir → 纯内存）
class CheckpointManager:
    def __init__(self, max_per_task: int = 10, persistence_dir: Optional[str] = None):
        self._checkpoints: Dict[str, List[Checkpoint]] = {}
        self._max_per_task = max_per_task
        self._persistence_dir = persistence_dir          # P2 已支持可选落盘
        if persistence_dir:
            os.makedirs(persistence_dir, exist_ok=True)
            self._load_from_disk()
```
- 落盘实现（P2 新增，:178-230）：`_persist` 写 `checkpoints.json`（临时文件 + os.replace 原子替换）、`_load_from_disk` 静默跳过损坏。
- **但 server.py 创建处均未传 persistence_dir**：:1314、:1928、:1948、:1969 全部 `CheckpointManager()` 无参 → 运行时检查点仍为内存态。
- 会议快照：server.py:2022 `save_meeting_snapshot` → snapshot 含 `"messages": meeting.messages[-50:]`（:2032，最近 50 条），存到 CheckpointManager；:2049 `restore_meeting_snapshot` → :2072 `meeting.messages = state.get("messages", [])` 整表替换。

**P2 durable 工作流持久化（backend/data/workflows）**：
```python
# backend/server.py:2242-2243  全局单例配置（唯一启用落盘的持久化点）
workflow_engine = WorkflowEngine(
    persistence_dir=os.path.join(os.path.dirname(__file__), "data", "workflows")
)
```
```python
# backend/workflow_engine.py:125-146  persist_execution（原子写，临时文件 + os.replace）
        path = os.path.join(self._persistence_dir, f"{execution_id}.json")
        tmp_path = f"{path}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, path)
```
- 恢复：`load_execution`(:148-175)（损坏返回 None）、`load_all_executions`(:177-184)。目录当前为空（未跑过）。
- `.gitignore` 含 `backend/data/*` → workflows 目录不会被提交。

### A4. 模型上下文来源现状（所有"给 LLM 拼上下文"的入口清单）

| # | 入口 | 文件:行号 | 拼进 prompt 的内容 |
|---|---|---|---|
| 1 | 串行讨论 prompt | discussion_manager.py:79-96 | `topic` + `agenda phase` + `previous_context`（`_build_previous_context` 全部历史） |
| 2 | 串行讨论 coordinator 总结 | discussion_manager.py:151-156 | `_build_previous_context(all_discussions)` |
| 3 | 并行讨论 prompt | mixed_location_discussion.py:241-255 | `topic` + `previous_context`（每轮 :134 重建） |
| 4 | 并行讨论 context 构建 | mixed_location_discussion.py:290-311 | `_build_previous_context`：**只取最近 10 条**（`discussions[-10:]`），80 字截断，去 STANCE 标签 |
| 5 | Reviewer 审查 prompt | review_pipeline.py:155-166 | `task_description` + `discussion_context`（方案块）+ `execution_result`（artifact 文本） |
| 6 | Monitor 评估 prompt | review_pipeline.py:195-207 | 同 5 + `reviewer_feedback` |
| 7 | Coordinator 总结 prompt | review_pipeline.py:235-242 | `task` + `execution_result` + 审查/评估意见 |
| 8 | **执行结果 artifact 化** | meeting_coordinator.py:869-881 | `_build_execution_artifact_text`：`[文件清单] + [摘要]`（默认截断 400 字）→ 作为 `execution_result` 传审查 |
| 9 | 讨论决策摘要投影 | meeting_coordinator.py:1559-1586 | `_extract_discussion_decisions`：取 support/modify 立场、去标签、120 字截断、**最多 8 条** → 作为 review 的 `discussion_context` |
| 10 | **经验注入（retrieve_relevant_rules）** | meeting_coordinator.py:1182-1202 | `ExperienceExtractor(retrieve_relevant_rules → build_experience_context)` 取 `past_rules[:5]` 追加进 `enhanced_description` |
| 11 | 经验注入（执行任务） | task_orchestrator.py:452-513 | `_build_prompt`(:452) + `_get_experience_context`(:488)：`retrieve_relevant_rules(task_type, keywords)` → 追加到执行 prompt |
| 12 | 执行任务 prompt | task_orchestrator.py:64-71 / :210-224 | 任务描述 + `experience_context` + `tool_prompt` |

```python
# backend/meeting_coordinator.py:869-881  审查的 execution_text（artifact 化后）
    @staticmethod
    def _build_execution_artifact_text(
        exec_results: List[Dict[str, Any]],
        max_summary_len: int = 400,
    ) -> str:
        """构建 artifact 模式的执行结果文本：文件清单 + 截断摘要（轻量引用，降低 LLM 上下文放大）"""
        parts: List[str] = []
        for r in exec_results:
            written = r.get("written_files") or []
            files_line = f"[文件清单] {', '.join(written)}" if written else "[文件清单] (无)"
            summary = (r.get("result") or "")[:max_summary_len]
            parts.append(f"{files_line}\n[摘要] {summary}")
        return "\n\n".join(parts)
```
```python
# backend/experience_extractor.py:523  检索规则方法（唯一相关 API）
    def retrieve_relevant_rules(self, task_type: str, keywords: List[str]) -> List[ExperienceRule]:
```

**现状总结**：目前"模型上下文"全部是**即时拼装的临时字符串**（讨论历史、决策摘要、经验规则、执行摘要），来源分散在 `meeting.messages`（无结构化）、`discussion_results`（局部 list）、`experience_extractor`（增量文件）三处；无统一、持久化、可回放的日志真相源。

### A5. 结论：最小可行 append-only SessionEvent 插入点与影响面

**插入点（改动面最小、影响最大）**：
1. **统一写入口 = `MeetingSession.add_message`（meeting.py:245-254）**。backend 全部 35 处消息写点（coordinator 28 + review_pipeline 3 + discussion_manager 2 + agent_bridge 1 + meeting.py 定义 1）最终都落到这一个方法。在该方法内追加结构化 `SessionEvent`（role/content/agent_id 已有；需补 `event_type`、`phase`、`actor`、`span_id`）并写 append-only 日志（复用 workflow_engine 的"临时文件 + os.replace"原子写模式，或 JSONL 追加）即可让所有现有调用零改动获得持久化事件流。
2. **投影点 = 上表 12 个 LLM 上下文入口**。其中可直接改造成"从 SessionEvent 派生"的最小集合：
   - 讨论上下文：discussion_manager.py:79-96、mixed_location_discussion.py:134/241-255 的 `previous_context` → 改为 `deriveMessages(project_events, window=10)`；
   - 审查上下文：meeting_coordinator.py:1559-1586 `_extract_discussion_decisions` 与 review_pipeline.py:155-242 的 `discussion_context/execution_result` → 改为投影 `discussion/execution` 事件；
   - 经验注入：meeting_coordinator.py:1182-1202、task_orchestrator.py:488-513 → 投影 `experience_injection` 事件。
3. **快照与审计并入**：server.py:2032 `meeting.messages[-50:]` 与 :2072 整表替换 → 改为"投影最近 N 事件"；security.py 审计（:59 `_audit_log`）可作为独立 `audit` 事件类型同库落盘。
4. **影响面**：`MeetingSession.messages` 消费者仅 server.py:2032（快照）、:2072（恢复）、:2498（metrics 计数 `len(meeting.messages)`）——均为轻量读取，可安全迁移为投影接口 `deriveMessages()` 而不破坏现有 912 个后端测试中依赖 `messages` 结构的用例（tests/test_meeting.py TestMeetingSession）。

**结论**：**可行且低侵入**。核心是"单一写入口已在 MeetingSession.add_message" + "投影点集中在 4 个模块 12 处"；无需新增大规模调用点改造。风险点：add_message 的 `(role, content, agent_id)` 三元组需扩为结构化事件（新增可选参数保持向后兼容），以及 `get_summary().messages_count` 等计数语义。

---

## B. 快照/评测门禁（dsh 理念：keyless snapshot replay + 场景评测）

### B1. loop-engineering/ 全貌

**package.json 脚本（loop-engineering/package.json:5-10）**：
```json
  "scripts": {
    "start": "tsx src/main.ts",
    "metrics": "tsx src/main.ts metrics",
    "evolve": "tsx src/main.ts evolve",
    "ci": "tsx src/main.ts ci"
  }
```
依赖仅 `better-sqlite3`、`ws`、`@types/ws`；无测试框架（**loop-engineering 内无任何 *.test.ts / *.spec.ts**）。

**CLI 入口（src/main.ts:1-76）**：COMMANDS = `["metrics","evolve","ci","coverage"]`。`ci` 命令 :41-48 调 `runCiGate(threshold=80)`，通过 exit 0/1。

**数据流（关键）：orchestrator/checkpoints → collector → db(SQLite) → calculator → reporter → gate → baseline**
```
orchestrator/src/loop/loop.ts SCENARIOS(18个) --runScenario()--> 写 orchestrator/checkpoints/iteration-N.json + latest.json
    │  collector.ts CHECKPOINTS_DIR = join(__dirname, "../../../orchestrator/checkpoints")   (:7)
    ▼
loop-engineering/src/metrics/collector.ts collectFromCheckpoints()  → ScenarioMetric[]
    ▼
reporter.ts ingestCheckpoints()（按 iteration_id 幂等）→ db.ts SQLite (data/metrics.db, 3 张表)
    ▼
calculator.ts calculateScore()/calculateIterationSummary() → quality_score / 迭代汇总
    ▼
ci/gate.ts runCiGate() → 硬门禁(无 critical) + 软门禁(score≥threshold) + 回归门禁(≥90% baseline) + 全场景通过
    ▼
ci/baseline.ts updateBaseline() → loop-engineering/baselines/latest.json + 时间戳文件
```

**公开接口（逐文件）**：
- `src/metrics/collector.ts`：`collectFromCheckpoints(): ScenarioMetric[]`（:60）、`getLatestCheckpoint(): CheckpointFile`（:100）；`SCENARIO_META` 23 项硬编码（:9-33，**与 registry 18 项不一致**，多出 database-sqlite/api-rest/frontend-react/refactor-complex/performance-optimization/security-audit/multi-module-integration/error-handling-complex 等，缺 frontend-gen/concurrency/refactor-quality）。
- `src/metrics/db.ts`：`getDb()`（:53）、`initDb(db)`（:62）、`closeDb()`（:123）；表 `scenario_metrics`/`iteration_summaries`/`prompt_versions`（:63-120），路径 `data/metrics.db`（:7）。
- `src/metrics/calculator.ts`：`calculateScore(metric): number`（:33，完成度30%+效率15%+协作15%+代码质量20%+过程质量20%）、`calculateIterationSummary(metrics, iterationId)`（:74）。
- `src/metrics/reporter.ts`：`ingestCheckpoints(): void`（:5，幂等去重 by iteration_id）、`showMetrics(trend)`（:161）。
- `src/ci/gate.ts`：`runCiGate(threshold: number): Promise<boolean>`（:5-83）。
- `src/ci/baseline.ts`：`Baseline` 接口（:10-15：timestamp/commitHash/avgScore/scenarioScores）、`loadBaseline()`（:17）、`updateBaseline(avgScore, scenarioScores)`（:26，写 latest.json + 时间戳文件）、`getCommitHash()`（:39，git rev-parse HEAD，失败回退 "unknown"）。
- `src/scenarios/registry.ts`：`ScenarioMeta` 接口（:9-18）、`SCENARIO_REGISTRY` 18 项（:20-204，9 子系统）、`getCoverageReport()`（:211）。

### B2. 现有评测入口

**orchestrator 侧（产生评测数据的执行器）**：
- package.json 脚本：`loop`（tsx src/loop/loop.ts）、`loop:retry`、`loop:scenario`、`loop:ci`（`cd ../loop-engineering && npx tsx src/main.ts ci`）。
- `src/loop/loop.ts`：`SCENARIOS: Scenario[]`（:51，18 个场景，结构含 `id/name/subsystem/content/roles/verifyFiles/verifyCommands/qualityChecks/timeout`）；`runScenario()`（:401-459，**需要 DEEPSEEK_API_KEY**，经 ws://localhost:8080/ws 走真实会议全链，文件验收 + verifyCommands + qualityChecks）；检查点写出 :563-565（iteration-N.json + latest.json，含 results[].filesCreated/testOutput/issues）。
- 无 key 的确定性校验逻辑已存在但被 LLM 调用耦合在 runScenario 内（文件存在性 `find /workspace -name` + read_file 非空 + `verifyCommands` 执行）。
- 其它评测脚本：`orchestrator/test-suite.ts`（多 Agent WebSocket 测试套件，TestCase 定义 :22-47）、`test-e2e.mjs`、`test-e2e-full.mjs`、`test-hybrid.mjs`、`test-integration.mjs`、`test-frontend-format.mjs`、`test-deep.ts`。

**backend 侧（可评测场景，全部 pytest）**：
- 目录 `backend/tests/` 共 **56 个测试文件、912 个 pytest 函数**（`rg -c "def test_"` 汇总）。
- `tests/test_e2e_full_chain.py:61-166` `TestFullChainReal`：`test_01_dag_construction` / `test_02_project_creates_team` / `test_03_skill_pack_resolution` / `test_04_meeting_template_generation` / `test_05_meeting_session_with_team` / `test_06_full_scenario_narrative`（real_env fixture，真实 DAG→团队→会话全链）。
- `tests/test_durable_execution.py`：12 个测试（:31-290），覆盖 WorkflowEngine 落盘/恢复/损坏文件/原子写/跳节点——P2 durable 的回归网。
- `tests/test_review_pipeline.py`：结构化反馈 + gate 门禁（:265 gate_failure_forces_revision_required 等）。
- 现有测试均为**确定性无 key**（无需 API key），天然可作为 backend 评测场景源。

### B3. baselines/ 目录现状（git status 均 untracked）

- **仓库根 `/home/test/MDH/baselines/`**（`git status` = `?? baselines/`）：含 `latest.json`（avgScore 93.5，10 个原始场景分）+ 1 个时间戳文件 `2026-06-30T08-06-49-510Z.json`（commitHash="unknown"）。
- **`/home/test/MDH/loop-engineering/baselines/`**（`git status` = `?? loop-engineering/baselines/`）：含 `latest.json`（avgScore 89，仅 database-sqlite 1 场景，commitHash 3101ebf）+ **27 个时间戳文件**（2026-06-30 当天，说明 CI 曾持续运行）。
- 两处 baseline **互不共享**：repo 根的 10 场景文件与 loop-engineering 的 27 文件内容来源不同（前者对应 orchestrator/checkpoints 早期数据，后者对应 collector 的 SCENARIO_META 子集）。
- `loop-engineering/data/metrics.db` 与 `orchestrator/checkpoints/` 均在 .gitignore 内（check-ignore 确认），不会污染仓库。

### B4. 结论：最小可行"快照 record/replay + 无 key 回放 + CI 门禁"设计

**建议：复用 loop-engineering 的 db/gate/baseline，新增一个 replay 层（约 1 个新模块 + 2 处改动）**，理由：db 表、gate 门禁、baseline 比较逻辑已存在且可独立于 LLM 运行；`collector.ts` 已从 `orchestrator/checkpoints` 摄取。

**最小设计**：
1. **record（快照记录）**：在 `orchestrator/src/loop/loop.ts` 的 `runScenario` 中，把当前已完成确定性校验的内容（verifyFiles 存在性、read_file 非空、verifyCommands 输出、qualityChecks 结果）持久化进 checkpoint 的 `results[]`（结构已含 `filesCreated/testOutput/issues`，仅需补存每文件的 **内容 hash** 或缩略文本）→ 形成**无 key 可重放的快照**（keyless：回放不调 LLM）。
2. **replay（无 key 回放比对）**：新增 `loop-engineering/src/replay/replay.ts`，`replayScenario(snapshotId, workspacePath): DiffResult` —— 重跑文件存在性 + verifyCommands + 质量断言，与记录快照逐字段 diff。新 npm script `"replay": "tsx src/main.ts replay"` + main.ts COMMANDS 加 `"replay"`。
3. **CI 门禁**：`ci/gate.ts` 的 `runCiGate` 增加一道 replay 门禁（replay diff 非空即 FAIL），并与既有 baseline 回归门禁（:48-61）串联；`loop:ci` 脚本（orchestrator/package.json）天然指向该入口。
4. **backend 场景接入**：把 `backend/tests/test_e2e_full_chain.py` 与 `test_durable_execution.py` 的结果以 ScenarioMetric 形态喂给 collector（新增一个 backend 适配器，复用 db.ts 的表结构），即可把 912 个确定性 pytest 纳入同一门禁体系，无需 API key。

**风险与注意**：
- `SCENARIO_META`（collector:9-33，23 项）与 `SCENARIO_REGISTRY`（registry:20-204，18 项）id 集不一致，replay 索引需以 checkpoint results[].scenarioId 为准。
- 回放比对需对非确定性输出（时间戳、duration、LLM 生成文本）做归一化（strip / hash 前缀），否则假阳性。
- 双 baseline 目录（repo 根 + loop-engineering/baselines）需合并策略：建议只保留 loop-engineering/baselines（git 提交纳入版本管理，使 CI 回归可跨 commit 比对）。

---

## 附：相关文件绝对路径索引

- /home/test/MDH/backend/meeting.py
- /home/test/MDH/backend/meeting_coordinator.py
- /home/test/MDH/backend/review_pipeline.py
- /home/test/MDH/backend/discussion_manager.py
- /home/test/MDH/backend/mixed_location_discussion.py
- /home/test/MDH/backend/experience_extractor.py
- /home/test/MDH/backend/task_orchestrator.py
- /home/test/MDH/backend/security.py
- /home/test/MDH/backend/compensation.py
- /home/test/MDH/backend/workflow_engine.py
- /home/test/MDH/backend/server.py
- /home/test/MDH/backend/ceo_agent.py
- /home/test/MDH/backend/agent_bridge.py
- /home/test/MDH/backend/tests/test_meeting.py
- /home/test/MDH/backend/tests/test_meeting_coordinator_router.py
- /home/test/MDH/backend/tests/test_review_pipeline.py
- /home/test/MDH/backend/tests/test_durable_execution.py
- /home/test/MDH/backend/tests/test_e2e_full_chain.py
- /home/test/MDH/loop-engineering/package.json
- /home/test/MDH/loop-engineering/src/main.ts
- /home/test/MDH/loop-engineering/src/metrics/{collector,calculator,db,reporter}.ts
- /home/test/MDH/loop-engineering/src/ci/{gate,baseline}.ts
- /home/test/MDH/loop-engineering/src/scenarios/registry.ts
- /home/test/MDH/loop-engineering/baselines/
- /home/test/MDH/orchestrator/src/loop/loop.ts
- /home/test/MDH/orchestrator/src/loop/persistence.ts
- /home/test/MDH/orchestrator/test-suite.ts
- /home/test/MDH/orchestrator/checkpoints/
- /home/test/MDH/baselines/
