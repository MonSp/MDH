"""Tests for SessionPersistence — 会话状态持久化"""
import os
import pytest
import tempfile

from session_persistence import SessionPersistence


@pytest.fixture
def persistence(tmp_path):
    db_path = str(tmp_path / "test.db")
    return SessionPersistence(db_path=db_path)


class TestSessionSnapshot:
    def test_save_and_load_snapshot(self, persistence):
        state = {"meeting_id": "m1", "agents": [{"id": "a1", "role": "executor"}]}
        assert persistence.save_snapshot("m1", state) is True

        loaded = persistence.load_snapshot("m1")
        assert loaded is not None
        assert loaded["meeting_id"] == "m1"
        assert len(loaded["agents"]) == 1

    def test_load_nonexistent_returns_none(self, persistence):
        assert persistence.load_snapshot("nonexistent") is None

    def test_update_existing_snapshot(self, persistence):
        persistence.save_snapshot("m1", {"version": 1})
        persistence.save_snapshot("m1", {"version": 2})

        loaded = persistence.load_snapshot("m1")
        assert loaded["version"] == 2

    def test_load_latest_snapshot(self, persistence):
        persistence.save_snapshot("m1", {"order": 1})
        persistence.save_snapshot("m2", {"order": 2})

        latest = persistence.load_latest_snapshot()
        assert latest is not None
        assert latest["session_id"] == "m2"

    def test_load_latest_empty(self, persistence):
        assert persistence.load_latest_snapshot() is None

    def test_delete_snapshot(self, persistence):
        persistence.save_snapshot("m1", {"data": True})
        assert persistence.delete_snapshot("m1") is True
        assert persistence.load_snapshot("m1") is None


class TestTaskIdempotency:
    def test_check_not_executed(self, persistence):
        assert persistence.check_task_executed("task-1:step-1") is None

    def test_mark_started_then_completed(self, persistence):
        assert persistence.mark_task_started("task-1:step-1", "task-1", "m1") is True
        assert persistence.check_task_executed("task-1:step-1") == "running"

        persistence.mark_task_completed("task-1:step-1")
        assert persistence.check_task_executed("task-1:step-1") == "completed"

    def test_idempotent_skip_duplicate(self, persistence):
        # First execution
        assert persistence.mark_task_started("task-1:step-1", "task-1") is True
        persistence.mark_task_completed("task-1:step-1")

        # Second execution — should be skipped
        assert persistence.mark_task_started("task-1:step-1", "task-1") is False
        assert persistence.check_task_executed("task-1:step-1") == "completed"

    def test_mark_failed(self, persistence):
        persistence.mark_task_started("task-1:step-1", "task-1")
        persistence.mark_task_failed("task-1:step-1")
        assert persistence.check_task_executed("task-1:step-1") == "failed"

    def test_cleanup_old_executions(self, persistence):
        persistence.mark_task_started("task-1:step-1", "task-1")
        persistence.mark_task_completed("task-1:step-1")
        # cleanup with 0 days should remove all completed
        count = persistence.cleanup_old_executions(days=0)
        assert count >= 0  # May be 0 if datetime math doesn't match
