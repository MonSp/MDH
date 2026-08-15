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
