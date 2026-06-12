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
        workspaces_dir=os.path.join(temp_dir, ".workspaces"),
        repo_path=temp_dir
    )

def test_create_worktree(workspace_manager, temp_dir):
    workspace = workspace_manager.create_workspace(
        task_id="task-001",
        workspace_type=WorkspaceType.GIT_WORKTREE,
        branch_name="feature/test-001"
    )
    
    assert workspace.workspace_id is not None
    assert workspace.workspace_type == WorkspaceType.GIT_WORKTREE
    assert os.path.exists(workspace.root_path)
    assert os.path.exists(os.path.join(workspace.root_path, ".git"))
    assert workspace.branch_name == "feature/test-001"

def test_create_standalone(workspace_manager, temp_dir):
    workspace = workspace_manager.create_workspace(
        task_id="task-002",
        workspace_type=WorkspaceType.STANDALONE
    )
    
    assert workspace.workspace_type == WorkspaceType.STANDALONE
    assert os.path.exists(workspace.root_path)
    assert not os.path.exists(os.path.join(workspace.root_path, ".git"))

def test_list_workspaces(workspace_manager):
    workspace_manager.create_workspace(task_id="task-1", workspace_type=WorkspaceType.STANDALONE)
    workspace_manager.create_workspace(task_id="task-2", workspace_type=WorkspaceType.STANDALONE)
    
    workspaces = workspace_manager.list_workspaces()
    assert len(workspaces) == 2

def test_destroy_workspace(workspace_manager):
    workspace = workspace_manager.create_workspace(task_id="task-3", workspace_type=WorkspaceType.STANDALONE)
    workspace_id = workspace.workspace_id
    root_path = workspace.root_path
    
    workspace_manager.destroy_workspace(workspace_id)
    
    assert not os.path.exists(root_path)
    assert workspace_manager.get_workspace(workspace_id) is None

def test_get_workspace(workspace_manager):
    workspace = workspace_manager.create_workspace(task_id="task-4", workspace_type=WorkspaceType.STANDALONE)
    
    retrieved = workspace_manager.get_workspace(workspace.workspace_id)
    assert retrieved is not None
    assert retrieved.task_id == "task-4"
