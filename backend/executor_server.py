"""
Executor Service — 文件系统抽象的工具执行服务

支持多种存储后端：local, docker_volume, nfs, s3
通过 API Token 认证，通过权限令牌控制危险操作
"""
import asyncio
import glob as glob_mod
import hmac
import logging
import os
import secrets
from abc import ABC, abstractmethod

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="MDH Executor", version="2.0.0")
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:8080,http://localhost:9090").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("executor")

# ====== 配置 ======
EXECUTOR_TOKEN = os.environ.get("EXECUTOR_TOKEN", "")
WORKSPACE_ROOT = os.environ.get("EXECUTOR_WORKSPACE", "/workspace")
STORAGE_BACKEND = os.environ.get("EXECUTOR_STORAGE", "local")  # local | docker_volume | nfs | s3
NFS_MOUNT_PATH = os.environ.get("EXECUTOR_NFS_MOUNT", "/mnt/nfs")
S3_BUCKET = os.environ.get("EXECUTOR_S3_BUCKET", "")
S3_ENDPOINT = os.environ.get("EXECUTOR_S3_ENDPOINT", "")

# 自动生成 token 如果未设置
if not EXECUTOR_TOKEN:
    EXECUTOR_TOKEN = secrets.token_urlsafe(32)
    logger.warning("EXECUTOR_TOKEN not set, generated: %s", EXECUTOR_TOKEN[:8] + "...")


# ====== 认证 ======
async def verify_token(authorization: str = Header(None)):
    """验证 API Token"""
    if not EXECUTOR_TOKEN:
        return True  # 未启用认证
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    if not hmac.compare_digest(token, EXECUTOR_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid token")
    return True


# ====== 文件系统抽象 ======
class FileSystemBackend(ABC):
    """文件系统后端抽象基类"""

    @abstractmethod
    async def read_file(self, path: str) -> str:
        ...

    @abstractmethod
    async def write_file(self, path: str, content: str) -> str:
        ...

    @abstractmethod
    async def edit_file(self, path: str, old_string: str, new_string: str) -> str:
        ...

    @abstractmethod
    async def list_directory(self, path: str) -> list[str]:
        ...

    @abstractmethod
    async def file_exists(self, path: str) -> bool:
        ...

    @abstractmethod
    async def mkdir(self, path: str) -> None:
        ...


class LocalFileSystem(FileSystemBackend):
    """本地文件系统后端"""

    def __init__(self, root: str):
        self.root = root

    def _resolve(self, path: str) -> str:
        resolved = os.path.join(self.root, path)
        # 安全检查：防止路径穿越
        real = os.path.realpath(resolved)
        if not real.startswith(os.path.realpath(self.root)):
            raise ValueError(f"Path traversal detected: {path}")
        return real

    async def read_file(self, path: str) -> str:
        full = self._resolve(path)
        if not os.path.exists(full):
            raise FileNotFoundError(f"Not found: {path}")
        with open(full, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    async def write_file(self, path: str, content: str) -> str:
        full = self._resolve(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Written {len(content)} bytes to {path}"

    async def edit_file(self, path: str, old_string: str, new_string: str) -> str:
        content = await self.read_file(path)
        if old_string not in content:
            raise ValueError(f"old_string not found in {path}")
        content = content.replace(old_string, new_string, 1)
        await self.write_file(path, content)
        return f"Edited {path}"

    async def list_directory(self, path: str) -> list[str]:
        full = self._resolve(path)
        if not os.path.isdir(full):
            raise NotADirectoryError(f"Not a directory: {path}")
        return os.listdir(full)

    async def file_exists(self, path: str) -> bool:
        return os.path.exists(self._resolve(path))

    async def mkdir(self, path: str) -> None:
        os.makedirs(self._resolve(path), exist_ok=True)


class DockerVolumeFileSystem(FileSystemBackend):
    """Docker Volume 文件系统后端（通过容器内路径访问）"""

    def __init__(self, volume_path: str):
        self.root = volume_path

    def _resolve(self, path: str) -> str:
        resolved = os.path.join(self.root, path)
        real = os.path.realpath(resolved)
        if not real.startswith(os.path.realpath(self.root)):
            raise ValueError(f"Path traversal detected: {path}")
        return real

    async def read_file(self, path: str) -> str:
        full = self._resolve(path)
        if not os.path.exists(full):
            raise FileNotFoundError(f"Not found: {path}")
        with open(full, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    async def write_file(self, path: str, content: str) -> str:
        full = self._resolve(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Written {len(content)} bytes to {path}"

    async def edit_file(self, path: str, old_string: str, new_string: str) -> str:
        content = await self.read_file(path)
        if old_string not in content:
            raise ValueError(f"old_string not found in {path}")
        content = content.replace(old_string, new_string, 1)
        await self.write_file(path, content)
        return f"Edited {path}"

    async def list_directory(self, path: str) -> list[str]:
        full = self._resolve(path)
        if not os.path.isdir(full):
            raise NotADirectoryError(f"Not a directory: {path}")
        return os.listdir(full)

    async def file_exists(self, path: str) -> bool:
        return os.path.exists(self._resolve(path))

    async def mkdir(self, path: str) -> None:
        os.makedirs(self._resolve(path), exist_ok=True)


class NfsFileSystem(LocalFileSystem):
    """NFS 挂载文件系统（继承本地文件系统，根目录指向挂载点）"""

    def __init__(self, mount_path: str):
        super().__init__(mount_path)
        if not os.path.ismount(mount_path):
            logger.warning("NFS path %s is not a mount point", mount_path)


# ====== 初始化文件系统后端 ======
def create_filesystem() -> FileSystemBackend:
    if STORAGE_BACKEND == "docker_volume":
        return DockerVolumeFileSystem(WORKSPACE_ROOT)
    elif STORAGE_BACKEND == "nfs":
        return NfsFileSystem(NFS_MOUNT_PATH)
    else:  # local
        return LocalFileSystem(WORKSPACE_ROOT)


fs = create_filesystem()


# ====== 数据模型 ======
class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: dict = {}
    call_id: str = ""
    workspace: str = ""
    permission_token: str = ""  # 危险操作需要的权限令牌


class ToolCallResponse(BaseModel):
    call_id: str
    tool_name: str
    result: object = None
    error: str | None = None
    success: bool = True


class HealthResponse(BaseModel):
    status: str
    storage_backend: str
    workspace: str
    auth_enabled: bool


# ====== 危险操作检查 ======
DANGEROUS_TOOLS = {"bash", "git_push", "run_tests"}
DANGEROUS_PATTERNS = [
    "rm -rf", "rm -r /", "mkfs", "dd if=", "> /dev/",
    "chmod 777", "chown -R", "shutdown", "reboot", "halt",
    "iptables", "systemctl", "service ", "kill -9",
]


def check_danger_permission(tool_name: str, args: dict, permission_token: str):
    """检查危险操作权限"""
    if tool_name not in DANGEROUS_TOOLS:
        return

    command = args.get("command", "")
    is_dangerous = any(p in command for p in DANGEROUS_PATTERNS)

    if is_dangerous and not permission_token:
        raise HTTPException(
            status_code=403,
            detail=f"Dangerous command detected: '{command[:50]}...'. Provide permission_token to proceed.",
        )


# ====== API 端点 ======
@app.post("/execute", response_model=ToolCallResponse)
async def execute_tool(
    request: ToolCallRequest,
    _: bool = Depends(verify_token),
):
    workspace = request.workspace or WORKSPACE_ROOT
    # docker_volume 模式下防止 workspace 参数逃逸
    if STORAGE_BACKEND == "docker_volume":
        ws_real = os.path.realpath(workspace)
        root_real = os.path.realpath(WORKSPACE_ROOT)
        if not ws_real.startswith(root_real):
            raise HTTPException(status_code=403, detail="Workspace outside allowed root")
    check_danger_permission(request.tool_name, request.arguments, request.permission_token)

    handler = TOOL_HANDLERS.get(request.tool_name)
    if not handler:
        return ToolCallResponse(
            call_id=request.call_id,
            tool_name=request.tool_name,
            error=f"Unknown tool: {request.tool_name}",
            success=False,
        )
    try:
        result = await handler(workspace, request.arguments)
        return ToolCallResponse(
            call_id=request.call_id,
            tool_name=request.tool_name,
            result=result,
        )
    except Exception as e:
        logger.exception("Tool failed: %s", request.tool_name)
        return ToolCallResponse(
            call_id=request.call_id,
            tool_name=request.tool_name,
            error=str(e),
            success=False,
        )


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        storage_backend=STORAGE_BACKEND,
        workspace=WORKSPACE_ROOT,
        auth_enabled=bool(EXECUTOR_TOKEN),
    )


@app.get("/token")
async def get_token(authorization: str = Header(None)):
    """返回当前 token（仅用于首次配置）"""
    await verify_token(authorization)
    return {"token": EXECUTOR_TOKEN}


@app.get("/tools")
async def list_tools():
    """返回所有可用工具及其危险标记"""
    return {
        "tools": [
            {"name": name, "dangerous": name in DANGEROUS_TOOLS}
            for name in sorted(TOOL_HANDLERS.keys())
        ],
        "total": len(TOOL_HANDLERS),
    }


# ====== 工具处理器 ======
def _resolve_in_workspace(workspace: str, path: str) -> str:
    """Resolve a path relative to the given workspace, with traversal protection."""
    full = os.path.join(workspace, path)
    real = os.path.realpath(full)
    ws_real = os.path.realpath(workspace)
    if not real.startswith(ws_real):
        raise ValueError(f"Path traversal detected: {path}")
    return real


async def handle_bash(workspace: str, args: dict) -> str:
    command = args.get("command", "")
    timeout = args.get("timeout", 30)
    proc = await asyncio.create_subprocess_shell(
        command, cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode("utf-8", errors="replace")
    except asyncio.TimeoutError:
        proc.kill()
        return f"Command timed out after {timeout}s"


async def handle_read_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    full = _resolve_in_workspace(workspace, path)
    with open(full, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


async def handle_write_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    content = args.get("content", "")
    full = _resolve_in_workspace(workspace, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Written {len(content)} bytes to {path}"


async def handle_edit_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    old_string = args.get("old_string", "")
    new_string = args.get("new_string", "")
    full = _resolve_in_workspace(workspace, path)
    with open(full, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    if old_string not in content:
        raise ValueError(f"old_string not found in {path}")
    content = content.replace(old_string, new_string, 1)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Edited {path}"


async def handle_list_directory(workspace: str, args: dict) -> list[str]:
    path = args.get("path", ".")
    full = _resolve_in_workspace(workspace, path)
    if not os.path.isdir(full):
        raise NotADirectoryError(f"Not a directory: {path}")
    return os.listdir(full)


async def handle_grep(workspace: str, args: dict) -> str:
    pattern = args.get("pattern", "")
    path = args.get("path", ".")
    full_path = _resolve_in_workspace(workspace, path)
    proc = await asyncio.create_subprocess_exec(
        "grep", "-rn", pattern, full_path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_glob(workspace: str, args: dict) -> list[str]:
    pattern = args.get("pattern", "**/*")
    full_pattern = os.path.join(workspace, pattern)
    return glob_mod.glob(full_pattern, recursive=True)


async def handle_git_status(workspace: str, args: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", "status", "--short", cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_git_diff(workspace: str, args: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", "diff", cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_git_commit(workspace: str, args: dict) -> str:
    message = args.get("message", "auto commit")
    # 先 add -A
    proc = await asyncio.create_subprocess_exec(
        "git", "add", "-A", cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    proc = await asyncio.create_subprocess_exec(
        "git", "commit", "-m", message, cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (stdout + stderr).decode("utf-8", errors="replace")


async def handle_git_push(workspace: str, args: dict) -> str:
    remote = args.get("remote", "origin")
    branch = args.get("branch", "")
    cmd = ["git", "push", remote]
    if branch:
        cmd.append(branch)
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (stdout + stderr).decode("utf-8", errors="replace")


async def handle_git_branch(workspace: str, args: dict) -> str:
    branch_name = args.get("branch_name", "")
    if branch_name:
        cmd = ["git", "checkout", "-b", branch_name]
    else:
        cmd = ["git", "branch"]
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (stdout + stderr).decode("utf-8", errors="replace")


async def handle_git_log(workspace: str, args: dict) -> str:
    count = str(args.get("count", 10))
    proc = await asyncio.create_subprocess_exec(
        "git", "log", f"-{count}", "--oneline", cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_run_tests(workspace: str, args: dict) -> str:
    test_path = args.get("test_path", "")
    verbose = args.get("verbose", False)
    cmd = ["python3", "-m", "pytest"]
    if verbose:
        cmd.append("-v")
    if test_path:
        cmd.append(test_path)
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_run_linter(workspace: str, args: dict) -> str:
    path = args.get("path", ".")
    full = _resolve_in_workspace(workspace, path)
    proc = await asyncio.create_subprocess_exec(
        "python3", "-m", "pylint", full, cwd=workspace,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_create_document(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    content = args.get("content", "")
    # format 大小写归一化：防 "DOCX" 静默降级；未知值仍按 text 处理（fail-safe）
    fmt = str(args.get("format", "text")).lower()
    full = _resolve_in_workspace(workspace, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    if fmt == "docx":
        from tool_executor import render_document_bytes
        with open(full, "wb") as f:
            f.write(render_document_bytes(content, "docx"))
    else:
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
    return f"Document created: {path}"


async def handle_edit_document(workspace: str, args: dict) -> str:
    # 与 edit_file 相同逻辑
    return await handle_edit_file(workspace, args)


async def handle_web_fetch(workspace: str, args: dict) -> str:
    url = args.get("url", "")
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "MDH-Executor/2.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        content = response.read().decode("utf-8", errors="replace")
    return content[:10000]


TOOL_HANDLERS = {
    "bash": handle_bash,
    "read_file": handle_read_file,
    "write_file": handle_write_file,
    "edit_file": handle_edit_file,
    "list_directory": handle_list_directory,
    "grep_content": handle_grep,
    "search_files": handle_glob,
    "git_status": handle_git_status,
    "git_diff": handle_git_diff,
    "git_commit": handle_git_commit,
    "git_push": handle_git_push,
    "git_branch": handle_git_branch,
    "git_log": handle_git_log,
    "run_tests": handle_run_tests,
    "run_linter": handle_run_linter,
    "create_document": handle_create_document,
    "edit_document": handle_edit_document,
    "web_fetch": handle_web_fetch,
}


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Executor v2.0")
    logger.info("  Storage: %s", STORAGE_BACKEND)
    logger.info("  Workspace: %s", WORKSPACE_ROOT)
    logger.info("  Auth: %s", "enabled" if EXECUTOR_TOKEN else "disabled")
    uvicorn.run(app, host="0.0.0.0", port=8767)
