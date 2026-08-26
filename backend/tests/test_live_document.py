"""Tests for LiveDocumentManager — 活文档协作"""
import csv
import json
import pytest
from live_document import LiveDocumentManager


@pytest.fixture
def mgr(tmp_path):
    return LiveDocumentManager(str(tmp_path), str(tmp_path / "workspace"))


@pytest.fixture
def sample_csv(tmp_path):
    path = tmp_path / "data.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "age", "salary"])
        writer.writerow(["Alice", "30", "50000"])
        writer.writerow(["Bob", "25", "40000"])
        writer.writerow(["Charlie", "35", "60000"])
    return str(path)


@pytest.fixture
def sample_json(tmp_path):
    path = tmp_path / "data.json"
    path.write_text(json.dumps([{"name": "A", "value": 1}, {"name": "B", "value": 2}]), encoding="utf-8")
    return str(path)


@pytest.fixture
def code_workspace(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / "main.py").write_text("def hello():\n    print('hello')\n\ndef add(a, b):\n    return a + b\n", encoding="utf-8")
    (ws / "utils.py").write_text("import os\n\ndef get_path():\n    return os.getcwd()\n", encoding="utf-8")
    return str(ws)


class TestLiveDocument:
    def test_analyze_codebase(self, mgr, code_workspace):
        """分析代码仓库"""
        result = mgr.analyze_codebase(code_workspace)
        assert result["total_files"] == 2
        assert result["total_lines"] > 0
        assert ".py" in result["by_extension"]

    def test_analyze_csv(self, mgr, sample_csv):
        """解析 CSV 数据集"""
        result = mgr.analyze_dataset(sample_csv)
        assert result["format"] == "csv"
        assert result["rows"] == 3
        assert result["columns"] == 3
        assert "salary" in result["numeric_columns"]
        assert result["numeric_columns"]["salary"]["mean"] == 50000.0

    def test_analyze_json(self, mgr, sample_json):
        """解析 JSON 数据集"""
        result = mgr.analyze_dataset(sample_json)
        assert result["format"] == "json"
        assert result["type"] == "array"
        assert result["length"] == 2

    def test_analyze_unsupported(self, mgr, tmp_path):
        """不支持的格式"""
        path = tmp_path / "test.xyz"
        path.write_text("data")
        result = mgr.analyze_dataset(str(path))
        assert "error" in result

    def test_track_artifact(self, mgr):
        """记录产出物变更"""
        entry = mgr.track_artifact("agent-1", "task-1", "main.py", "write")
        assert entry["agent_id"] == "agent-1"
        assert entry["action"] == "write"

    def test_artifact_history(self, mgr):
        """获取变更历史"""
        mgr.track_artifact("agent-1", "task-1", "a.py", "write")
        mgr.track_artifact("agent-2", "task-2", "b.py", "edit")
        mgr.track_artifact("agent-1", "task-3", "a.py", "edit")
        history = mgr.get_artifact_history(file_path="a.py")
        assert len(history) == 2

    def test_artifact_stats(self, mgr):
        """产出物统计"""
        mgr.track_artifact("agent-1", "task-1", "a.py", "write")
        mgr.track_artifact("agent-1", "task-2", "b.py", "write")
        stats = mgr.get_artifact_stats()
        assert stats["total_changes"] == 2
        assert stats["by_agent"]["agent-1"] == 2

    def test_detect_conflict(self, mgr):
        """检测并发编辑冲突"""
        mgr.track_artifact("agent-1", "task-1", "shared.py", "edit")
        conflict = mgr.detect_conflict("shared.py", "agent-2")
        assert conflict is not None
        assert "agent-1" in conflict["conflicting_agents"]

    def test_no_conflict_when_different_file(self, mgr):
        """不同文件无冲突"""
        mgr.track_artifact("agent-1", "task-1", "a.py", "edit")
        assert mgr.detect_conflict("b.py", "agent-2") is None

    def test_persistence(self, mgr, tmp_path):
        """持久化"""
        mgr.track_artifact("agent-1", "task-1", "a.py", "write")
        mgr2 = LiveDocumentManager(str(tmp_path), str(tmp_path / "workspace"))
        assert len(mgr2._artifacts) == 1
