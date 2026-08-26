"""Tests for benchmark/analysis.py — 评测结果分析"""
import json
import pytest

from benchmark.analysis import (
    analyze_report, compare_versions, format_analysis,
    analyze_baseline_file,
)


@pytest.fixture
def sample_report():
    return {
        "timestamp": "2026-08-23T00:00:00Z",
        "total": 7,
        "passed": 6,
        "failed": 1,
        "avg_llm_calls": 6.0,
        "avg_latency_s": 0.5,
        "results": [
            {"task_id": "simple-01", "success": True, "llm_calls": 6, "latency_s": 0.5, "files_written": 6},
            {"task_id": "simple-02", "success": True, "llm_calls": 6, "latency_s": 0.0, "files_written": 6},
            {"task_id": "simple-03", "success": True, "llm_calls": 6, "latency_s": 0.1, "files_written": 6},
            {"task_id": "standard-01", "success": True, "llm_calls": 6, "latency_s": 0.1, "files_written": 6},
            {"task_id": "standard-02", "success": True, "llm_calls": 6, "latency_s": 1.2, "files_written": 12},
            {"task_id": "complex-01", "success": False, "llm_calls": 12, "latency_s": 5.0, "files_written": 0},
            {"task_id": "complex-02", "success": True, "llm_calls": 6, "latency_s": 0.0, "files_written": 12},
        ],
    }


class TestAnalyzeReport:
    def test_summary(self, sample_report):
        a = analyze_report(sample_report)
        assert a.total_tasks == 7
        assert a.passed == 6
        assert a.failed == 1
        assert a.success_rate == pytest.approx(6 / 7)

    def test_by_category(self, sample_report):
        a = analyze_report(sample_report)
        assert "simple" in a.by_category
        assert "standard" in a.by_category
        assert "complex" in a.by_category
        assert a.by_category["simple"].passed == 3
        assert a.by_category["simple"].success_rate == 1.0

    def test_by_tag(self, sample_report):
        a = analyze_report(sample_report)
        assert "python" in a.by_tag
        assert a.by_tag["python"].total >= 2

    def test_anomaly_detection(self, sample_report):
        a = analyze_report(sample_report)
        # complex-01 has llm_calls=12, others have 6 — should be detected
        llm_anomalies = [x for x in a.anomalies if x.metric == "llm_calls"]
        assert any(x.task_id == "complex-01" for x in llm_anomalies)

    def test_empty_report(self):
        a = analyze_report({"results": []})
        assert a.total_tasks == 0

    def test_format_analysis(self, sample_report):
        a = analyze_report(sample_report)
        text = format_analysis(a)
        assert "评测结果分析" in text
        assert "分类对比" in text
        assert "标签分析" in text


class TestCompareVersions:
    def test_trend_detection(self, tmp_path):
        # 创建两个版本的基线
        v1 = {"total": 5, "passed": 4, "timestamp": "v1",
              "results": [{"task_id": "t1", "success": True, "llm_calls": 6, "latency_s": 0.5}] * 4 +
                         [{"task_id": "t2", "success": False, "llm_calls": 6, "latency_s": 0.5}]}
        v2 = {"total": 5, "passed": 5, "timestamp": "v2",
              "results": [{"task_id": "t1", "success": True, "llm_calls": 4, "latency_s": 0.3}] * 5}

        p1 = str(tmp_path / "v1.json")
        p2 = str(tmp_path / "v2.json")
        with open(p1, "w") as f: json.dump(v1, f)
        with open(p2, "w") as f: json.dump(v2, f)

        trends = compare_versions([p1, p2])
        assert len(trends) == 2
        assert trends[0].success_rate == 0.8
        assert trends[1].success_rate == 1.0
        assert trends[1].avg_llm_calls < trends[0].avg_llm_calls

    def test_no_files(self):
        trends = compare_versions(["/nonexistent/v1.json"])
        assert trends == []


class TestAnalyzeBaselineFile:
    def test_load_and_analyze(self, tmp_path, sample_report):
        path = str(tmp_path / "baseline.json")
        with open(path, "w") as f:
            json.dump(sample_report, f)
        a = analyze_baseline_file(path)
        assert a.total_tasks == 7
        assert len(a.by_category) == 3
