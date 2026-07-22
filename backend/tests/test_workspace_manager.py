import os
import shutil
import subprocess
import tempfile
import pytest
from workspace_manager import WorkspaceManager, Workspace, WorkspaceType

@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp()
    subprocess.run(["git", "init"], cwd=d, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=d, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=d, check=True, capture_output=True)
    with open(os.path.join(d, "README.md"), "w") as f:
        f.write("# Test Repo")
    subprocess.run(["git", "add", "."], cwd=d, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=d, check=True, capture_output=True)
    yield d
    shutil.rmtree(d, ignore_errors=True)

@pytest.fixture
def workspace_manager(temp_dir):
    return WorkspaceManager(
        workspaces_dir=os.path.join(temp_dir, ".workspaces")
    )

def test_create_standalone(workspace_manager):
    """新项目：创建空目录"""
    workspace = workspace_manager.create_workspace(
        task_id="task-001",
        workspace_type=WorkspaceType.STANDALONE
    )
    
    assert workspace.workspace_id is not None
    assert workspace.workspace_type == WorkspaceType.STANDALONE
    assert os.path.exists(workspace.root_path)
    assert not os.path.exists(os.path.join(workspace.root_path, ".git"))
    assert workspace.repo_path is None

def test_create_worktree(workspace_manager, temp_dir):
    """已有项目：从git创建worktree"""
    workspace = workspace_manager.create_workspace(
        task_id="task-002",
        workspace_type=WorkspaceType.GIT_WORKTREE,
        branch_name="feature/test-002",
        repo_path=temp_dir
    )
    
    assert workspace.workspace_id is not None
    assert workspace.workspace_type == WorkspaceType.GIT_WORKTREE
    assert os.path.exists(workspace.root_path)
    assert os.path.exists(os.path.join(workspace.root_path, ".git"))
    assert workspace.branch_name == "feature/test-002"
    assert workspace.repo_path == temp_dir

def test_create_worktree_without_repo_path(workspace_manager):
    """GIT_WORKTREE类型缺少repo_path应报错"""
    with pytest.raises(ValueError, match="repo_path"):
        workspace_manager.create_workspace(
            task_id="task-003",
            workspace_type=WorkspaceType.GIT_WORKTREE
        )

def test_list_workspaces(workspace_manager):
    workspace_manager.create_workspace(task_id="task-1", workspace_type=WorkspaceType.STANDALONE)
    workspace_manager.create_workspace(task_id="task-2", workspace_type=WorkspaceType.STANDALONE)
    
    workspaces = workspace_manager.list_workspaces()
    assert len(workspaces) == 2

def test_destroy_standalone(workspace_manager):
    workspace = workspace_manager.create_workspace(task_id="task-3", workspace_type=WorkspaceType.STANDALONE)
    workspace_id = workspace.workspace_id
    root_path = workspace.root_path
    
    workspace_manager.destroy_workspace(workspace_id)
    
    assert not os.path.exists(root_path)
    assert workspace_manager.get_workspace(workspace_id) is None

def test_destroy_worktree(workspace_manager, temp_dir):
    workspace = workspace_manager.create_workspace(
        task_id="task-4",
        workspace_type=WorkspaceType.GIT_WORKTREE,
        branch_name="feature/test-004",
        repo_path=temp_dir
    )
    workspace_id = workspace.workspace_id
    root_path = workspace.root_path
    
    workspace_manager.destroy_workspace(workspace_id)
    
    assert not os.path.exists(root_path)
    assert workspace_manager.get_workspace(workspace_id) is None

def test_get_workspace(workspace_manager):
    workspace = workspace_manager.create_workspace(task_id="task-5", workspace_type=WorkspaceType.STANDALONE)
    
    retrieved = workspace_manager.get_workspace(workspace.workspace_id)
    assert retrieved is not None
    assert retrieved.task_id == "task-5"

def test_standalone_workspaces_isolated(workspace_manager):
    """多个 STANDALONE 工作区应有独立目录，互不干扰"""
    ws1 = workspace_manager.create_workspace(task_id="t1", workspace_type=WorkspaceType.STANDALONE)
    ws2 = workspace_manager.create_workspace(task_id="t2", workspace_type=WorkspaceType.STANDALONE)

    # 不同工作区应有不同 root_path
    assert ws1.root_path != ws2.root_path
    assert ws1.root_path != workspace_manager.workspaces_dir
    assert ws2.root_path != workspace_manager.workspaces_dir

    # 在 ws1 中写入文件
    with open(os.path.join(ws1.root_path, "test.txt"), "w") as f:
        f.write("workspace 1")

    # 销毁 ws2 不应影响 ws1
    workspace_manager.destroy_workspace(ws2.workspace_id)
    assert os.path.exists(os.path.join(ws1.root_path, "test.txt"))
    assert workspace_manager.get_workspace(ws1.workspace_id) is not None
