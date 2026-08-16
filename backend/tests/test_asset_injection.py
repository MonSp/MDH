from asset_injection import build_asset_context
from asset_store import AssetStore
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution


def test_build_asset_context_merges_three_types(tmp_path, monkeypatch):
    import asset_injection
    monkeypatch.setattr(asset_injection, "_REUSE_STATS_PATH", str(tmp_path / "reuse_stats.json"))  # 落盘重定向 tmp
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料，研发部负责版本冻结")
    store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。",
        "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", ["责任人", "行动项"],
        team_id="team-x",
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


def test_build_asset_context_respects_caps(tmp_path, monkeypatch):
    import asset_injection
    monkeypatch.setattr(asset_injection, "_REUSE_STATS_PATH", str(tmp_path / "reuse_stats.json"))  # 落盘重定向 tmp
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


def test_reuse_stats_updated_on_nonempty_context(tmp_path, monkeypatch):
    from asset_injection import _REUSE_STATS, build_asset_context, get_reuse_stats
    monkeypatch.setattr("asset_injection._REUSE_STATS_PATH", str(tmp_path / "reuse_stats.json"))  # 落盘重定向 tmp
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人。", ["责任人", "行动项"], team_id="team-x")
    _REUSE_STATS.clear()
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要", "待办"])
    assert ctx != ""  # 有资产才计数
    stats = get_reuse_stats()
    assert stats["total"] == 1
    assert stats["by_team"].get("team-x") == 1
    assert stats["by_type"]["artifacts"] >= 1
    assert stats["last_at"]


def test_reuse_stats_untouched_on_empty_context(tmp_path, monkeypatch):
    from asset_injection import _REUSE_STATS, build_asset_context, get_reuse_stats
    monkeypatch.setattr("asset_injection._REUSE_STATS_PATH", str(tmp_path / "reuse_stats.json"))  # 落盘重定向 tmp
    store = AssetStore(str(tmp_path))
    extractor = ExperienceExtractor(str(tmp_path))
    _REUSE_STATS.clear()
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"])
    assert ctx == ""  # 无资产
    assert get_reuse_stats()["total"] == 0  # 空资产不计数


def test_reuse_stats_persists_to_disk(tmp_path, monkeypatch):
    import json as _json

    from asset_injection import _REUSE_LOCK, _REUSE_STATS, build_asset_context, get_reuse_stats
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人。", ["责任人", "行动项"], team_id="team-x")
    stats_path = tmp_path / "reuse_stats.json"
    monkeypatch.setattr("asset_injection._REUSE_STATS_PATH", str(stats_path))  # 落盘路径重定向 tmp
    with _REUSE_LOCK:
        _REUSE_STATS.clear()
    # ① 有资产 build → total==1
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要", "待办"])
    assert ctx != ""  # 有资产才计数
    assert get_reuse_stats()["total"] == 1
    # ② 落盘文件存在且 json total==1
    assert stats_path.exists()
    assert _json.loads(stats_path.read_text(encoding="utf-8"))["total"] == 1
    # ③ 清内存 → get_reuse_stats 从落盘加载 total==1（进程重启恢复语义）
    with _REUSE_LOCK:
        _REUSE_STATS.clear()
    assert get_reuse_stats()["total"] == 1


def test_reuse_stats_thread_safety(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    from asset_injection import _REUSE_LOCK, _REUSE_STATS, build_asset_context, get_reuse_stats
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人。", ["责任人", "行动项"], team_id="team-x")
    monkeypatch.setattr("asset_injection._REUSE_STATS_PATH", str(tmp_path / "reuse_stats.json"))  # 落盘重定向 tmp
    with _REUSE_LOCK:
        _REUSE_STATS.clear()
    # 并发 build（同 store/extractor 实例；检索只读共享）——锁下无丢失自增
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(
            lambda _: build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要", "待办"]),
            range(20),
        ))
    stats = get_reuse_stats()
    assert stats["total"] == 20  # 锁下无丢失自增
    assert stats["by_team"].get("team-x") == 20


def test_reuse_stats_loads_before_first_build(tmp_path, monkeypatch):
    """回归（评审 Important）：重启后首次 build 前必须加载落盘值。

    生产主流程（前端不轮询 /api/assets/reuse-metrics）重启后几乎总是先 build 而非
    get_reuse_stats——若 build 计数前不 _ensure_loaded，会从 0 重计并覆盖落盘累计值。
    """
    import json as _json

    from asset_injection import _REUSE_LOCK, _REUSE_STATS, build_asset_context, get_reuse_stats
    stats_path = tmp_path / "reuse_stats.json"
    monkeypatch.setattr("asset_injection._REUSE_STATS_PATH", str(stats_path))  # 落盘重定向 tmp
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线\n市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人。", ["责任人", "行动项"], team_id="team-x")
    # ① 直接 seed 落盘 total==5（模拟上次进程已累计 5 次复用）
    stats_path.write_text(_json.dumps({
        "total": 5,
        "by_team": {"team-x": 5},
        "by_type": {"templates": 5, "artifacts": 5, "rules": 5},
        "last_at": "2026-08-16T00:00:00",
    }, ensure_ascii=False), encoding="utf-8")
    # ② 清内存 → 模拟进程重启（内存 total=0）
    with _REUSE_LOCK:
        _REUSE_STATS.clear()
    # ③ 先 build（主流程总是先 build 而非 get_reuse_stats）
    ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要", "待办"])
    assert ctx != ""
    # ④ 5+1==6：若未加载落盘值会从 0 重计 ==1
    assert get_reuse_stats()["total"] == 6
