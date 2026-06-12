import logging
import os
import re
import subprocess
from typing import Any, Dict

from tool_registry import (
    SHELL_BLACKLIST_PATTERNS,
    ToolCall,
    ToolDefinition,
    ToolParameter,
    ToolRegistry,
    ToolResult,
)

logger = logging.getLogger(__name__)


class ToolExecutor:
    def __init__(self, registry: ToolRegistry, workspace_root: str):
        self.registry = registry
        self.workspace_root = os.path.realpath(workspace_root)
        self._register_builtin_tools()

    def _register_builtin_tools(self) -> None:
        tools = [
            (
                ToolDefinition(
                    name="read_file",
                    description="读取文件内容",
                    parameters=[
                        ToolParameter(name="path", type="string", description="文件路径"),
                    ],
                    category="file",
                ),
                self._exec_read_file,
            ),
            (
                ToolDefinition(
                    name="write_file",
                    description="写入文件内容",
                    parameters=[
                        ToolParameter(name="path", type="string", description="文件路径"),
                        ToolParameter(name="content", type="string", description="文件内容"),
                    ],
                    category="file",
                ),
                self._exec_write_file,
            ),
            (
                ToolDefinition(
                    name="edit_file",
                    description="编辑文件（替换文本）",
                    parameters=[
                        ToolParameter(name="path", type="string", description="文件路径"),
                        ToolParameter(name="old_text", type="string", description="要替换的文本"),
                        ToolParameter(name="new_text", type="string", description="新文本"),
                    ],
                    category="file",
                ),
                self._exec_edit_file,
            ),
            (
                ToolDefinition(
                    name="list_directory",
                    description="列出目录内容",
                    parameters=[
                        ToolParameter(name="path", type="string", description="目录路径", required=False, default="."),
                    ],
                    category="file",
                ),
                self._exec_list_directory,
            ),
            (
                ToolDefinition(
                    name="bash",
                    description="执行shell命令",
                    parameters=[
                        ToolParameter(name="command", type="string", description="要执行的命令"),
                        ToolParameter(name="timeout", type="integer", description="超时秒数", required=False, default=60),
                    ],
                    category="shell",
                    dangerous=True,
                ),
                self._exec_bash,
            ),
            (
                ToolDefinition(
                    name="git_status",
                    description="查看git状态",
                    parameters=[],
                    category="git",
                ),
                self._exec_git_status,
            ),
            (
                ToolDefinition(
                    name="git_commit",
                    description="提交git变更",
                    parameters=[
                        ToolParameter(name="message", type="string", description="提交信息"),
                        ToolParameter(name="add_all", type="boolean", description="是否暂存所有变更", required=False, default=True),
                    ],
                    category="git",
                ),
                self._exec_git_commit,
            ),
        ]
        for definition, executor in tools:
            self.registry.register(definition, executor)

    def _resolve_path(self, relative_path: str) -> str:
        resolved = os.path.realpath(os.path.join(self.workspace_root, relative_path))
        if not resolved.startswith(self.workspace_root):
            return ""
        return resolved

    def execute(self, tool_call: ToolCall) -> ToolResult:
        valid, msg = self.registry.validate_tool_call(tool_call)
        if not valid:
            return ToolResult(success=False, error=msg, call_id=tool_call.call_id)

        definition = self.registry.get_tool(tool_call.tool_name)
        if not definition:
            return ToolResult(
                success=False,
                error=f"Unknown tool: {tool_call.tool_name}",
                call_id=tool_call.call_id,
            )

        # Path security check for file tools
        if definition.category == "file":
            path_arg = tool_call.arguments.get("path", "")
            if path_arg:
                resolved = self._resolve_path(path_arg)
                if not resolved:
                    return ToolResult(
                        success=False,
                        error="路径遍历攻击被禁止: 路径超出工作区范围",
                        call_id=tool_call.call_id,
                    )

        executor = self.registry.get_executor(tool_call.tool_name)
        if not executor:
            return ToolResult(
                success=False,
                error=f"No executor for tool: {tool_call.tool_name}",
                call_id=tool_call.call_id,
            )

        try:
            return executor(tool_call)
        except Exception as e:
            logger.exception("Error executing tool %s", tool_call.tool_name)
            return ToolResult(
                success=False,
                error=f"执行错误: {e}",
                call_id=tool_call.call_id,
            )

    def _exec_read_file(self, tool_call: ToolCall) -> ToolResult:
        path = tool_call.arguments["path"]
        resolved = self._resolve_path(path)
        if not os.path.isfile(resolved):
            return ToolResult(success=False, error=f"文件不存在: {path}", call_id=tool_call.call_id)
        with open(resolved, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return ToolResult(success=True, output=content, call_id=tool_call.call_id)

    def _exec_write_file(self, tool_call: ToolCall) -> ToolResult:
        path = tool_call.arguments["path"]
        content = tool_call.arguments["content"]
        resolved = self._resolve_path(path)
        os.makedirs(os.path.dirname(resolved), exist_ok=True)
        with open(resolved, "w", encoding="utf-8") as f:
            f.write(content)
        return ToolResult(success=True, output=f"文件已写入: {path}", call_id=tool_call.call_id)

    def _exec_edit_file(self, tool_call: ToolCall) -> ToolResult:
        path = tool_call.arguments["path"]
        old_text = tool_call.arguments["old_text"]
        new_text = tool_call.arguments["new_text"]
        resolved = self._resolve_path(path)
        if not os.path.isfile(resolved):
            return ToolResult(success=False, error=f"文件不存在: {path}", call_id=tool_call.call_id)
        with open(resolved, "r", encoding="utf-8") as f:
            content = f.read()
        if old_text not in content:
            return ToolResult(success=False, error=f"未找到要替换的文本", call_id=tool_call.call_id)
        new_content = content.replace(old_text, new_text, 1)
        with open(resolved, "w", encoding="utf-8") as f:
            f.write(new_content)
        return ToolResult(success=True, output=f"文件已编辑: {path}", call_id=tool_call.call_id)

    def _exec_list_directory(self, tool_call: ToolCall) -> ToolResult:
        path = tool_call.arguments.get("path", ".")
        resolved = self._resolve_path(path)
        if not os.path.isdir(resolved):
            return ToolResult(success=False, error=f"目录不存在: {path}", call_id=tool_call.call_id)
        entries = os.listdir(resolved)
        lines = []
        for entry in sorted(entries):
            full = os.path.join(resolved, entry)
            suffix = "/" if os.path.isdir(full) else ""
            lines.append(f"{entry}{suffix}")
        return ToolResult(success=True, output="\n".join(lines), call_id=tool_call.call_id)

    def _exec_bash(self, tool_call: ToolCall) -> ToolResult:
        command = tool_call.arguments["command"]
        timeout = tool_call.arguments.get("timeout", 60)

        # Blacklist check
        for pattern in SHELL_BLACKLIST_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return ToolResult(
                    success=False,
                    error=f"命令被禁止: 匹配危险模式 {pattern}",
                    call_id=tool_call.call_id,
                )

        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            output = result.stdout
            if result.stderr:
                output += ("\n" if output else "") + result.stderr
            return ToolResult(
                success=result.returncode == 0,
                output=output if result.returncode == 0 else "",
                error=output if result.returncode != 0 else "",
                call_id=tool_call.call_id,
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                error=f"命令超时 ({timeout}s)",
                call_id=tool_call.call_id,
            )

    def _exec_git_status(self, tool_call: ToolCall) -> ToolResult:
        try:
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return ToolResult(
                success=result.returncode == 0,
                output=result.stdout,
                error=result.stderr if result.returncode != 0 else "",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    def _exec_git_commit(self, tool_call: ToolCall) -> ToolResult:
        message = tool_call.arguments["message"]
        add_all = tool_call.arguments.get("add_all", True)

        try:
            if add_all:
                subprocess.run(
                    ["git", "add", "-A"],
                    cwd=self.workspace_root,
                    capture_output=True,
                    text=True,
                    check=True,
                    timeout=30,
                )

            result = subprocess.run(
                ["git", "commit", "-m", message],
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return ToolResult(
                success=result.returncode == 0,
                output=result.stdout,
                error=result.stderr if result.returncode != 0 else "",
                call_id=tool_call.call_id,
            )
        except subprocess.CalledProcessError as e:
            return ToolResult(success=False, error=e.stderr, call_id=tool_call.call_id)
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)
