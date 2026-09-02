"""Tests for ArtifactStore — 执行产物结构化存储"""
import os

import pytest

from artifact_store import ArtifactRef, ArtifactStore


@pytest.fixture
def store(tmp_path):
    workspace = str(tmp_path)
    # 创建一些测试文件
    os.makedirs(os.path.join(workspace, "src"), exist_ok=True)
    with open(os.path.join(workspace, "src", "main.py"), "w") as f:
        f.write("def hello():\n    return 'world'\n")
    with open(os.path.join(workspace, "README.md"), "w") as f:
        f.write("# Test Project\nThis is a test.\n")
    with open(os.path.join(workspace, "data.json"), "w") as f:
        f.write('{"key": "value"}\n')
    return ArtifactStore(workspace)


class TestArtifactStore:
    def test_save_and_load_artifacts(self, store):
        refs = store.save_artifacts(
            task_id="task-1",
            agent_id="agent-executor",
            files_written=["src/main.py", "README.md"],
            result_summary="创建了两个文件",
        )
        assert len(refs) == 2
        assert refs[0].type == "code"
        assert refs[1].type == "document"
        assert refs[0].agent_id == "agent-executor"

        loaded = store.load_artifacts("task-1")
        assert len(loaded) == 2

    def test_type_inference(self, store):
        refs = store.save_artifacts("task-2", "agent", ["src/main.py", "data.json", "README.md"])
        types = {r.path: r.type for r in refs}
        assert types["src/main.py"] == "code"
        assert types["data.json"] == "data"
        assert types["README.md"] == "document"

    def test_read_artifact_content(self, store):
        refs = store.save_artifacts("task-3", "agent", ["src/main.py"])
        content = store.read_artifact_content(refs[0])
        assert "def hello" in content

    def test_read_nonexistent_returns_empty(self, store):
        ref = ArtifactRef(type="file", path="nonexistent.py")
        assert store.read_artifact_content(ref) == ""

    def test_build_artifact_context(self, store):
        store.save_artifacts("task-4", "agent", ["src/main.py", "README.md"])
        context = store.build_artifact_context(["task-4"])
        assert "def hello" in context
        assert "Test Project" in context

    def test_build_context_empty_tasks(self, store):
        assert store.build_artifact_context(["nonexistent"]) == ""

    def test_summary_captured(self, store):
        refs = store.save_artifacts("task-5", "agent", ["src/main.py"], result_summary="执行成功")
        loaded = store.load_artifacts("task-5")
        assert len(loaded) == 1
