"""Tests for executor_server.py — all 18 tools + /tools endpoint"""
import os
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
os.environ["EXECUTOR_TOKEN"] = "test-token"

from executor_server import app, TOOL_HANDLERS

client = TestClient(app)
HEADERS = {"Authorization": "Bearer test-token"}


@pytest.fixture
def ws(tmp_path):
    """Create a temp workspace with a test file"""
    (tmp_path / "hello.txt").write_text("hello world")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "inner.txt").write_text("inner")
    return str(tmp_path)


def call_tool(name, args, workspace):
    resp = client.post("/execute", json={
        "tool_name": name, "arguments": args, "call_id": "t1", "workspace": workspace,
    }, headers=HEADERS)
    assert resp.status_code == 200
    return resp.json()


# ─── File tools ───

def test_read_file(ws):
    r = call_tool("read_file", {"path": "hello.txt"}, ws)
    assert r["result"] == "hello world"
    assert r["success"] is True


def test_write_file(ws):
    r = call_tool("write_file", {"path": "new.txt", "content": "new content"}, ws)
    assert r["success"] is True
    assert open(os.path.join(ws, "new.txt")).read() == "new content"


def test_edit_file(ws):
    r = call_tool("edit_file", {"path": "hello.txt", "old_string": "world", "new_string": "universe"}, ws)
    assert r["success"] is True
    assert "universe" in open(os.path.join(ws, "hello.txt")).read()


def test_list_directory(ws):
    r = call_tool("list_directory", {"path": "."}, ws)
    assert "hello.txt" in r["result"]
    assert "sub" in r["result"]


# ─── Search tools ───

def test_grep_content(ws):
    r = call_tool("grep_content", {"pattern": "hello", "path": "."}, ws)
    assert "hello.txt" in r["result"]


def test_search_files(ws):
    r = call_tool("search_files", {"pattern": "*.txt"}, ws)
    assert any("hello.txt" in f for f in r["result"])


# ─── Git tools ───

def test_git_status(ws):
    r = call_tool("git_status", {}, ws)
    assert r["success"] is True


def test_git_log(ws):
    r = call_tool("git_log", {"count": 5}, ws)
    assert r["success"] is True


# ─── Test/Lint tools ───

def test_run_tests(ws):
    r = call_tool("run_tests", {}, ws)
    assert r["success"] is True


def test_run_linter(ws):
    r = call_tool("run_linter", {"path": "."}, ws)
    assert r["success"] is True


# ─── Document tools ───

def test_create_document(ws):
    r = call_tool("create_document", {"path": "doc.md", "content": "# Title"}, ws)
    assert r["success"] is True
    assert open(os.path.join(ws, "doc.md")).read() == "# Title"


def test_edit_document(ws):
    (ws_path := os.path.join(ws, "doc.md")) and open(ws_path, "w").write("# Old")
    r = call_tool("edit_document", {"path": "doc.md", "old_string": "# Old", "new_string": "# New"}, ws)
    assert r["success"] is True
    assert "# New" in open(os.path.join(ws, "doc.md")).read()


# ─── Bash ───

def test_bash(ws):
    r = call_tool("bash", {"command": "echo hello"}, ws)
    assert "hello" in r["result"]


def test_bash_timeout(ws):
    r = call_tool("bash", {"command": "sleep 10", "timeout": 1}, ws)
    assert "timed out" in r["result"].lower() or r["success"] is False


# ─── Path traversal ───

def test_path_traversal(ws):
    r = call_tool("read_file", {"path": "/etc/passwd"}, ws)
    assert r["success"] is False
    assert "traversal" in r["error"].lower()


# ─── Unknown tool ───

def test_unknown_tool(ws):
    r = call_tool("nonexistent_tool", {}, ws)
    assert r["success"] is False
    assert "Unknown tool" in r["error"]


# ─── /tools endpoint ───

def test_list_tools_endpoint():
    resp = client.get("/tools", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 18
    names = {t["name"] for t in data["tools"]}
    assert "bash" in names
    assert "git_push" in names
    assert "run_tests" in names
    assert "web_fetch" in names
    # dangerous flags
    dangerous = {t["name"] for t in data["tools"] if t["dangerous"]}
    assert "bash" in dangerous
    assert "git_push" in dangerous


# ─── /health ───

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ─── git_diff ───

def test_git_diff(ws):
    import subprocess
    subprocess.run(["git", "init"], cwd=ws, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@t.com"], cwd=ws, capture_output=True)
    subprocess.run(["git", "config", "user.name", "T"], cwd=ws, capture_output=True)
    with open(os.path.join(ws, "hello.txt"), "a") as f:
        f.write(" modified")
    resp = client.post("/execute", json={
        "tool_name": "git_diff", "arguments": {}, "call_id": "t1", "workspace": ws,
    }, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ─── git_commit ───

def test_git_commit(ws):
    import subprocess
    subprocess.run(["git", "init"], cwd=ws, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@t.com"], cwd=ws, capture_output=True)
    subprocess.run(["git", "config", "user.name", "T"], cwd=ws, capture_output=True)
    resp = client.post("/execute", json={
        "tool_name": "git_commit", "arguments": {"message": "test commit"}, "call_id": "t1", "workspace": ws,
    }, headers=HEADERS)
    assert resp.status_code == 200


# ─── /token endpoint ───

def test_token_endpoint():
    resp = client.get("/token", headers=HEADERS)
    assert resp.status_code == 200
    assert "token" in resp.json()


# ─── workspace validation ───

def test_workspace_escape_blocked():
    """docker_volume 模式下 workspace 逃逸应被阻止"""
    from executor_server import STORAGE_BACKEND
    if STORAGE_BACKEND != "docker_volume":
        pytest.skip("only applies to docker_volume backend")
    resp = client.post("/execute", json={
        "tool_name": "read_file", "arguments": {"path": "test"}, "call_id": "t1", "workspace": "/etc",
    }, headers=HEADERS)
    assert resp.status_code == 403
