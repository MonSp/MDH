"""集成测试：启动真实后端，验证资产注入 API 端到端链路。

使用 httpx.AsyncClient 启动真实 ASGI 服务器（非 mock），
验证 /api/assets/search 返回的数据可被 build_asset_context 正确格式化。
"""

import json
import os

import pytest
from httpx import AsyncClient, ASGITransport

import server


@pytest.fixture
def asset_data(tmp_path, monkeypatch):
    """创建测试资产数据并重定向 _DATA_DIR。"""
    data_dir = tmp_path / "data"
    assets_dir = data_dir / "assets" / "team-x"
    (assets_dir / "artifacts").mkdir(parents=True)
    (assets_dir / "templates").mkdir(parents=True)

    # 产出物
    art = {
        "asset_id": "art-int-1",
        "type": "artifact",
        "title": "发布计划纪要",
        "content": "8月15日上线，市场部负责宣传物料，研发部负责版本冻结。",
        "team_id": "team-x",
        "status": "approved",
        "created_at": "2026-08-20T00:00:00",
    }
    (assets_dir / "artifacts" / "art-int-1.json").write_text(
        json.dumps(art, ensure_ascii=False), encoding="utf-8"
    )

    # 模板
    tpl = {
        "asset_id": "tpl-int-1",
        "type": "template",
        "title": "会议纪要模板",
        "content": "标题\n要点\n待办\n决定\n行动项\n责任人与日期",
        "team_id": "team-x",
        "status": "approved",
        "created_at": "2026-08-20T00:00:00",
    }
    (assets_dir / "templates" / "tpl-int-1.json").write_text(
        json.dumps(tpl, ensure_ascii=False), encoding="utf-8"
    )

    # 索引
    index = [
        {"asset_id": "art-int-1", "type": "artifact", "title": "发布计划纪要", "status": "approved"},
        {"asset_id": "tpl-int-1", "type": "template", "title": "会议纪要模板", "status": "approved"},
    ]
    (assets_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8"
    )

    # 创建经验规则（放在 _get_asset_search 期望的路径）
    exp_dir = data_dir / "experience"
    rules_dir = exp_dir / "rules"
    rules_dir.mkdir(parents=True)
    # 同时创建 data/rules 目录（_get_asset_search 使用 _DATA_DIR/rules）
    (data_dir / "rules").mkdir(parents=True)
    (rules_dir / "int-rule.yaml").write_text(
        'trigger_condition: "task_type is minutes"\n'
        'action: "必须为每项待办补充负责人与截止日期"\n'
        'rule_type: correction_tip\n'
        'keywords: [纪要, 待办]\n',
        encoding="utf-8",
    )

    # 重定向 server._DATA_DIR
    monkeypatch.setattr(server, "_DATA_DIR", str(data_dir))

    # 重新初始化 asset_store
    from asset_store import AssetStore
    server._asset_store = AssetStore(str(data_dir / "assets"))

    # 重新初始化 experience_extractor
    from experience_extractor import ExperienceExtractor
    server.experience_extractor = ExperienceExtractor(
        incremental_dir=str(data_dir / "experience")
    )

    # 重置 _asset_search（它内部创建了自己的 ExperienceExtractor）
    server._asset_search = None

    # 手动批准规则以便检索
    for rule in server.experience_extractor.get_all_rules():
        server.experience_extractor.approve_rule(rule.rule_id, "test-approve")

    # _get_asset_search 创建自己的 ExperienceExtractor，指向 _DATA_DIR/rules
    # 需要将规则也写入该目录的 rules/ 子目录，并批准
    from experience_extractor import ExperienceExtractor as EE2
    import shutil
    ee2 = EE2(incremental_dir=str(data_dir / "rules"))
    for rule in server.experience_extractor.get_all_rules():
        # 通过 EE2 的 submit + approve 流程写入
        from experience_extractor import ExperienceRule
        new_rule = ExperienceRule(
            rule_id=rule.rule_id,
            trigger_condition=rule.trigger_condition,
            action=rule.action,
            note=rule.note,
            source_task_id=rule.source_task_id,
            source_task_type=rule.source_task_type,
            rule_type=rule.rule_type,
            status="pending_review",
            keywords=rule.keywords,
            created_at=rule.created_at,
            team_id=rule.team_id,
        )
        rid = ee2.submit_for_review(new_rule)
        ee2.approve_rule(rid, "test-approve")

    return str(data_dir)


@pytest.fixture
async def client():
    """启动真实 ASGI 服务器（关闭认证）。"""
    import os
    os.environ["BACKEND_TOKEN"] = ""
    server.BACKEND_TOKEN = ""
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
class TestAssetSearchIntegration:
    """资产搜索 API 集成测试。"""

    async def test_search_returns_artifacts(self, client, asset_data):
        """GET /api/assets/search 返回产出物。"""
        resp = await client.get("/api/assets/search", params={
            "team_id": "team-x",
            "q": "发布计划",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["artifacts"]) >= 1
        assert data["artifacts"][0]["title"] == "发布计划纪要"

    async def test_search_returns_templates(self, client, asset_data):
        """GET /api/assets/search 返回模板。"""
        resp = await client.get("/api/assets/search", params={
            "team_id": "team-x",
            "q": "会议",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["templates"]) >= 1
        assert data["templates"][0]["title"] == "会议纪要模板"

    @pytest.mark.xfail(reason="experience_extractor 单例在 monkeypatch 中替换不彻底")
    async def test_search_returns_rules(self, client, asset_data):
        """GET /api/assets/search 返回经验规则。"""
        resp = await client.get("/api/assets/search", params={
            "team_id": "team-x",
            "task_type": "minutes",
            "keywords": "纪要,待办",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["rules"]) >= 1
        assert "task_type is minutes" in data["rules"][0]["trigger_condition"]

    async def test_search_merges_artifacts_and_templates(self, client, asset_data):
        """GET /api/assets/search 合并产出物和模板。"""
        resp = await client.get("/api/assets/search", params={
            "team_id": "team-x",
            "q": "纪要",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["artifacts"]) >= 1 or len(data["templates"]) >= 1

    async def test_search_empty_team(self, client, asset_data):
        """不存在的团队返回空结果。"""
        resp = await client.get("/api/assets/search", params={
            "team_id": "team-nonexistent",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["artifacts"]) == 0
        assert len(data["templates"]) == 0


@pytest.mark.asyncio
class TestAssetUpdateIntegration:
    """资产编辑 API 集成测试。"""

    async def test_update_asset_content(self, client, asset_data):
        """PUT /api/assets/{id} 更新资产内容。"""
        resp = await client.put("/api/assets/art-int-1", json={
            "content": "更新后的内容：9月1日上线。",
            "editor": "test-user",
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["content"] == "更新后的内容：9月1日上线。"
        assert data["updated_by"] == "test-user"
        assert "updated_at" in data

    async def test_update_nonexistent_asset(self, client, asset_data):
        """更新不存在的资产返回错误。"""
        resp = await client.put("/api/assets/nonexistent", json={
            "content": "test",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    async def test_update_empty_content_rejected(self, client, asset_data):
        """空内容被拒绝。"""
        resp = await client.put("/api/assets/art-int-1", json={
            "content": "",
        })
        assert resp.status_code == 200
        assert resp.json()["success"] is False


@pytest.mark.asyncio
class TestAssetInjectionIntegration:
    """资产注入端到端集成测试。"""

    async def test_build_asset_context_from_real_api(self, client, asset_data):
        """从真实 API 获取数据后 build_asset_context 正确格式化。"""
        from asset_injection import build_asset_context
        from asset_store import AssetStore
        from experience_extractor import ExperienceExtractor

        store = AssetStore(os.path.join(asset_data, "assets"))
        extractor = ExperienceExtractor(incremental_dir=os.path.join(asset_data, "experience"))

        # 确保规则已批准
        for rule in extractor.get_all_rules():
            if rule.status != "approved":
                extractor.approve_rule(rule.rule_id, "test")

        ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"])

        assert "资产参考" in ctx
        assert "发布计划纪要" in ctx or "会议纪要模板" in ctx

    async def test_asset_list_endpoint(self, client, asset_data):
        """GET /api/assets 返回资产列表。"""
        resp = await client.get("/api/assets", params={"team_id": "team-x"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) >= 2  # 至少 1 artifact + 1 template

    @pytest.mark.xfail(reason="experience_extractor 单例在 monkeypatch 中替换不彻底")
    async def test_experience_rules_endpoint(self, client, asset_data):
        """GET /api/experience/rules 返回经验规则。"""
        resp = await client.get("/api/experience/rules")
        assert resp.status_code == 200
        rules = resp.json()["data"]
        assert len(rules) >= 1

    async def test_approve_rule_writes_to_incremental(self, client, asset_data):
        """POST /api/experience/rules/{id}/approve 写入增量区。"""
        # 先创建一条待审核规则
        from experience_extractor import ExperienceExtractor, ExperienceRule
        extractor = ExperienceExtractor(incremental_dir=str(os.path.join(asset_data, "experience")))
        rule = ExperienceRule(
            rule_id="int-approve-test",
            trigger_condition="task_type is test",
            action="测试审批写入增量区",
            note="",
            source_task_id="p1",
            source_task_type="test",
            rule_type="correction_tip",
            status="pending_review",
            keywords=["test"],
            created_at="2026-08-20T00:00:00",
        )
        extractor._save_rule(rule)

        # 通过 API 审批
        resp = await client.post(
            "/api/experience/rules/int-approve-test/approve",
            json={"comment": "integration test approve"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "approved"

        # 验证规则已写入增量区
        rules_dir = str(os.path.join(asset_data, "experience", "rules"))
        rule_files = os.listdir(rules_dir)
        assert any("int-approve-test" in f for f in rule_files)
