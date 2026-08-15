# [M4 后续] 评测基准 CI 门禁集成 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 M4 评测基准（`asset_judge_benchmark.evaluate_judge`）落地为 CI 质量门禁——门禁命令检查 LLM judge 的准确率/校准/区分度指标是否达标（仿 AIP Evals 评测纪律 + loop-engineering gate 先例），供 CI 步骤调用。仓库无 CI 配置（.github/workflows 不存在），本计划交付门禁模块 + CI 接入示例文档。

**Architecture:** 新增 `backend/asset_benchmark_gate.py`——`run_gate(judge, items=None, thresholds=None, baseline_path=None) -> GateResult`（指标 vs 阈值 → passed + 明细）；`main()` CLI（`--api-key/--base-url/--model/--benchmark-file/--baseline`，无 key 时用确定性 fake judge 验证门禁流程本身）；基线记录（`data/benchmark_baseline.json`：指标 + 时间戳 + 提交——防退化，可选）；退出码 0/1。文档：`docs/compose/plans/2026-08-15-hybrid-team-platform-benchmark-ci.md` 或 docs/ 下 CI 集成说明（GitHub Actions workflow 示例 + 阈值配置）。

**Tech Stack:** Python 3.11 · pytest 9.1.1 · 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`asset_judge_benchmark.py`（evaluate_judge/BENCHMARK_ITEMS/load_benchmark_items 语义——门禁纯消费）；`asset_judge.py`（make_judge_from_env/make_llm_judge）；`pilot_judge.py`。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）。

---

### Task 1: asset_benchmark_gate 门禁模块

**Files:**
- Create: `backend/asset_benchmark_gate.py`
- Test: `backend/tests/test_asset_benchmark_gate.py`

**Interfaces:**
- Consumes: `evaluate_judge(judge, items=None) -> BenchmarkResult`（accuracy/mae/good_mean/bad_mean/sep）；`load_benchmark_items(path)`；`make_judge_from_env()`（asset_judge.py）。
- Produces: `DEFAULT_THRESHOLDS = {"min_accuracy": 0.8, "max_mae": 0.3, "min_sep": 0.3}`；`GateResult` dataclass（passed: bool, metrics: dict, violations: list[str]）；`run_gate(judge, items=None, thresholds=None, baseline_path=None) -> GateResult`（评估 → 逐指标 vs 阈值 → violations；baseline_path 非空时记录 `{"timestamp", "metrics", "passed"}` 到 JSON）；`main()` CLI（argparse：--api-key/--base-url/--model/--benchmark-file/--baseline/--min-accuracy/--max-mae/--min-sep；无 api-key 且 env 无 DEEPSEEK_API_KEY → 用确定性 fake judge（perfect judge——验证门禁流程恒过，注明"未运行真实评测"）；退出码 0=passed/1=failed）。

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_asset_benchmark_gate.py`）

```python
from asset_benchmark_gate import DEFAULT_THRESHOLDS, GateResult, run_gate


def _perfect_judge(asset):
    from asset_judge_benchmark import BENCHMARK_ITEMS
    return next(i.gold_score for i in BENCHMARK_ITEMS if i.asset["content"] == asset.get("content"))


def test_run_gate_perfect_judge_passes():
    result = run_gate(_perfect_judge)
    assert result.passed
    assert result.metrics["accuracy"] == 1.0
    assert result.metrics["sep"] > 0.3
    assert result.violations == []


def test_run_gate_bad_judge_fails():
    def inverted_judge(asset):
        from asset_judge_benchmark import BENCHMARK_ITEMS
        item = next(i for i in BENCHMARK_ITEMS if i.asset["content"] == asset.get("content"))
        return 0.0 if item.gold_pass else 1.0

    result = run_gate(inverted_judge)
    assert not result.passed
    assert any("accuracy" in v for v in result.violations)


def test_run_gate_custom_thresholds():
    result = run_gate(_perfect_judge, thresholds={"min_accuracy": 0.9, "max_mae": 0.1, "min_sep": 0.5})
    assert result.passed
    tight = run_gate(_perfect_judge, thresholds={"min_accuracy": 0.99, "max_mae": 0.01, "min_sep": 0.9})
    assert not tight.passed  # mae=0 < 0.01 通过但 sep 0.6125 < 0.9 → 失败


def test_run_gate_records_baseline(tmp_path):
    result = run_gate(_perfect_judge, baseline_path=str(tmp_path / "baseline.json"))
    assert result.passed
    import json
    data = json.loads((tmp_path / "baseline.json").read_text(encoding="utf-8"))
    assert data["passed"] is True and data["metrics"]["accuracy"] == 1.0 and "timestamp" in data
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_benchmark_gate.py -v`
Expected: FAIL——`ModuleNotFoundError: No module named 'asset_benchmark_gate'`。

- [ ] **Step 3: 实现**（新建 `backend/asset_benchmark_gate.py`）

```python
"""评测基准 CI 门禁：LLM judge 质量指标（准确率/校准/区分度）是否达标。

仿 AIP Evals 评测纪律 + loop-engineering gate 先例：evaluate_judge 指标 vs 阈值，
violations 列出未达标项；基线记录（可选）供防退化。CLI 无 key 时用确定性 perfect judge
验证门禁流程本身（注明"未运行真实评测"）。
"""

import argparse
import json
import os
import time
from dataclasses import dataclass, field
from typing import Callable

from asset_judge_benchmark import BENCHMARK_ITEMS, evaluate_judge, load_benchmark_items

DEFAULT_THRESHOLDS = {"min_accuracy": 0.8, "max_mae": 0.3, "min_sep": 0.3}


@dataclass
class GateResult:
    passed: bool
    metrics: dict
    violations: list = field(default_factory=list)


def _perfect_judge(asset) -> float:
    return next(i.gold_score for i in BENCHMARK_ITEMS if i.asset["content"] == asset.get("content"))


def run_gate(judge: Callable[[dict], float], items=None, thresholds: dict | None = None,
             baseline_path: str | None = None) -> GateResult:
    """评估 judge 质量指标 vs 阈值；baseline_path 非空时记录基线 JSON。"""
    thresholds = thresholds or DEFAULT_THRESHOLDS
    result = evaluate_judge(judge, items=items)
    metrics = {"accuracy": result.accuracy, "mae": result.mae,
               "good_mean": result.good_mean, "bad_mean": result.bad_mean, "sep": result.sep}
    violations = []
    if metrics["accuracy"] < thresholds["min_accuracy"]:
        violations.append(f"accuracy {metrics['accuracy']:.3f} < {thresholds['min_accuracy']}")
    if metrics["mae"] > thresholds["max_mae"]:
        violations.append(f"mae {metrics['mae']:.3f} > {thresholds['max_mae']}")
    if metrics["sep"] < thresholds["min_sep"]:
        violations.append(f"sep {metrics['sep']:.3f} < {thresholds['min_sep']}")
    passed = not violations
    if baseline_path:
        with open(baseline_path, "w", encoding="utf-8") as f:
            json.dump({"timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"), "metrics": metrics, "passed": passed},
                      f, ensure_ascii=False, indent=1)
    return GateResult(passed=passed, metrics=metrics, violations=violations)


def main() -> int:
    p = argparse.ArgumentParser(description="评测基准 CI 门禁（LLM judge 质量指标）")
    p.add_argument("--api-key", default=os.environ.get("DEEPSEEK_API_KEY", ""))
    p.add_argument("--base-url", default=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"))
    p.add_argument("--model", default=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"))
    p.add_argument("--benchmark-file", default="", help="外部标注集 JSON（缺省内置）")
    p.add_argument("--baseline", default="", help="基线 JSON 路径（记录指标防退化）")
    p.add_argument("--min-accuracy", type=float, default=DEFAULT_THRESHOLDS["min_accuracy"])
    p.add_argument("--max-mae", type=float, default=DEFAULT_THRESHOLDS["max_mae"])
    p.add_argument("--min-sep", type=float, default=DEFAULT_THRESHOLDS["min_sep"])
    args = p.parse_args()

    items = load_benchmark_items(args.benchmark_file) if args.benchmark_file else None
    real = False
    if args.api_key:
        from asset_judge import make_llm_judge
        judge = make_llm_judge(args.api_key, args.base_url, args.model)
        real = True
    else:
        judge = _perfect_judge  # 无 key：确定性 fake 验证门禁流程（恒过，注明未跑真实评测）
    result = run_gate(judge, items=items,
                      thresholds={"min_accuracy": args.min_accuracy, "max_mae": args.max_mae, "min_sep": args.min_sep},
                      baseline_path=args.baseline or None)
    print(f"[gate] {'PASS' if result.passed else 'FAIL'} {'（真实 LLM 评测）' if real else '（无 key：门禁流程自检，未运行真实评测）'}")
    print(f"[gate] metrics: accuracy={result.metrics['accuracy']:.3f} mae={result.metrics['mae']:.3f} "
          f"sep={result.metrics['sep']:.3f} good={result.metrics['good_mean']:.3f} bad={result.metrics['bad_mean']:.3f}")
    for v in result.violations:
        print(f"[gate] violation: {v}")
    return 0 if result.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_asset_benchmark_gate.py tests/test_asset_judge_benchmark.py -q`（新 4 + 基准回归全绿）
Run: `/home/test/miniconda3/envs/agentscope/bin/python asset_benchmark_gate.py`（无 key → 门禁流程自检 PASS，exit 0）

- [ ] **Step 5: 提交**

```bash
git add backend/asset_benchmark_gate.py backend/tests/test_asset_benchmark_gate.py
git commit -m "feat(hybrid): judge benchmark CI gate with thresholds and baseline"
```

---

### Task 2: CI 接入示例文档

**Files:**
- Create: `docs/compose/plans/2026-08-15-hybrid-team-platform-benchmark-ci.md`（或 `docs/compose/reports/` 侧——以 plans/ 下与计划同目录为准，命名 benchmark-ci-gate.md）

**Interfaces:**
- Consumes: Task 1 `asset_benchmark_gate.py` CLI。
- Produces: CI 接入说明——运行方式（真实 key 门禁 / 无 key 自检）、阈值配置（--min-accuracy/--max-mae/--min-sep）、基线（--baseline 记录）、GitHub Actions workflow 示例（`benchmark-gate` job：安装依赖 → `python asset_benchmark_gate.py --api-key ${{ secrets.DEEPSEEK_API_KEY }} --baseline data/benchmark_baseline.json`，成功/失败语义）、已知边界（真实评测消耗 token、CI 无 key 时自检恒过）。

- [ ] **Step 1: 实现**

写文档（运行方式/阈值/基线/GA workflow 示例/已知边界），内容与 Task 1 CLI 逐字对应。

- [ ] **Step 2: 验证**

Run: `grep -n "asset_benchmark_gate\|min-accuracy\|baseline" docs/compose/plans/2026-08-15-hybrid-team-platform-benchmark-ci.md`（关键命令/参数与实现一致）

- [ ] **Step 3: 提交**

```bash
git add docs/compose/plans/2026-08-15-hybrid-team-platform-benchmark-ci.md
git commit -m "docs(hybrid): judge benchmark CI gate integration guide"
```

---

## Self-Review 结论

- **覆盖**：M4 登记"评测基准 CI 门禁"落地——门禁命令（阈值/基线/真实+fake 模式）+ CI 接入示例文档；仿 AIP Evals 评测纪律 + loop-engineering gate 先例。
- **无占位符**：全部步骤含可运行代码/命令与预期输出。
- **范围**：新增门禁模块 + 测试 + 文档；asset_judge_benchmark/asset_judge/pilot_judge 零改动（门禁纯消费）。
