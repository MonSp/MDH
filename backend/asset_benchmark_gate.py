"""评测基准 CI 门禁：LLM judge 质量指标（准确率/校准/区分度）是否达标。

仿 AIP Evals 评测纪律 + loop-engineering gate 先例：evaluate_judge 指标 vs 阈值，
violations 列出未达标项；基线记录（可选）供防退化。CLI 无 key 时用确定性 perfect judge
验证门禁流程本身（注明"未运行真实评测"）。
"""

import argparse
import json
import os
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from asset_judge_benchmark import BENCHMARK_ITEMS, evaluate_judge, load_benchmark_items

DEFAULT_THRESHOLDS = {"min_accuracy": 0.8, "max_mae": 0.3, "min_sep": 0.3}


@dataclass
class GateResult:
    passed: bool
    metrics: dict
    violations: list = field(default_factory=list)


def _current_commit() -> str:
    """当前 HEAD commit（基线可追溯）；非 git 环境/失败回退空串。"""
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True,
                                       stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def run_gate(judge: Callable[[dict], float], items=None, thresholds: dict | None = None,
             baseline_path: str | None = None) -> GateResult:
    """评估 judge 质量指标 vs 阈值；baseline_path 非空时记录基线 JSON。"""
    thresholds = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
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
            json.dump({"timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"), "commit": _current_commit(),
                       "metrics": metrics, "passed": passed},
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
        # 无 key：确定性 perfect judge 验证门禁流程（基于实际标注集 items，缺省内置集；恒过）
        pool = items if items is not None else BENCHMARK_ITEMS
        judge = lambda asset: next(i.gold_score for i in pool if i.asset["content"] == asset.get("content"))
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
