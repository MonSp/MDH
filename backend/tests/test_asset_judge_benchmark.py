import json

import pytest

from asset_evaluator import _JUDGE_THRESHOLD
from asset_judge_benchmark import BENCHMARK_ITEMS, BenchmarkItem, evaluate_judge


def test_benchmark_items_well_formed():
    assert len(BENCHMARK_ITEMS) == 8
    for item in BENCHMARK_ITEMS:
        assert 0.0 <= item.gold_score <= 1.0
        assert item.gold_pass == (item.gold_score >= _JUDGE_THRESHOLD)
        assert item.asset["type"] in ("template", "artifact")


def test_evaluate_judge_perfect_judge():
    def perfect_judge(asset):
        return next(i.gold_score for i in BENCHMARK_ITEMS if i.asset["content"] == asset.get("content"))

    result = evaluate_judge(perfect_judge)
    assert result.accuracy == 1.0
    assert result.mae == 0.0
    assert result.good_mean > result.bad_mean  # 区分度
    # 单遍评测：per_item 逐条结果与汇总指标同源
    assert len(result.per_item) == len(BENCHMARK_ITEMS)
    assert all(item["correct"] for item in result.per_item)
    assert all(item["judge_score"] == item["gold_score"] for item in result.per_item)


def test_evaluate_judge_inverted_judge():
    # 按 gold_pass 反转打分：好资产给低分、差资产给高分 → 全部判定错误
    def inverted_judge(asset):
        return 0.0 if next(i.gold_pass for i in BENCHMARK_ITEMS
                           if i.asset["content"] == asset.get("content")) else 1.0

    result = evaluate_judge(inverted_judge)
    assert result.accuracy == 0.0
    assert len(result.per_item) == len(BENCHMARK_ITEMS)
    assert not any(item["correct"] for item in result.per_item)


def test_evaluate_judge_custom_items():
    items = [
        BenchmarkItem(asset={"type": "artifact", "title": "a", "content": "好内容"}, gold_score=0.8, gold_pass=True),
        BenchmarkItem(asset={"type": "artifact", "title": "b", "content": "差内容"}, gold_score=0.2, gold_pass=False),
    ]
    result = evaluate_judge(lambda a: 0.8 if a["content"] == "好内容" else 0.2, items=items)
    assert result.accuracy == 1.0 and result.mae == 0.0
    assert len(result.per_item) == 2


def test_evaluate_judge_empty_items():
    result = evaluate_judge(lambda a: 1.0, items=[])
    assert result.accuracy == 0.0
    assert result.mae == 0.0
    assert result.good_mean == 0.0 and result.bad_mean == 0.0
    assert result.per_item == []


def test_load_benchmark_items_from_json(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    f = tmp_path / "items.json"
    f.write_text(json.dumps([
        {"asset": {"type": "artifact", "title": "a", "content": "好内容"}, "gold_score": 0.8, "gold_pass": True},
        {"asset": {"type": "artifact", "title": "b", "content": "差内容"}, "gold_score": 0.2, "gold_pass": False},
    ]), encoding="utf-8")
    items = load_benchmark_items(str(f))
    assert len(items) == 2
    assert items[0].gold_score == 0.8 and items[0].gold_pass is True
    assert items[1].asset["title"] == "b"


def test_load_benchmark_items_rejects_inconsistent_gold_pass(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    f = tmp_path / "bad.json"
    f.write_text(json.dumps([
        {"asset": {"type": "artifact", "title": "a", "content": "内容"}, "gold_score": 0.8, "gold_pass": False},
    ]), encoding="utf-8")
    with pytest.raises(ValueError):
        load_benchmark_items(str(f))


def test_load_benchmark_items_missing_file(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    with pytest.raises(FileNotFoundError):
        load_benchmark_items(str(tmp_path / "nope.json"))


def test_load_benchmark_items_invalid_json(tmp_path):
    from asset_judge_benchmark import load_benchmark_items
    f = tmp_path / "bad.json"
    f.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError):
        load_benchmark_items(str(f))
