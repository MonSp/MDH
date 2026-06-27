"""
Executor Service — 纯工具执行服务

接收编排器的工具调用请求，执行后返回结果。
不包含 LLM 推理逻辑，只负责工具执行。
"""
import asyncio
import glob as glob_mod
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="MDH Executor", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("executor")

WORKSPACE_ROOT = os.environ.get("EXECUTOR_WORKSPACE", "/workspace")


class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: dict = {}
    call_id: str = ""
    workspace: str = ""


class ToolCallResponse(BaseModel):
    call_id: str
    tool_name: str
    result: object = None
    error: str | None = None
    success: bool = True


@app.post("/execute", response_model=ToolCallResponse)
async def execute_tool(request: ToolCallRequest):
    workspace = request.workspace or WORKSPACE_ROOT
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
        logger.exception("Tool execution failed: %s", request.tool_name)
        return ToolCallResponse(
            call_id=request.call_id,
            tool_name=request.tool_name,
            error=str(e),
            success=False,
        )


@app.get("/health")
async def health():
    return {"status": "ok", "workspace": WORKSPACE_ROOT}


async def handle_bash(workspace: str, args: dict) -> str:
    command = args.get("command", "")
    timeout = args.get("timeout", 30)
    proc = await asyncio.create_subprocess_shell(
        command,
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode("utf-8", errors="replace")
    except asyncio.TimeoutError:
        proc.kill()
        return f"Command timed out after {timeout}s"


async def handle_read_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    full_path = os.path.join(workspace, path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"File not found: {path}")
    with open(full_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


async def handle_write_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    content = args.get("content", "")
    full_path = os.path.join(workspace, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Written {len(content)} bytes to {path}"


async def handle_edit_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    old_string = args.get("old_string", "")
    new_string = args.get("new_string", "")
    full_path = os.path.join(workspace, path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"File not found: {path}")
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
    if old_string not in content:
        raise ValueError(f"old_string not found in {path}")
    content = content.replace(old_string, new_string, 1)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Edited {path}"


async def handle_list_directory(workspace: str, args: dict) -> list[str]:
    path = args.get("path", ".")
    full_path = os.path.join(workspace, path)
    if not os.path.isdir(full_path):
        raise NotADirectoryError(f"Not a directory: {path}")
    return os.listdir(full_path)


async def handle_grep(workspace: str, args: dict) -> str:
    pattern = args.get("pattern", "")
    path = args.get("path", ".")
    full_path = os.path.join(workspace, path)
    proc = await asyncio.create_subprocess_exec(
        "grep", "-rn", pattern, full_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_glob(workspace: str, args: dict) -> list[str]:
    pattern = args.get("pattern", "**/*")
    full_pattern = os.path.join(workspace, pattern)
    return glob_mod.glob(full_pattern, recursive=True)


async def handle_git_status(workspace: str, args: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", "status", "--short",
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_git_diff(workspace: str, args: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", "diff",
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_git_commit(workspace: str, args: dict) -> str:
    message = args.get("message", "auto commit")
    proc = await asyncio.create_subprocess_exec(
        "git", "commit", "-m", message,
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (stdout + stderr).decode("utf-8", errors="replace")


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
}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8767)
