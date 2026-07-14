"""Tests for workspace_sync.py — workspace synchronization and file locking"""
import asyncio
import pytest
from workspace_sync import WorkspaceSync, FileState, WorkspaceState


@pytest.fixture
def sync(tmp_path):
    """Create a WorkspaceSync instance with a temp directory"""
    ws = WorkspaceSync(
        workspace_id="test-ws",
        root_path=str(tmp_path),
        sync_interval=1.0,
    )
    return ws


@pytest.fixture
def sync_with_file(tmp_path):
    """Create a WorkspaceSync with a test file already tracked"""
    ws = WorkspaceSync(
        workspace_id="test-ws",
        root_path=str(tmp_path),
        sync_interval=1.0,
    )
    ws._state.files["test.txt"] = FileState(
        path="test.txt",
        hash="abc123",
        size=100,
        modified_at=1000.0,
        owner_agent_id="agent-1",
    )
    return ws


# ── Data classes ──

class TestDataclasses:
    def test_file_state(self):
        fs = FileState(path="a.txt", hash="h1", size=50, modified_at=100.0, owner_agent_id="a1")
        assert fs.path == "a.txt"
        assert fs.owner_agent_id == "a1"

    def test_workspace_state_defaults(self):
        ws = WorkspaceState(workspace_id="ws1", root_path="/tmp/test")
        assert ws.files == {}
        assert ws.locked_files == set()
        assert ws.last_sync == 0.0


# ── Initialization ──

class TestInit:
    def test_init(self, sync):
        assert sync._workspace_id == "test-ws"
        assert sync._state.workspace_id == "test-ws"

    def test_get_state(self, sync):
        state = sync.get_state()
        assert isinstance(state, WorkspaceState)
        assert state.workspace_id == "test-ws"


# ── File locking ──

class TestFileLocking:
    def test_lock_file(self, sync_with_file):
        assert sync_with_file.lock_file("test.txt", "agent-1") is True
        assert "test.txt" in sync_with_file._state.locked_files

    def test_lock_already_locked(self, sync_with_file):
        sync_with_file.lock_file("test.txt", "agent-1")
        assert sync_with_file.lock_file("test.txt", "agent-2") is False

    def test_unlock_file(self, sync_with_file):
        sync_with_file.lock_file("test.txt", "agent-1")
        assert sync_with_file.unlock_file("test.txt", "agent-1") is True
        assert "test.txt" not in sync_with_file._state.locked_files

    def test_unlock_not_locked(self, sync_with_file):
        assert sync_with_file.unlock_file("test.txt", "agent-1") is False

    def test_unlock_wrong_agent(self, sync_with_file):
        sync_with_file.lock_file("test.txt", "agent-1")
        assert sync_with_file.unlock_file("test.txt", "agent-2") is False
        assert "test.txt" in sync_with_file._state.locked_files

    def test_lock_updates_owner(self, sync_with_file):
        sync_with_file.lock_file("test.txt", "agent-2")
        assert sync_with_file._state.files["test.txt"].owner_agent_id == "agent-2"

    def test_lock_new_file(self, sync):
        """Locking a file not yet tracked should still work"""
        assert sync.lock_file("new.txt", "agent-1") is True
        assert "new.txt" in sync._state.locked_files


# ── Remote state update ──

class TestRemoteState:
    def test_update_adds_new_files(self, sync):
        remote = WorkspaceState(
            workspace_id="remote-ws",
            root_path="/remote",
            files={
                "remote.txt": FileState(path="remote.txt", hash="r1", size=200, modified_at=500.0, owner_agent_id="agent-r"),
            },
        )
        sync.update_remote_state(remote)
        assert "remote.txt" in sync._state.files
        assert sync._state.files["remote.txt"].owner_agent_id == "agent-r"

    def test_update_merges_locks(self, sync):
        sync._state.locked_files.add("local.txt")
        remote = WorkspaceState(
            workspace_id="remote-ws",
            root_path="/remote",
            locked_files={"remote.txt"},
        )
        sync.update_remote_state(remote)
        assert "local.txt" in sync._state.locked_files
        assert "remote.txt" in sync._state.locked_files

    def test_update_does_not_overwrite_existing(self, sync_with_file):
        remote = WorkspaceState(
            workspace_id="remote-ws",
            root_path="/remote",
            files={
                "test.txt": FileState(path="test.txt", hash="different", size=999, modified_at=9999.0, owner_agent_id="agent-remote"),
            },
        )
        sync_with_file.update_remote_state(remote)
        # Existing file should keep its hash/size but owner may be logged
        assert sync_with_file._state.files["test.txt"].hash == "abc123"


# ── Conflict callback ──

class TestConflictCallback:
    def test_set_conflict_callback(self, sync):
        async def my_callback(conflicts):
            pass
        sync.set_conflict_callback(my_callback)
        assert sync._on_conflict is my_callback


# ── Start/Stop lifecycle ──

class TestLifecycle:
    @pytest.mark.asyncio
    async def test_start_creates_task(self, sync):
        await sync.start()
        assert sync._sync_task is not None
        await sync.stop()

    @pytest.mark.asyncio
    async def test_stop_cancels_task(self, sync):
        await sync.start()
        await sync.stop()
        assert sync._sync_task is None

    @pytest.mark.asyncio
    async def test_start_idempotent(self, sync):
        await sync.start()
        task1 = sync._sync_task
        await sync.start()  # should not create a second task
        assert sync._sync_task is task1
        await sync.stop()

    @pytest.mark.asyncio
    async def test_stop_when_not_started(self, sync):
        # Should not raise
        await sync.stop()
