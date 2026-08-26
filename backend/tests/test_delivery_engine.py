"""Tests for DeliveryEngine — 自主交付"""
import os
import pytest
from delivery_engine import DeliveryEngine


@pytest.fixture
def engine(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    # 初始化 git 仓库
    import subprocess
    subprocess.run(["git", "init"], cwd=str(ws), capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=str(ws), capture_output=True)
    subprocess.run(["git", "config", "user.name", "test"], cwd=str(ws), capture_output=True)
    return DeliveryEngine(str(tmp_path), str(ws))


class TestDeliveryEngine:
    def test_deliver_notification(self, engine):
        """通知交付"""
        result = engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="实现登录API",
            execution_results=[{"result": "完成", "written_files": ["login.py"]}],
            review_result={"structured_feedback": {"status": "approved"}},
            delivery_types=["notification"],
        )
        assert result["notification"]["success"] is True
        assert result["notification"]["notification"]["agent_id"] == "agent-1"

    def test_deliver_report(self, engine, tmp_path):
        """文档交付"""
        result = engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="实现登录API",
            execution_results=[{"result": "完成", "written_files": ["login.py"]}],
            review_result={"structured_feedback": {"status": "approved", "score": 8.5}},
            delivery_types=["report"],
        )
        assert result["report"]["success"] is True
        assert os.path.isfile(result["report"]["report_path"])
        report = result["report"]["report"]
        assert report["review_status"] == "approved"
        assert report["review_score"] == 8.5

    def test_deliver_git_no_changes(self, engine):
        """Git 交付：无变更"""
        result = engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="test",
            execution_results=[{"result": "完成", "written_files": []}],
            review_result={},
            delivery_types=["git"],
        )
        assert result["git"]["success"] is True
        assert result["git"]["action"] == "no_changes"

    def test_deliver_git_with_changes(self, engine, tmp_path):
        """Git 交付：有文件变更"""
        # 创建一个文件
        ws = tmp_path / "workspace"
        (ws / "test.py").write_text("print('hello')", encoding="utf-8")

        result = engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="写测试文件",
            execution_results=[{"result": "完成", "written_files": ["test.py"]}],
            review_result={},
            delivery_types=["git"],
        )
        assert result["git"]["success"] is True
        assert result["git"]["action"] == "committed"

    def test_deliver_deploy_placeholder(self, engine):
        """部署触发：占位"""
        result = engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="test",
            execution_results=[], review_result={},
            delivery_types=["deploy"],
        )
        assert result["deploy"]["success"] is True
        assert result["deploy"]["action"] == "skipped"

    def test_delivery_log(self, engine):
        """交付日志记录"""
        engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="test",
            execution_results=[], review_result={}, delivery_types=["notification"],
        )
        log = engine.get_delivery_log()
        assert len(log) == 1
        assert log[0]["agent_id"] == "agent-1"

    def test_delivery_stats(self, engine):
        """交付统计"""
        for i in range(3):
            engine.deliver(
                agent_id=f"agent-{i}", task_id=f"task-{i}", task_description="test",
                execution_results=[], review_result={}, delivery_types=["notification"],
            )
        stats = engine.get_delivery_stats()
        assert stats["total_deliveries"] == 3
        assert stats["success_rate"] == 1.0
        assert stats["by_type"]["notification"] == 3

    def test_persistence(self, engine, tmp_path):
        """交付日志持久化"""
        engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="test",
            execution_results=[], review_result={}, delivery_types=["notification"],
        )
        engine2 = DeliveryEngine(str(tmp_path), str(tmp_path / "workspace"))
        assert len(engine2._delivery_log) == 1
