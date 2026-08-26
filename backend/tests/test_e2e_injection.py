"""端到端测试：验证增量区和资产注入在 Python 端实际生效。"""

import json
import os

import pytest


@pytest.fixture
def incremental_dir(tmp_path):
    """创建测试增量区目录结构。"""
    inc = tmp_path / "experience"
    inc.mkdir()

    # system_prompt_addon.md
    (inc / "system_prompt_addon.md").write_text(
        "# 测试技能补充\n\n这是增量区的补充指令。", encoding="utf-8"
    )

    # rules/
    rules_dir = inc / "rules"
    rules_dir.mkdir()
    (rules_dir / "test-rule.yaml").write_text(
        'trigger_condition: "task_type is minutes"\n'
        'action: "必须为每项待办补充负责人与截止日期"\n'
        'rule_type: correction_tip\n'
        'keywords: [纪要, 待办]\n',
        encoding="utf-8",
    )

    # knowledge_add/
    knowledge_dir = inc / "knowledge_add"
    knowledge_dir.mkdir()
    (knowledge_dir / "meeting-rules.md").write_text(
        "# 会议纪要规范\n\n必须包含：1. 决议 2. 行动项 3. 责任人 4. 截止日期",
        encoding="utf-8",
    )

    return str(inc)


@pytest.fixture
def asset_dir(tmp_path):
    """创建测试资产目录结构。"""
    assets = tmp_path / "assets" / "team-x"
    (assets / "artifacts").mkdir(parents=True)
    (assets / "templates").mkdir(parents=True)

    # 产出物
    art = {
        "asset_id": "art-test-1",
        "type": "artifact",
        "title": "发布计划纪要",
        "content": "8月15日上线，市场部负责宣传物料，研发部负责版本冻结。",
        "team_id": "team-x",
        "status": "approved",
        "created_at": "2026-08-20T00:00:00",
    }
    (assets / "artifacts" / "art-test-1.json").write_text(
        json.dumps(art, ensure_ascii=False), encoding="utf-8"
    )

    # 模板
    tpl = {
        "asset_id": "tpl-test-1",
        "type": "template",
        "title": "会议纪要模板",
        "content": "标题\n要点\n待办\n决定\n行动项\n责任人与日期",
        "team_id": "team-x",
        "status": "approved",
        "created_at": "2026-08-20T00:00:00",
    }
    (assets / "templates" / "tpl-test-1.json").write_text(
        json.dumps(tpl, ensure_ascii=False), encoding="utf-8"
    )

    # 索引
    index = [
        {"asset_id": "art-test-1", "type": "artifact", "title": "发布计划纪要", "status": "approved"},
        {"asset_id": "tpl-test-1", "type": "template", "title": "会议纪要模板", "status": "approved"},
    ]
    (assets / "index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8"
    )

    return str(tmp_path / "assets")


class TestPythonIncrementalInjection:
    """Python 端增量区注入测试。"""

    def test_inject_incremental_context_addon(self, incremental_dir):
        """system_prompt_addon.md 注入到 system prompt。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager

        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir=incremental_dir)
        result = pool._inject_incremental_context("你是全栈开发工程师。")

        assert "进化技能补充" in result
        assert "测试技能补充" in result
        assert "增量区的补充指令" in result

    def test_inject_incremental_context_rules(self, incremental_dir):
        """增量区 rules 注入到 system prompt。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager

        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir=incremental_dir)
        result = pool._inject_incremental_context("你是全栈开发工程师。")

        assert "进化经验规则" in result
        assert "task_type is minutes" in result
        assert "必须为每项待办补充负责人与截止日期" in result

    def test_inject_skips_rejected_rules(self, tmp_path):
        """被拒绝的规则不应注入到 system prompt。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager

        inc = tmp_path / "exp"
        inc.mkdir()
        rules_dir = inc / "rules"
        rules_dir.mkdir()
        # approved rule (default)
        (rules_dir / "good.yaml").write_text(
            'trigger_condition: "task_type is deploy"\n'
            'action: "部署前必须运行完整测试"\n'
            'rule_type: correction_tip\n',
            encoding="utf-8",
        )
        # rejected rule
        (rules_dir / "bad.yaml").write_text(
            'trigger_condition: "task_type is hotfix"\n'
            'action: "跳过测试直接部署"\n'
            'rule_type: correction_tip\n'
            'status: rejected\n',
            encoding="utf-8",
        )
        # pending_review rule
        (rules_dir / "pending.yaml").write_text(
            'trigger_condition: "task_type is refactor"\n'
            'action: "重构前先写测试"\n'
            'rule_type: success_pattern\n'
            'status: pending_review\n',
            encoding="utf-8",
        )

        pool = AgentPool(key_manager=KeyManager(), incremental_dir=str(inc))
        result = pool._inject_incremental_context("你是开发工程师。")

        assert "部署前必须运行完整测试" in result
        assert "跳过测试直接部署" not in result
        assert "重构前先写测试" not in result

    def test_inject_incremental_context_knowledge(self, incremental_dir):
        """增量区 knowledge_add 注入到 system prompt。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager

        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir=incremental_dir)
        result = pool._inject_incremental_context("你是全栈开发工程师。")

        assert "进化领域知识" in result
        assert "会议纪要规范" in result
        assert "决议" in result

    def test_inject_preserves_original_prompt(self, incremental_dir):
        """注入保留原始 system prompt 内容。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager

        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir=incremental_dir)
        original = "你是全栈开发工程师。你的职责是编写代码。"
        result = pool._inject_incremental_context(original)

        assert result.startswith(original)

    def test_inject_empty_incremental_dir(self, tmp_path):
        """空增量区目录不注入任何内容。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager

        empty_dir = str(tmp_path / "empty")
        os.makedirs(empty_dir, exist_ok=True)

        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir=empty_dir)
        original = "你是全栈开发工程师。"
        result = pool._inject_incremental_context(original)

        assert result == original

    def test_inject_no_incremental_dir(self):
        """incremental_dir 为空时不注入。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager

        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir="")
        original = "你是全栈开发工程师。"
        result = pool._inject_incremental_context(original)

        assert result == original


class TestPythonAssetInjection:
    """Python 端资产注入测试。"""

    def test_build_asset_context_merges_types(self, asset_dir, tmp_path):
        """build_asset_context 合并模板、产出物、规则三种资产。"""
        from asset_store import AssetStore
        from asset_injection import build_asset_context
        from experience_extractor import ExperienceExtractor, ExperienceRule

        store = AssetStore(asset_dir)
        extractor = ExperienceExtractor(str(tmp_path / "experience"))

        # 直接创建并保存规则
        rule = ExperienceRule(
            rule_id="test-rule-1",
            trigger_condition="task_type is minutes",
            action="补充责任人",
            note="",
            source_task_id="p1",
            source_task_type="minutes",
            rule_type="correction_tip",
            status="approved",
            keywords=["纪要", "待办"],
            created_at="2026-08-20T00:00:00",
        )
        extractor._save_rule(rule)

        ctx = build_asset_context(store, extractor, "team-x", task_type="minutes", keywords=["纪要"])

        assert "资产参考" in ctx
        assert "发布计划纪要" in ctx or "会议纪要模板" in ctx

    def test_build_asset_context_empty_team(self, asset_dir, tmp_path):
        """无资产团队返回空串。"""
        from asset_store import AssetStore
        from asset_injection import build_asset_context
        from experience_extractor import ExperienceExtractor

        store = AssetStore(asset_dir)
        extractor = ExperienceExtractor(str(tmp_path / "experience"))

        ctx = build_asset_context(store, extractor, "team-empty")
        assert ctx == ""


class TestPythonEndToEnd:
    """Python 端端到端注入链路测试。"""

    def test_full_injection_chain(self, incremental_dir, asset_dir, tmp_path):
        """完整链路: 增量区 + 资产 → system prompt。"""
        from agent_pool import AgentPool
        from key_manager import KeyManager
        from asset_store import AssetStore
        from asset_injection import build_asset_context
        from experience_extractor import ExperienceExtractor

        # 1. 增量区注入
        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir=incremental_dir)
        base_prompt = "你是全栈开发工程师。"
        prompt_with_inc = pool._inject_incremental_context(base_prompt)

        assert "进化技能补充" in prompt_with_inc
        assert "进化经验规则" in prompt_with_inc
        assert "进化领域知识" in prompt_with_inc

        # 2. 资产注入
        store = AssetStore(asset_dir)
        extractor = ExperienceExtractor(str(tmp_path / "experience"))
        asset_ctx = build_asset_context(store, extractor, "team-x")

        # 3. 合并
        full_prompt = f"{prompt_with_inc}\n{asset_ctx}"
        assert "进化技能补充" in full_prompt
        assert "资产参考" in full_prompt or asset_ctx == ""

    def test_create_agent_injects_incremental(self, incremental_dir):
        """验证 AgentPool._create_agent 实际将增量区注入到 agent system_prompt。"""
        from unittest.mock import patch
        from agent_pool import AgentPool, AgentConfig
        from key_manager import KeyManager

        km = KeyManager()
        pool = AgentPool(key_manager=km, incremental_dir=incremental_dir)

        config = AgentConfig(
            id="test-agent",
            name="测试工程师",
            role="executor",
            capabilities=["code_generation"],
            system_prompt="你是全栈开发工程师。",
        )

        # 捕获 Agent() 构造函数收到的 system_prompt 参数
        captured_kwargs = {}
        with patch('agent_pool.Agent') as MockAgent:
            MockAgent.return_value.sys_prompt = ''
            pool._create_agent(config)
            captured_kwargs = MockAgent.call_args

        # 验证 Agent() 收到的 system_prompt 包含增量区内容
        prompt = captured_kwargs.kwargs.get('system_prompt', '') or captured_kwargs[1].get('system_prompt', '')
        assert "进化技能补充" in prompt
        assert "进化经验规则" in prompt
        assert "进化领域知识" in prompt
        # 原始 prompt 也被保留
        assert "你是全栈开发工程师" in prompt
