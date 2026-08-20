from asset_search import AssetSearch
from asset_store import AssetStore
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_search_merges_three_asset_types(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    extractor = ExperienceExtractor(str(tmp_path))
    evo_result = SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["责任人", "行动项"],
        team_id="team-x",
    )
    # v1.3.4: 手动批准规则
    if evo_result["rule_id"]:
        extractor.approve_rule(evo_result["rule_id"], reviewer_comment="test-approve")
    result = AssetSearch(store, extractor).search("team-x", query="发布计划", task_type="minutes", keywords=["责任人", "行动项"])
    assert result["artifacts"] and result["templates"]
    # 检索隔离（T5 评审 Important）："责任人"/"行动项" 只存在于调用方 keywords，
    # transcript 与 task_description 均不含这些词，规则检索命中只能依赖 _save_rule
    # 回填的 keywords（配合 source_task_type 回填的 type-match bonus）。若回滚回填，
    # 该规则 keywords 无这些词 → overlap=0 → rules 为空，此断言失败（真实防回归）。
    assert any(r["rule_id"] for r in result["rules"])  # 技能规则检索
    assert result["templates"][0]["status"] == "proposed"  # 模板含 proposed（可复用候选）


def test_search_asset_type_filter(tmp_path):
    # 契约：asset_type 过滤时只检索该类型，返回 dict 结构不变（其余键为空列表）
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    extractor = ExperienceExtractor(str(tmp_path))
    artifact_only = AssetSearch(store, extractor).search("team-x", query="发布计划", asset_type="artifact")
    assert artifact_only["artifacts"] and not artifact_only["templates"] and not artifact_only["rules"]
    template_only = AssetSearch(store, extractor).search("team-x", query="发布计划", asset_type="template")
    assert template_only["templates"] and not template_only["artifacts"] and not template_only["rules"]


def test_search_rules_respects_team_isolation(tmp_path):
    # 团队 A/B 各 evolve 规则 → search(team_id="team-a") 仅返回 A 的规则
    # （构建同 test_search_merges_three_asset_types 模式——两团队 evolve 后 search 过滤）
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result_a = evo.evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。",
        "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["责任人", "行动项"],
        team_id="team-a",
    )
    result_b = evo.evolve_from_feedback(
        "p2", "minutes", "会议讨论发布计划。",
        "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["责任人", "行动项"],
        team_id="team-b",
    )
    # v1.3.4: 手动批准规则
    if result_a["rule_id"]:
        extractor.approve_rule(result_a["rule_id"], reviewer_comment="test-approve")
    if result_b["rule_id"]:
        extractor.approve_rule(result_b["rule_id"], reviewer_comment="test-approve")
    assert result_a["count"] >= 1 and result_b["count"] >= 1
    search = AssetSearch(store, extractor)
    only_a = search.search("team-a", task_type="minutes", keywords=["责任人", "行动项"])
    only_b = search.search("team-b", task_type="minutes", keywords=["责任人", "行动项"])
    a_ids = [r["rule_id"] for r in only_a["rules"]]
    b_ids = [r["rule_id"] for r in only_b["rules"]]
    assert result_a["rule_id"] in a_ids
    assert result_b["rule_id"] not in a_ids  # 跨团队泄漏防护
    assert result_b["rule_id"] in b_ids
    assert result_a["rule_id"] not in b_ids


def test_search_empty_when_no_assets(tmp_path):
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    result = AssetSearch(store, extractor).search("team-x", query="无", task_type="minutes", keywords=["纪要"])
    assert result == {"artifacts": [], "templates": [], "rules": []}
