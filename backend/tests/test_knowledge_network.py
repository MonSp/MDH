"""Tests for KnowledgeNetwork — 联动进化"""
import json

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

    def test_network_stats(self, network):
        """知识网络统计"""
        stats = network.get_network_stats()
        assert stats["skill_packs"] >= 1
        assert stats["rules"] >= 0
        assert stats["assets"] >= 1
