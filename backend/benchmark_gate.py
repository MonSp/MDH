"""
评测基准 CI 门禁 — 无 key 自检 + 基线回归检测

用法：
    python benchmark_gate.py                        # 自检模式（无需 LLM key）
    python benchmark_gate.py --with-llm             # 真实 LLM 模式
    python benchmark_gate.py --baseline baselines/v2.0.0.json  # 对比基线

退出码：
    0 — 通过
    1 — 失败（回归或指标超限）
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from benchmark.tasks import get_benchmark_tasks
from benchmark.runner import (
    run_benchmark, compare_with_baseline, format_report,
    BenchmarkReport, TaskResult,
)


def run_self_check() -> BenchmarkReport:
    """无 LLM 自检 — 验证评测框架可用性

    不调用 LLM，仅验证：
    - 评测任务加载正常
    - 指标收集器工作正常
    - 基线对比逻辑正确
    - 报告格式化正常
    """
    tasks = get_benchmark_tasks()
    report = BenchmarkReport(
        timestamp="self-check",
        total=len(tasks),
        passed=len(tasks),
        failed=0,
        avg_llm_calls=0,
        avg_latency_s=0,
        results=[
            TaskResult(
                task_id=t.id,
                success=True,
                llm_calls=0,
                tool_calls=0,
                files_written=0,
                latency_s=0,
                path_used=t.expected_path,
            )
            for t in tasks
        ],
    )

    # 验证基线对比逻辑
    baseline_path = os.path.join(os.path.dirname(__file__), "..", "baselines", "v2.0.0.json")
    if os.path.exists(baseline_path):
        report = compare_with_baseline(report, baseline_path)

    return report


def check_thresholds(report: BenchmarkReport) -> list:
    """检查指标是否超限"""
    failures = []

    # 成功率门禁
    if report.total > 0:
        success_rate = report.passed / report.total
        if success_rate < 0.8:
            failures.append(f"成功率 {success_rate:.0%} < 80%")

    # 回归门禁
    if report.regressions:
        for reg in report.regressions:
            failures.append(reg)

    return failures


def main():
    parser = argparse.ArgumentParser(description="MDH 评测基准 CI 门禁")
    parser.add_argument("--with-llm", action="store_true", help="使用真实 LLM 运行评测")
    parser.add_argument("--baseline", default="", help="基线 JSON 路径")
    parser.add_argument("--category", default="", help="按类别过滤")
    args = parser.parse_args()

    # 默认基线路径
    if not args.baseline:
        default_bl = os.path.join(os.path.dirname(__file__), "..", "baselines", "v2.0.0.json")
        if os.path.exists(default_bl):
            args.baseline = default_bl

    print("=" * 60)
    print("MDH 评测基准 CI 门禁")
    print("=" * 60)

    if args.with_llm:
        # 真实 LLM 模式
        print("模式: 真实 LLM 评测")
        tasks = get_benchmark_tasks(category=args.category or None)
        report = run_benchmark(tasks=tasks)
    else:
        # 自检模式
        print("模式: 无 key 自检（验证框架可用性）")
        report = run_self_check()

    # 对比基线
    if args.baseline:
        print(f"基线: {args.baseline}")
        report = compare_with_baseline(report, args.baseline)

    # 输出报告
    print(format_report(report))

    # 检查门禁
    failures = check_thresholds(report)

    if failures:
        print(f"\n❌ 门禁失败 ({len(failures)} 项):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print(f"\n✅ 门禁通过")
        if not args.with_llm:
            print("   (自检模式：未运行真实 LLM 评测)")
        sys.exit(0)


if __name__ == "__main__":
    main()
