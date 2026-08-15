# [M4] 沉淀闭环增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让沉淀闭环"闭环"起来：①纪要 DAG 节点执行时自动检索并注入团队资产（模板/知识/技能规则）指导生成（设计 [S5] 第 42 行落地）；②LLM judge 评测基准量化 judge 质量（准确率/校准/区分度，仿 AIP Evals）。

**Architecture:** 新增 2 模块（`asset_injection.py` 资产上下文构建——消费 M3 AssetSearch；`asset_judge_benchmark.py` 评测基准——消费 M3 make_llm_judge/AssetEvaluator）+ 修改 `meeting_coordinator.py`（可选 `asset_context_builder` seam 注入节点 prompt——默认 None 向后兼容）+ 扩展 `pilot_judge.py`（--benchmark 真实 key 跑基准）。

**Tech Stack:** Python 3.11 · pytest 9.1.1（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：AssetStore/AssetEvaluator/AssetSearch/AssetJudge/ApprovalManager/模板固化内部；既有端点响应形状；既有纪要链路行为（注入 seam 默认 None——零行为变化）。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件；既有 churn 绝不提交。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）；`test_performance.py` flaky。

---

### Task 1: AssetContextBuilder（资产上下文构建）

**Covers:** [S3]

**Files:**
- Create: `backend/asset_injection.py`
- Test: `backend/tests/test_asset_injection.py`

**Interfaces:**
- Consumes: M3 `AssetSearch(store, extractor).search(team_id, query="", asset_type="", task_type="", keywords=None) -> {"artifacts", "templates", "rules"}`（asset_search.py）；`AssetStore`/`ExperienceExtractor`。
- Produces: `build_asset_context(store, extractor, team_id, task_type="", keywords=None) -> str`——AssetSearch.search → 格式化注入文本（模板标题+要点前 3 行 / 知识（产出物）标题+内容前 100 字符 / 技能规则 trigger_condition+action 前 100 字符，各最多 3 条，渐进披露）；全部为空 → 返回 `""`。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_injection.py`）

```python
from asset_injection import build_asset_context
from asset_store import AssetStore
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_build_asset_context_merges_three_types(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料，研发部负责版本冻结")
    store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。",
        "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["责任人", "行动项"],
    )
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["责任人", "行动项"])
    assert "资产参考" in ctx
    assert "发布计划模板" in ctx        # 模板注入
    assert "纪要-0815" in ctx          # 知识（产出物）注入
    assert "action" in ctx or "责任人" in ctx  # 技能规则注入


def test_build_asset_context_empty_when_no_assets(tmp_path):
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    assert build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"]) == ""


def test_build_asset_context_respects_team_isolation(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    ctx_other = build_asset_context(store, extractor, "team-y", task_type="minutes", keywords=["纪要"])
    assert ctx_other == ""  # 团队隔离：team-y 无资产
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_injection.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'asset_injection'`。

- [ ] **Step 3: 实现**（新建 `backend/asset_injection.py`）

```python
"""资产上下文构建：纪要 DAG 节点执行时注入团队资产（模板/知识/技能规则）。

设计 [S3]：AssetSearch 检索 → 摘要目录 + 按需加载（渐进披露 P-5.11）；
无资产返回空串（注入零成本）。注入是增强非必需——调用方异常可吞。
"""

from asset_search import AssetSearch

_MAX_TEMPLATES = 3
_MAX_ARTIFACTS = 3
_MAX_RULES = 3
_SNIPPET_LEN = 100


def build_asset_context(store, extractor, team_id: str, task_type: str = "", keywords: list | None = None) -> str:
    """检索团队资产并格式化为注入文本；无资产返回空串。"""
    result = AssetSearch(store, extractor).search(team_id, task_type=task_type, keywords=keywords)
    lines: list[str] = []
    for tpl in result["templates"][:_MAX_TEMPLATES]:
        head = "\n".join(tpl.get("content", "").splitlines()[:3])
        lines.append(f"- 模板「{tpl.get('title', '')}」：{head[:_SNIPPET_LEN]}")
    for art in result["artifacts"][:_MAX_ARTIFACTS]:
        lines.append(f"- 知识「{art.get('title', '')}」：{art.get('content', '')[:_SNIPPET_LEN]}")
    for rule in result["rules"][:_MAX_RULES]:
        lines.append(f"- 规则：{rule.get('trigger_condition', '')} → {rule.get('action', '')[:_SNIPPET_LEN]}")
    if not lines:
        return ""
    return "\n资产参考：\n" + "\n".join(lines)
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_injection.py tests/test_asset_search.py -q`
Expected: 3 新用例 + 检索回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_injection.py backend/tests/test_asset_injection.py
git commit -m "feat(hybrid): asset context builder for minutes DAG node injection"
```

---

### Task 2: 节点 prompt 注入（coordinator seam）

**Covers:** [S3]

**Files:**
- Modify: `backend/meeting_coordinator.py`（`__init__` 尾置 `asset_context_builder` + `_execute_workflow_node` prompt 注入）
- Test: `backend/tests/test_asset_injection.py` 或新建 `backend/tests/test_node_asset_injection.py`（coordinator 层）

**Interfaces:**
- Consumes: Task 1 `build_asset_context`。
- Produces: `MeetingCoordinator(..., asset_context_builder: Optional[Callable[[str, str, list | None], str]] = None)`（尾置默认，签名 `(team_id, task_type, keywords) -> str`）；`_execute_workflow_node` 对 `dept-docs` 节点（builder 非空时）调用 builder（team_id 从 `input_data.get("team_id", "")` 取，缺省空 → 不注入），非空结果追加 `f"\n资产参考：\n{asset_context}"` 到 prompt（:345 产出要求段前）；builder 异常 try/except 吞掉（注入是增强非必需）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_node_asset_injection.py`）

```python
import pytest

from meeting_coordinator import MeetingCoordinator


def _make_coordinator(builder=None):
    coord = MeetingCoordinator.__new__(MeetingCoordinator)
    coord._asset_context_builder = builder
    coord._approval_manager = None
    coord._workspace = None
    return coord


@pytest.mark.asyncio
async def test_docs_node_prompt_includes_asset_context(monkeypatch):
    captured = {}

    async def fake_loop(model, prompt, toolset, **kwargs):
        captured["prompt"] = prompt
        return {"result": "ok", "files_written": [], "tool_outputs": []}

    coord = _make_coordinator(builder=lambda team_id, task_type, keywords: f"\n资产参考：\n- 模板「会议纪要模板」：标题\n要点")
    monkeypatch.setattr(coord, "_get_model", lambda role: object())
    monkeypatch.setattr(MeetingCoordinator, "_run_agent_execution_loop", fake_loop)

    node = type("Node", (), {"node_id": "draft", "dept_id": "dept-docs", "task_description": "撰写纪要初稿"})()
    await coord._execute_workflow_node(node, {"transcript": "会议讨论...", "team_id": "team-x"})
    assert "资产参考" in captured["prompt"]
    assert "会议纪要模板" in captured["prompt"]


@pytest.mark.asyncio
async def test_non_docs_node_or_no_builder_skips_injection(monkeypatch):
    captured = {}

    async def fake_loop(model, prompt, toolset, **kwargs):
        captured["prompt"] = prompt
        return {"result": "ok", "files_written": [], "tool_outputs": []}

    # 无 builder → 不注入
    coord = _make_coordinator(builder=None)
    monkeypatch.setattr(coord, "_get_model", lambda role: object())
    monkeypatch.setattr(MeetingCoordinator, "_run_agent_execution_loop", fake_loop)
    node = type("Node", (), {"node_id": "extract", "dept_id": "dept-docs", "task_description": "提取要点"})()
    await coord._execute_workflow_node(node, {"transcript": "会议讨论..."})
    assert "资产参考" not in captured["prompt"]

    # builder 异常 → 吞掉不影响执行
    def broken_builder(team_id, task_type, keywords):
        raise RuntimeError("asset store down")

    coord2 = _make_coordinator(builder=broken_builder)
    monkeypatch.setattr(coord2, "_get_model", lambda role: object())
    monkeypatch.setattr(MeetingCoordinator, "_run_agent_execution_loop", fake_loop)
    node2 = type("Node", (), {"node_id": "draft", "dept_id": "dept-docs", "task_description": "撰写纪要初稿"})()
    await coord2._execute_workflow_node(node2, {"transcript": "会议讨论...", "team_id": "team-x"})
    assert "资产参考" not in captured["prompt"]  # 异常吞掉 → 无注入段
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_node_asset_injection.py -v`
Expected: FAIL——`AttributeError: 'MeetingCoordinator' object has no attribute '_asset_context_builder'`。

- [ ] **Step 3: 实现**

`backend/meeting_coordinator.py`：
- `__init__` 尾置（approval_timeout 之后）加 `asset_context_builder: Optional[Callable[[str, str, list | None], str]] = None`，存 `self._asset_context_builder`。
- `_execute_workflow_node` prompt 构造（:345 产出要求段前）插入：

```python
        asset_context = ""
        if self._asset_context_builder is not None and node.dept_id == "dept-docs":
            try:
                team_id = (input_data or {}).get("team_id", "")
                if team_id:
                    asset_context = self._asset_context_builder(team_id, "minutes", ["纪要", "待办"])
            except Exception as exc:  # 注入是增强非必需——失败不影响节点执行
                self.logger.warning("资产参考注入失败: %s", exc)
        prompt = (
            f"请执行以下任务：\n"
            f"任务描述：{node.task_description}\n"
            f"输入数据：{json.dumps(input_data, ensure_ascii=False)}\n"
            f"{tool_prompt}"
            f"{asset_context}\n\n"
            f"需要产出文件时，用代码块输出：```文件名\n内容\n```；需要调用工具时输出 JSON："
            f'{{"tool": "工具名", "arguments": {{...}}}}。'
        )
```

（**注意**：prompt 现构造是 `f"{tool_prompt}\n\n"`——改为 `f"{tool_prompt}{asset_context}\n\n"`，asset_context 非空时自带 `\n资产参考：\n` 前缀；空串时输出与现状逐字节一致。以实际代码为准微调。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_node_asset_injection.py tests/test_meeting_coordinator_router.py tests/test_workflow_integration.py -q`
Expected: 新 2 用例 + 既有 coordinator 回归全绿（seam 默认 None 零影响）。

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/tests/test_node_asset_injection.py
git commit -m "feat(hybrid): inject asset context into minutes DAG node prompts via coordinator seam"
```

---

### Task 3: LLM judge 评测基准

**Covers:** [S4]

**Files:**
- Create: `backend/asset_judge_benchmark.py`
- Modify: `backend/pilot_judge.py`（--benchmark 参数）
- Test: `backend/tests/test_asset_judge_benchmark.py`

**Interfaces:**
- Consumes: M3 `make_llm_judge`（asset_judge.py）；`AssetEvaluator._JUDGE_THRESHOLD == 0.5`。
- Produces: `BenchmarkItem` dataclass（asset/gold_score/gold_pass）；`BENCHMARK_ITEMS`（8 条内置标注集）；`BenchmarkResult` dataclass（accuracy/mae/good_mean/bad_mean/sep）；`evaluate_judge(judge, items=None) -> BenchmarkResult`。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_judge_benchmark.py`）

```python
import pytest

from asset_judge_benchmark import BENCHMARK_ITEMS, BenchmarkItem, evaluate_judge


def test_benchmark_items_well_formed():
    assert len(BENCHMARK_ITEMS) == 8
    for item in BENCHMARK_ITEMS:
        assert 0.0 <= item.gold_score <= 1.0
        assert item.gold_pass == (item.gold_score >= 0.5)
        assert item.asset["type"] in ("template", "artifact")


def test_evaluate_judge_perfect_judge():
    def perfect_judge(asset):
        return next(i.gold_score for i in BENCHMARK_ITEMS if i.asset["content"] == asset.get("content"))

    result = evaluate_judge(perfect_judge)
    assert result.accuracy == 1.0
    assert result.mae == 0.0
    assert result.good_mean > result.bad_mean  # 区分度


def test_evaluate_judge_wrong_judge():
    def inverted_judge(asset):
        return 1.0 if asset.get("content", "").startswith("差") else 0.0

    result = evaluate_judge(inverted_judge)
    assert result.accuracy < 1.0


def test_evaluate_judge_custom_items():
    items = [
        BenchmarkItem(asset={"type": "artifact", "title": "a", "content": "好内容"}, gold_score=0.8, gold_pass=True),
        BenchmarkItem(asset={"type": "artifact", "title": "b", "content": "差内容"}, gold_score=0.2, gold_pass=False),
    ]
    result = evaluate_judge(lambda a: 0.8 if a["content"] == "好内容" else 0.2, items=items)
    assert result.accuracy == 1.0 and result.mae == 0.0
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_judge_benchmark.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'asset_judge_benchmark'`。

- [ ] **Step 3: 实现**（新建 `backend/asset_judge_benchmark.py`）

```python
"""LLM judge 评测基准：人工标注资产集评估 judge 准确率/校准/区分度。

设计 [S4]：仿 AIP Evals 指标——accuracy（判定一致率）、mae（分数校准）、
good_mean-bad_mean（区分度）。标注集为内置演示数据（试点部门真实标注集后续外部化）。
"""

from dataclasses import dataclass

_JUDGE_THRESHOLD = 0.5  # 与 AssetEvaluator._JUDGE_THRESHOLD 一致


@dataclass
class BenchmarkItem:
    asset: dict
    gold_score: float
    gold_pass: bool


@dataclass
class BenchmarkResult:
    accuracy: float
    mae: float
    good_mean: float
    bad_mean: float

    @property
    def sep(self) -> float:
        return self.good_mean - self.bad_mean


BENCHMARK_ITEMS = [
    # 好模板：结构化完整（标题/要点/决策/待办含责任人）
    BenchmarkItem(asset={"type": "template", "title": "发布计划模板-结构化",
                         "content": "标题：发布计划\n要点：确定 8 月 15 日上线\n决策：不做延期\n待办：市场部宣传物料（李娜，8/10）\n待办：研发部版本冻结（王强，8/12）"},
                  gold_score=0.85, gold_pass=True),
    BenchmarkItem(asset={"type": "template", "title": "会议纪要模板-完整",
                         "content": "标题：会议纪要\n参加人：市场部、研发部\n要点：新产品 8 月 15 日上线\n决策：日期确定\n待办：宣传物料（李娜，8/10）\n待办：客户通知（张伟，8/13）"},
                  gold_score=0.85, gold_pass=True),
    # 差模板：内容单薄、无待办责任人
    BenchmarkItem(asset={"type": "template", "title": "会议纪要模板-单薄",
                         "content": "标题：会议纪要\n今天开会讨论了发布的事情，大家同意 8 月 15 日上线。\n具体谁负责后面再说。"},
                  gold_score=0.3, gold_pass=False),
    BenchmarkItem(asset={"type": "template", "title": "发布计划模板-草率",
                         "content": "标题：发布计划\n定了 8 月 15 日上线。"},
                  gold_score=0.2, gold_pass=False),
    # 好产出物：完整纪要
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0815-完整",
                         "content": "会议确定新产品 8 月 15 日上线。\n市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。\n所有待办均指定责任人与截止日期。"},
                  gold_score=0.8, gold_pass=True),
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0814-完整",
                         "content": "会议讨论预算调整。\n财务部负责更新预算表（张伟，8/20），市场部确认宣传预算（李娜，8/18）。\n下次评审定于 8 月 25 日。"},
                  gold_score=0.8, gold_pass=True),
    # 差产出物：一句话/无结构
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0815-简略", "content": "开了个会，说了说发布的事。"},
                  gold_score=0.2, gold_pass=False),
    BenchmarkItem(asset={"type": "artifact", "title": "纪要-0814-简略", "content": "讨论了预算。"},
                  gold_score=0.15, gold_pass=False),
]


def evaluate_judge(judge, items=None) -> BenchmarkResult:
    """逐条评测 judge（0-1 分数），输出准确率/校准/区分度指标。"""
    items = items if items is not None else BENCHMARK_ITEMS
    correct = 0
    abs_errors = []
    good_scores, bad_scores = [], []
    for item in items:
        score = float(judge(item.asset))
        if (score >= _JUDGE_THRESHOLD) == item.gold_pass:
            correct += 1
        abs_errors.append(abs(score - item.gold_score))
        (good_scores if item.gold_pass else bad_scores).append(score)
    good_mean = sum(good_scores) / len(good_scores) if good_scores else 0.0
    bad_mean = sum(bad_scores) / len(bad_scores) if bad_scores else 0.0
    return BenchmarkResult(
        accuracy=correct / len(items),
        mae=sum(abs_errors) / len(abs_errors),
        good_mean=good_mean,
        bad_mean=bad_mean,
    )
```

`backend/pilot_judge.py` 扩展 `--benchmark` 参数（复用 make_llm_judge 与 run 的 key 参数）：`--benchmark` 时构造 judge → `evaluate_judge(judge)` → 打印各指标 + 逐条分数（资产标题 + judge 分数 + gold）。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_judge_benchmark.py tests/test_asset_judge.py -q`
Expected: 4 新用例 + judge 回归全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_judge_benchmark.py backend/tests/test_asset_judge_benchmark.py backend/pilot_judge.py
git commit -m "feat(hybrid): judge benchmark with labeled assets and accuracy/calibration metrics"
```

---

## Self-Review 结论

- **Spec 覆盖**：T1→[S3]（AssetContextBuilder）；T2→[S3]（节点注入 seam）；T3→[S4]（评测基准）。[S1]/[S2]/[S5] 为设计说明/验收。全部覆盖。
- **无占位符**：全部步骤含可运行代码与预期输出；涉及 coordinator 内部（prompt 构造/init 尾置）给出"以实际代码为准"指引。
- **类型一致性**：`build_asset_context(store, extractor, team_id, task_type, keywords) -> str`；`asset_context_builder: Optional[Callable[[str, str, list | None], str]]`；`evaluate_judge(judge, items=None) -> BenchmarkResult`（accuracy/mae/good_mean/bad_mean/sep）跨任务一致。
- **低耦合**：AssetStore/AssetEvaluator/AssetSearch/AssetJudge 零改动；注入 seam 默认 None 零行为变化；评测基准纯消费既有组件。
