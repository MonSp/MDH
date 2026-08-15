from asset_injection import build_asset_context
from asset_store import AssetStore
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_build_asset_context_merges_three_types(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料，研发部负责版本冻结")
    store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。",
        "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["责任人", "行动项"],
    )
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["责任人", "行动项"])
    assert "资产参考" in ctx
    assert "发布计划模板" in ctx        # 模板注入
    assert "纪要-0815" in ctx          # 知识（产出物）注入
    assert "action" in ctx or "责任人" in ctx  # 技能规则注入


def test_build_asset_context_empty_when_no_assets(tmp_path):
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    assert build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"]) == ""


def test_build_asset_context_respects_team_isolation(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    ctx_other = build_asset_context(store, extractor, "team-y", task_type="minutes", keywords=["纪要"])
    assert ctx_other == ""  # 团队隔离：team-y 无资产


def test_build_asset_context_respects_caps(tmp_path):
    # 锁定渐进披露上限（评审 Important）：注入体量受控，防 prompt 膨胀。
    # 回归锁定：未来改动不得删掉 [:_MAX_X]/[:_SNIPPET_LEN] 切片或放宽常量。
    store = AssetStore(str(tmp_path))
    for i in range(5):  # 5 个模板 → 注入 ≤3
        store.propose_template("team-x", f"模板{i}", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    store.store_artifact("team-x", "长知识", "长" * 300)  # 300 字符 → 截断 ≤100
    extractor = ExperienceExtractor(str(tmp_path))
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"])
    assert ctx.count("- 模板「") <= 3
    for line in ctx.splitlines():
        assert len(line) <= 130  # 每行 ≤ ~130（前缀 + 100 截断）
