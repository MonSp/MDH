"""Tests for SystemIntrospection — 系统自省"""
import pytest
import yaml

from system_introspection import SystemIntrospection


@pytest.fixture
def introspection(tmp_path):
    """创建带规则和追踪数据的系统自省"""
    data_dir = tmp_path / "data"
    exp_dir = data_dir / "experience" / "rules"
    exp_dir.mkdir(parents=True)

    # 创建不同类型的规则
    rules = [
        {"rule_id": "r1", "trigger_condition": "x", "action": "y", "rule_type": "success_pattern",
         "keywords": ["backend"], "status": "approved", "effectiveness_score": 0.9, "usage_count": 10, "success_count": 9},
        {"rule_id": "r2", "trigger_condition": "x2", "action": "y2", "rule_type": "success_pattern",
         "keywords": ["backend"], "status": "approved", "effectiveness_score": 0.7, "usage_count": 8, "success_count": 6},
        {"rule_id": "r3", "trigger_condition": "x3", "action": "y3", "rule_type": "failure_avoidance",
         "keywords": ["frontend"], "status": "approved", "effectiveness_score": 0.2, "usage_count": 5, "success_count": 1},
    ]
    for r in rules:
        (exp_dir / f"{r['rule_id']}.yaml").write_text(yaml.dump({"rules": [r]}), encoding="utf-8")

    return SystemIntrospection(str(data_dir))


class TestSystemIntrospection:
    def test_track_feature_call(self, introspection):
        """记录功能调用"""
        introspection.track_feature_call("mentor_matching", success=True)
        introspection.track_feature_call("mentor_matching", success=True)
        introspection.track_feature_call("mentor_matching", success=False)

        utilization = introspection.get_feature_utilization()
        mentor = next(f for f in utilization["features"] if f["feature"] == "mentor_matching")
        assert mentor["calls"] == 3
        assert mentor["success_rate"] == pytest.approx(2/3, abs=0.01)

    def test_feature_utilization_summary(self, introspection):
        """功能利用率汇总"""
        result = introspection.get_feature_utilization()
        assert "features" in result
        assert "summary" in result
        assert result["summary"]["total_features"] >= 10
        assert result["summary"]["active"] + result["summary"]["minimal"] + result["summary"]["unused"] == result["summary"]["total_features"]

    def test_module_health(self, introspection):
        """模块健康度分析"""
        result = introspection.get_module_health()
        assert "modules" in result
        assert "total_rules" in result
        assert result["total_rules"] == 3

    def test_module_health_identifies_weakest(self, introspection):
        """识别最弱模块"""
        result = introspection.get_module_health()
        assert result["weakest"] == "failure_avoidance"  # 有效性 0.2

    def test_regression_tracking(self, introspection):
        """回归追踪"""
        introspection.track_regression("experience_extractor", "规则提取失败")
        introspection.track_regression("experience_extractor", "规则提取失败2")
        report = introspection.get_regression_report()
        assert report["total_regressions"] == 2
        assert report["by_module"]["experience_extractor"] == 2

    def test_improvement_proposals(self, introspection):
        """改进提案生成"""
        proposals = introspection.generate_improvement_proposals()
        assert isinstance(proposals, list)
        # 应该有关于低有效性模块的提案
        critical = [p for p in proposals if p["type"] == "critical_module"]
        assert len(critical) >= 1

    def test_proposals_include_unused_features(self, introspection):
        """未使用功能生成提案"""
        proposals = introspection.generate_improvement_proposals()
        unused = [p for p in proposals if p["type"] == "unused_feature"]
        assert len(unused) > 0  # 大部分 v1.5.x 功能在测试中不会被调用

    def test_persistence(self, introspection, tmp_path):
        """追踪数据持久化"""
        introspection.track_feature_call("test_feature", True)
        si2 = SystemIntrospection(str(tmp_path / "data"))
        assert "test_feature" in si2._tracking.get("feature_calls", {})
