import enum
import logging
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

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
    repo_path: Optional[str] = None  # 原始仓库路径（仅GIT_WORKTREE类型）
    metadata: Dict = field(default_factory=dict)


@dataclass
class DirectoryScan:
    """目录扫描结果"""
    path: str
    exists: bool
    is_empty: bool
    has_git: bool
    file_count: int
    files: List[str]           # 顶层文件/目录列表
    project_hints: List[str]   # 检测到的项目特征（如 package.json, requirements.txt 等）


class WorkspaceManager:
    def __init__(self, workspaces_dir: str):
        self.workspaces_dir = workspaces_dir
        self._workspaces: Dict[str, Workspace] = {}
        os.makedirs(workspaces_dir, exist_ok=True)

    def scan_directory(self, path: str) -> DirectoryScan:
        """扫描目录内容，检测是否已有项目"""
        if not os.path.isdir(path):
            return DirectoryScan(
                path=path, exists=False, is_empty=True,
                has_git=False, file_count=0, files=[], project_hints=[],
            )

        entries = os.listdir(path)
        files = sorted(entries)
        project_hints = []

        # 检测项目特征文件
        hint_files = {
            'package.json': 'Node.js项目',
            'requirements.txt': 'Python项目',
            'pyproject.toml': 'Python项目(pyproject)',
            'Cargo.toml': 'Rust项目',
            'go.mod': 'Go项目',
            'pom.xml': 'Java项目(Maven)',
            'build.gradle': 'Java项目(Gradle)',
            'Makefile': 'C/C++项目',
            'index.html': 'Web前端',
            'README.md': '有文档',
            'README.rst': '有文档',
            '.env': '有环境配置',
            'docker-compose.yml': 'Docker编排',
            'Dockerfile': 'Docker镜像',
            '.gitignore': 'Git项目',
        }
        for fname in files:
            if fname in hint_files:
                project_hints.append(hint_files[fname])

        has_git = '.git' in entries
        if has_git:
            project_hints.insert(0, 'Git仓库')

        return DirectoryScan(
            path=path,
            exists=True,
            is_empty=len(entries) == 0,
            has_git=has_git,
            file_count=len(entries),
            files=files[:20],  # 最多显示20个
            project_hints=project_hints,
        )

    def create_workspace(
        self,
        task_id: str,
        workspace_type: WorkspaceType,
        branch_name: Optional[str] = None,
        repo_path: Optional[str] = None,
        force: bool = False,
    ) -> Workspace:
        workspace_id = str(uuid.uuid4())[:8]

        if workspace_type == WorkspaceType.GIT_WORKTREE:
            root_path = os.path.join(self.workspaces_dir, workspace_id)
            if not repo_path or not os.path.isdir(repo_path):
                raise ValueError(f"GIT_WORKTREE类型需要有效的repo_path，当前: {repo_path}")
            if not branch_name:
                branch_name = f"task/{task_id}"
            os.makedirs(root_path, exist_ok=True)
            subprocess.run(
                ["git", "worktree", "add", "-b", branch_name, root_path],
                cwd=repo_path,
                check=True,
                capture_output=True,
            )
        else:
            root_path = self.workspaces_dir
            # 安全检查：目录已存在且非空
            if os.path.isdir(root_path) and not force:
                scan = self.scan_directory(root_path)
                if not scan.is_empty:
                    if scan.has_git:
                        raise ValueError(
                            f"目标目录是已有Git项目: {root_path}\n"
                            f"检测到: {', '.join(scan.project_hints)}\n"
                            f"请使用Git Worktree模式，或指定空目录。"
                        )
                    raise DirectoryNotEmptyError(
                        path=root_path,
                        scan=scan,
                    )
            os.makedirs(root_path, exist_ok=True)

        workspace = Workspace(
            workspace_id=workspace_id,
            task_id=task_id,
            workspace_type=workspace_type,
            root_path=root_path,
            branch_name=branch_name,
            repo_path=repo_path,
        )
        self._workspaces[workspace_id] = workspace
        logger.info("创建工作区: %s (%s) -> %s", workspace_id, workspace_type.value, root_path)
        return workspace

    def get_workspace(self, workspace_id: str) -> Optional[Workspace]:
        return self._workspaces.get(workspace_id)

    def list_workspaces(self) -> List[Workspace]:
        return list(self._workspaces.values())

    def destroy_workspace(self, workspace_id: str) -> None:
        workspace = self._workspaces.pop(workspace_id, None)
        if not workspace:
            return

        if workspace.workspace_type == WorkspaceType.GIT_WORKTREE and workspace.repo_path:
            subprocess.run(
                ["git", "worktree", "remove", "--force", workspace.root_path],
                cwd=workspace.repo_path,
                capture_output=True,
            )

        if os.path.exists(workspace.root_path):
            shutil.rmtree(workspace.root_path, ignore_errors=True)

    def get_workspace_path(self, workspace_id: str) -> Optional[str]:
        workspace = self._workspaces.get(workspace_id)
        return workspace.root_path if workspace else None


class DirectoryNotEmptyError(ValueError):
    """目录非空异常，携带扫描结果"""
    def __init__(self, path: str, scan: DirectoryScan):
        self.scan = scan
        self.path = path
        file_list = ', '.join(scan.files[:10])
        if len(scan.files) > 10:
            file_list += f'... (共{scan.file_count}个)'
        hints = ', '.join(scan.project_hints) if scan.project_hints else '无'
        super().__init__(
            f"目标目录非空: {path}\n"
            f"已有文件: {file_list}\n"
            f"项目特征: {hints}"
        )
