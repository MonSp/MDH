import logging
import os
import re
import subprocess
from typing import Any, Dict

from doc_tools.seam import DocSpec, get_doc_builder
from tool_registry import (
    SHELL_BLACKLIST_PATTERNS,
    ToolCall,
    ToolDefinition,
    ToolParameter,
    ToolRegistry,
    ToolResult,
)

logger = logging.getLogger(__name__)


def render_document_bytes(content: str, fmt: str) -> bytes:
    """按 format 渲染文档字节：docx 走 doc_tools seam，其余返回 utf-8 文本。"""
    if fmt == "docx":
        lines = content.splitlines()
        spec = DocSpec(title=lines[0] if lines else "", paragraphs=lines[1:])
        return get_doc_builder("stdlib").build(spec)
    return content.encode("utf-8")


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
            # Git扩展工具
            (
                ToolDefinition(
                    name="git_push",
                    description="推送到远程仓库",
                    parameters=[
                        ToolParameter(name="remote", type="string", description="远程仓库名", required=False, default="origin"),
                        ToolParameter(name="branch", type="string", description="分支名", required=False),
                    ],
                    category="git",
                    dangerous=True,
                ),
                self._exec_git_push,
            ),
            (
                ToolDefinition(
                    name="git_branch",
                    description="创建/切换分支",
                    parameters=[
                        ToolParameter(name="branch_name", type="string", description="分支名", required=False),
                    ],
                    category="git",
                ),
                self._exec_git_branch,
            ),
            (
                ToolDefinition(
                    name="git_diff",
                    description="查看代码差异",
                    parameters=[
                        ToolParameter(name="staged", type="boolean", description="是否查看暂存区", required=False, default=False),
                    ],
                    category="git",
                ),
                self._exec_git_diff,
            ),
            (
                ToolDefinition(
                    name="git_log",
                    description="查看提交历史",
                    parameters=[
                        ToolParameter(name="count", type="integer", description="显示条数", required=False, default=10),
                    ],
                    category="git",
                ),
                self._exec_git_log,
            ),
            # 搜索工具
            (
                ToolDefinition(
                    name="search_files",
                    description="按模式搜索文件",
                    parameters=[
                        ToolParameter(name="pattern", type="string", description="文件名模式"),
                        ToolParameter(name="path", type="string", description="搜索目录", required=False, default="."),
                    ],
                    category="search",
                ),
                self._exec_search_files,
            ),
            (
                ToolDefinition(
                    name="grep_content",
                    description="搜索文件内容",
                    parameters=[
                        ToolParameter(name="pattern", type="string", description="搜索模式"),
                        ToolParameter(name="path", type="string", description="搜索目录", required=False, default="."),
                        ToolParameter(name="include", type="string", description="文件类型过滤", required=False),
                    ],
                    category="search",
                ),
                self._exec_grep_content,
            ),
            # 测试工具
            (
                ToolDefinition(
                    name="run_tests",
                    description="运行测试套件",
                    parameters=[
                        ToolParameter(name="test_path", type="string", description="测试路径", required=False),
                        ToolParameter(name="verbose", type="boolean", description="详细输出", required=False, default=False),
                    ],
                    category="test",
                    dangerous=True,
                ),
                self._exec_run_tests,
            ),
            (
                ToolDefinition(
                    name="run_linter",
                    description="运行代码质量检查",
                    parameters=[
                        ToolParameter(name="path", type="string", description="检查路径", required=False, default="."),
                    ],
                    category="test",
                ),
                self._exec_run_linter,
            ),
            # 文档工具
            (
                ToolDefinition(
                    name="create_document",
                    description="创建文档",
                    parameters=[
                        ToolParameter(name="path", type="string", description="文件路径"),
                        ToolParameter(name="content", type="string", description="文档内容"),
                        ToolParameter(
                            name="format",
                            type="string",
                            description="文档格式：text 纯文本（默认），docx 生成 Word 文档",
                            required=False,
                            default="text",
                            enum=["text", "docx"],
                        ),
                    ],
                    category="document",
                ),
                self._exec_create_document,
            ),
            (
                ToolDefinition(
                    name="edit_document",
                    description="编辑文档",
                    parameters=[
                        ToolParameter(name="path", type="string", description="文件路径"),
                        ToolParameter(name="old_text", type="string", description="要替换的文本"),
                        ToolParameter(name="new_text", type="string", description="新文本"),
                    ],
                    category="document",
                ),
                self._exec_edit_document,
            ),
            # Web工具
            (
                ToolDefinition(
                    name="web_fetch",
                    description="获取网页内容",
                    parameters=[
                        ToolParameter(name="url", type="string", description="URL地址"),
                    ],
                    category="web",
                ),
                self._exec_web_fetch,
            ),
        ]
        for definition, executor in tools:
            self.registry.register(definition, executor)

        # 注册浏览器自动化工具
        self._register_browser_tools()

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
            # Execute with timeout protection
            timeout = getattr(definition, 'timeout', 30) or 30
            import signal

            def timeout_handler(signum, frame):
                raise TimeoutError(f"Tool {tool_call.tool_name} timed out after {timeout}s")

            old_handler = signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(timeout)
            try:
                result = executor(tool_call)
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old_handler)
            return result
        except TimeoutError as e:
            logger.warning("Tool %s timed out after %ds", tool_call.tool_name, timeout)
            return ToolResult(
                success=False,
                error=str(e),
                call_id=tool_call.call_id,
            )
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

        # Windows兼容：翻译常见Linux命令
        if os.name == 'nt':
            command = self._translate_for_windows(command)

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

    @staticmethod
    def _translate_for_windows(command: str) -> str:
        """将常见Linux命令翻译为Windows等价命令"""
        # mkdir -p dir1 dir2 → mkdir dir1 dir2 (Windows mkdir自动创建父目录)
        command = re.sub(r'\bmkdir\s+-p\b', 'mkdir', command)
        # ls -la → dir
        command = re.sub(r'\bls\s+-la\b', 'dir', command)
        command = re.sub(r'\bls\s+-l\b', 'dir', command)
        command = re.sub(r'\bls\b', 'dir', command)
        # cat file → type file
        command = re.sub(r'\bcat\b', 'type', command)
        # cp -r → xcopy /E /I
        command = re.sub(r'\bcp\s+-r\b', 'xcopy /E /I', command)
        # rm -rf → rmdir /S /Q
        command = re.sub(r'\brm\s+-rf\b', 'rmdir /S /Q', command)
        # && → ; (PowerShell style, but cmd.exe supports && too)
        return command

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

    # ───── Git扩展工具 ─────

    def _exec_git_push(self, tool_call: ToolCall) -> ToolResult:
        remote = tool_call.arguments.get("remote", "origin")
        branch = tool_call.arguments.get("branch", "")
        try:
            cmd = ["git", "push", remote]
            if branch:
                cmd.append(branch)
            result = subprocess.run(
                cmd,
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=120,
            )
            return ToolResult(
                success=result.returncode == 0,
                output=result.stdout,
                error=result.stderr if result.returncode != 0 else "",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    def _exec_git_branch(self, tool_call: ToolCall) -> ToolResult:
        branch_name = tool_call.arguments.get("branch_name", "")
        try:
            if branch_name:
                result = subprocess.run(
                    ["git", "checkout", "-b", branch_name],
                    cwd=self.workspace_root,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
            else:
                result = subprocess.run(
                    ["git", "branch"],
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

    def _exec_git_diff(self, tool_call: ToolCall) -> ToolResult:
        staged = tool_call.arguments.get("staged", False)
        try:
            cmd = ["git", "diff"]
            if staged:
                cmd.append("--staged")
            result = subprocess.run(
                cmd,
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

    def _exec_git_log(self, tool_call: ToolCall) -> ToolResult:
        count = tool_call.arguments.get("count", 10)
        try:
            result = subprocess.run(
                ["git", "log", f"-{count}", "--oneline"],
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

    # ───── 搜索工具 ─────

    def _exec_search_files(self, tool_call: ToolCall) -> ToolResult:
        pattern = tool_call.arguments["pattern"]
        path = tool_call.arguments.get("path", ".")
        resolved = self._resolve_path(path)
        if not os.path.isdir(resolved):
            return ToolResult(success=False, error=f"目录不存在: {path}", call_id=tool_call.call_id)
        try:
            import fnmatch
            matches = []
            for root, dirs, files in os.walk(resolved):
                for filename in fnmatch.filter(files, pattern):
                    matches.append(os.path.relpath(os.path.join(root, filename), resolved))
            return ToolResult(
                success=True,
                output="\n".join(sorted(matches)) if matches else "未找到匹配文件",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    def _exec_grep_content(self, tool_call: ToolCall) -> ToolResult:
        pattern = tool_call.arguments["pattern"]
        path = tool_call.arguments.get("path", ".")
        include = tool_call.arguments.get("include", "")
        resolved = self._resolve_path(path)
        if not os.path.isdir(resolved):
            return ToolResult(success=False, error=f"目录不存在: {path}", call_id=tool_call.call_id)
        try:
            import fnmatch
            matches = []
            for root, dirs, files in os.walk(resolved):
                for filename in files:
                    if include and not fnmatch.fnmatch(filename, include):
                        continue
                    filepath = os.path.join(root, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                            for i, line in enumerate(f, 1):
                                if pattern in line:
                                    rel_path = os.path.relpath(filepath, resolved)
                                    matches.append(f"{rel_path}:{i}: {line.rstrip()}")
                    except (PermissionError, UnicodeDecodeError):
                        continue
            return ToolResult(
                success=True,
                output="\n".join(matches[:100]) if matches else "未找到匹配内容",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    # ───── 测试工具 ─────

    def _exec_run_tests(self, tool_call: ToolCall) -> ToolResult:
        test_path = tool_call.arguments.get("test_path", "")
        verbose = tool_call.arguments.get("verbose", False)
        try:
            cmd = ["python", "-m", "pytest"]
            if verbose:
                cmd.append("-v")
            if test_path:
                cmd.append(test_path)
            result = subprocess.run(
                cmd,
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=300,
            )
            # 回退：python 解释器未安装 pytest 模块时，尝试 PATH 上的 pytest 命令
            if result.returncode != 0 and "No module named pytest" in result.stderr:
                fallback = ["pytest"]
                if verbose:
                    fallback.append("-v")
                if test_path:
                    fallback.append(test_path)
                result = subprocess.run(
                    fallback,
                    cwd=self.workspace_root,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )
            return ToolResult(
                success=result.returncode == 0,
                output=result.stdout,
                error=result.stderr if result.returncode != 0 else "",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    def _exec_run_linter(self, tool_call: ToolCall) -> ToolResult:
        path = tool_call.arguments.get("path", ".")
        resolved = self._resolve_path(path)
        try:
            result = subprocess.run(
                ["python", "-m", "pylint", resolved],
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=120,
            )
            return ToolResult(
                success=result.returncode == 0,
                output=result.stdout,
                error=result.stderr if result.returncode != 0 else "",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    # ───── 文档工具 ─────

    def _exec_create_document(self, tool_call: ToolCall) -> ToolResult:
        path = tool_call.arguments["path"]
        content = tool_call.arguments["content"]
        # format 大小写归一化：防 "DOCX" 静默降级；未知值仍按 text 处理（fail-safe）
        fmt = str(tool_call.arguments.get("format", "text")).lower()
        resolved = self._resolve_path(path)
        try:
            os.makedirs(os.path.dirname(resolved), exist_ok=True)
            if fmt == "docx":
                with open(resolved, "wb") as f:
                    f.write(render_document_bytes(content, "docx"))
            else:
                with open(resolved, "w", encoding="utf-8") as f:
                    f.write(content)
            return ToolResult(
                success=True,
                output=f"文档已创建: {path}",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    def _exec_edit_document(self, tool_call: ToolCall) -> ToolResult:
        path = tool_call.arguments["path"]
        old_text = tool_call.arguments["old_text"]
        new_text = tool_call.arguments["new_text"]
        resolved = self._resolve_path(path)
        if not os.path.isfile(resolved):
            return ToolResult(success=False, error=f"文件不存在: {path}", call_id=tool_call.call_id)
        try:
            with open(resolved, "r", encoding="utf-8") as f:
                content = f.read()
            if old_text not in content:
                return ToolResult(success=False, error="未找到要替换的文本", call_id=tool_call.call_id)
            new_content = content.replace(old_text, new_text, 1)
            with open(resolved, "w", encoding="utf-8") as f:
                f.write(new_content)
            return ToolResult(
                success=True,
                output=f"文档已编辑: {path}",
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    # ───── Web工具 ─────

    def _exec_web_fetch(self, tool_call: ToolCall) -> ToolResult:
        url = tool_call.arguments["url"]
        try:
            import urllib.request
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read().decode("utf-8", errors="replace")
            return ToolResult(
                success=True,
                output=content[:10000],  # 限制输出大小
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)

    # ───── 浏览器自动化工具 (Playwright) ─────

    def _register_browser_tools(self) -> None:
        """注册 Playwright 浏览器工具"""
        browser_tools = [
            ("navigate", "导航到指定网页", [("url", "string", "目标 URL", True)]),
            ("click", "点击页面上的元素", [("selector", "string", "CSS 选择器", True)]),
            ("fill", "填写表单输入框", [("selector", "string", "CSS 选择器", True), ("value", "string", "要填写的值", True)]),
            ("type_text", "逐字输入文本", [("selector", "string", "CSS 选择器", True), ("text", "string", "要输入的文本", True), ("delay", "integer", "每个字符的延迟（毫秒）", False)]),
            ("press_key", "按下键盘按键", [("key", "string", "按键名称", True)]),
            ("hover", "悬停在元素上", [("selector", "string", "CSS 选择器", True)]),
            ("select", "选择下拉框选项", [("selector", "string", "CSS 选择器", True), ("value", "string", "选项值", True)]),
            ("scroll", "滚动页面", [("direction", "string", "滚动方向（up/down/left/right）", True), ("amount", "integer", "滚动像素值", False)]),
            ("get_text", "获取元素文本内容", [("selector", "string", "CSS 选择器", True)]),
            ("get_attribute", "获取元素属性值", [("selector", "string", "CSS 选择器", True), ("attribute", "string", "属性名", True)]),
            ("get_url", "获取当前页面 URL", []),
            ("get_title", "获取当前页面标题", []),
            ("query", "查询元素是否存在", [("selector", "string", "CSS 选择器", True)]),
            ("wait_for", "等待元素达到指定状态", [("selector", "string", "CSS 选择器", True), ("state", "string", "目标状态", False)]),
            ("screenshot", "全页面截图", [("path", "string", "保存路径", False)]),
            ("screenshot_element", "元素截图", [("selector", "string", "CSS 选择器", True), ("path", "string", "保存路径", False)]),
            ("list_tabs", "列出所有标签页", []),
            ("switch_tab", "切换标签页", [("tab_id", "string", "标签页 ID", True)]),
            ("new_tab", "新建标签页", [("url", "string", "初始 URL", False)]),
            ("close_tab", "关闭标签页", [("tab_id", "string", "标签页 ID", True)]),
            ("evaluate_js", "执行 JavaScript", [("code", "string", "JavaScript 代码", True)]),
            ("execute_steps", "批量执行步骤", [("steps", "array", "步骤列表", True)]),
        ]

        for name, desc, params in browser_tools:
            self.registry.register(
                ToolDefinition(
                    name=name,
                    description=desc,
                    parameters=[ToolParameter(name=p[0], type=p[1], description=p[2], required=p[3]) for p in params],
                    category="browser",
                ),
                lambda tc, _name=name: self._exec_browser_tool(tc, _name),
            )

    def _exec_browser_tool(self, tool_call: ToolCall, tool_name: str) -> ToolResult:
        """通用浏览器工具执行器"""
        import asyncio
        import playwright_browser as pw

        try:
            # 获取对应的异步函数
            func = getattr(pw, tool_name, None)
            if not func:
                return ToolResult(success=False, error=f"Unknown browser tool: {tool_name}", call_id=tool_call.call_id)

            # 调用异步函数
            result = asyncio.get_event_loop().run_until_complete(func(**tool_call.arguments))
            return ToolResult(
                success=True,
                output=str(result),
                call_id=tool_call.call_id,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e), call_id=tool_call.call_id)
