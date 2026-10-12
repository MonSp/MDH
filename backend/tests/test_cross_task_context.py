"""跨任务产物传递（方案 A）— last_workspace 指针与上下文注入"""

import pytest

import workspace_manager
from workspace_manager import build_previous_workspace_context, write_last_workspace


def _make_prev_workspace(tmp_path):
    prev = tmp_path / "prev-ws"
    (prev / "src").mkdir(parents=True)
    (prev / ".git").mkdir()
    (prev / "node_modules" / "pkg").mkdir(parents=True)
    (prev / "README.md").write_text("# 上一任务说明\n## 契约\nGET /api/users", encoding="utf-8")
    (prev / "src" / "app.py").write_text("USERS = []", encoding="utf-8")
    (prev / ".git" / "config").write_text("gitdata", encoding="utf-8")
    (prev / "node_modules" / "pkg" / "index.js").write_text("junk", encoding="utf-8")
    return str(prev)


def test_context_contains_tree_and_readme(tmp_path, monkeypatch):
    prev = _make_prev_workspace(tmp_path)
    monkeypatch.setattr(workspace_manager, "_LAST_WS_PATH", str(tmp_path / "lw.json"))
    write_last_workspace(prev, project_id="p1", brief="写一个 Flask /api/users 端点")

    ctx = build_previous_workspace_context(current_root=str(tmp_path / "other"))
    assert "[上一任务产物]" in ctx
    assert "GET /api/users" in ctx            # README 关键内容注入
    assert "- src/app.py" in ctx              # 文件清单
    assert "node_modules" not in ctx          # 垃圾目录跳过
    assert ".git" not in ctx.split("文件清单")[1].split("\n\n")[0] or "- .git/config" not in ctx


def test_missing_pointer_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace_manager, "_LAST_WS_PATH", str(tmp_path / "nope.json"))
    assert build_previous_workspace_context() == ""


def test_pointer_equal_to_current_root_skipped(tmp_path, monkeypatch):
    prev = _make_prev_workspace(tmp_path)
    monkeypatch.setattr(workspace_manager, "_LAST_WS_PATH", str(tmp_path / "lw.json"))
    write_last_workspace(prev)
    # 指针指向当前工作区（同一任务内）→ 不自注入
    assert build_previous_workspace_context(current_root=prev) == ""


def test_dead_pointer_path_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace_manager, "_LAST_WS_PATH", str(tmp_path / "lw.json"))
    write_last_workspace(str(tmp_path / "already-deleted"))
    assert build_previous_workspace_context(current_root=str(tmp_path / "cur")) == ""


@pytest.mark.asyncio
async def test_workflow_node_prompt_carries_prev_context(tmp_path, monkeypatch):
    """工作流节点 prompt 携带上一任务产物（E4 接力场景）"""
    from types import SimpleNamespace

    from coordinator_workflow import execute_workflow_node
    from protocol import WorkflowNode, WorkflowNodeStatus

    prev = _make_prev_workspace(tmp_path)
    monkeypatch.setattr(workspace_manager, "_LAST_WS_PATH", str(tmp_path / "lw.json"))
    write_last_workspace(prev, brief="上一单")

    captured = {}

    class FakeExtractor:
        def _infer_task_type(self, t):
            return "general"

        def retrieve_relevant_rules(self, tt, kw):
            return []

        def build_experience_context(self, rules):
            return ""

    coord = SimpleNamespace(
        _get_experience_extractor=lambda: FakeExtractor(),
        _workspace=None,  # 当前工作区不同 → 注入生效
        _asset_context_builder=None,
        _approval_manager=None,
        _executor_url="",
        meeting=SimpleNamespace(agents=[]),
        _get_model=lambda role: object(),
        _find_agent_id=lambda role: None,
    )

    async def fake_loop(model, prompt, toolset, on_model_error=None):
        captured["prompt"] = prompt
        return {"result": "done", "files_written": [], "tool_outputs": [], "verification": []}

    coord._run_agent_execution_loop = fake_loop

    node = WorkflowNode(
        node_id="n1", task_description="为 /api/users 加 Dockerfile",
        dept_id="dept-devops", status=WorkflowNodeStatus.PENDING,
    )
    await execute_workflow_node(coord, node, {})
    assert "[上一任务产物]" in captured["prompt"]
    assert "GET /api/users" in captured["prompt"]
