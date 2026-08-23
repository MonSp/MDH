"""
评测基准 CLI 入口

用法：
    python benchmark_cli.py                          # 运行全部
    python benchmark_cli.py --category simple        # 按类别
    python benchmark_cli.py --task-id simple-01      # 单个任务
    python benchmark_cli.py --baseline baselines/v1.json  # 对比基线
    python benchmark_cli.py --save-baseline baselines/v2.json  # 保存为基线
"""

import argparse
import asyncio
import json
import logging
import os
import sys

# 确保 backend 目录在 path 中
sys.path.insert(0, os.path.dirname(__file__))

from benchmark.tasks import get_benchmark_tasks
from benchmark.runner import (
    run_benchmark, compare_with_baseline, save_baseline, format_report,
)

logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")
logger = logging.getLogger("benchmark_cli")


async def main():
    parser = argparse.ArgumentParser(description="MDH 评测基准")
    parser.add_argument("--category", choices=["simple", "standard", "complex"], help="按类别过滤")
    parser.add_argument("--task-id", help="运行单个任务")
    parser.add_argument("--baseline", help="基线 JSON 路径（对比回归）")
    parser.add_argument("--save-baseline", help="保存结果为基线")
    parser.add_argument("--output", help="报告输出路径（JSON）")
    parser.add_argument("--workspace", help="工作区路径")
    parser.add_argument("--analyze", action="store_true", help="输出详细分析报告")
    parser.add_argument("--trends", nargs="*", help="趋势对比：多个基线文件路径")
    args = parser.parse_args()

    # 获取任务
    if args.task_id:
        tasks = [t for t in get_benchmark_tasks() if t.id == args.task_id]
        if not tasks:
            logger.error("任务不存在: %s", args.task_id)
            sys.exit(1)
    else:
        tasks = get_benchmark_tasks(category=args.category)

    logger.info("运行 %d 个评测任务", len(tasks))

    # 执行评测
    report = await run_benchmark(tasks=tasks, workspace=args.workspace)

    # 对比基线
    if args.baseline:
        report = compare_with_baseline(report, args.baseline)

    # 输出报告
    print(format_report(report))

    # 分析报告
    if args.analyze:
        from benchmark.analysis import analyze_report, format_analysis, compare_versions
        from dataclasses import asdict
        report_dict = asdict(report)
        analysis = analyze_report(report_dict)

        # 趋势对比
        if args.trends:
            analysis.trends = compare_versions(args.trends)
            if len(analysis.trends) >= 2:
                first, last = analysis.trends[0], analysis.trends[-1]
                rate_delta = last.success_rate - first.success_rate
                llm_delta = last.avg_llm_calls - first.avg_llm_calls
                analysis.trend_summary = f"成功率 {'↑' if rate_delta >= 0 else '↓'}{abs(rate_delta):.0%} | LLM 调用 {'↑' if llm_delta >= 0 else '↓'}{abs(llm_delta):.1f}"

        print(format_analysis(analysis))

    # 保存基线
    if args.save_baseline:
        save_baseline(report, args.save_baseline)

    # 保存 JSON 报告
    if args.output:
        from dataclasses import asdict
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(asdict(report), f, ensure_ascii=False, indent=2)
        logger.info("报告已保存: %s", args.output)

    # 退出码：有回归返回 1
    if report.regressions:
        logger.error("检测到 %d 个回归!", len(report.regressions))
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
