# [M4 后续] 评测基准标注集外部化 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `asset_judge_benchmark.BENCHMARK_ITEMS`（模块常量 8 条）外部化为 JSON 文件加载（M4 评审建议"配置/文件加载而非模块常量，避免 8 条集在代码里膨胀；试点部门真实标注集可注入"）——新增 `load_benchmark_items(path)`（解析 + 校验）、示例文件 `benchmark_items.example.json`、`pilot_judge --benchmark-file` 参数。

**Architecture:** `asset_judge_benchmark.py` 新增 `load_benchmark_items(path) -> list[BenchmarkItem]`（纯标准库 json 解析 + 字段/一致性校验 + 文件缺失/非法 JSON 清晰异常）；内置 `BENCHMARK_ITEMS` 保留为默认回退（`evaluate_judge(items=None)` 语义不变，向后兼容）；入库 `backend/benchmark_items.example.json`（与内置同内容、演示外部化格式）；`pilot_judge.py --benchmark-file` 指定外部标注集（缺省内置）。真实试点部门标注集放 `data/benchmark_items.json`（gitignored 运行数据）。

**Tech Stack:** Python 3.11 · pytest 9.1.1 · 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`evaluate_judge` 签名与语义（items=None 回退内置）、`BenchmarkItem`/`BenchmarkResult` dataclass 字段、`_JUDGE_THRESHOLD` 引用、内置 `BENCHMARK_ITEMS` 数据内容。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）。

---

### Task 1: load_benchmark_items + 示例文件

**Files:**
- Modify: `backend/asset_judge_benchmark.py`（新增 `load_benchmark_items`）
- Create: `backend/benchmark_items.example.json`
- Test: `backend/tests/test_asset_judge_benchmark.py`（追加）

**Interfaces:**
- Consumes: `BenchmarkItem`（asset/gold_score/gold_pass）；`_JUDGE_THRESHOLD`（asset_evaluator）。
- Produces: `load_benchmark_items(path: str) -> list[BenchmarkItem]`——读 JSON（`[{"asset": {"type","title","content","team_id"}, "gold_score": 0.85, "gold_pass": true}]`），逐条构造 `BenchmarkItem`；校验：每条含 asset dict + gold_score 0-1 + gold_pass bool + `gold_pass == (gold_score >= _JUDGE_THRESHOLD)`（不一致抛 `ValueError`）；文件缺失/非法 JSON 抛 `FileNotFoundError`/`ValueError`（清晰异常，不静默）。

- [ ] **Step 1: 写失败测试**（追加 `backend/tests/test_asset_judge_benchmark.py`）

```python
def test_load_benchmark_items_from_json(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    f = tmp_path / "items.json"
    f.write_text(json.dumps([
        {"asset": {"type": "artifact", "title": "a", "content": "好内容"}, "gold_score": 0.8, "gold_pass": True},
        {"asset": {"type": "artifact", "title": "b", "content": "差内容"}, "gold_score": 0.2, "gold_pass": False},
    ]), encoding="utf-8")
    items = load_benchmark_items(str(f))
    assert len(items) == 2
    assert items[0].gold_score == 0.8 and items[0].gold_pass is True
    assert items[1].asset["title"] == "b"


def test_load_benchmark_items_rejects_inconsistent_gold_pass(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    f = tmp_path / "bad.json"
    f.write_text(json.dumps([
        {"asset": {"type": "artifact", "title": "a", "content": "内容"}, "gold_score": 0.8, "gold_pass": False},
    ]), encoding="utf-8")
    with pytest.raises(ValueError):
        load_benchmark_items(str(f))


def test_load_benchmark_items_missing_file(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    with pytest.raises(FileNotFoundError):
        load_benchmark_items(str(tmp_path / "nope.json"))


def test_load_benchmark_items_invalid_json(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    f = tmp_path / "bad.json"
    f.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError):
        load_benchmark_items(str(f))
```

（文件头需 `import json`——读现有 imports 确认。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_judge_benchmark.py::test_load_benchmark_items_from_json -v`
Expected: FAIL——`ImportError: cannot import name 'load_benchmark_items'`。

- [ ] **Step 3: 实现**

`backend/asset_judge_benchmark.py` 追加（BENCHMARK_ITEMS 之后、evaluate_judge 之前）：

```python
def load_benchmark_items(path: str) -> list[BenchmarkItem]:
    """从 JSON 文件加载标注集（外部化：试点部门真实标注集可注入）。

    格式：`[{"asset": {"type","title","content","team_id"}, "gold_score": 0-1, "gold_pass": bool}]`；
    校验 gold_pass 与 gold_score 阈值一致（不一致抛 ValueError）；文件缺失/非法 JSON 抛清晰异常。
    """
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    items = []
    for entry in raw:
        asset = entry.get("asset")
        if not isinstance(asset, dict):
            raise ValueError(f"标注集条目缺 asset dict: {entry!r}")
        gold_score = entry.get("gold_score")
        gold_pass = entry.get("gold_pass")
        if not isinstance(gold_score, (int, float)) or not 0.0 <= gold_score <= 1.0:
            raise ValueError(f"gold_score 非法: {gold_score!r}")
        if not isinstance(gold_pass, bool):
            raise ValueError(f"gold_pass 非法: {gold_pass!r}")
        if gold_pass != (gold_score >= _JUDGE_THRESHOLD):
            raise ValueError(f"gold_pass 与 gold_score 阈值不一致: {entry!r}")
        items.append(BenchmarkItem(asset=asset, gold_score=float(gold_score), gold_pass=gold_pass))
    return items
```

（`import json` 加到文件头。）

新建 `backend/benchmark_items.example.json`（与内置 BENCHMARK_ITEMS 同内容、演示外部化格式——8 条，含 asset 的 team_id 键如 `"team_id": "demo"`；好资产 gold 0.8-0.85/True，差资产 0.15-0.3/False）。

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_judge_benchmark.py -q`
Expected: 全绿（既有 5 + 新 4）。

- [ ] **Step 5: 提交**

```bash
git add backend/asset_judge_benchmark.py backend/benchmark_items.example.json backend/tests/test_asset_judge_benchmark.py
git commit -m "feat(hybrid): externalize judge benchmark items via JSON loader"
```

---

### Task 2: pilot_judge --benchmark-file 参数

**Files:**
- Modify: `backend/pilot_judge.py`（`--benchmark-file` 参数 + run_benchmark 接线）

**Interfaces:**
- Consumes: Task 1 `load_benchmark_items`。
- Produces: `pilot_judge.py --benchmark-file <path>`（`--benchmark` 置位且提供文件时用外部标注集；缺省内置 `BENCHMARK_ITEMS`）；docstring 补示例。

- [ ] **Step 1: 实现**

`backend/pilot_judge.py`：
- import 改 `from asset_judge_benchmark import evaluate_judge, load_benchmark_items`（BENCHMARK_ITEMS 已不用——M4 修复轮已删 import；确认）。
- `run_benchmark(judge, model, benchmark_file=None)`：`items = load_benchmark_items(benchmark_file) if benchmark_file else None` → `evaluate_judge(judge, items=items)`。
- `parse_args` 加 `--benchmark-file`（help "外部标注集 JSON 文件（缺省内置）"）。
- `run()` 分发 `if args.benchmark: run_benchmark(judge, args.model, benchmark_file=args.benchmark_file); return`。
- docstring 补 `--benchmark-file` 示例。

- [ ] **Step 2: 验证**

Run: `/home/test/miniconda3/envs/agentscope/bin/python backend/pilot_judge.py --help | grep benchmark-file`（参数存在）
Run: `/home/test/miniconda3/envs/agentscope/bin/python -m py_compile backend/pilot_judge.py`（语法正确）

- [ ] **Step 3: 提交**

```bash
git add backend/pilot_judge.py
git commit -m "feat(pilot): benchmark file option for external judge benchmark items"
```

---

## Self-Review 结论

- **覆盖**：M4 评审登记（标注集外部化）落地——`load_benchmark_items` + 示例文件 + pilot 参数；内置默认回退保持向后兼容。
- **无占位符**：全部步骤含可运行代码/命令与预期输出。
- **范围**：`asset_judge_benchmark.py`（新增 load 函数）+ 示例 JSON + pilot_judge 参数 + 测试；不改 evaluate_judge/BenchmarkItem/BENCHMARK_ITEMS 既有语义。
