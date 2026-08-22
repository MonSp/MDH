"""Tests for TeamSynergy — 团队协同优化"""
import pytest
from team_synergy import TeamSynergy


@pytest.fixture
def synergy(tmp_path):
    return TeamSynergy(str(tmp_path))


class TestTeamSynergy:
    def test_record_and_analyze(self, synergy):
        """记录和分析团队任务"""
        synergy.record_team_task(["a1", "a2"], "frontend", True, 8.0)
        synergy.record_team_task(["a1", "a2"], "frontend", True, 9.0)
        synergy.record_team_task(["a1", "a2"], "frontend", False, 5.0)

        result = synergy.analyze_synergy()
        assert len(result["pairs"]) == 1
        assert result["pairs"][0]["success_rate"] == pytest.approx(2/3, abs=0.01)
        assert result["total_tasks_analyzed"] == 3

    def test_synergy_score(self, synergy):
        """协同得分计算"""
        synergy.record_team_task(["a1", "a2"], "task", True, 9.0)
        synergy.record_team_task(["a1", "a2"], "task", True, 8.0)
        result = synergy.analyze_synergy()
        assert result["pairs"][0]["synergy_score"] > 0.5

    def test_bottleneck_detection(self, synergy):
        """瓶颈检测"""
        # a1 总是成功
        for _ in range(5):
            synergy.record_team_task(["a1", "a3"], "task", True, 8.0)
        # a2 总是失败
        for _ in range(5):
            synergy.record_team_task(["a2", "a3"], "task", False, 3.0)

        result = synergy.analyze_synergy()
        bottlenecks = result["bottlenecks"]
        assert len(bottlenecks) >= 1
        assert bottlenecks[0]["agent_id"] == "a2"

    def test_recommend_teams(self, synergy):
        """推荐最优团队"""
        synergy.record_team_task(["a1", "a2"], "task", True, 9.0)
        synergy.record_team_task(["a1", "a2"], "task", True, 8.0)
        synergy.record_team_task(["a1", "a3"], "task", False, 4.0)

        result = synergy.analyze_synergy()
        assert len(result["best_teams"]) >= 1
        assert result["best_teams"][0]["success_rate"] == 1.0

    def test_recommend_for_task(self, synergy):
        """为任务推荐 agent"""
        synergy.record_team_task(["a1", "a2"], "frontend", True, 8.0)
        synergy.record_team_task(["a1", "a2"], "frontend", True, 9.0)
        synergy.record_team_task(["a3", "a4"], "frontend", False, 4.0)

        recommended = synergy.recommend_for_task("frontend", ["a1", "a2", "a3", "a4"])
        assert "a1" in recommended
        assert "a2" in recommended

    def test_recommend_no_history(self, synergy):
        """无历史时返回前两个 agent"""
        recommended = synergy.recommend_for_task("frontend", ["a1", "a2", "a3"])
        assert recommended == ["a1", "a2"]

    def test_stats(self, synergy):
        """协同统计"""
        synergy.record_team_task(["a1", "a2"], "task", True)
        synergy.record_team_task(["a2", "a3"], "task", False)
        stats = synergy.get_stats()
        assert stats["total_tasks"] == 2
        assert stats["unique_agents"] == 3

    def test_persistence(self, synergy, tmp_path):
        """持久化"""
        synergy.record_team_task(["a1", "a2"], "task", True)
        synergy2 = TeamSynergy(str(tmp_path))
        assert len(synergy2._synergy["task_history"]) == 1
