"""Tests for benchmark — 评测基准系统"""
import json
import os
import pytest

from benchmark.tasks import BENCHMARK_TASKS, get_benchmark_tasks, BenchmarkTask
from benchmark.runner import (
    TaskResult, BenchmarkReport, MetricsCollector,
    compare_with_baseline, save_baseline, format_report,
)


class TestBenchmarkTasks:
    def test_all_tasks_have_required_fields(self):
        for task in BENCHMARK_TASKS:
            assert task.id, f"任务缺少 id"
            assert task.task, f"任务 {task.id} 缺少 task"
            assert task.category in ("simple", "standard", "complex"), f"任务 {task.id} 类别无效"
            assert task.expected_path in ("simple", "complex", "workflow"), f"任务 {task.id} 路径无效"
            assert task.max_llm_calls > 0, f"任务 {task.id} max_llm_calls 无效"

    def test_get_by_category(self):
        simple = get_benchmark_tasks(category="simple")
        assert all(t.category == "simple" for t in simple)
        assert len(simple) >= 2

    def test_get_by_tags(self):
        python_tasks = get_benchmark_tasks(tags=["python"])
        assert len(python_tasks) >= 2
        assert all("python" in t.tags for t in python_tasks)

    def test_get_all(self):
        assert len(BENCHMARK_TASKS) >= 5


class TestMetricsCollector:
    def test_initial_state(self):
        c = MetricsCollector()
        assert c.llm_calls == 0
        assert c.tool_calls == 0
        assert c.files_written == 0


class TestBenchmarkReport:
    def test_format_report(self):
        report = BenchmarkReport(
            timestamp="2026-08-23T00:00:00Z",
            total=2, passed=1, failed=1,
            avg_llm_calls=5.0, avg_latency_s=10.0,
            results=[
                TaskResult(task_id="t1", success=True, llm_calls=3, latency_s=5.0),
                TaskResult(task_id="t2", success=False, llm_calls=7, latency_s=15.0, error="timeout"),
            ],
            regressions=["[回归] t2: 成功→失败"],
            improvements=[],
        )
        text = format_report(report)
        assert "MDH 评测基准报告" in text
        assert "✅" in text
        assert "❌" in text
        assert "回归" in text

    def test_save_and_load_baseline(self, tmp_path):
        report = BenchmarkReport(
            timestamp="2026-08-23T00:00:00Z",
            total=1, passed=1, failed=0,
            avg_llm_calls=3.0, avg_latency_s=5.0,
            results=[TaskResult(task_id="t1", success=True, llm_calls=3, latency_s=5.0)],
        )
        path = str(tmp_path / "baseline.json")
        save_baseline(report, path)
        assert os.path.exists(path)

        with open(path) as f:
            data = json.load(f)
        assert data["total"] == 1
        assert len(data["results"]) == 1


class TestCompareBaseline:
    def test_detect_regression(self, tmp_path):
        baseline = {
            "results": [
                {"task_id": "t1", "success": True, "llm_calls": 3, "latency_s": 5.0},
            ]
        }
        bl_path = str(tmp_path / "bl.json")
        with open(bl_path, "w") as f:
            json.dump(baseline, f)

        report = BenchmarkReport(
            total=1, passed=0, failed=1,
            results=[TaskResult(task_id="t1", success=False, llm_calls=3, latency_s=5.0, error="fail")],
        )
        report = compare_with_baseline(report, bl_path)
        assert len(report.regressions) == 1
        assert "成功→失败" in report.regressions[0]

    def test_detect_improvement(self, tmp_path):
        baseline = {
            "results": [
                {"task_id": "t1", "success": False, "llm_calls": 10, "latency_s": 20.0},
            ]
        }
        bl_path = str(tmp_path / "bl.json")
        with open(bl_path, "w") as f:
            json.dump(baseline, f)

        report = BenchmarkReport(
            total=1, passed=1, failed=0,
            results=[TaskResult(task_id="t1", success=True, llm_calls=5, latency_s=10.0)],
        )
        report = compare_with_baseline(report, bl_path)
        assert len(report.improvements) >= 1

    def test_no_baseline_file(self, tmp_path):
        report = BenchmarkReport(total=0)
        report = compare_with_baseline(report, str(tmp_path / "nonexistent.json"))
        assert report.regressions == []
