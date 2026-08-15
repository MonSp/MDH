from asset_evaluator import AssetEvaluator
from asset_store import AssetStore


def test_evaluate_artifact_passes_checks(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    result = AssetEvaluator(store).evaluate(asset)
    assert result.passed
    assert all(result.checks.values())


def test_evaluate_empty_content_fails(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要", "")
    result = AssetEvaluator(store).evaluate(asset)
    assert not result.passed
    assert result.checks["completeness"] is False


def test_evaluate_template_quality_threshold(tmp_path):
    store = AssetStore(str(tmp_path))
    asset_id = store.propose_template("team-x", "短模板", "标题")  # <50 字符 → quality 不过
    asset = store.get(asset_id)  # propose_template 返回 asset_id（str），评测需要资产 dict
    result = AssetEvaluator(store).evaluate(asset)
    assert not result.passed
    assert result.checks["quality"] is False


def test_evaluate_duplicate_fails(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料 销售部准备客户通知")
    dup = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料 销售部准备客户通知")
    result = AssetEvaluator(store).evaluate(dup)
    assert not result.passed
    assert result.checks["duplicate"] is False


def test_evaluate_judge_seam(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    good = AssetEvaluator(store, judge=lambda a: 0.9).evaluate(asset)
    assert good.passed and good.judge_score == 0.9
    bad = AssetEvaluator(store, judge=lambda a: 0.3).evaluate(asset)  # <0.5 阈值 → 不过
    assert not bad.passed


def test_evaluate_no_judge_skips(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    result = AssetEvaluator(store).evaluate(asset)
    assert result.judge_score is None  # judge 默认 None → 跳过


def test_duplicate_not_flagged_for_content_mention(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "会议纪要", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    new = store.store_artifact("team-x", "发布计划", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    result = AssetEvaluator(store).evaluate(new)
    assert result.checks["duplicate"] is True  # 不同标题 → 不判重复（duplicate 检查通过）


def test_judge_exception_fails_closed(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")

    def broken_judge(asset_dict):
        raise ConnectionError("judge 网络错误")

    result = AssetEvaluator(store, judge=broken_judge).evaluate(asset)
    assert not result.passed
    assert result.judge_score is None
    assert "judge 异常" in result.reason
