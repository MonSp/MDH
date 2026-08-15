# [T42] llm_cache team_id 隔离修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 T42（T41 评审 1 Important）——`semantic_analyze` 的 llm_cache 键（md5 `role:model:prompt`）不含 team_id：同消息不同团队 300s TTL 内命中缓存返回带旧 team_id 的 `SemanticAnalysisResult`（team_id 烘焙进 minutes workflow input_spec），M4 注入 seam 会向团队 B 注入团队 A 的资产——跨团队正确性/数据隔离缺陷。

**Architecture:** 方案 B（最小、正确性优先）：`MeetingCoordinator.semantic_analyze` 在 `team_id` 非空时**完全绕过缓存**（不读不写——`analyzer.analyze(user_message, team_id=team_id)` 直接返回）；空 team_id 保持既有缓存路径零变化（既有调用/测试不受影响）。理由：①team_id 非空是"活跃注入"场景，每次需实时团队资产（缓存 300s 内资产可能变化）；②文档模式短路是确定性规则（无 LLM 调用）——绕过缓存无额外成本；③跨团队缓存隔离价值低（各团队独立结果）——方案 A（key 含 team_id）侵入通用 llm_cache API，收益不抵复杂度。

**Tech Stack:** Python 3.11 · pytest 9.1.1（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`llm_cache.py`（key 构造/API——方案 B 不侵入）；`SemanticAnalyzer.analyze`/`build_minutes_workflow`/seam。
- **提交纪律**：单任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）；`test_performance.py` flaky。

---

### Task 1: semantic_analyze team_id 非空绕过缓存

**Files:**
- Modify: `backend/meeting_coordinator.py`（`semantic_analyze` 缓存绕过）
- Test: `backend/tests/test_meeting_coordinator_router.py`（追加缓存×team_id 回归）

**Interfaces:**
- Produces: `semantic_analyze(user_message, team_id="")`——`team_id` 非空时跳过 `llm_cache.get/put`（直接 `analyzer.analyze(user_message, team_id=team_id)` 返回）；空 team_id 走既有缓存路径（get 命中返回 / miss 则 analyze + put——零变化）。

- [ ] **Step 1: 写失败测试**（追加 `backend/tests/test_meeting_coordinator_router.py`——T41 的 `TestTeamIdPassThrough` 类旁或新建用例）

```python
async def test_semantic_analyze_team_id_bypasses_cache():
    # 构造 coordinator（读既有 TestTeamIdPassThrough 的构造/monkeypatch 惯例），
    # monkeypatch llm_cache.get/put 为记录调用 + 返回 None，
    # monkeypatch analyzer.analyze 捕获 team_id 并返回带 team_id 的 SemanticAnalysisResult。
    #
    # 场景：
    # 1. semantic_analyze("同一条消息", team_id="team-a") → analyzer.analyze(team_id="team-a") 被调用，
    #    llm_cache.get/put 均未被调用（绕过）
    # 2. 再调 semantic_analyze("同一条消息", team_id="team-b") → analyzer.analyze(team_id="team-b") 被调用
    #    （即使缓存有 team-a 结果也不命中——各自实时分析，team_id 不串）
    # 3. semantic_analyze("消息", team_id="") → 走缓存路径（llm_cache.get 被调用）
```

（**关键断言**：①team_id 非空时 `llm_cache.get`/`put` 零调用；②team A 与 team B 同消息各自返回正确 team_id（串行调用不串）；③空 team_id 仍调 get（缓存路径保留）。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_meeting_coordinator_router.py -k "team_id_bypasses_cache" -v`
Expected: FAIL——当前 team_id 非空仍走缓存（get 被调用）。

- [ ] **Step 3: 实现**

`backend/meeting_coordinator.py` `semantic_analyze`（:1078-1090）：

```python
    async def semantic_analyze(self, user_message: str, team_id: str = "") -> SemanticAnalysisResult:
        """语义分析用户消息（委托给SemanticAnalyzer，带缓存）

        team_id 非空时绕过缓存：缓存键不含 team_id（llm_cache key = md5(role:model:prompt)），
        同消息跨团队 TTL 命中会返回带旧 team_id 的结果（M4 注入 seam 跨团队资产泄漏）——
        team_id 场景每次实时分析（文档模式为确定性短路，无 LLM 成本）。
        """
        if team_id:
            return await self._semantic_analyzer.analyze(user_message, team_id=team_id)

        from llm_cache import llm_cache
        cached = llm_cache.get(user_message, role="semantic_analyze", model=self.model_name)
        if cached is not None:
            self.logger.info("语义分析命中缓存: %s", user_message[:50])
            return cached

        result = await self._semantic_analyzer.analyze(user_message, team_id=team_id)
        llm_cache.put(user_message, result, role="semantic_analyze", model=self.model_name)
        return result
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_meeting_coordinator_router.py tests/test_minutes_workflow.py tests/test_review_integration.py -q`
Expected: 新用例 + 既有回归（空 team_id 缓存路径/透传用例）全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/tests/test_meeting_coordinator_router.py
git commit -m "fix(hybrid): bypass llm cache for team-scoped semantic analysis to prevent cross-team team id leak"
```

---

## Self-Review 结论

- **覆盖**：T42 落地——team_id 非空绕过缓存（同消息跨团队不串 team_id），空 team_id 缓存路径零变化；llm_cache API 零侵入。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及 coordinator 测试构造给"以实际为准"指引。
- **范围**：semantic_analyze 一处判断 + 测试；llm_cache/analyzer/build_minutes_workflow/seam 零改动。
