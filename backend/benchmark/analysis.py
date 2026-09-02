"""
评测结果分析 — 统计汇总 + 分类对比 + 趋势追踪 + 异常检测

用法：
    from benchmark.analysis import analyze_report, compare_versions, format_analysis
"""

import json
import os
import statistics
from dataclasses import dataclass, field

from benchmark.tasks import BENCHMARK_TASKS


@dataclass
class CategoryStats:
    """分类统计"""
    category: str
    total: int = 0
    passed: int = 0
    failed: int = 0
    avg_llm_calls: float = 0.0
    avg_latency: float = 0.0
    avg_files: float = 0.0
    success_rate: float = 0.0


@dataclass
class TagStats:
    """标签统计"""
    tag: str
    total: int = 0
    passed: int = 0
    avg_llm_calls: float = 0.0
    avg_latency: float = 0.0


@dataclass
class Anomaly:
    """异常项"""
    task_id: str
    metric: str  # "llm_calls" | "latency" | "files"
    value: float
    expected: float
    deviation: float  # 标准差倍数


@dataclass
class TrendPoint:
    """趋势数据点"""
    version: str
    timestamp: str
    total: int
    passed: int
    success_rate: float
    avg_llm_calls: float
    avg_latency: float


@dataclass
class AnalysisReport:
    """分析报告"""
    # 汇总
    total_tasks: int = 0
    passed: int = 0
    failed: int = 0
    success_rate: float = 0.0
    avg_llm_calls: float = 0.0
    avg_latency: float = 0.0
    avg_files: float = 0.0

    # 分类
    by_category: dict[str, CategoryStats] = field(default_factory=dict)

    # 标签
    by_tag: dict[str, TagStats] = field(default_factory=dict)

    # 异常
    anomalies: list[Anomaly] = field(default_factory=list)

    # 趋势
    trends: list[TrendPoint] = field(default_factory=list)
    trend_summary: str = ""


def analyze_report(report_data: dict) -> AnalysisReport:
    """分析单次评测报告

    Args:
        report_data: 评测报告 JSON（从 benchmark_runner 输出）

    Returns:
        AnalysisReport 分析报告
    """
    results = report_data.get("results", [])
    if not results:
        return AnalysisReport()

    analysis = AnalysisReport(
        total_tasks=report_data.get("total", len(results)),
        passed=report_data.get("passed", 0),
        failed=report_data.get("failed", 0),
    )
    analysis.success_rate = analysis.passed / analysis.total_tasks if analysis.total_tasks > 0 else 0

    # 构建 task→category/tag 映射
    task_meta = {t.id: t for t in BENCHMARK_TASKS}

    # 按分类聚合
    cat_data: dict[str, list[dict]] = {}
    tag_data: dict[str, list[dict]] = {}
    llm_values = []
    lat_values = []
    file_values = []

    for r in results:
        tid = r.get("task_id", "")
        meta = task_meta.get(tid)
        cat = meta.category if meta else r.get("category", "unknown")
        tags = meta.tags if meta else []

        cat_data.setdefault(cat, []).append(r)
        for tag in tags:
            tag_data.setdefault(tag, []).append(r)

        llm = r.get("llm_calls", 0)
        lat = r.get("latency_s", 0)
        files = r.get("files_written", 0)
        llm_values.append(llm)
        lat_values.append(lat)
        file_values.append(files)

    # 汇总平均值
    analysis.avg_llm_calls = statistics.mean(llm_values) if llm_values else 0
    analysis.avg_latency = statistics.mean(lat_values) if lat_values else 0
    analysis.avg_files = statistics.mean(file_values) if file_values else 0

    # 分类统计
    for cat, items in cat_data.items():
        n = len(items)
        p = sum(1 for r in items if r.get("success"))
        cs = CategoryStats(
            category=cat, total=n, passed=p, failed=n - p,
            success_rate=p / n if n > 0 else 0,
            avg_llm_calls=statistics.mean(r.get("llm_calls", 0) for r in items),
            avg_latency=statistics.mean(r.get("latency_s", 0) for r in items),
            avg_files=statistics.mean(r.get("files_written", 0) for r in items),
        )
        analysis.by_category[cat] = cs

    # 标签统计
    for tag, items in tag_data.items():
        n = len(items)
        p = sum(1 for r in items if r.get("success"))
        ts = TagStats(
            tag=tag, total=n, passed=p,
            avg_llm_calls=statistics.mean(r.get("llm_calls", 0) for r in items),
            avg_latency=statistics.mean(r.get("latency_s", 0) for r in items),
        )
        analysis.by_tag[tag] = ts

    # 异常检测（Z-score > 2）
    def detect_anomalies(values: list[float], metric_name: str):
        if len(values) < 3:
            return
        mean = statistics.mean(values)
        stdev = statistics.stdev(values) if len(values) > 1 else 0
        if stdev == 0:
            return
        for i, v in enumerate(values):
            z = abs(v - mean) / stdev
            if z > 2 and v > mean:
                analysis.anomalies.append(Anomaly(
                    task_id=results[i].get("task_id", f"task-{i}"),
                    metric=metric_name, value=v, expected=mean, deviation=round(z, 2),
                ))

    detect_anomalies(llm_values, "llm_calls")
    detect_anomalies(lat_values, "latency")

    return analysis


def compare_versions(baseline_paths: list[str]) -> list[TrendPoint]:
    """对比多个基线版本，生成趋势数据

    Args:
        baseline_paths: 基线 JSON 文件路径列表（按时间排序）

    Returns:
        TrendPoint 列表
    """
    points = []
    for path in baseline_paths:
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            version = os.path.splitext(os.path.basename(path))[0]
            results = data.get("results", [])
            total = data.get("total", len(results))
            passed = data.get("passed", sum(1 for r in results if r.get("success")))
            llm = [r.get("llm_calls", 0) for r in results]
            lat = [r.get("latency_s", 0) for r in results]

            points.append(TrendPoint(
                version=version,
                timestamp=data.get("timestamp", ""),
                total=total,
                passed=passed,
                success_rate=passed / total if total > 0 else 0,
                avg_llm_calls=statistics.mean(llm) if llm else 0,
                avg_latency=statistics.mean(lat) if lat else 0,
            ))
        except Exception:
            continue
    return points


def format_analysis(analysis: AnalysisReport) -> str:
    """格式化分析报告"""
    lines = [
        "=" * 60,
        "评测结果分析",
        "=" * 60,
        "",
        "## 汇总",
        f"  总计: {analysis.total_tasks} | 通过: {analysis.passed} | 失败: {analysis.failed} | 成功率: {analysis.success_rate:.0%}",
        f"  平均 LLM 调用: {analysis.avg_llm_calls:.1f} | 平均延迟: {analysis.avg_latency:.1f}s | 平均文件: {analysis.avg_files:.1f}",
    ]

    if analysis.by_category:
        lines.append("")
        lines.append("## 分类对比")
        lines.append(f"  {'类别':<12} {'总计':>4} {'通过':>4} {'成功率':>6} {'LLM':>5} {'延迟':>6} {'文件':>5}")
        lines.append(f"  {'─'*48}")
        for cat in ["simple", "standard", "complex"]:
            cs = analysis.by_category.get(cat)
            if cs:
                lines.append(f"  {cat:<12} {cs.total:>4} {cs.passed:>4} {cs.success_rate:>5.0%} {cs.avg_llm_calls:>5.1f} {cs.avg_latency:>5.1f}s {cs.avg_files:>5.1f}")

    if analysis.by_tag:
        lines.append("")
        lines.append("## 标签分析（按任务数排序）")
        sorted_tags = sorted(analysis.by_tag.values(), key=lambda t: t.total, reverse=True)[:10]
        lines.append(f"  {'标签':<15} {'任务':>4} {'通过':>4} {'LLM':>5} {'延迟':>6}")
        lines.append(f"  {'─'*38}")
        for ts in sorted_tags:
            lines.append(f"  {ts.tag:<15} {ts.total:>4} {ts.passed:>4} {ts.avg_llm_calls:>5.1f} {ts.avg_latency:>5.1f}s")

    if analysis.anomalies:
        lines.append("")
        lines.append("## 异常项（Z-score > 2）")
        for a in analysis.anomalies:
            lines.append(f"  ⚠️  {a.task_id}: {a.metric} = {a.value:.1f}（期望 {a.expected:.1f}，偏离 {a.deviation}σ）")

    if analysis.trends:
        lines.append("")
        lines.append("## 趋势")
        lines.append(f"  {'版本':<15} {'总计':>4} {'通过':>4} {'成功率':>6} {'LLM':>5} {'延迟':>6}")
        lines.append(f"  {'─'*44}")
        for tp in analysis.trends:
            lines.append(f"  {tp.version:<15} {tp.total:>4} {tp.passed:>4} {tp.success_rate:>5.0%} {tp.avg_llm_calls:>5.1f} {tp.avg_latency:>5.1f}s")
        if analysis.trend_summary:
            lines.append(f"\n  {analysis.trend_summary}")

    lines.append("")
    lines.append("=" * 60)
    return "\n".join(lines)


def analyze_baseline_file(path: str) -> AnalysisReport:
    """分析基线文件"""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return analyze_report(data)
