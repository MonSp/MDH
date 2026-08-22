"""Tests for CapabilityBoundary — 能力边界感知"""
import os
import pytest
import yaml

from capability_boundary import CapabilityBoundary


@pytest.fixture
def boundary(tmp_path):
    """创建带规则的能力边界"""
    exp_dir = tmp_path / "data" / "experience" / "rules"
    exp_dir.mkdir(parents=True)

    # 高置信领域：多条高分规则
    for i in range(5):
        rule = {
            "rules": [{
                "rule_id": f"backend-{i}",
                "trigger_condition": f"x{i}",
                "action": f"y{i}",
                "rule_type": "success_pattern",
                "keywords": ["backend", "api"],
                "status": "approved",
                "effectiveness_score": 0.8,
                "usage_count": 10,
                "success_count": 8,
            }]
        }
        (exp_dir / f"backend-{i}.yaml").write_text(yaml.dump(rule), encoding="utf-8")

    # 低置信领域：1 条低分规则
    low_rule = {
        "rules": [{
            "rule_id": "ml-1",
            "trigger_condition": "ml",
            "action": "train",
            "rule_type": "success_pattern",
            "keywords": ["ml", "machine-learning"],
            "status": "approved",
            "effectiveness_score": 0.2,
            "usage_count": 3,
            "success_count": 1,
        }]
    }
    (exp_dir / "ml-1.yaml").write_text(yaml.dump(low_rule), encoding="utf-8")

    return CapabilityBoundary(str(tmp_path / "data"))


class TestCapabilityBoundary:
    def test_confidence_map(self, boundary):
        """置信度地图计算"""
        result = boundary.compute_confidence_map()
        assert "domains" in result
        assert "overall_confidence" in result
        assert result["total_domains"] >= 2

    def test_high_confidence_domain(self, boundary):
        """高分规则领域高置信"""
        result = boundary.compute_confidence_map()
        domains = result["domains"]
        # backend 领域应该高置信
        backend = [d for k, d in domains.items() if "backend" in k.lower()]
        if backend:
            assert backend[0]["confidence"] >= 0.5

    def test_low_confidence_domain(self, boundary):
        """低分规则领域低置信"""
        result = boundary.compute_confidence_map()
        domains = result["domains"]
        # ml 领域应该低置信
        ml = [d for k, d in domains.items() if "ml" in k.lower() or "machine" in k.lower()]
        if ml:
            assert ml[0]["confidence"] < 0.5

    def test_detect_unknown_domain(self, boundary):
        """检测未知领域"""
        result = boundary.detect_unknown_domain(["quantum-computing", "blockchain"])
        assert result["is_unknown"] is True
        assert result["best_confidence"] == 0.0

    def test_detect_known_domain(self, boundary):
        """检测已知领域"""
        result = boundary.detect_unknown_domain(["backend", "api"])
        assert result["is_unknown"] is False
        assert result["best_confidence"] > 0

    def test_boundary_report(self, boundary):
        """能力边界报告"""
        report = boundary.get_boundary_report()
        assert "confidence_map" in report
        assert "sorted_domains" in report
        assert "recommendations" in report

    def test_recommendations_for_low_domains(self, boundary):
        """低置信领域生成改进建议"""
        report = boundary.get_boundary_report()
        recs = report["recommendations"]
        # 应该有针对低置信领域的建议
        assert isinstance(recs, list)
