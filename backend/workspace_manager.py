import enum
import logging
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class WorkspaceType(enum.Enum):
    GIT_WORKTREE = "git_worktree"
    STANDALONE = "standalone"


@dataclass
class Workspace:
    workspace_id: str
    task_id: str
    workspace_type: WorkspaceType
    root_path: str
    branch_name: Optional[str] = None
    metadata: Dict = field(default_factory=dict)


class WorkspaceManager:
    def __init__(self, workspaces_dir: str, repo_path: str):
        self.workspaces_dir = workspaces_dir
        self.repo_path = repo_path
        self._workspaces: Dict[str, Workspace] = {}
        os.makedirs(workspaces_dir, exist_ok=True)

    def create_workspace(
        self,
        task_id: str,
        workspace_type: WorkspaceType,
        branch_name: Optional[str] = None,
    ) -> Workspace:
        workspace_id = str(uuid.uuid4())[:8]
        root_path = os.path.join(self.workspaces_dir, workspace_id)

        if workspace_type == WorkspaceType.GIT_WORKTREE:
            if not branch_name:
                branch_name = f"task/{task_id}"
            os.makedirs(root_path, exist_ok=True)
            subprocess.run(
                ["git", "worktree", "add", "-b", branch_name, root_path],
                cwd=self.repo_path,
                check=True,
                capture_output=True,
            )
        else:
            os.makedirs(root_path, exist_ok=True)

        workspace = Workspace(
            workspace_id=workspace_id,
            task_id=task_id,
            workspace_type=workspace_type,
            root_path=root_path,
            branch_name=branch_name,
        )
        self._workspaces[workspace_id] = workspace
        return workspace

    def get_workspace(self, workspace_id: str) -> Optional[Workspace]:
        return self._workspaces.get(workspace_id)

    def list_workspaces(self) -> List[Workspace]:
        return list(self._workspaces.values())

    def destroy_workspace(self, workspace_id: str) -> None:
        workspace = self._workspaces.pop(workspace_id, None)
        if not workspace:
            return

        if workspace.workspace_type == WorkspaceType.GIT_WORKTREE:
            subprocess.run(
                ["git", "worktree", "remove", "--force", workspace.root_path],
                cwd=self.repo_path,
                capture_output=True,
            )

        if os.path.exists(workspace.root_path):
            shutil.rmtree(workspace.root_path, ignore_errors=True)

    def get_workspace_path(self, workspace_id: str) -> Optional[str]:
        workspace = self._workspaces.get(workspace_id)
        return workspace.root_path if workspace else None
