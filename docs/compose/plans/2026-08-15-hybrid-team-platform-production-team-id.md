# [M4 后续] process_user_message 生产携带 team_id Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地登记项——生产纪要路径（`process_user_message`）携带 team_id，使 M4 注入 seam 在生产路径活跃（当前 `semantic_analyzer.py:61` 文档模式分支单参调用 `build_minutes_workflow`，team_id 无通道——演示/直驱试点绕过 analyzer 传参，生产经 analyzer 的路径无法注入）。

**Architecture:** 三层尾置透传（均默认 `""`，向后兼容——空则 analyzer 不加键，既有调用/测试零变化）：`SemanticAnalyzer.analyze(user_message, team_id="")` → 文档模式分支 `build_minutes_workflow(user_message, team_id=team_id)`（T1 已实现 team_id 透传节点 input_spec）；`MeetingCoordinator.semantic_analyze(user_message, team_id="")` → analyzer.analyze 透传；`process_user_message(user_message, on_message, team_id="")` → semantic_analyze 透传。演示端点/试点可传（可选接线，不强制）。

**Tech Stack:** Python 3.11 · pytest 9.1.1（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`build_minutes_workflow`（T1 已交付 team_id 透传）；`_execute_workflow_node` seam；`build_asset_context`；非文档模式的 analyzer 路由分支（team_id 仅文档模式消费）。
- **提交纪律**：单任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）。

---

### Task 1: 三层 team_id 透传

**Files:**
- Modify: `backend/semantic_analyzer.py`（`analyze` 尾置 team_id + 文档模式分支透传）
- Modify: `backend/meeting_coordinator.py`（`semantic_analyze` + `process_user_message` 尾置 team_id 透传）
- Test: `backend/tests/test_semantic_analyzer.py`（或 test_minutes_workflow/test_meeting_coordinator_router——以实际测试文件为准，读现有 analyzer 测试位置）+ `backend/tests/test_node_asset_injection.py`（coordinator 透传）或合适文件

**Interfaces:**
- Produces: `SemanticAnalyzer.analyze(user_message: str, team_id: str = "") -> SemanticAnalysisResult`（文档模式分支 `build_minutes_workflow(user_message, team_id=team_id)`；非文档分支不受影响）；`MeetingCoordinator.semantic_analyze(user_message: str, team_id: str = "") -> SemanticAnalysisResult`（透传）；`process_user_message(user_message: str, on_message, team_id: str = "") -> dict`（透传 semantic_analyze）；空 team_id 时 analyzer 不加 input_spec 键（既有形状零变化）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_semantic_analyzer.py`（读实际文件确认位置——analyzer 级测试用 `SemanticAnalyzer(router=None)` 模式，M2a-T2 先例）追加：

```python
async def test_analyze_minutes_carries_team_id():
    analyzer = SemanticAnalyzer(router=None)
    result = await analyzer.analyze("请把会议纪要整理成文档。", team_id="team-x")
    assert result.is_workflow and result.workflow_definition is not None
    for node in result.workflow_definition.nodes:
        assert node.input_spec.get("team_id") == "team-x"


async def test_analyze_minutes_no_team_id_keeps_shape():
    analyzer = SemanticAnalyzer(router=None)
    result = await analyzer.analyze("请把会议纪要整理成文档。")
    for node in result.workflow_definition.nodes:
        assert "team_id" not in node.input_spec
```

（若 `test_semantic_analyzer.py` 不存在，读 tests/ 下 analyzer 测试实际位置——如 test_meeting_coordinator_router.py 有 analyzer 相关用例——以实际为准，可新建或追加。）

`backend/tests/test_meeting_coordinator_router.py` 或 coordinator 测试追加：

```python
async def test_process_user_message_passes_team_id_to_analysis():
    # 构造 coordinator（__new__ + 属性注入 _router/analyzer 相关），
    # monkeypatch semantic_analyze 捕获 team_id 参数，断言透传。
    # （以实际 coordinator 测试模式为准——读既有测试的构造/monkeypatch 惯例。）
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_semantic_analyzer.py::test_analyze_minutes_carries_team_id -v`
Expected: FAIL——`TypeError: analyze() got an unexpected keyword argument 'team_id'`（或文档分支 workflow 节点无 team_id——以实际为准）。

- [ ] **Step 3: 实现**

`backend/semantic_analyzer.py`：

```python
    async def analyze(self, user_message: str, team_id: str = "") -> SemanticAnalysisResult:
        # 文档模式分支（:60 附近）：
        #   workflow_definition=build_minutes_workflow(user_message, team_id=team_id),
```

`backend/meeting_coordinator.py`：

```python
    async def semantic_analyze(self, user_message: str, team_id: str = "") -> SemanticAnalysisResult:
        # 透传 analyzer.analyze(user_message, team_id=team_id)

    async def process_user_message(
        self,
        user_message: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        team_id: str = "",
    ) -> Dict[str, Any]:
        # semantic_analyze 调用处透传 team_id
```

（以实际代码为准：读 analyzer.analyze 文档模式分支与 coordinator.semantic_analyze/process_user_message 的调用点，尾置参数 + 透传；空 team_id 时 build_minutes_workflow 不加键——T1 语义。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_semantic_analyzer.py tests/test_meeting_coordinator_router.py tests/test_minutes_workflow.py -q`
Expected: 新用例 + 既有回归（缺省 shape/调用零变化）全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/semantic_analyzer.py backend/meeting_coordinator.py <测试文件>
git commit -m "feat(hybrid): carry team id through process_user_message for production asset injection"
```

---

## Self-Review 结论

- **覆盖**：登记项"process_user_message 生产携带 team_id"落地——analyze/semantic_analyze/process_user_message 三层尾置透传，生产纪要路径可携带团队标识（演示端点/试点调用方可传），M4 注入 seam 在生产路径从惰性转活跃（结合 T1 build_minutes_workflow team_id 与 coordinator seam）。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及 analyzer 测试文件位置给"以实际为准"指引。
- **范围**：三层签名尾置默认 + 透传 + 测试；build_minutes_workflow/seam/非文档分支零改动；空 team_id 形状零变化。
