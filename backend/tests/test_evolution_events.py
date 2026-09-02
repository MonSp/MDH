"""Tests for EvolutionEvent data model, EvolutionEventStore, and ABTracker (T1 + T2)."""

import os
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

import pytest

from evolution_events import (
    EVENT_TYPES,
    ABTracker,
    EvolutionEvent,
    EvolutionEventStore,
    _now_iso,
    new_event_id,
)

# ══════════════════════════════════════════════════════════════════
# T1: EvolutionEvent + EvolutionEventStore
# ══════════════════════════════════════════════════════════════════


@pytest.fixture
def store(tmp_path):
    """Create a fresh EvolutionEventStore backed by a temp DB."""
    db_path = str(tmp_path / "test_evolution.db")
    return EvolutionEventStore(db_path)


def _make_event(event_type="xp_granted", agent_id="agent-1", task_id="", details=None):
    """Helper to create an EvolutionEvent."""
    return EvolutionEvent(
        event_id=new_event_id(),
        event_type=event_type,
        agent_id=agent_id,
        timestamp=_now_iso(),
        details=details or {},
        task_id=task_id,
        before_state={},
        after_state={},
    )


class TestEvolutionEventModel:
    def test_event_fields(self):
        """EvolutionEvent dataclass has all required fields."""
        ev = EvolutionEvent(
            event_id="test-id",
            event_type="xp_granted",
            agent_id="a1",
            timestamp="2026-01-01T00:00:00Z",
            details={"xp": 10},
            task_id="t1",
            before_state={"level": 0},
            after_state={"level": 1},
        )
        assert ev.event_id == "test-id"
        assert ev.event_type == "xp_granted"
        assert ev.agent_id == "a1"
        assert ev.details == {"xp": 10}
        assert ev.task_id == "t1"

    def test_to_dict(self):
        ev = _make_event()
        d = ev.to_dict()
        assert "event_id" in d
        assert "event_type" in d
        assert isinstance(d, dict)

    def test_valid_event_types(self):
        """All event type constants are defined."""
        assert "xp_granted" in EVENT_TYPES
        assert "skill_level_up" in EVENT_TYPES
        assert "career_promotion" in EVENT_TYPES
        assert "rule_created" in EVENT_TYPES
        assert "rule_evolved" in EVENT_TYPES
        assert "rule_demoted" in EVENT_TYPES
        assert "rule_approved" in EVENT_TYPES
        assert "domain_confidence_change" in EVENT_TYPES


class TestRecordAndQueryTimeline:
    """test_record_and_query_timeline"""

    def test_record_and_query(self, store):
        """Record events and retrieve them from the timeline."""
        ev1 = _make_event("xp_granted", "agent-1", details={"xp_gained": 10})
        ev2 = _make_event("skill_level_up", "agent-1", details={"new_level": 1})

        store.record_event(ev1)
        store.record_event(ev2)

        timeline = store.get_timeline()
        assert len(timeline) == 2
        # Most recent first (ordered by timestamp DESC)
        # Both have same timestamp in fast tests, so just check both exist
        event_ids = {e["event_id"] for e in timeline}
        assert ev1.event_id in event_ids
        assert ev2.event_id in event_ids

    def test_details_parsed_as_dict(self, store):
        """Details are returned as a dict, not a raw JSON string."""
        ev = _make_event(details={"xp_gained": 42})
        store.record_event(ev)
        timeline = store.get_timeline()
        assert isinstance(timeline[0]["details"], dict)
        assert timeline[0]["details"]["xp_gained"] == 42


class TestFilterByAgentId:
    """test_filter_by_agent_id"""

    def test_filter(self, store):
        store.record_event(_make_event("xp_granted", "agent-A"))
        store.record_event(_make_event("xp_granted", "agent-B"))
        store.record_event(_make_event("skill_level_up", "agent-A"))

        result = store.get_timeline(agent_id="agent-A")
        assert len(result) == 2
        assert all(e["agent_id"] == "agent-A" for e in result)

    def test_filter_no_match(self, store):
        store.record_event(_make_event("xp_granted", "agent-A"))
        result = store.get_timeline(agent_id="agent-Z")
        assert len(result) == 0


class TestFilterByEventType:
    """test_filter_by_event_type"""

    def test_filter(self, store):
        store.record_event(_make_event("xp_granted", "agent-1"))
        store.record_event(_make_event("rule_created", "agent-1"))
        store.record_event(_make_event("xp_granted", "agent-2"))

        result = store.get_timeline(event_type="xp_granted")
        assert len(result) == 2
        assert all(e["event_type"] == "xp_granted" for e in result)


class TestFilterBySince:
    """test_filter_by_since"""

    def test_filter(self, store):
        now = datetime.now(timezone.utc)
        old_ts = (now - timedelta(days=10)).isoformat()
        new_ts = now.isoformat()

        old_event = _make_event("xp_granted", "agent-1")
        old_event.timestamp = old_ts
        store.record_event(old_event)

        new_event = _make_event("xp_granted", "agent-1")
        new_event.timestamp = new_ts
        store.record_event(new_event)

        # Only events since 5 days ago
        since = (now - timedelta(days=5)).isoformat()
        result = store.get_timeline(since=since)
        assert len(result) == 1
        assert result[0]["event_id"] == new_event.event_id


class TestSummaryAggregation:
    """test_summary_aggregation"""

    def test_summary(self, store):
        now = datetime.now(timezone.utc)

        # Record events within the last 7 days
        for i in range(3):
            store.record_event(_make_event("xp_granted", "agent-1", details={"xp_gained": 10}))
        store.record_event(_make_event("rule_created", "agent-1"))
        store.record_event(_make_event("rule_demoted", "agent-1"))

        summary = store.get_summary(period_days=7)
        assert summary["total_events"] == 5
        assert summary["by_type"]["xp_granted"] == 3
        assert summary["by_type"]["rule_created"] == 1
        assert summary["by_type"]["rule_demoted"] == 1
        assert summary["xp_delta"] == 30
        assert summary["rule_changes"]["created"] == 1
        assert summary["rule_changes"]["demoted"] == 1

    def test_summary_with_agent_filter(self, store):
        store.record_event(_make_event("xp_granted", "agent-1", details={"xp_gained": 10}))
        store.record_event(_make_event("xp_granted", "agent-2", details={"xp_gained": 20}))

        summary = store.get_summary(agent_id="agent-1", period_days=7)
        assert summary["total_events"] == 1
        assert summary["xp_delta"] == 10


class TestEmptyTimeline:
    """test_empty_timeline"""

    def test_empty(self, store):
        timeline = store.get_timeline()
        assert timeline == []

    def test_empty_summary(self, store):
        summary = store.get_summary(period_days=7)
        assert summary["total_events"] == 0
        assert summary["xp_delta"] == 0
        assert summary["rule_changes"]["created"] == 0


class TestEventStoreWiring:
    """test_event_store_wiring — verify grant_xp records event when event_store is set"""

    def test_grant_xp_records_xp_event(self, tmp_path):
        """When event_store is provided, grant_xp records an xp_granted event."""
        from agent_profile_manager import AgentProfileManager

        profiles_dir = str(tmp_path / "profiles")
        os.makedirs(profiles_dir, exist_ok=True)
        db_path = str(tmp_path / "evolution.db")
        event_store = EvolutionEventStore(db_path)

        mgr = AgentProfileManager(profiles_dir, event_store=event_store)
        # Create profile first
        mgr.get_or_create("test-agent", "TestAgent", "engineering")

        # Grant XP (success=True triggers XP gain)
        result = mgr.grant_xp(
            agent_id="test-agent",
            skill_id="frontend_dev",
            task_success=True,
            review_score=8.0,
            task_complexity=3,
            skill_config={"xp_thresholds": [100, 300, 600]},
        )

        assert result["xp_gained"] > 0

        # Check that an xp_granted event was recorded
        events = event_store.get_timeline(agent_id="test-agent", event_type="xp_granted")
        assert len(events) >= 1
        assert events[0]["event_type"] == "xp_granted"
        assert events[0]["details"]["skill_id"] == "frontend_dev"

    def test_grant_xp_no_event_without_store(self, tmp_path):
        """When event_store is None, no events are recorded (backward compatibility)."""
        from agent_profile_manager import AgentProfileManager

        profiles_dir = str(tmp_path / "profiles")
        os.makedirs(profiles_dir, exist_ok=True)

        mgr = AgentProfileManager(profiles_dir, event_store=None)
        mgr.get_or_create("test-agent", "TestAgent", "engineering")

        result = mgr.grant_xp(
            agent_id="test-agent",
            skill_id="frontend_dev",
            task_success=True,
            review_score=8.0,
            task_complexity=3,
            skill_config={"xp_thresholds": [100, 300, 600]},
        )
        assert result["xp_gained"] > 0
        # No exception should be raised

    def test_skill_level_up_event(self, tmp_path):
        """When XP grants enough to level up, a skill_level_up event is recorded."""
        from agent_profile_manager import AgentProfileManager

        profiles_dir = str(tmp_path / "profiles")
        os.makedirs(profiles_dir, exist_ok=True)
        db_path = str(tmp_path / "evolution.db")
        event_store = EvolutionEventStore(db_path)

        mgr = AgentProfileManager(profiles_dir, event_store=event_store)
        mgr.get_or_create("test-agent", "TestAgent", "engineering")

        # Grant enough XP to level up (threshold is 100 for level 0 → 1)
        for _ in range(5):
            mgr.grant_xp(
                agent_id="test-agent",
                skill_id="backend_dev",
                task_success=True,
                review_score=9.0,
                task_complexity=5,
                skill_config={"xp_thresholds": [100, 300, 600]},
            )

        events = event_store.get_timeline(agent_id="test-agent", event_type="skill_level_up")
        assert len(events) >= 1
        assert events[0]["details"]["skill_id"] == "backend_dev"
        assert events[0]["details"]["new_level"] > events[0]["details"]["old_level"]

    def test_experience_extractor_wiring(self, tmp_path):
        """When event_store is provided, approve_rule records rule_approved event."""
        from experience_extractor import ExperienceExtractor

        incremental_dir = str(tmp_path / "experience")
        os.makedirs(incremental_dir, exist_ok=True)
        db_path = str(tmp_path / "evolution.db")
        event_store = EvolutionEventStore(db_path)

        extractor = ExperienceExtractor(incremental_dir, event_store=event_store)

        # Create and save a rule, then approve it
        from experience_extractor import ExperienceRule, _new_rule_id, _now_iso
        rule = ExperienceRule(
            rule_id=_new_rule_id(),
            trigger_condition="test condition",
            action="test action",
            note="test",
            source_task_id="task-1",
            source_task_type="testing",
            rule_type="success_pattern",
            status="pending_review",
            keywords=["test"],
            created_at=_now_iso(),
        )
        extractor._save_rule(rule)
        result = extractor.approve_rule(rule.rule_id)
        assert result is True

        events = event_store.get_timeline(event_type="rule_approved")
        assert len(events) >= 1
        assert events[0]["details"]["rule_id"] == rule.rule_id


# ══════════════════════════════════════════════════════════════════
# T2: ABTracker
# ══════════════════════════════════════════════════════════════════


@pytest.fixture
def ab_tracker(tmp_path):
    """Create a fresh ABTracker backed by a temp DB."""
    conn = sqlite3.connect(str(tmp_path / "test_ab.db"), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return ABTracker(conn)


class TestABRecordAndQuery:
    """test_ab_record_and_query"""

    def test_record_and_query(self, ab_tracker):
        """Record tasks and query stats."""
        ab_tracker.record_task("frontend", success=True, has_rules=True)
        ab_tracker.record_task("frontend", success=True, has_rules=True)
        ab_tracker.record_task("frontend", success=False, has_rules=False)
        ab_tracker.record_task("backend", success=True, has_rules=False)

        stats = ab_tracker.get_stats()
        assert len(stats) >= 2

        # Find frontend stats
        fe = next(s for s in stats if s["task_type"] == "frontend")
        assert fe["total"] == 3
        assert fe["with_rules_total"] == 2
        assert fe["without_rules_total"] == 1

    def test_filter_by_task_type(self, ab_tracker):
        ab_tracker.record_task("frontend", success=True, has_rules=True)
        ab_tracker.record_task("backend", success=False, has_rules=False)

        stats = ab_tracker.get_stats(task_type="frontend")
        assert len(stats) == 1
        assert stats[0]["task_type"] == "frontend"


class TestABImprovementCalculation:
    """test_ab_improvement_calculation"""

    def test_improvement(self, ab_tracker):
        """With rules has higher success rate → positive improvement."""
        # With rules: 3/3 success = 100%
        ab_tracker.record_task("frontend", success=True, has_rules=True)
        ab_tracker.record_task("frontend", success=True, has_rules=True)
        ab_tracker.record_task("frontend", success=True, has_rules=True)
        # Without rules: 1/2 success = 50%
        ab_tracker.record_task("frontend", success=True, has_rules=False)
        ab_tracker.record_task("frontend", success=False, has_rules=False)

        stats = ab_tracker.get_stats(task_type="frontend")
        assert len(stats) == 1
        assert stats[0]["with_rules_success_rate"] == 100.0
        assert stats[0]["without_rules_success_rate"] == 50.0
        assert stats[0]["improvement_pct"] == 50.0

    def test_improvement_no_without_rules(self, ab_tracker):
        """No tasks without rules → improvement is 0."""
        ab_tracker.record_task("backend", success=True, has_rules=True)

        stats = ab_tracker.get_stats(task_type="backend")
        assert stats[0]["without_rules_total"] == 0
        assert stats[0]["without_rules_success_rate"] == 0.0
        assert stats[0]["improvement_pct"] == 0.0


class TestABNoData:
    """test_ab_no_data_returns_empty"""

    def test_empty(self, ab_tracker):
        stats = ab_tracker.get_stats()
        assert stats == []

    def test_empty_with_filter(self, ab_tracker):
        ab_tracker.record_task("frontend", success=True, has_rules=True)
        stats = ab_tracker.get_stats(task_type="backend")
        assert stats == []


class TestConcurrency:
    """Basic thread-safety smoke test."""

    def test_concurrent_writes(self, store):
        """Multiple threads writing events should not corrupt data."""
        errors = []

        def writer(n):
            try:
                for i in range(10):
                    store.record_event(_make_event("xp_granted", f"agent-{n}"))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        timeline = store.get_timeline(limit=100)
        assert len(timeline) == 50  # 5 threads * 10 events each
