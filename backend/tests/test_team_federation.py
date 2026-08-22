"""Tests for TeamFederation — 多团队进化联邦"""
import pytest
from team_federation import TeamFederation


@pytest.fixture
def federation(tmp_path):
    return TeamFederation(str(tmp_path))


class TestTeamFederation:
    def test_publish_evolution(self, federation):
        """高分规则发布到共享池"""
        result = federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend", "api"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        assert result is not None
        assert result["source_team"] == "team-a"
        assert result["trust_score"] > 0

    def test_publish_low_score_rejected(self, federation):
        """低分规则不发布"""
        result = federation.publish_evolution("team-a", {
            "rule_id": "r2", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.3, "usage_count": 10,
        })
        assert result is None

    def test_publish_low_usage_rejected(self, federation):
        """使用次数不足不发布"""
        result = federation.publish_evolution("team-a", {
            "rule_id": "r3", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 2,
        })
        assert result is None

    def test_subscribe_team(self, federation):
        """智能订阅：团队关键词匹配"""
        federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend", "api"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        federation.publish_evolution("team-a", {
            "rule_id": "r2", "trigger_condition": "x2", "action": "y2",
            "keywords": ["frontend", "ui"], "rule_type": "success_pattern",
            "effectiveness_score": 0.9, "usage_count": 15,
        })

        # team-b 订阅 backend 相关
        matches = federation.subscribe_team("team-b", ["backend", "python"])
        assert len(matches) == 1
        assert "backend" in matches[0]["keywords"]

    def test_subscribe_excludes_own_team(self, federation):
        """不订阅自己的规则"""
        federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        matches = federation.subscribe_team("team-a", ["backend"])
        assert len(matches) == 0

    def test_subscribe_excludes_low_trust(self, federation):
        """低信任来源的规则不订阅"""
        federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        # 多次失败降低信任
        for _ in range(10):
            federation.report_usage("evo-xxx", "team-b", False)  # 不存在的规则，不影响
        # 手动降低信任
        federation._trust_scores["team-a"] = 0.2
        federation._save()

        matches = federation.subscribe_team("team-b", ["backend"])
        assert len(matches) == 0

    def test_report_usage(self, federation):
        """报告跨团队使用结果"""
        evo = federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        assert federation.report_usage(evo["evolution_id"], "team-b", True) is True
        assert federation.report_usage(evo["evolution_id"], "team-b", False) is True

        stats = federation.get_federation_stats()
        assert stats["total_cross_team_usage"] == 2

    def test_trust_adjustment(self, federation):
        """信任评分随使用结果调整"""
        evo = federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        initial_trust = federation._get_trust("team-a")
        federation.report_usage(evo["evolution_id"], "team-b", True)
        assert federation._get_trust("team-a") > initial_trust

    def test_federation_stats(self, federation):
        """联邦统计"""
        federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        stats = federation.get_federation_stats()
        assert stats["total_evolutions"] == 1
        assert stats["active_evolutions"] == 1
        assert "team-a" in stats["by_source_team"]

    def test_team_feed(self, federation):
        """团队个性化进化流"""
        federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend", "api"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        feed = federation.get_team_feed("team-b", ["backend"])
        assert len(feed["subscribed"]) == 1
        assert feed["trust_score"] == 0.5  # 默认信任
        assert len(feed["recommendations"]) > 0

    def test_persistence(self, federation, tmp_path):
        """持久化"""
        federation.publish_evolution("team-a", {
            "rule_id": "r1", "trigger_condition": "x", "action": "y",
            "keywords": ["backend"], "rule_type": "success_pattern",
            "effectiveness_score": 0.8, "usage_count": 10,
        })
        federation2 = TeamFederation(str(tmp_path))
        assert len(federation2._evolutions) == 1
