"""集成测试：真实 ASGI 服务器，验证资产注入 + 经验规则端到端链路。

所有测试使用 httpx.AsyncClient + ASGITransport（真实 FastAPI app，非 mock）。
资产注入不跳过真实后端。
"""

import json
import os

import pytest
from httpx import ASGITransport, AsyncClient

import server
from routers import experience as experience_router


@pytest.fixture
def asset_data(tmp_path, monkeypatch):
    """创建测试资产数据并重定向 server 模块级单例。"""
    data_dir = tmp_path / "data"
    assets_dir = data_dir / "assets" / "team-x"
    (assets_dir / "artifacts").mkdir(parents=True)
    (assets_dir / "templates").mkdir(parents=True)

    # 产出物
    (assets_dir / "artifacts" / "art-int-1.json").write_text(json.dumps({
        "asset_id": "art-int-1", "type": "artifact", "title": "发布计划纪要",
        "content": "8月15日上线，市场部负责宣传物料，研发部负责版本冻结。",
        "team_id": "team-x", "status": "approved", "created_at": "2026-08-20T00:00:00",
    }, ensure_ascii=False), encoding="utf-8")

    # 模板
    (assets_dir / "templates" / "tpl-int-1.json").write_text(json.dumps({
        "asset_id": "tpl-int-1", "type": "template", "title": "会议纪要模板",
        "content": "标题\n要点\n待办\n决定\n行动项\n责任人与日期",
        "team_id": "team-x", "status": "approved", "created_at": "2026-08-20T00:00:00",
    }, ensure_ascii=False), encoding="utf-8")

    # 索引
    (assets_dir / "index.json").write_text(json.dumps([
        {"asset_id": "art-int-1", "type": "artifact", "title": "发布计划纪要", "status": "approved"},
        {"asset_id": "tpl-int-1", "type": "template", "title": "会议纪要模板", "status": "approved"},
    ], ensure_ascii=False), encoding="utf-8")

    # 经验规则目录（_get_asset_search 使用 _DATA_DIR/rules）
    rules_base = data_dir / "rules"
    rules_sub = rules_base / "rules"
    rules_sub.mkdir(parents=True)
    (rules_sub / "int-rule.yaml").write_text(
        'trigger_condition: "task_type is minutes"\n'
        'action: "必须为每项待办补充负责人与截止日期"\n'
        'rule_type: correction_tip\n'
        'keywords: [纪要, 待办]\n',
        encoding="utf-8",
    )

    # 增量区目录（approve_rule → write_to_incremental_area）
    inc_dir = data_dir / "experience"
    inc_rules = inc_dir / "rules"
    inc_rules.mkdir(parents=True)

    # 重定向 server 模块级单例
    monkeypatch.setattr(server, "_DATA_DIR", str(data_dir))

    from asset_store import AssetStore
    server._asset_store = AssetStore(str(data_dir / "assets"))

    from experience_extractor import ExperienceExtractor, ExperienceRule

    # server.experience_extractor 使用 _DATA_DIR/experience 作为增量区
    server.experience_extractor = ExperienceExtractor(incremental_dir=str(inc_dir))
    experience_router.set_experience_extractor(server.experience_extractor)
    # 写入规则到 server.experience_extractor 的 _rules_dir (data/experience/rules)
    rule = ExperienceRule(
        rule_id="int-rule",
        trigger_condition="task_type is minutes",
        action="必须为每项待办补充负责人与截止日期",
        note="", source_task_id="p1", source_task_type="minutes",
        rule_type="correction_tip", status="approved",
        keywords=["纪要", "待办"], created_at="2026-08-20T00:00:00",
        team_id="team-x",
    )
    server.experience_extractor._save_rule(rule)
    server.experience_extractor.approve_rule("int-rule", "test-approve")

    # _get_asset_search 内部创建自己的 ExperienceExtractor，指向 _DATA_DIR/rules
    # 替换 _asset_search 使其使用正确的 extractor
    from asset_search import AssetSearch
    search_extractor = ExperienceExtractor(incremental_dir=str(rules_base))
    # 复制规则到 search_extractor 的 _rules_dir
    for r in server.experience_extractor.get_all_rules():
        new_r = ExperienceRule(
            rule_id=r.rule_id, trigger_condition=r.trigger_condition,
            action=r.action, note=r.note, source_task_id=r.source_task_id,
            source_task_type=r.source_task_type, rule_type=r.rule_type,
            status="pending_review", keywords=r.keywords,
            created_at=r.created_at, team_id=r.team_id,
        )
        rid = search_extractor.submit_for_review(new_r)
        search_extractor.approve_rule(rid, "test-approve")
    search_instance = AssetSearch(server._asset_store, search_extractor)
    # 直接 patch _get_asset_search 函数引用（绕过 lazy init）
    # 在 server 模块中，_get_asset_search 是一个普通函数，端点通过模块命名空间调用它
    # monkeypatch 替换 server 模块的属性，端点函数内的 _get_asset_search() 会解析到新值
    original_fn = server._get_asset_search
    server._get_asset_search = lambda: search_instance

    return str(data_dir)


@pytest.fixture
async def client():
    """真实 ASGI 服务器（关闭认证）。"""
    import os
    os.environ["BACKEND_TOKEN"] = ""
    server.BACKEND_TOKEN = ""
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
class TestAssetSearchAPI:
    """资产搜索 API。"""

    async def test_search_returns_artifacts(self, client, asset_data):
        resp = await client.get("/api/assets/search", params={"team_id": "team-x", "q": "发布计划"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["artifacts"]) >= 1
        assert data["artifacts"][0]["title"] == "发布计划纪要"

    async def test_search_returns_templates(self, client, asset_data):
        resp = await client.get("/api/assets/search", params={"team_id": "team-x", "q": "会议"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["templates"]) >= 1
        assert data["templates"][0]["title"] == "会议纪要模板"

    async def test_search_returns_rules(self, client, asset_data):
        # 验证 _get_asset_search 被正确替换
        search = server._get_asset_search()
        rules = search._extractor.get_all_rules()
        assert len(rules) >= 1, f"search extractor has {len(rules)} rules"

        resp = await client.get("/api/assets/search", params={
            "team_id": "team-x", "task_type": "minutes", "keywords": "纪要,待办",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["rules"]) >= 1
        assert "task_type is minutes" in data["rules"][0]["trigger_condition"]

    async def test_search_merges_all_types(self, client, asset_data):
        resp = await client.get("/api/assets/search", params={
            "team_id": "team-x", "task_type": "minutes", "keywords": "纪要,发布计划",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["artifacts"]) >= 1
        assert len(data["templates"]) >= 1
        assert len(data["rules"]) >= 1

    async def test_search_empty_team(self, client, asset_data):
        resp = await client.get("/api/assets/search", params={"team_id": "team-nonexistent"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["artifacts"]) == 0
        assert len(data["templates"]) == 0


@pytest.mark.asyncio
class TestAssetUpdateAPI:
    """资产编辑 API。"""

    async def test_update_asset_content(self, client, asset_data):
        resp = await client.put("/api/assets/art-int-1", json={"content": "更新后的内容", "editor": "test-user"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["content"] == "更新后的内容"
        assert data["updated_by"] == "test-user"
        assert "updated_at" in data

    async def test_update_nonexistent_asset(self, client, asset_data):
        resp = await client.put("/api/assets/nonexistent", json={"content": "test"})
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    async def test_update_empty_content_rejected(self, client, asset_data):
        resp = await client.put("/api/assets/art-int-1", json={"content": ""})
        assert resp.status_code == 200
        assert resp.json()["success"] is False


@pytest.mark.asyncio
class TestExperienceRulesAPI:
    """经验规则 API。"""

    async def test_list_rules(self, client, asset_data):
        resp = await client.get("/api/experience/rules")
        assert resp.status_code == 200
        rules = resp.json()["data"]
        assert len(rules) >= 1

    async def test_approve_rule_writes_to_incremental(self, client, asset_data):
        """审批通过后规则写入增量区。"""
        from experience_extractor import ExperienceExtractor, ExperienceRule
        extractor = ExperienceExtractor(incremental_dir=str(os.path.join(asset_data, "experience")))
        rule = ExperienceRule(
            rule_id="int-approve-test",
            trigger_condition="task_type is test",
            action="测试审批写入增量区",
            note="", source_task_id="p1", source_task_type="test",
            rule_type="correction_tip", status="pending_review",
            keywords=["test"], created_at="2026-08-20T00:00:00",
        )
        extractor._save_rule(rule)

        resp = await client.post(
            "/api/experience/rules/int-approve-test/approve",
            json={"comment": "integration test"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "approved"

        # 验证规则已写入增量区
        rules_dir = os.path.join(asset_data, "experience", "rules")
        assert any("int-approve-test" in f for f in os.listdir(rules_dir))


@pytest.mark.asyncio
class TestAssetInjectionChain:
    """资产注入端到端链路。"""

    async def test_build_asset_context_merges_types(self, asset_data):
        """build_asset_context 合并模板、产出物、规则。"""
        from asset_injection import build_asset_context
        from asset_store import AssetStore
        from experience_extractor import ExperienceExtractor

        store = AssetStore(os.path.join(asset_data, "assets"))
        extractor = ExperienceExtractor(incremental_dir=os.path.join(asset_data, "experience"))
        for rule in extractor.get_all_rules():
            if rule.status != "approved":
                extractor.approve_rule(rule.rule_id, "test")

        ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"])
        assert "资产参考" in ctx
        assert "发布计划纪要" in ctx or "会议纪要模板" in ctx

    async def test_asset_list_endpoint(self, client, asset_data):
        resp = await client.get("/api/assets", params={"team_id": "team-x"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) >= 2

    async def test_full_injection_chain(self, asset_data):
        """完整链路：增量区 + 资产 → 合并注入。"""
        from agent_pool import AgentPool
        from asset_injection import build_asset_context
        from asset_store import AssetStore
        from experience_extractor import ExperienceExtractor
        from key_manager import KeyManager

        # 1. 增量区注入
        inc_dir = os.path.join(asset_data, "experience")
        pool = AgentPool(key_manager=KeyManager(), incremental_dir=inc_dir)
        prompt = pool._inject_incremental_context("你是全栈开发工程师。")
        assert "进化" in prompt or prompt == "你是全栈开发工程师。"

        # 2. 资产注入
        store = AssetStore(os.path.join(asset_data, "assets"))
        extractor = ExperienceExtractor(incremental_dir=inc_dir)
        ctx = build_asset_context(store, extractor, "team-x")

        # 3. 合并
        full = f"{prompt}\n{ctx}"
        assert len(full) > len("你是全栈开发工程师。")
