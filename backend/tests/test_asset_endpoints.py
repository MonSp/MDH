"""演示端点 /api/assets/*（M3 沉淀闭环）

覆盖 [S7]：产出物入库 / 模板固化（评测→gate）/ 三类资产合并检索 /
把关差异→技能增量 / 资产列表 per team。

模式沿用 M2/M3 既有演示端点测试：
- TestClient + server.BACKEND_TOKEN = ""（关闭 REST 认证中间件）
- monkeypatch 替换惰性单例 helper（_get_asset_store/_get_template_confirmation/
  _get_skill_evolution/_get_asset_search 全局），各用例以临时目录隔离数据。
"""
from fastapi.testclient import TestClient

import server

server.BACKEND_TOKEN = ""

client = TestClient(server.app)

# 模板内容须过评测：有换行且 >50 字符（模板 quality 阈值 50）——54 字符模式
_GOOD_CONTENT = (
    "标题\n要点\n待办\n决定\n行动项\n责任人与日期安排\n"
    "发布范围\n风险预案\n回滚方案\n验收标准\n上线窗口\n值班安排"
)


def test_artifacts_endpoint_stores(tmp_path, monkeypatch):
    from asset_store import AssetStore
    store = AssetStore(str(tmp_path))
    monkeypatch.setattr(server, "_get_asset_store", lambda: store)
    resp = client.post("/api/assets/artifacts", json={
        "team_id": "team-x", "title": "纪要-0815", "content": "发布计划 确定 8 月 15 日上线 市场部负责宣传物料",
    })
    assert resp.status_code == 200
    assert resp.json()["success"] and resp.json()["data"]["asset_id"]


def test_templates_endpoint_requests_gate(tmp_path, monkeypatch):
    from asset_store import AssetStore
    from asset_evaluator import AssetEvaluator
    from approval_manager import ApprovalManager
    from template_confirmation import TemplateConfirmation
    store = AssetStore(str(tmp_path))
    approvals = ApprovalManager()
    tc = TemplateConfirmation(store, AssetEvaluator(store), approvals)
    monkeypatch.setattr(server, "_get_template_confirmation", lambda: tc)
    client = TestClient(server.app)
    resp = client.post("/api/assets/templates", json={
        "team_id": "team-x", "title": "发布计划模板", "content": _GOOD_CONTENT,
        "approver": "emp-001",
    })
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["asset_id"] and data["request_id"]
    assert approvals.get_pending_requests()  # gate 已发起


def test_templates_endpoint_evaluation_failure(tmp_path, monkeypatch):
    from asset_store import AssetStore
    from asset_evaluator import AssetEvaluator
    from approval_manager import ApprovalManager
    from template_confirmation import TemplateConfirmation
    store = AssetStore(str(tmp_path))
    tc = TemplateConfirmation(store, AssetEvaluator(store), ApprovalManager())
    monkeypatch.setattr(server, "_get_template_confirmation", lambda: tc)
    resp = client.post("/api/assets/templates", json={
        "team_id": "team-x", "title": "坏模板", "content": "标题",
    })
    assert resp.status_code == 200 and not resp.json()["success"]


def test_search_endpoint_merges(tmp_path, monkeypatch):
    from asset_store import AssetStore
    from asset_search import AssetSearch
    from experience_extractor import ExperienceExtractor
    from skill_evolution import SkillEvolution
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    extractor = ExperienceExtractor(str(tmp_path))
    result = SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人。", ["纪要", "待办"],
        team_id="team-x",
    )
    # v1.3.4: 规则保持 pending_review，需要手动批准才能被检索
    if result["rule_id"]:
        extractor.approve_rule(result["rule_id"], reviewer_comment="test-approve")
    monkeypatch.setattr(server, "_get_asset_search", lambda: AssetSearch(store, extractor))
    resp = client.get("/api/assets/search", params={
        "team_id": "team-x", "q": "发布计划", "task_type": "minutes", "keywords": "纪要,待办",
    })
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["artifacts"] and data["rules"]


def test_experience_endpoint_writes_rule(tmp_path, monkeypatch):
    from experience_extractor import ExperienceExtractor
    from skill_evolution import SkillEvolution
    extractor = ExperienceExtractor(str(tmp_path))
    monkeypatch.setattr(server, "_get_skill_evolution", lambda: SkillEvolution(extractor))
    resp = client.post("/api/assets/experience", json={
        "team_id": "team-x", "task_type": "minutes", "transcript": "会议讨论发布计划。",
        "feedback": "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", "keywords": ["纪要", "待办"],
    })
    assert resp.status_code == 200
    assert resp.json()["data"]["count"] >= 1


def test_experience_endpoint_threads_team_id(tmp_path, monkeypatch):
    """T7 评审 Important：/api/assets/experience 的 body.team_id 必须经
    evolve_from_feedback 透传到规则——否则经端点提炼的规则 team_id=""，
    对团队检索永久不可见，演示闭环 evolve→search→注入 行为回归。"""
    from experience_extractor import ExperienceExtractor
    from skill_evolution import SkillEvolution
    extractor = ExperienceExtractor(str(tmp_path))
    monkeypatch.setattr(server, "_get_skill_evolution", lambda: SkillEvolution(extractor))
    resp = client.post("/api/assets/experience", json={
        "team_id": "team-x", "task_type": "minutes", "transcript": "会议讨论发布计划。",
        "feedback": "审核修改：遗漏行动项责任人，需要补充负责人与截止日期。", "keywords": ["纪要", "待办"],
    })
    assert resp.status_code == 200 and resp.json()["data"]["count"] >= 1
    # v1.3.4: 手动批准规则（不再自动审批）
    rule_id = resp.json()["data"]["rule_id"]
    if rule_id:
        extractor.approve_rule(rule_id, reviewer_comment="test-approve")
    # 端点提炼的规则须带 team_id=team-x → 团队检索命中
    team_hits = extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-x")
    assert any(r.team_id == "team-x" for r in team_hits), "team_id 未透传到规则"
    # 其他团队检索不得命中该规则（严格过滤）
    other_hits = extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-other")
    assert not any(r.team_id == "team-x" for r in other_hits)


def test_list_endpoint_filters_by_team(tmp_path, monkeypatch):
    from asset_store import AssetStore
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 确定 8 月 15 日上线 市场部负责宣传物料")
    monkeypatch.setattr(server, "_get_asset_store", lambda: store)
    resp = client.get("/api/assets", params={"team_id": "team-x"})
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1


def test_template_confirmation_singleton_uses_demo_gate_manager(tmp_path, monkeypatch):
    """接线要求（T3 评审预警）：_get_template_confirmation 必须复用 _demo_gate_manager，
    否则经 /api/gates/decide 的员工决定不会触发 _bridge_gate_decisions 的
    on_gate_result（桥接只覆盖构造时传入的实例），S5 演示闭环断裂。"""
    from asset_store import AssetStore
    monkeypatch.setattr(server, "_get_asset_store", lambda: AssetStore(str(tmp_path)))
    monkeypatch.setattr(server, "_template_confirmation", None)
    # T6 评审 Minor：本用例会把桥接安装到共享 _demo_gate_manager 并留下
    # _template_confirmation——尾部必须恢复，否则后续同进程测试驱动真实
    # template: gate 会撞上已删除的 tmp_path store。
    original_handle = server._demo_gate_manager.handle_gate_response
    try:
        tc = server._get_template_confirmation()
        assert tc._approvals is server._demo_gate_manager
    finally:
        server._demo_gate_manager.handle_gate_response = original_handle
        server._demo_gate_manager._template_bridge_installed = False
        server._template_confirmation = None


def test_malicious_team_id_returns_fail_not_500(tmp_path, monkeypatch):
    """T6 评审 Important：畸形/恶意 team_id（../ 路径遍历、非字符串）在各端点
    必须返回 200 + success=False（包装为 _fail），不得以 500 传播。"""
    from asset_store import AssetStore
    from asset_evaluator import AssetEvaluator
    from approval_manager import ApprovalManager
    from asset_search import AssetSearch
    from experience_extractor import ExperienceExtractor
    from skill_evolution import SkillEvolution
    from template_confirmation import TemplateConfirmation

    store = AssetStore(str(tmp_path))
    monkeypatch.setattr(server, "_get_asset_store", lambda: store)
    # 本地隔离实例，避免把桥接装到共享 _demo_gate_manager 上（T6 评审 Minor）
    tc = TemplateConfirmation(store, AssetEvaluator(store), ApprovalManager())
    monkeypatch.setattr(server, "_get_template_confirmation", lambda: tc)
    monkeypatch.setattr(server, "_get_skill_evolution", lambda: SkillEvolution(ExperienceExtractor(str(tmp_path))))
    monkeypatch.setattr(server, "_get_asset_search", lambda: AssetSearch(store, ExperienceExtractor(str(tmp_path))))

    # POST 写路径：../ 路径遍历 → ValueError
    for url, payload in [
        ("/api/assets/artifacts", {"team_id": "../evil", "title": "t", "content": "c"}),
        ("/api/assets/templates", {"team_id": "../evil", "title": "t", "content": _GOOD_CONTENT}),
        ("/api/assets/experience", {"team_id": "../evil", "task_type": "minutes"}),
    ]:
        resp = client.post(url, json=payload)
        assert resp.status_code == 200, f"{url} -> HTTP {resp.status_code}"
        assert not resp.json()["success"], url

    # POST 写路径：非字符串 team_id → TypeError
    resp = client.post("/api/assets/artifacts", json={"team_id": 123, "title": "t", "content": "c"})
    assert resp.status_code == 200 and not resp.json()["success"]

    # GET 读路径：../ 路径遍历
    resp = client.get("/api/assets/search", params={"team_id": "../evil"})
    assert resp.status_code == 200 and not resp.json()["success"]
    resp = client.get("/api/assets", params={"team_id": "../evil"})
    assert resp.status_code == 200 and not resp.json()["success"]


def test_templates_endpoint_with_judge_wiring(tmp_path, monkeypatch):
    from asset_evaluator import AssetEvaluator
    from asset_store import AssetStore
    from approval_manager import ApprovalManager
    from template_confirmation import TemplateConfirmation
    store = AssetStore(str(tmp_path))
    approvals = ApprovalManager()
    monkeypatch.setattr(server, "_get_asset_store", lambda: store)
    monkeypatch.setattr(server, "_get_asset_judge", lambda: lambda a: 0.9)  # 高分 judge
    tc = TemplateConfirmation(store, AssetEvaluator(store, lambda a: 0.9), approvals)
    monkeypatch.setattr(server, "_get_template_confirmation", lambda: tc)
    client = TestClient(server.app)
    resp = client.post("/api/assets/templates", json={
        "team_id": "team-x", "title": "发布计划模板", "content": _GOOD_CONTENT,
        "approver": "emp-001",
    })
    assert resp.status_code == 200 and resp.json()["success"]


def test_real_singleton_wires_judge(tmp_path, monkeypatch):
    """T6 评审 Minor #1：真实 _get_template_confirmation() 接线行
    `AssetEvaluator(store, _get_asset_judge())` 的 judge 注入路径——此前被
    _get_template_confirmation monkeypatch 遮蔽，唯一执行点
    test_template_confirmation_singleton_uses_demo_gate_manager 又是 env-off
    （judge 解析为 None）。monkeypatch _get_asset_judge 为打分 lambda，走真实
    单例构造后断言 judge 已流入 tc._evaluator，并验证好模板经真实单例 + 注入
    judge 过评测。尾部复位 _template_confirmation + 恢复桥接，避免带 judge 的
    真实单例泄漏到后续测试（try/finally）。"""
    from asset_store import AssetStore
    monkeypatch.setattr(server, "_get_asset_store", lambda: AssetStore(str(tmp_path)))
    monkeypatch.setattr(server, "_get_asset_judge", lambda: (lambda a: 0.9))
    monkeypatch.setattr(server, "_template_confirmation", None)
    original_handle = server._demo_gate_manager.handle_gate_response
    try:
        tc = server._get_template_confirmation()
        assert tc._evaluator._judge is not None  # judge 经真实单例流入
        result = tc._evaluator.evaluate({
            "type": "template", "team_id": "team-x",
            "title": "发布计划模板", "content": _GOOD_CONTENT,
        })
        assert result.passed and result.judge_score == 0.9  # 好模板过评测
    finally:
        server._demo_gate_manager.handle_gate_response = original_handle
        server._demo_gate_manager._template_bridge_installed = False
        server._template_confirmation = None


def test_get_asset_judge_respects_env_switch(monkeypatch):
    monkeypatch.delenv("ASSET_JUDGE_ENABLED", raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "k")
    try:
        server._asset_judge = None  # 从干净单例开始（防前序泄漏）
        assert server._get_asset_judge() is None  # 未启用 → None
        monkeypatch.setenv("ASSET_JUDGE_ENABLED", "1")
        assert server._get_asset_judge() is not None  # 启用 + key → judge
    finally:
        # 清理单例（避免污染后续测试）：断言失败时也复位，不残留绑定
        # monkeypatched key 的真实 judge；env 由 monkeypatch 自动还原。
        server._asset_judge = None
        monkeypatch.delenv("ASSET_JUDGE_ENABLED", raising=False)


def test_reuse_metrics_endpoint(tmp_path, monkeypatch):
    from asset_store import AssetStore
    from asset_injection import get_reuse_stats
    stats = {"total": 3, "by_team": {"team-x": 2}, "by_type": {"templates": 1, "artifacts": 1, "rules": 1}, "last_at": "t"}
    monkeypatch.setattr("server._get_asset_store", lambda: AssetStore(str(tmp_path)))
    monkeypatch.setattr("asset_injection.get_reuse_stats", lambda: stats)  # 或以真实统计为准
    client = TestClient(server.app)
    resp = client.get("/api/assets/reuse-metrics")
    assert resp.status_code == 200 and resp.json()["data"]["total"] == 3
