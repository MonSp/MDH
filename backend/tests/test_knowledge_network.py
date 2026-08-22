"""Tests for KnowledgeNetwork — 联动进化"""
import json
import os
import pytest
import yaml

from knowledge_network import KnowledgeNetwork


@pytest.fixture
def network(tmp_path):
    """创建带技能包和资产的知识网络"""
    # 创建技能包
    skills_dir = tmp_path / "skill_packs" / "backend_dev"
    skills_dir.mkdir(parents=True)
    manifest = {"name": "backend_dev", "keywords": ["backend", "api", "python"]}
    (skills_dir / "manifest.yaml").write_text(yaml.dump(manifest), encoding="utf-8")
    rules_dir = skills_dir / "rules"
    rules_dir.mkdir()
    rule_data = {"rules": [{"rule_id": "old-rule-1", "trigger_condition": "x", "action": "y"}]}
    (rules_dir / "old-rule.yaml").write_text(yaml.dump(rule_data), encoding="utf-8")

    # 创建资产
    assets_dir = tmp_path / "data" / "assets"
    assets_dir.mkdir(parents=True)
    index = [{"asset_id": "asset-1", "title": "API设计模板", "keywords": ["api", "backend"]}]
    (assets_dir / "index.json").write_text(json.dumps(index), encoding="utf-8")

    return KnowledgeNetwork(str(tmp_path / "data"), str(tmp_path / "skill_packs"))


class TestKnowledgeNetwork:
    def test_find_related_skills(self, network):
        """根据关键词找到相关技能包"""
        skills = network._find_related_skills(["backend", "api"])
        assert "backend_dev" in skills

    def test_find_related_skills_no_match(self, network):
        """不相关的关键词不匹配"""
        skills = network._find_related_skills(["cooking", "recipe"])
        assert len(skills) == 0

    def test_find_related_assets(self, network):
        """根据关键词找到相关资产"""
        assets = network._find_related_assets(["api", "backend"])
        assert "asset-1" in assets

    def test_update_skill_pack_rules(self, network):
        """更新技能包中的规则引用"""
        updated = network._update_skill_pack_rules("backend_dev", "old-rule-1", "new-rule-1")
        assert updated is True
        # 验证更新后的文件
        rules_dir = os.path.join(network._skill_packs_dir, "backend_dev", "rules")
        with open(os.path.join(rules_dir, "old-rule.yaml"), encoding="utf-8") as f:
            data = yaml.safe_load(f)
        assert data["rules"][0]["rule_id"] == "new-rule-1"
        assert data["rules"][0]["evolved"] is True

    def test_update_skill_pack_rules_nonexistent(self, network):
        """不存在的技能包返回 False"""
        assert network._update_skill_pack_rules("nonexistent", "a", "b") is False

    def test_propagate_rule_evolution(self, network):
        """联动进化：规则进化触发技能包和资产更新"""
        result = network.propagate_rule_evolution("old-rule-1", "new-rule-1", ["backend", "api"])
        assert "backend_dev" in result["updated_skills"]
        assert "asset-1" in result["updated_assets"]
        assert result["propagated"] >= 1

    def test_evolution_log(self, network):
        """联动进化记录到日志"""
        network.propagate_rule_evolution("old-rule-1", "new-rule-1", ["backend"])
        log = network.get_evolution_log()
        assert len(log) == 1
        assert log[0]["rule_id"] == "old-rule-1"
        assert log[0]["evolved_rule_id"] == "new-rule-1"

    def test_network_stats(self, network):
        """知识网络统计"""
        stats = network.get_network_stats()
        assert stats["skill_packs"] >= 1
        assert stats["rules"] >= 0
        assert stats["assets"] >= 1

    def test_flag_asset_for_reeval(self, network):
        """标记资产需要重新评估"""
        network._flag_asset_for_reeval("asset-1")
        index_path = os.path.join(network._data_dir, "assets", "index.json")
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)
        asset = next(a for a in index if a["asset_id"] == "asset-1")
        assert asset.get("needs_reeval") is True
