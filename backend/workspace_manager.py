import enum
import json
import logging
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass, field

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
    branch_name: str | None = None
    repo_path: str | None = None  # 原始仓库路径（仅GIT_WORKTREE类型）
    metadata: dict = field(default_factory=dict)


@dataclass
class DirectoryScan:
    """目录扫描结果"""
    path: str
    exists: bool
    is_empty: bool
    has_git: bool
    file_count: int
    files: list[str]           # 顶层文件/目录列表
    project_hints: list[str]   # 检测到的项目特征（如 package.json, requirements.txt 等）


class WorkspaceManager:
    def __init__(self, workspaces_dir: str):
        self.workspaces_dir = workspaces_dir
        self._workspaces: dict[str, Workspace] = {}
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
        branch_name: str | None = None,
        repo_path: str | None = None,
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
            root_path = os.path.join(self.workspaces_dir, workspace_id)
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

    def get_workspace(self, workspace_id: str) -> Workspace | None:
        return self._workspaces.get(workspace_id)

    def list_workspaces(self) -> list[Workspace]:
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

    def get_workspace_path(self, workspace_id: str) -> str | None:
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

# ---------------------------------------------------------------------------
# 跨任务产物指针（方案 A：上一任务工作区上下文注入）
# ---------------------------------------------------------------------------

_LAST_WS_PATH = os.path.join(os.path.dirname(__file__), "data", "last_workspace.json")

# 遍历产物时跳过的目录 / 文件
_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".pytest_cache", ".artifacts",
              ".venv", "venv", "dist", "build", "coverage", ".mypy_cache", ".ruff_cache"}
_KEY_FILE_ORDER = ("readme", "package.json", "requirements.txt", "pyproject.toml",
                   "dockerfile", "app.py", "main.py", "server.js", "index.js")


def write_last_workspace(root_path: str, project_id: str = "", brief: str = "") -> None:
    """任务完成时记录其工作区指针，供下一任务读取（落盘以跨 WS 连接）"""
    try:
        payload = {
            "path": os.path.abspath(root_path),
            "project_id": project_id,
            "brief": brief[:200],
            "recorded_at": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc).isoformat(),
        }
        os.makedirs(os.path.dirname(_LAST_WS_PATH), exist_ok=True)
        with open(_LAST_WS_PATH, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.debug("记录上一任务工作区失败: %s", e)


def _collect_workspace_tree(root: str, max_files: int = 60) -> list[str]:
    entries: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in _SKIP_DIRS)
        rel_dir = os.path.relpath(dirpath, root)
        for name in sorted(filenames):
            rel = name if rel_dir == "." else f"{rel_dir}/{name}"
            entries.append(rel)
            if len(entries) >= max_files:
                return entries
    return entries


def build_previous_workspace_context(current_root: str = "", max_tree: int = 60,
                                     max_total_chars: int = 5000) -> str:
    """构造「上一任务产物」提示上下文：文件清单 + 关键文件内容

    指针缺失 / 路径失效 / 指向当前工作区时返回空串（只读注入，不破坏隔离）。
    """
    try:
        if not os.path.isfile(_LAST_WS_PATH):
            return ""
        with open(_LAST_WS_PATH, encoding="utf-8") as fh:
            meta = json.load(fh)
        prev_root = meta.get("path") or ""
        if not prev_root or not os.path.isdir(prev_root):
            return ""
        if current_root and os.path.abspath(prev_root) == os.path.abspath(current_root):
            return ""

        tree = _collect_workspace_tree(prev_root, max_files=max_tree)
        if not tree:
            return ""

        parts = [f"[上一任务产物]（工作区: {prev_root}"]
        if meta.get("brief"):
            parts[0] += f"，任务: {meta['brief']}"
        parts[0] += "）"
        parts.append("文件清单：\n" + "\n".join(f"- {rel}" for rel in tree))

        budget = max_total_chars
        # 关键文件内容：README 优先，其次清单/入口文件
        lower_map = {rel.lower(): rel for rel in tree}
        picked: list[str] = []
        for key in _KEY_FILE_ORDER:
            for low, rel in lower_map.items():
                base = os.path.basename(low)
                if (key == "readme" and base.startswith("readme")) or base == key:
                    if rel not in picked:
                        picked.append(rel)
                    break
            if len(picked) >= 4:
                break

        for rel in picked:
            if budget <= 0:
                break
            full = os.path.join(prev_root, rel)
            try:
                if os.path.getsize(full) > 64 * 1024:
                    continue
                with open(full, encoding="utf-8", errors="replace") as fh:
                    text = fh.read(budget)
            except OSError:
                continue
            parts.append(f"--- {rel} ---\n{text}")
            budget -= len(text)

        return "\n\n".join(parts)
    except Exception as e:
        logger.debug("上一任务产物上下文跳过: %s", e)
        return ""
