"""Tests for ProactiveMonitor — 主动式监控"""
import pytest
from agent_profile_manager import AgentProfileManager
from proactive_monitor import ProactiveMonitor


@pytest.fixture
def monitor(tmp_path):
    profiles_dir = str(tmp_path / "agent_profiles")
    mgr = AgentProfileManager(profiles_dir)

    # 正常 agent
    p1 = mgr.get_or_create("agent-1", "正常", department="dept-software")
    p1.skill_progress = {"backend_dev": {"level": 2, "xp": 200, "usage_count": 10, "success_count": 8, "avg_review_score": 8.0, "task_count": 10}}
    mgr.save_profile(p1)

    # 弱表现 agent
    p2 = mgr.get_or_create("agent-2", "弱表现", department="dept-software")
    p2.skill_progress = {"frontend_dev": {"level": 1, "xp": 50, "usage_count": 5, "success_count": 1, "avg_review_score": 4.0, "task_count": 5}}
    mgr.save_profile(p2)

    # 单技能覆盖部门
    p3 = mgr.get_or_create("agent-3", "数据", department="dept-data")
    p3.skill_progress = {"data_analysis": {"level": 2, "xp": 100, "usage_count": 4, "success_count": 3, "avg_review_score": 7.0, "task_count": 4}}
    mgr.save_profile(p3)

    return ProactiveMonitor(str(tmp_path))


class TestProactiveMonitor:
    def test_health_check_detects_low_success_rate(self, monitor):
        """检测低成功率 agent"""
        result = monitor.run_health_check()
        alerts = result["alerts"]
        low_rate = [a for a in alerts if a["type"] == "low_success_rate"]
        assert len(low_rate) >= 1
        assert "agent-2" in low_rate[0]["agent_id"]

    def test_health_check_detects_skill_gap(self, monitor):
        """检测技能覆盖缺口"""
        result = monitor.run_health_check()
        alerts = result["alerts"]
        gaps = [a for a in alerts if a["type"] == "skill_gap"]
        # dept-data 只有 1 个中级技能
        assert len(gaps) >= 1

    def test_health_check_summary(self, monitor):
        """健康巡检汇总"""
        result = monitor.run_health_check()
        summary = result["summary"]
        assert summary["total"] > 0
        assert summary["warning"] + summary["critical"] + summary["info"] == summary["total"]

    def test_alerts_persisted(self, monitor, tmp_path):
        """告警持久化"""
        monitor.run_health_check()
        monitor2 = ProactiveMonitor(str(tmp_path))
        assert len(monitor2._alerts) > 0

    def test_recent_alerts(self, monitor):
        """获取最近告警"""
        monitor.run_health_check()
        alerts = monitor.get_recent_alerts(limit=5)
        assert len(alerts) > 0
        assert len(alerts) <= 5

    def test_alert_stats(self, monitor):
        """告警统计"""
        monitor.run_health_check()
        stats = monitor.get_alert_stats()
        assert stats["total"] > 0
        assert "low_success_rate" in stats["by_type"] or "skill_gap" in stats["by_type"]

    def test_no_alerts_for_healthy_system(self, tmp_path):
        """健康系统无告警"""
        profiles_dir = str(tmp_path / "profiles")
        mgr = AgentProfileManager(profiles_dir)
        p = mgr.get_or_create("agent-1", "健康", department="dept-software")
        p.skill_progress = {
            "backend_dev": {"level": 2, "xp": 200, "usage_count": 10, "success_count": 9, "avg_review_score": 8.5, "task_count": 10},
            "frontend_dev": {"level": 2, "xp": 150, "usage_count": 8, "success_count": 7, "avg_review_score": 8.0, "task_count": 8},
        }
        mgr.save_profile(p)
        mon = ProactiveMonitor(str(tmp_path))
        result = mon.run_health_check()
        low_rate = [a for a in result["alerts"] if a["type"] == "low_success_rate"]
        assert len(low_rate) == 0
