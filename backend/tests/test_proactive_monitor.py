"""Tests for ProactiveMonitor — 主动式监控"""
import json
import os
import pytest
from proactive_monitor import ProactiveMonitor


@pytest.fixture
def monitor(tmp_path):
    # 创建模拟的 agent profiles
    profiles_dir = tmp_path / "agent_profiles"
    profiles_dir.mkdir()

    # 正常 agent
    (profiles_dir / "agent-1.json").write_text(json.dumps({
        "agent_id": "agent-1", "department": "dept-software",
        "skill_progress": {
            "backend_dev": {"level": 2, "xp": 200, "usage_count": 10, "success_count": 8},
        }
    }), encoding="utf-8")

    # 弱表现 agent
    (profiles_dir / "agent-2.json").write_text(json.dumps({
        "agent_id": "agent-2", "department": "dept-software",
        "skill_progress": {
            "frontend_dev": {"level": 1, "xp": 50, "usage_count": 5, "success_count": 1},
        }
    }), encoding="utf-8")

    # 单技能覆盖部门
    (profiles_dir / "agent-3.json").write_text(json.dumps({
        "agent_id": "agent-3", "department": "dept-data",
        "skill_progress": {
            "data_analysis": {"level": 2, "xp": 100, "usage_count": 4, "success_count": 3},
        }
    }), encoding="utf-8")

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
        profiles_dir = tmp_path / "agent_profiles"
        profiles_dir.mkdir()
        (profiles_dir / "agent-1.json").write_text(json.dumps({
            "agent_id": "agent-1", "department": "dept-software",
            "skill_progress": {
                "backend_dev": {"level": 2, "xp": 200, "usage_count": 10, "success_count": 9},
                "frontend_dev": {"level": 2, "xp": 150, "usage_count": 8, "success_count": 7},
            }
        }), encoding="utf-8")
        mon = ProactiveMonitor(str(tmp_path))
        result = mon.run_health_check()
        # 应该没有低成功率告警
        low_rate = [a for a in result["alerts"] if a["type"] == "low_success_rate"]
        assert len(low_rate) == 0
