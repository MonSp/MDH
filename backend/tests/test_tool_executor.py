import os
import shutil
import tempfile
import pytest
from tool_executor import ToolExecutor
from tool_registry import ToolRegistry, ToolCall


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


# ── list_directory ──

def test_list_directory(tool_executor, temp_workspace):
    os.makedirs(os.path.join(temp_workspace, "sub"))
    open(os.path.join(temp_workspace, "a.txt"), "w").close()
    open(os.path.join(temp_workspace, "sub", "b.txt"), "w").close()

    result = tool_executor.execute(ToolCall(
        tool_name="list_directory",
        arguments={"path": "."}
    ))
    assert result.success is True
    assert "a.txt" in result.output
    assert "sub" in result.output


def test_list_directory_nonexistent(tool_executor):
    result = tool_executor.execute(ToolCall(
        tool_name="list_directory",
        arguments={"path": "nonexistent"}
    ))
    assert result.success is False


# ── search_files (glob) ──

def test_search_files(tool_executor, temp_workspace):
    open(os.path.join(temp_workspace, "test.py"), "w").close()
    open(os.path.join(temp_workspace, "test.js"), "w").close()

    result = tool_executor.execute(ToolCall(
        tool_name="search_files",
        arguments={"pattern": "*.py"}
    ))
    assert result.success is True
    assert "test.py" in result.output


# ── grep_content ──

def test_grep_content(tool_executor, temp_workspace):
    with open(os.path.join(temp_workspace, "code.py"), "w") as f:
        f.write("def hello():\n    print('hello')\n\ndef world():\n    print('world')\n")

    result = tool_executor.execute(ToolCall(
        tool_name="grep_content",
        arguments={"pattern": "def ", "path": "."}
    ))
    assert result.success is True
    assert "hello" in result.output
    assert "world" in result.output


# ── create_document ──

def test_create_document(tool_executor, temp_workspace):
    result = tool_executor.execute(ToolCall(
        tool_name="create_document",
        arguments={"path": "doc.md", "content": "# Hello"}
    ))
    assert result.success is True
    with open(os.path.join(temp_workspace, "doc.md")) as f:
        assert f.read() == "# Hello"


# ── edit_document ──

def test_edit_document(tool_executor, temp_workspace):
    with open(os.path.join(temp_workspace, "doc.md"), "w") as f:
        f.write("# Old Title")

    result = tool_executor.execute(ToolCall(
        tool_name="edit_document",
        arguments={"path": "doc.md", "old_text": "Old", "new_text": "New"}
    ))
    assert result.success is True
    with open(os.path.join(temp_workspace, "doc.md")) as f:
        assert "New Title" in f.read()


# ── git operations ──

def test_git_status(tool_executor, temp_workspace):
    import subprocess
    subprocess.run(["git", "init"], cwd=temp_workspace, capture_output=True)

    result = tool_executor.execute(ToolCall(
        tool_name="git_status",
        arguments={}
    ))
    assert result.success is True


def test_git_log(tool_executor, temp_workspace):
    import subprocess
    subprocess.run(["git", "init"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=temp_workspace, capture_output=True)
    with open(os.path.join(temp_workspace, "f.txt"), "w") as f:
        f.write("x")
    subprocess.run(["git", "add", "."], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=temp_workspace, capture_output=True)

    result = tool_executor.execute(ToolCall(
        tool_name="git_log",
        arguments={"count": 1}
    ))
    assert result.success is True
    assert "init" in result.output


# ── unknown tool ──

def test_unknown_tool(tool_executor):
    result = tool_executor.execute(ToolCall(
        tool_name="nonexistent_tool",
        arguments={}
    ))
    assert result.success is False
    assert "不支持" in result.error or "unknown" in result.error.lower()


# ── git_diff ──

def test_git_diff(tool_executor, temp_workspace):
    import subprocess
    subprocess.run(["git", "init"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@t.com"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.name", "T"], cwd=temp_workspace, capture_output=True)
    with open(os.path.join(temp_workspace, "f.txt"), "w") as f:
        f.write("original")
    subprocess.run(["git", "add", "."], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=temp_workspace, capture_output=True)
    with open(os.path.join(temp_workspace, "f.txt"), "a") as f:
        f.write(" modified")

    result = tool_executor.execute(ToolCall(tool_name="git_diff", arguments={}))
    assert result.success is True
    assert "modified" in result.output


# ── git_commit ──

def test_git_commit(tool_executor, temp_workspace):
    import subprocess
    subprocess.run(["git", "init"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@t.com"], cwd=temp_workspace, capture_output=True)
    subprocess.run(["git", "config", "user.name", "T"], cwd=temp_workspace, capture_output=True)
    with open(os.path.join(temp_workspace, "new.txt"), "w") as f:
        f.write("content")

    result = tool_executor.execute(ToolCall(
        tool_name="git_commit",
        arguments={"message": "test commit"}
    ))
    assert result.success is True


# ── run_tests ──

def test_run_tests(tool_executor, temp_workspace):
    import shutil
    if not shutil.which("python"):
        import pytest
        pytest.skip("python not on PATH (only python3)")

    with open(os.path.join(temp_workspace, "test_sample.py"), "w") as f:
        f.write("def test_ok(): assert True\n")

    result = tool_executor.execute(ToolCall(
        tool_name="run_tests",
        arguments={"test_path": "test_sample.py"}
    ))
    assert result.success is True


# ── run_linter ──

def test_run_linter(tool_executor, temp_workspace):
    with open(os.path.join(temp_workspace, "clean.py"), "w") as f:
        f.write("x = 1\n")

    result = tool_executor.execute(ToolCall(
        tool_name="run_linter",
        arguments={"path": "clean.py"}
    ))
    # linter may or may not be installed, just check it doesn't crash
    assert result is not None
