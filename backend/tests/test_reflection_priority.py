"""Tests for ReflectionPriorityQueue — 反思优先级队列"""
import json
import os
import pytest
import yaml

from reflection_priority import ReflectionPriorityQueue


@pytest.fixture
def queue(tmp_path):
    """创建带规则的反思队列"""
    exp_dir = tmp_path / "data" / "experience"
    rules_dir = exp_dir / "rules"
    rules_dir.mkdir(parents=True)

    # 创建不同健康度的规则
    rules = [
        {"rule_id": "r1", "trigger_condition": "x1", "action": "y1", "rule_type": "success_pattern",
         "keywords": ["backend"], "status": "approved", "effectiveness_score": 0.9, "usage_count": 10, "success_count": 9},
        {"rule_id": "r2", "trigger_condition": "x2", "action": "y2", "rule_type": "success_pattern",
         "keywords": ["backend"], "status": "approved", "effectiveness_score": 0.8, "usage_count": 8, "success_count": 6},
        {"rule_id": "r3", "trigger_condition": "x3", "action": "y3", "rule_type": "correction_tip",
         "keywords": ["frontend"], "status": "approved", "effectiveness_score": 0.2, "usage_count": 5, "success_count": 1},
        {"rule_id": "r4", "trigger_condition": "x4", "action": "y4", "rule_type": "correction_tip",
         "keywords": ["frontend"], "status": "approved", "effectiveness_score": 0.1, "usage_count": 6, "success_count": 1},
    ]
    for r in rules:
        (rules_dir / f"{r['rule_id']}.yaml").write_text(
            yaml.dump({"rules": [r]}, allow_unicode=True), encoding="utf-8"
        )

    return ReflectionPriorityQueue(str(tmp_path / "data"))


class TestReflectionPriorityQueue:
    def test_compute_priorities(self, queue):
        """计算反思优先级"""
        result = queue.compute_priorities()
        assert "domains" in result
        assert "queue" in result
        assert "summary" in result

    def test_domain_health(self, queue):
        """领域健康度计算"""
        result = queue.compute_priorities()
        domains = {d["domain"]: d for d in result["domains"]}
        # backend 领域健康度高
        if "backend" in domains:
            assert domains["backend"]["health_score"] >= 0.7
        # frontend 领域健康度低
        if "frontend" in domains:
            assert domains["frontend"]["health_score"] < 0.4

    def test_priority_queue_ordering(self, queue):
        """优先级队列按优先级排序"""
        result = queue.compute_priorities()
        priorities = [q["priority"] for q in result["queue"]]
        assert priorities == sorted(priorities, reverse=True)

    def test_critical_domain_in_queue(self, queue):
        """紧急领域出现在队列中"""
        result = queue.compute_priorities()
        targets = [q["target"] for q in result["queue"]]
        # frontend 领域应该是 critical
        assert "frontend" in targets or "correction_tip" in targets

    def test_low_score_rules_in_queue(self, queue):
        """低分规则出现在队列中"""
        result = queue.compute_priorities()
        low_score = [q for q in result["queue"] if q["type"] == "low_score_rule"]
        assert len(low_score) >= 1

    def test_summary_counts(self, queue):
        """汇总计数"""
        result = queue.compute_priorities()
        summary = result["summary"]
        assert summary["total_domains"] >= 1
        assert summary["healthy"] + summary["needs_attention"] + summary["critical"] == summary["total_domains"]

    def test_queue_persistence(self, queue, tmp_path):
        """队列持久化"""
        queue.compute_priorities()
        queue2 = ReflectionPriorityQueue(str(tmp_path / "data"))
        saved = queue2.get_saved_queue()
        assert len(saved["queue"]) > 0

    def test_empty_rules(self, tmp_path):
        """无规则时返回空结果"""
        data_dir = tmp_path / "data"
        (data_dir / "experience" / "rules").mkdir(parents=True)
        q = ReflectionPriorityQueue(str(data_dir))
        result = q.compute_priorities()
        assert result["summary"]["total_domains"] == 0
