import pytest

from asset_judge_benchmark import BENCHMARK_ITEMS, BenchmarkItem, evaluate_judge


def test_benchmark_items_well_formed():
    assert len(BENCHMARK_ITEMS) == 8
    for item in BENCHMARK_ITEMS:
        assert 0.0 <= item.gold_score <= 1.0
        assert item.gold_pass == (item.gold_score >= 0.5)
        assert item.asset["type"] in ("template", "artifact")


def test_evaluate_judge_perfect_judge():
    def perfect_judge(asset):
        return next(i.gold_score for i in BENCHMARK_ITEMS if i.asset["content"] == asset.get("content"))

    result = evaluate_judge(perfect_judge)
    assert result.accuracy == 1.0
    assert result.mae == 0.0
    assert result.good_mean > result.bad_mean  # 区分度


def test_evaluate_judge_wrong_judge():
    def inverted_judge(asset):
        return 1.0 if asset.get("content", "").startswith("差") else 0.0

    result = evaluate_judge(inverted_judge)
    assert result.accuracy < 1.0


def test_evaluate_judge_custom_items():
    items = [
        BenchmarkItem(asset={"type": "artifact", "title": "a", "content": "好内容"}, gold_score=0.8, gold_pass=True),
        BenchmarkItem(asset={"type": "artifact", "title": "b", "content": "差内容"}, gold_score=0.2, gold_pass=False),
    ]
    result = evaluate_judge(lambda a: 0.8 if a["content"] == "好内容" else 0.2, items=items)
    assert result.accuracy == 1.0 and result.mae == 0.0
