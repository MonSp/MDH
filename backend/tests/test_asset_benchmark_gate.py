from asset_benchmark_gate import run_gate


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


def test_run_gate_partial_thresholds():
    # 只传部分键：缺省补 DEFAULT_THRESHOLDS，不 KeyError
    result = run_gate(_perfect_judge, thresholds={"min_accuracy": 0.9})
    assert result.passed


def test_run_gate_records_baseline(tmp_path):
    result = run_gate(_perfect_judge, baseline_path=str(tmp_path / "baseline.json"))
    assert result.passed
    import json
    data = json.loads((tmp_path / "baseline.json").read_text(encoding="utf-8"))
    assert data["passed"] is True and data["metrics"]["accuracy"] == 1.0 and "timestamp" in data
    assert "commit" in data  # 基线格式：指标 + 时间戳 + 提交（防退化可追溯）


def test_main_no_key_external_items_self_check(tmp_path, monkeypatch, capsys):
    # 无 key + 外部标注集（content 不在内置集）：perfect judge 基于传入 items → 自检 PASS 不崩溃
    import json
    items = [
        {"asset": {"type": "template", "title": "部门专属-好",
                   "content": "外部标注-唯一内容-甲"}, "gold_score": 0.9, "gold_pass": True},
        {"asset": {"type": "template", "title": "部门专属-差",
                   "content": "外部标注-唯一内容-乙"}, "gold_score": 0.2, "gold_pass": False},
    ]
    bf = tmp_path / "ext_items.json"
    bf.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["asset_benchmark_gate.py", "--api-key", "",
                                     "--benchmark-file", str(bf)])
    from asset_benchmark_gate import main
    assert main() == 0
    assert "门禁流程自检" in capsys.readouterr().out
