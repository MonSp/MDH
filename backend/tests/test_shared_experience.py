"""Tests for SharedExperiencePool and cross-project experience retrieval"""
import pytest
import tempfile
from pathlib import Path

from shared_experience_pool import SharedExperiencePool, SharedRule


@pytest.fixture
def pool(tmp_path):
    """创建临时共享池"""
    return SharedExperiencePool(str(tmp_path / "shared"))


class TestSharedExperiencePool:
    def test_publish_rule(self, pool):
        rule = pool.publish_rule(
            {"trigger_condition": "task is frontend", "action": "use React", "keywords": ["react", "frontend"]},
            source_project="proj-1",
            source_team="team-a",
        )
        assert rule is not None
        assert rule.source_project == "proj-1"
        assert "react" in rule.keywords

    def test_publish_missing_fields_returns_none(self, pool):
        result = pool.publish_rule({"trigger_condition": "x"})
        assert result is None

    def test_search_by_keywords(self, pool):
        pool.publish_rule(
            {"trigger_condition": "frontend task", "action": "use React", "keywords": ["react", "frontend"]},
            source_project="proj-1",
        )
        pool.publish_rule(
            {"trigger_condition": "backend task", "action": "use FastAPI", "keywords": ["python", "fastapi"]},
            source_project="proj-2",
        )
        results = pool.search(keywords=["react"])
        assert len(results) == 1
        assert "react" in results[0].keywords

    def test_search_empty_pool(self, pool):
        results = pool.search(keywords=["anything"])
        assert len(results) == 0

    def test_search_no_keywords_returns_all(self, pool):
        pool.publish_rule(
            {"trigger_condition": "x", "action": "y", "keywords": ["a"]},
            source_project="p1",
        )
        results = pool.search()
        assert len(results) == 1

    def test_fork_rule(self, pool):
        rule = pool.publish_rule(
            {"trigger_condition": "frontend", "action": "React", "keywords": ["react"]},
            source_project="proj-1",
        )
        forked = pool.fork_rule(rule.rule_id, "proj-2")
        assert forked is not None
        assert forked["source"] == f"shared_pool:{rule.rule_id}"
        assert forked["source_project"] == "proj-1"

    def test_fork_increments_usage(self, pool):
        rule = pool.publish_rule(
            {"trigger_condition": "x", "action": "y", "keywords": ["a"]},
            source_project="p1",
        )
        pool.fork_rule(rule.rule_id, "p2")
        pool.fork_rule(rule.rule_id, "p3")
        stats = pool.get_stats()
        assert stats["total_usage"] == 2

    def test_get_stats(self, pool):
        pool.publish_rule(
            {"trigger_condition": "x", "action": "y", "keywords": ["a"], "rule_type": "success_pattern"},
            source_project="p1",
        )
        pool.publish_rule(
            {"trigger_condition": "a", "action": "b", "keywords": ["c"], "rule_type": "correction_tip"},
            source_project="p2",
        )
        stats = pool.get_stats()
        assert stats["total_rules"] == 2
        assert stats["rule_types"]["success_pattern"] == 1
        assert stats["rule_types"]["correction_tip"] == 1
