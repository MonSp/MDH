from asset_search import AssetSearch
from asset_store import AssetStore
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_search_merges_three_asset_types(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["纪要", "待办"],
    )
    result = AssetSearch(store, extractor).search("team-x", query="发布计划", task_type="minutes", keywords=["纪要", "待办"])
    assert result["artifacts"] and result["templates"]
    assert any(r["rule_id"] for r in result["rules"])  # 技能规则检索
    assert result["templates"][0]["status"] == "proposed"  # 模板含 proposed（可复用候选）


def test_search_empty_when_no_assets(tmp_path):
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    result = AssetSearch(store, extractor).search("team-x", query="无", task_type="minutes", keywords=["纪要"])
    assert result == {"artifacts": [], "templates": [], "rules": []}
