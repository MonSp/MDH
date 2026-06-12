import os
import shutil
import tempfile
import pytest
from tool_executor import ToolExecutor
from tool_registry import ToolRegistry, ToolDefinition, ToolParameter, ToolCall


@pytest.fixture
def temp_workspace():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def tool_executor(temp_workspace):
    registry = ToolRegistry()
    executor = ToolExecutor(registry=registry, workspace_root=temp_workspace)
    return executor


def test_read_file(tool_executor, temp_workspace):
    test_file = os.path.join(temp_workspace, "test.txt")
    with open(test_file, "w") as f:
        f.write("Hello, World!")

    result = tool_executor.execute(ToolCall(
        tool_name="read_file",
        arguments={"path": "test.txt"}
    ))

    assert result.success is True
    assert "Hello, World!" in result.output


def test_write_file(tool_executor, temp_workspace):
    result = tool_executor.execute(ToolCall(
        tool_name="write_file",
        arguments={
            "path": "new_file.txt",
            "content": "New content"
        }
    ))

    assert result.success is True
    assert os.path.exists(os.path.join(temp_workspace, "new_file.txt"))

    with open(os.path.join(temp_workspace, "new_file.txt")) as f:
        assert f.read() == "New content"


def test_bash_command(tool_executor):
    result = tool_executor.execute(ToolCall(
        tool_name="bash",
        arguments={"command": "echo hello"}
    ))

    assert result.success is True
    assert "hello" in result.output


def test_bash_blocked_command(tool_executor):
    result = tool_executor.execute(ToolCall(
        tool_name="bash",
        arguments={"command": "sudo rm -rf /"}
    ))

    assert result.success is False
    assert "禁止" in result.error or "blocked" in result.error.lower()


def test_path_traversal_blocked(tool_executor):
    result = tool_executor.execute(ToolCall(
        tool_name="read_file",
        arguments={"path": "../../../etc/passwd"}
    ))

    assert result.success is False
    assert "路径" in result.error or "path" in result.error.lower()


def test_edit_file(tool_executor, temp_workspace):
    test_file = os.path.join(temp_workspace, "edit_test.txt")
    with open(test_file, "w") as f:
        f.write("Hello, World!")

    result = tool_executor.execute(ToolCall(
        tool_name="edit_file",
        arguments={
            "path": "edit_test.txt",
            "old_text": "World",
            "new_text": "Python"
        }
    ))

    assert result.success is True

    with open(test_file) as f:
        assert "Hello, Python!" == f.read()
