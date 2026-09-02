"""Tests for SharedExperiencePool and cross-project experience retrieval"""
import tempfile

import pytest

from shared_experience_pool import SharedExperiencePool


@pytest.fixture
def pool(tmp_path):
    """创建临时共享池"""
    return SharedExperiencePool(str(tmp_path / "shared"))


def _high_quality_rule(**overrides):
    """构造满足质量门禁的规则数据"""
    data = {
        "trigger_condition": "task is frontend",
        "action": "use React",
        "keywords": ["react", "frontend"],
        "effectiveness_score": 0.8,
        "usage_count": 5,
    }
    data.update(overrides)
    return data


class TestSharedExperiencePool:
    def test_publish_rule(self, pool):
        rule = pool.publish_rule(
            _high_quality_rule(),
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
            _high_quality_rule(keywords=["react", "frontend"]),
            source_project="proj-1",
        )
        pool.publish_rule(
            _high_quality_rule(trigger_condition="backend task", action="use FastAPI", keywords=["python", "fastapi"]),
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
            _high_quality_rule(trigger_condition="x", action="y", keywords=["a"]),
            source_project="p1",
        )
        results = pool.search()
        assert len(results) == 1

    def test_fork_rule(self, pool):
        rule = pool.publish_rule(
            _high_quality_rule(keywords=["react"]),
            source_project="proj-1",
        )
        forked = pool.fork_rule(rule.rule_id, "proj-2")
        assert forked is not None
        assert forked["source"] == f"shared_pool:{rule.rule_id}"
        assert forked["source_project"] == "proj-1"

    def test_fork_increments_usage(self, pool):
        rule = pool.publish_rule(
            _high_quality_rule(trigger_condition="x", action="y", keywords=["a"]),
            source_project="p1",
        )
        pool.fork_rule(rule.rule_id, "p2")
        pool.fork_rule(rule.rule_id, "p3")
        stats = pool.get_stats()
        assert stats["total_usage"] == 2

    def test_get_stats(self, pool):
        pool.publish_rule(
            _high_quality_rule(trigger_condition="x", action="y", keywords=["a"], rule_type="success_pattern"),
            source_project="p1",
        )
        pool.publish_rule(
            _high_quality_rule(trigger_condition="a", action="b", keywords=["c"], rule_type="correction_tip"),
            source_project="p2",
        )
        stats = pool.get_stats()
        assert stats["total_rules"] == 2
        assert stats["rule_types"]["success_pattern"] == 1
        assert stats["rule_types"]["correction_tip"] == 1


# ──────────────────── 质量门禁 ────────────────────


class TestPublishQualityGate:
    def test_high_quality_auto_approved(self, pool):
        """满足门禁的规则自动批准"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.8, usage_count=5),
            source_project="p1",
        )
        assert rule.status == "approved"

    def test_low_score_pending(self, pool):
        """低评分规则进入待审核"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5),
            source_project="p1",
        )
        assert rule.status == "pending"

    def test_low_usage_pending(self, pool):
        """使用次数不足的规则进入待审核"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.8, usage_count=1),
            source_project="p1",
        )
        assert rule.status == "pending"

    def test_boundary_score_exactly_06_approved(self, pool):
        """恰好 0.6 分通过门禁"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.6, usage_count=2),
            source_project="p1",
        )
        assert rule.status == "approved"

    def test_effectiveness_carry_over(self, pool):
        """发布时携带有效性评分"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.85),
            source_project="p1",
        )
        assert rule.effectiveness_score == 0.85


# ──────────────────── 审批流程 ────────────────────


class TestApprovalWorkflow:
    def test_approve_pending_rule(self, pool):
        """批准待审核规则"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5),
            source_project="p1",
        )
        assert rule.status == "pending"
        assert pool.approve_rule(rule.rule_id, "admin") is True
        loaded = pool._load_rule(rule.rule_id)
        assert loaded.status == "approved"

    def test_reject_pending_rule(self, pool):
        """拒绝待审核规则"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5),
            source_project="p1",
        )
        assert pool.reject_rule(rule.rule_id, "不符合标准") is True
        loaded = pool._load_rule(rule.rule_id)
        assert loaded.status == "rejected"

    def test_cannot_approve_already_approved(self, pool):
        """不能重复批准已批准的规则"""
        rule = pool.publish_rule(
            _high_quality_rule(),
            source_project="p1",
        )
        assert rule.status == "approved"
        assert pool.approve_rule(rule.rule_id) is False

    def test_pending_not_in_search(self, pool):
        """待审核规则不出现在搜索结果中"""
        pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5, keywords=["react"]),
            source_project="p1",
        )
        results = pool.search(keywords=["react"])
        assert len(results) == 0

    def test_search_include_pending(self, pool):
        """搜索时可选包含待审核规则"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5, keywords=["react"]),
            source_project="p1",
        )
        results = pool.search(keywords=["react"], include_pending=True)
        assert len(results) == 1

    def test_rejected_not_in_search(self, pool):
        """已拒绝规则不出现在搜索结果中"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5, keywords=["react"]),
            source_project="p1",
        )
        pool.reject_rule(rule.rule_id)
        results = pool.search(keywords=["react"], include_pending=True)
        assert len(results) == 0

    def test_get_pending_rules(self, pool):
        """获取待审核规则列表"""
        pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5),
            source_project="p1",
        )
        pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.8, usage_count=5),
            source_project="p2",
        )
        pending = pool.get_pending_rules()
        assert len(pending) == 1
        assert pending[0].status == "pending"

    def test_stats_includes_pending_count(self, pool):
        """统计包含待审核计数"""
        pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5),
            source_project="p1",
        )
        pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.8, usage_count=5),
            source_project="p2",
        )
        stats = pool.get_stats()
        assert stats["pending_count"] == 1
        assert stats["by_status"]["approved"] == 1
        assert stats["by_status"]["pending"] == 1

    def test_approve_then_searchable(self, pool):
        """批准后规则可被搜索"""
        rule = pool.publish_rule(
            _high_quality_rule(effectiveness_score=0.3, usage_count=5, keywords=["react"]),
            source_project="p1",
        )
        assert len(pool.search(keywords=["react"])) == 0
        pool.approve_rule(rule.rule_id)
        assert len(pool.search(keywords=["react"])) == 1


# ──────────────────── Fork 效果追踪 ────────────────────


class TestForkEffectiveness:
    def test_update_fork_effectiveness(self, pool):
        """更新 fork 效果"""
        rule = pool.publish_rule(_high_quality_rule(), source_project="p1")
        assert pool.update_fork_effectiveness(rule.rule_id, True) is True
        assert pool.update_fork_effectiveness(rule.rule_id, False) is True
        loaded = pool._load_rule(rule.rule_id)
        assert loaded.fork_total_count == 2
        assert loaded.fork_success_count == 1
        assert loaded.fork_effectiveness == 0.5

    def test_update_fork_effectiveness_unknown_rule(self, pool):
        """未知规则返回 False"""
        assert pool.update_fork_effectiveness("nonexistent", True) is False

    def test_fork_effectiveness_persists(self, pool, tmp_path):
        """效果数据持久化"""
        rule = pool.publish_rule(_high_quality_rule(), source_project="p1")
        pool.update_fork_effectiveness(rule.rule_id, True)

        pool2 = SharedExperiencePool(str(tmp_path / "shared"))
        loaded = pool2._load_rule(rule.rule_id)
        assert loaded.fork_effectiveness == 1.0


# ──────────────────── 排行榜 ────────────────────


class TestLeaderboard:
    def test_leaderboard_empty(self, pool):
        """空池返回空排行榜"""
        assert pool.get_leaderboard() == []

    def test_leaderboard_ordering(self, pool):
        """按综合得分排序"""
        r1 = pool.publish_rule(_high_quality_rule(keywords=["a"]), source_project="p1")
        r2 = pool.publish_rule(_high_quality_rule(keywords=["b"]), source_project="p2")
        # r1: 1 次 fork，100% 效果
        pool.fork_rule(r1.rule_id, "p3")
        pool.update_fork_effectiveness(r1.rule_id, True)
        # r2: 10 次 fork，50% 效果
        for i in range(10):
            pool.fork_rule(r2.rule_id, f"p{i+3}")
        for _ in range(5):
            pool.update_fork_effectiveness(r2.rule_id, True)
        for _ in range(5):
            pool.update_fork_effectiveness(r2.rule_id, False)

        board = pool.get_leaderboard()
        assert len(board) == 2
        # r2 的 composite_score 更高（使用次数多）
        assert board[0]["rule_id"] == r2.rule_id

    def test_leaderboard_excludes_pending(self, pool):
        """待审核规则不出现在排行榜"""
        pool.publish_rule(_high_quality_rule(effectiveness_score=0.3, usage_count=5), source_project="p1")
        assert len(pool.get_leaderboard()) == 0


# ──────────────────── 共享推荐 ────────────────────


class TestShareRecommendations:
    def test_high_score_recommendation(self):
        """高分规则被推荐"""
        from experience_extractor import ExperienceExtractor
        d = tempfile.mkdtemp()
        ext = ExperienceExtractor(d)
        # 创建高分规则
        from experience_extractor import ExperienceRule
        rule = ExperienceRule(
            rule_id="rec-1", trigger_condition="x", action="y", note="",
            source_task_id="p1", source_task_type="t", rule_type="success_pattern",
            status="approved", keywords=["a"], created_at="now",
            effectiveness_score=0.8, usage_count=10, success_count=8,
        )
        ext._save_rule(rule)
        recs = ext.get_share_recommendations()
        assert len(recs) == 1
        assert recs[0]["effectiveness_score"] == 0.8

    def test_low_score_not_recommendation(self):
        """低分规则不被推荐"""
        from experience_extractor import ExperienceExtractor, ExperienceRule
        d = tempfile.mkdtemp()
        ext = ExperienceExtractor(d)
        rule = ExperienceRule(
            rule_id="rec-2", trigger_condition="x", action="y", note="",
            source_task_id="p1", source_task_type="t", rule_type="success_pattern",
            status="approved", keywords=["a"], created_at="now",
            effectiveness_score=0.3, usage_count=10, success_count=3,
        )
        ext._save_rule(rule)
        assert len(ext.get_share_recommendations()) == 0
