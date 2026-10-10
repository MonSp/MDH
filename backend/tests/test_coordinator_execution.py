"""coordinator_execution.run_dev_loop 回归 — written_files 跨轮累计

E2 (R5 rerun) 复现：修复轮不再重写已有文件（written_files=[]），
最后一轮覆盖导致 task_result.written_files=[]，与磁盘 13 个文件不符。
"""
import asyncio

from coordinator_execution import run_dev_loop


class _FakeMeeting:
    def __init__(self):
        self.tasks = []
        self.messages = []

    def add_message(self, *args, **kwargs):
        self.messages.append((args, kwargs))


class _FakeReviewPipeline:
    """第 1 轮 revision_required，第 2 轮 approved"""

    def __init__(self):
        self.calls = 0

    async def review(self, task_description, execution_result, on_message, **kwargs):
        self.calls += 1
        status = "revision_required" if self.calls == 1 else "approved"
        return {
            "structured_feedback": {"status": status, "issues": [], "max_iterations": 3},
            "reviewer_feedback": "反馈",
            "monitor_feedback": "",
            "coordinator_summary": "总结",
            "critic_result": {"severity": "low", "findings": []},
            "grounding_result": {"grounded": False, "sources": []},
        }


class _FakeCoordinator:
    def __init__(self):
        self._max_iterations = 3
        self._workspace = None
        self._artifact_store = None
        self.meeting = _FakeMeeting()
        self._review_pipeline = _FakeReviewPipeline()
        self._round = 0

    async def _msg(self, coordinator_id, text):
        pass

    def _run_deterministic_gate(self, workspace_path):
        return {"passed": True, "failures": [], "skipped": []}

    async def execute_assigned_tasks(self):
        self._round += 1
        if self._round == 1:
            return [{
                "task_id": "t1", "agent_id": "agent-a",
                "result": "第1轮交付 app.py + 测试",
                "written_files": ["app.py", "test_app.py"],
            }]
        # 修复轮：只改聊天说明，不重写文件（E2 实况）
        return [{
            "task_id": "t1", "agent_id": "agent-a",
            "result": "已按反馈修复（未重写文件）",
            "written_files": [],
        }]


def test_written_files_cumulative_across_rounds():
    coord = _FakeCoordinator()
    seen = []

    async def on_message(agent_id, content, delta, **kwargs):
        seen.append((agent_id, content))

    results, review_result, report = asyncio.run(run_dev_loop(
        coord, "coord-1", "任务描述", "", on_message,
    ))

    assert coord._review_pipeline.calls == 2  # 触发过一轮修复
    assert report.total_iterations == 2
    # 关键断言：最终结果保留第 1 轮产出，不被空的修复轮覆盖
    assert results[0]["written_files"] == ["app.py", "test_app.py"]
    assert review_result["structured_feedback"]["status"] == "approved"
