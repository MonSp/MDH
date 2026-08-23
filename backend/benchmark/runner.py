"""
评测运行器 — 执行基准任务，收集指标，对比基线

用法：
    python -m benchmark.runner --category simple --baseline baselines/v1.json
    python -m benchmark.runner --task-id simple-01
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from benchmark.tasks import BenchmarkTask, get_benchmark_tasks

logger = logging.getLogger("benchmark")


@dataclass
class TaskResult:
    """单个任务的评测结果"""
    task_id: str
    success: bool
    llm_calls: int = 0
    tool_calls: int = 0
    files_written: int = 0
    latency_s: float = 0.0
    path_used: str = ""
    error: str = ""
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BenchmarkReport:
    """评测报告"""
    timestamp: str = ""
    total: int = 0
    passed: int = 0
    failed: int = 0
    avg_llm_calls: float = 0.0
    avg_latency_s: float = 0.0
    results: List[TaskResult] = field(default_factory=list)
    regressions: List[str] = field(default_factory=list)
    improvements: List[str] = field(default_factory=list)


class MetricsCollector:
    """指标收集器 — 通过 monkey-patch 拦截 LLM/工具调用"""

    def __init__(self):
        self.llm_calls = 0
        self.tool_calls = 0
        self.files_written = 0
        self._original_reply = None
        self._original_execute = None

    def install(self, model, toolset=None):
        """安装拦截器"""
        if model and hasattr(model, 'reply'):
            self._original_reply = model.reply
            original = self._original_reply

            async def counting_reply(msg):
                self.llm_calls += 1
                return await original(msg)

            model.reply = counting_reply

        if toolset and hasattr(toolset, 'execute'):
            self._original_execute = toolset.execute
            original_exec = self._original_execute

            def counting_execute(tool_name, arguments):
                self.tool_calls += 1
                result = original_exec(tool_name, arguments)
                if tool_name == 'write_file' and result.success:
                    self.files_written += 1
                return result

            toolset.execute = counting_execute

    def uninstall(self):
        """卸载拦截器"""
        # 由调用方负责恢复
        pass


async def run_single_task(task: BenchmarkTask, workspace: str) -> TaskResult:
    """执行单个评测任务

    Args:
        task: 评测任务定义
        workspace: 工作区路径

    Returns:
        TaskResult 评测结果
    """
    start_time = time.time()
    result = TaskResult(task_id=task.id, success=False)

    try:
        # 动态导入避免循环依赖
        from meeting import MeetingSession
        from protocol import AgentRole

        # 创建临时会议
        meeting = MeetingSession(f"bench-{task.id}")
        meeting.add_agent("bench-ceo", "CEO", AgentRole.CEO, ["semantic_analysis"])
        meeting.add_agent("bench-executor", "Executor", AgentRole.EXECUTOR, ["code_generation"])
        meeting.add_agent("bench-reviewer", "Reviewer", AgentRole.REVIEWER, ["code_review"])
        meeting.start()

        # 使用 SimpleExecutor 或 TaskOrchestrator 执行
        from dynamic_router import DynamicRouter
        from task_orchestrator import TaskOrchestrator

        router = DynamicRouter(os.path.join(os.path.dirname(__file__), "..", "data", "routing_table.json"))

        collector = MetricsCollector()

        class DummyModel:
            name = "benchmark"
            async def reply(self, msg):
                # 返回一个简单的执行结果
                return type('Msg', (), {'content': [{'type': 'text', 'text': '任务完成'}]})()

        model = DummyModel()
        collector.llm_calls = 0  # DummyModel 不经过 safe_llm_reply

        # 简化执行：直接用 TaskOrchestrator
        orchestrator = TaskOrchestrator(
            get_model_fn=lambda role: model,
            meeting=meeting,
            router=router,
            workspace_root=workspace,
        )

        # 添加任务并执行
        meeting.add_task("bench-executor", task.task)
        meeting.update_task_status(meeting.tasks[0].id, "assigned")

        exec_results = await orchestrator.execute()

        result.llm_calls = collector.llm_calls
        result.tool_calls = collector.tool_calls
        result.files_written = sum(len(r.get("written_files", [])) for r in exec_results)
        result.path_used = "complex"

        # 检查成功条件
        if exec_results:
            result.success = True
            if task.expected_min_files > 0 and result.files_written < task.expected_min_files:
                result.success = False
                result.error = f"文件数不足: {result.files_written} < {task.expected_min_files}"

        meeting.stop()

    except Exception as e:
        result.error = str(e)
        logger.warning("评测任务 %s 失败: %s", task.id, e)

    result.latency_s = time.time() - start_time
    return result


async def run_benchmark(
    tasks: Optional[List[BenchmarkTask]] = None,
    category: Optional[str] = None,
    workspace: Optional[str] = None,
) -> BenchmarkReport:
    """运行评测基准

    Args:
        tasks: 指定任务列表（为空则运行全部）
        category: 按类别过滤
        workspace: 工作区路径

    Returns:
        BenchmarkReport 评测报告
    """
    if tasks is None:
        tasks = get_benchmark_tasks(category=category)

    if workspace is None:
        workspace = os.path.join(os.path.dirname(__file__), "..", "data", "benchmark_workspace")
    os.makedirs(workspace, exist_ok=True)

    report = BenchmarkReport(
        timestamp=datetime.now(timezone.utc).isoformat(),
        total=len(tasks),
    )

    for task in tasks:
        logger.info("评测: %s — %s", task.id, task.task[:50])
        result = await run_single_task(task, workspace)
        report.results.append(result)

        if result.success:
            report.passed += 1
        else:
            report.failed += 1

    # 计算平均值
    if report.results:
        report.avg_llm_calls = sum(r.llm_calls for r in report.results) / len(report.results)
        report.avg_latency_s = sum(r.latency_s for r in report.results) / len(report.results)

    return report


def compare_with_baseline(report: BenchmarkReport, baseline_path: str) -> BenchmarkReport:
    """对比基线，检测回归和改进

    Args:
        report: 当前评测报告
        baseline_path: 基线 JSON 文件路径

    Returns:
        更新了 regressions/improvements 的报告
    """
    if not os.path.exists(baseline_path):
        logger.info("基线文件不存在: %s，跳过对比", baseline_path)
        return report

    try:
        with open(baseline_path, "r", encoding="utf-8") as f:
            baseline = json.load(f)
    except Exception as e:
        logger.warning("读取基线失败: %s", e)
        return report

    baseline_results = {r["task_id"]: r for r in baseline.get("results", [])}

    for result in report.results:
        bl = baseline_results.get(result.task_id)
        if not bl:
            continue

        # 成功率回归
        if bl.get("success") and not result.success:
            report.regressions.append(f"[回归] {result.task_id}: 成功→失败 ({result.error})")

        # LLM 调用增加（超过 20%）
        bl_llm = bl.get("llm_calls", 0)
        if bl_llm > 0 and result.llm_calls > bl_llm * 1.2:
            report.regressions.append(f"[回归] {result.task_id}: LLM 调用 {bl_llm}→{result.llm_calls}")

        # 延迟增加（超过 50%）
        bl_lat = bl.get("latency_s", 0)
        if bl_lat > 0 and result.latency_s > bl_lat * 1.5:
            report.regressions.append(f"[回归] {result.task_id}: 延迟 {bl_lat:.1f}s→{result.latency_s:.1f}s")

        # 改进检测
        if not bl.get("success") and result.success:
            report.improvements.append(f"[改进] {result.task_id}: 失败→成功")
        if bl_llm > 0 and result.llm_calls < bl_llm * 0.8:
            report.improvements.append(f"[改进] {result.task_id}: LLM 调用 {bl_llm}→{result.llm_calls}")

    return report


def save_baseline(report: BenchmarkReport, path: str) -> None:
    """保存当前结果为基线"""
    data = {
        "timestamp": report.timestamp,
        "total": report.total,
        "passed": report.passed,
        "failed": report.failed,
        "avg_llm_calls": report.avg_llm_calls,
        "avg_latency_s": report.avg_latency_s,
        "results": [asdict(r) for r in report.results],
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info("基线已保存: %s", path)


def format_report(report: BenchmarkReport) -> str:
    """格式化评测报告"""
    lines = [
        f"{'='*60}",
        f"MDH 评测基准报告",
        f"{'='*60}",
        f"时间: {report.timestamp}",
        f"总计: {report.total} | 通过: {report.passed} | 失败: {report.failed}",
        f"平均 LLM 调用: {report.avg_llm_calls:.1f} | 平均延迟: {report.avg_latency_s:.1f}s",
        f"{'─'*60}",
    ]

    for r in report.results:
        status = "✅" if r.success else "❌"
        lines.append(f"  {status} {r.task_id}: LLM={r.llm_calls} 工具={r.tool_calls} 文件={r.files_written} 延迟={r.latency_s:.1f}s")
        if r.error:
            lines.append(f"     错误: {r.error}")

    if report.regressions:
        lines.append(f"{'─'*60}")
        lines.append("回归:")
        for reg in report.regressions:
            lines.append(f"  ⚠️  {reg}")

    if report.improvements:
        lines.append(f"{'─'*60}")
        lines.append("改进:")
        for imp in report.improvements:
            lines.append(f"  ✨ {imp}")

    lines.append(f"{'='*60}")
    return "\n".join(lines)
