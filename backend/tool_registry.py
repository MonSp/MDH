import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

SHELL_WHITELIST = {
    "npm", "pip", "python", "python3", "git", "ls", "cat", "mkdir", "cp", "mv",
    "echo", "grep", "find", "test", "jest", "pytest", "tsc", "eslint", "prettier",
    "cargo", "go", "node", "npx", "yarn", "pnpm", "make", "cmake", "docker",
    "curl", "wget", "head", "tail", "wc", "sort", "uniq", "diff", "touch",
    "chmod", "chown", "whoami", "pwd", "date", "env", "which", "whereis",
    "pylint", "black", "isort", "mypy", "flake8", "ruff",
    "pip3", "pipenv", "poetry", "conda",
    "tar", "zip", "unzip", "gzip", "gunzip",
    "ssh", "scp", "rsync",
    "sed", "awk", "xargs",
    "ping", "nslookup", "dig",
    "df", "du", "free", "top", "ps",
    "tee", "tr", "cut", "paste",
}

SHELL_BLACKLIST_PATTERNS = [
    r"\brm\s+-rf\s+/",
    r"\bsudo\b",
    r"\bchmod\s+777\b",
    r"\bshutdown\b",
    r"\breboot\b",
    r"\bformat\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r":(){ :\|:& };:",
]


@dataclass
class ToolParameter:
    name: str
    type: str
    description: str
    required: bool = True
    default: Any = None
    enum: list[str] | None = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: list[ToolParameter] = field(default_factory=list)
    category: str = "general"
    dangerous: bool = False
    timeout: int = 60


@dataclass
class ToolCall:
    tool_name: str
    arguments: dict[str, Any]
    call_id: str = ""


@dataclass
class ToolResult:
    success: bool
    output: str = ""
    error: str = ""
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    call_id: str = ""


ToolExecutorFunc = Callable[[ToolCall], ToolResult]


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}
        self._executors: dict[str, ToolExecutorFunc] = {}

    def register(
        self,
        definition: ToolDefinition,
        executor: ToolExecutorFunc,
    ) -> None:
        if definition.name in self._tools:
            logger.warning("Overwriting existing tool: %s", definition.name)
        self._tools[definition.name] = definition
        self._executors[definition.name] = executor
        logger.info("Registered tool: %s (category=%s)", definition.name, definition.category)

    def get_tool(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def list_tools(self, category: str | None = None) -> list[ToolDefinition]:
        tools = list(self._tools.values())
        if category:
            tools = [t for t in tools if t.category == category]
        return tools

    def get_executor(self, name: str) -> ToolExecutorFunc | None:
        return self._executors.get(name)

    def validate_tool_call(self, tool_call: ToolCall) -> tuple[bool, str]:
        definition = self._tools.get(tool_call.tool_name)
        if not definition:
            return False, f"Unknown tool: {tool_call.tool_name}"

        for param in definition.parameters:
            if param.required and param.name not in tool_call.arguments:
                if param.default is None:
                    return False, f"Missing required parameter: {param.name}"

        if definition.category == "shell":
            ok, msg = self._check_shell_safety(tool_call.arguments)
            if not ok:
                return False, msg

        return True, ""

    def _check_shell_safety(self, arguments: dict[str, Any]) -> tuple[bool, str]:
        command = arguments.get("command", "")
        if not command:
            return True, ""

        for pattern in SHELL_BLACKLIST_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return False, f"Blocked dangerous command pattern: {pattern}"

        first_token = command.strip().split()[0] if command.strip() else ""
        if first_token and first_token not in SHELL_WHITELIST:
            return False, f"Command not in whitelist: {first_token}"

        return True, ""

    def get_tools_schema(self) -> list[dict[str, Any]]:
        schemas = []
        for tool in self._tools.values():
            properties = {}
            required = []
            for param in tool.parameters:
                prop: dict[str, Any] = {
                    "type": param.type,
                    "description": param.description,
                }
                if param.enum:
                    prop["enum"] = param.enum
                if param.default is not None:
                    prop["default"] = param.default
                properties[param.name] = prop
                if param.required:
                    required.append(param.name)

            schema = {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required,
                    },
                },
            }
            schemas.append(schema)
        return schemas
