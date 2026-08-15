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
    SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", "会议讨论发布计划。", "审核修改：遗漏行动项责任人。", ["纪要", "待办"],
    )
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


def test_get_asset_judge_respects_env_switch(monkeypatch):
    monkeypatch.delenv("ASSET_JUDGE_ENABLED", raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "k")
    assert server._get_asset_judge() is None  # 未启用 → None
    monkeypatch.setenv("ASSET_JUDGE_ENABLED", "1")
    assert server._get_asset_judge() is not None  # 启用 + key → judge
    # 清理单例（避免污染后续测试）
    server._asset_judge = None
    monkeypatch.delenv("ASSET_JUDGE_ENABLED", raising=False)
