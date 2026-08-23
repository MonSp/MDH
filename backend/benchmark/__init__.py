"""MDH 评测基准系统"""

from benchmark.tasks import BenchmarkTask, BENCHMARK_TASKS, get_benchmark_tasks
from benchmark.runner import (
    TaskResult, BenchmarkReport, MetricsCollector,
    run_single_task, run_benchmark, compare_with_baseline,
    save_baseline, format_report,
)

__all__ = [
    "BenchmarkTask", "BENCHMARK_TASKS", "get_benchmark_tasks",
    "TaskResult", "BenchmarkReport", "MetricsCollector",
    "run_single_task", "run_benchmark", "compare_with_baseline",
    "save_baseline", "format_report",
]
