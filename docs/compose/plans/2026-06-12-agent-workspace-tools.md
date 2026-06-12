# Agent工作区与工具调用系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为Agent团队提供真实的代码工作区，支持读写文件、执行命令、Git操作，完成后自动创建PR。

**Architecture:** 
- WorkspaceManager管理git worktree隔离工作区
- ToolRegistry注册和管理可用工具（bash、文件操作、git）
- ToolExecutor执行工具调用并实施安全检查
- GitIntegration封装git操作和PR创建

**Tech Stack:** Python 3.10+, subprocess, git CLI, GitHub REST API

---

## 文件结构

```
backend/
├── workspace_manager.py    # 新增：工作区管理（git worktree）
├── tool_registry.py        # 新增：工具注册和安全检查
├── tool_executor.py        # 新增：工具执行引擎
├── git_integration.py      # 新增：Git操作和PR创建
├── ceo_agent.py            # 修改：集成工作区创建
├── meeting_coordinator.py  # 修改：Agent可调用工具
├── server.py               # 修改：新增工作区消息处理
└── tests/
    ├── test_workspace_manager.py
    ├── test_tool_executor.py
    └── test_git_integration.py

src/
├── components/
│   └── office-team/
│       ├── WorkspacePanel.tsx   # 新增：工作区状态面板
│       └── ToolCallLog.tsx      # 新增：工具调用日志
└── hooks/
    └── useMeetingSocket.ts      # 修改：处理工作区消息
```

---

## 阶段1：基础框架

### Task 1: WorkspaceManager - 工作区管理器

**Files:**
- Create: `backend/workspace_manager.py`
- Test: `backend/tests/test_workspace_manager.py`

- [ ] **Step 1: 创建测试文件**

```python
# backend/tests/test_workspace_manager.py
import os
import shutil
import tempfile
import pytest
from workspace_manager import WorkspaceManager, Workspace, WorkspaceType

@pytest.fixture
def temp_dir():
    """创建临时目录作为测试仓库"""
    d = tempfile.mkdtemp()
    # 初始化git仓库
    os.system(f"cd {d} && git init && git config user.email 'test@test.com' && git config user.name 'Test'")
    # 创建初始文件
    with open(os.path.join(d, "README.md"), "w") as f:
        f.write("# Test Repo")
    os.system(f"cd {d} && git add . && git commit -m 'init'")
    yield d
    shutil.rmtree(d, ignore_errors=True)

@pytest.fixture
def workspace_manager(temp_dir):
    return WorkspaceManager(
        workspaces_dir=os.path.join(temp_dir, ".workspaces"),
        repo_path=temp_dir
    )

def test_create_worktree(workspace_manager, temp_dir):
    """测试创建git worktree"""
    workspace = workspace_manager.create_workspace(
        task_id="task-001",
        workspace_type=WorkspaceType.GIT_WORKTREE,
        branch_name="feature/test-001"
    )
    
    assert workspace.workspace_id is not None
    assert workspace.workspace_type == WorkspaceType.GIT_WORKTREE
    assert os.path.exists(workspace.root_path)
    assert os.path.isdir(os.path.join(workspace.root_path, ".git"))
    # worktree应该有自己的分支
    assert workspace.branch_name == "feature/test-001"

def test_create_standalone(workspace_manager, temp_dir):
    """测试创建独立目录工作区"""
    workspace = workspace_manager.create_workspace(
        task_id="task-002",
        workspace_type=WorkspaceType.STANDALONE
    )
    
    assert workspace.workspace_type == WorkspaceType.STANDALONE
    assert os.path.exists(workspace.root_path)
    # 独立目录不应该有.git
    assert not os.path.exists(os.path.join(workspace.root_path, ".git"))

def test_list_workspaces(workspace_manager):
    """测试列出所有工作区"""
    workspace_manager.create_workspace(task_id="task-1", workspace_type=WorkspaceType.STANDALONE)
    workspace_manager.create_workspace(task_id="task-2", workspace_type=WorkspaceType.STANDALONE)
    
    workspaces = workspace_manager.list_workspaces()
    assert len(workspaces) == 2

def test_destroy_workspace(workspace_manager):
    """测试销毁工作区"""
    workspace = workspace_manager.create_workspace(task_id="task-3", workspace_type=WorkspaceType.STANDALONE)
    workspace_id = workspace.workspace_id
    root_path = workspace.root_path
    
    workspace_manager.destroy_workspace(workspace_id)
    
    assert not os.path.exists(root_path)
    assert workspace_manager.get_workspace(workspace_id) is None

def test_get_workspace(workspace_manager):
    """测试获取工作区信息"""
    workspace = workspace_manager.create_workspace(task_id="task-4", workspace_type=WorkspaceType.STANDALONE)
    
    retrieved = workspace_manager.get_workspace(workspace.workspace_id)
    assert retrieved is not None
    assert retrieved.task_id == "task-4"
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/test_workspace_manager.py -v
```

预期：FAIL（workspace_manager模块不存在）

- [ ] **Step 3: 实现WorkspaceManager**

```python
# backend/workspace_manager.py
"""
WorkspaceManager - 工作区管理器

管理Agent团队的代码工作区，支持：
- Git Worktree: 基于现有仓库的隔离工作树
- Standalone: 独立目录（新项目）
"""

import logging
import os
import shutil
import subprocess
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class WorkspaceType(str, Enum):
    """工作区类型"""
    GIT_WORKTREE = "git_worktree"  # 基于git worktree的隔离工作区
    STANDALONE = "standalone"       # 独立目录


@dataclass
class Workspace:
    """工作区数据类"""
    workspace_id: str
    task_id: str
    workspace_type: WorkspaceType
    root_path: str                   # 工作区根目录绝对路径
    branch_name: Optional[str] = None  # git分支名（仅git_worktree类型）
    repo_path: Optional[str] = None    # 原始仓库路径（仅git_worktree类型）
    created_at: str = ""
    metadata: dict = field(default_factory=dict)


class WorkspaceManager:
    """工作区管理器
    
    Args:
        workspaces_dir: 工作区存储根目录
        repo_path: 原始git仓库路径（用于创建worktree）
    """
    
    def __init__(self, workspaces_dir: str, repo_path: str = ""):
        self._workspaces_dir = Path(workspaces_dir)
        self._workspaces_dir.mkdir(parents=True, exist_ok=True)
        self._repo_path = repo_path
        self._workspaces: Dict[str, Workspace] = {}
        
        # 加载已有工作区
        self._load_existing()
    
    def _load_existing(self) -> None:
        """扫描已有工作区"""
        metadata_file = self._workspaces_dir / "workspaces.json"
        if not metadata_file.exists():
            return
        
        import json
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            for item in data:
                workspace = Workspace(**item)
                workspace.workspace_type = WorkspaceType(workspace.workspace_type)
                self._workspaces[workspace.workspace_id] = workspace
        except Exception as e:
            logger.warning("加载工作区元数据失败: %s", e)
    
    def _save_metadata(self) -> None:
        """保存工作区元数据"""
        import json
        from dataclasses import asdict
        
        metadata_file = self._workspaces_dir / "workspaces.json"
        data = [asdict(w) for w in self._workspaces.values()]
        
        with open(metadata_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def create_workspace(
        self,
        task_id: str,
        workspace_type: WorkspaceType,
        branch_name: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> Workspace:
        """创建工作区
        
        Args:
            task_id: 关联的任务ID
            workspace_type: 工作区类型
            branch_name: git分支名（仅git_worktree类型，不指定则自动生成）
            metadata: 额外元数据
            
        Returns:
            创建的Workspace对象
            
        Raises:
            ValueError: repo_path未配置但尝试创建git_worktree
            RuntimeError: git命令执行失败
        """
        workspace_id = str(uuid.uuid4())[:8]
        
        if workspace_type == WorkspaceType.GIT_WORKTREE:
            return self._create_git_worktree(workspace_id, task_id, branch_name, metadata)
        else:
            return self._create_standalone(workspace_id, task_id, metadata)
    
    def _create_git_worktree(
        self,
        workspace_id: str,
        task_id: str,
        branch_name: Optional[str],
        metadata: Optional[dict],
    ) -> Workspace:
        """创建git worktree工作区"""
        if not self._repo_path or not os.path.isdir(self._repo_path):
            raise ValueError(f"原始仓库路径不存在: {self._repo_path}")
        
        # 检查是否是git仓库
        git_dir = os.path.join(self._repo_path, ".git")
        if not os.path.exists(git_dir):
            raise ValueError(f"路径不是git仓库: {self._repo_path}")
        
        # 自动生成分支名
        if not branch_name:
            branch_name = f"agent/workspace-{workspace_id}"
        
        # 创建worktree目录
        worktree_path = self._workspaces_dir / workspace_id
        worktree_path.mkdir(parents=True, exist_ok=True)
        
        # 执行git worktree add
        cmd = [
            "git", "worktree", "add",
            str(worktree_path),
            "-b", branch_name
        ]
        
        result = subprocess.run(
            cmd,
            cwd=self._repo_path,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            # 清理失败的目录
            if worktree_path.exists():
                shutil.rmtree(worktree_path, ignore_errors=True)
            raise RuntimeError(f"创建git worktree失败: {result.stderr}")
        
        workspace = Workspace(
            workspace_id=workspace_id,
            task_id=task_id,
            workspace_type=WorkspaceType.GIT_WORKTREE,
            root_path=str(worktree_path),
            branch_name=branch_name,
            repo_path=self._repo_path,
            metadata=metadata or {},
        )
        
        self._workspaces[workspace_id] = workspace
        self._save_metadata()
        
        logger.info("已创建git worktree工作区: %s -> %s", workspace_id, worktree_path)
        return workspace
    
    def _create_standalone(
        self,
        workspace_id: str,
        task_id: str,
        metadata: Optional[dict],
    ) -> Workspace:
        """创建独立目录工作区"""
        workspace_path = self._workspaces_dir / workspace_id
        workspace_path.mkdir(parents=True, exist_ok=True)
        
        workspace = Workspace(
            workspace_id=workspace_id,
            task_id=task_id,
            workspace_type=WorkspaceType.STANDALONE,
            root_path=str(workspace_path),
            metadata=metadata or {},
        )
        
        self._workspaces[workspace_id] = workspace
        self._save_metadata()
        
        logger.info("已创建独立工作区: %s -> %s", workspace_id, workspace_path)
        return workspace
    
    def get_workspace(self, workspace_id: str) -> Optional[Workspace]:
        """获取工作区信息"""
        return self._workspaces.get(workspace_id)
    
    def list_workspaces(self) -> List[Workspace]:
        """列出所有工作区"""
        return list(self._workspaces.values())
    
    def destroy_workspace(self, workspace_id: str) -> bool:
        """销毁工作区
        
        Args:
            workspace_id: 工作区ID
            
        Returns:
            是否成功销毁
        """
        workspace = self._workspaces.get(workspace_id)
        if not workspace:
            logger.warning("工作区不存在: %s", workspace_id)
            return False
        
        # 如果是git worktree，需要先移除worktree
        if workspace.workspace_type == WorkspaceType.GIT_WORKTREE and workspace.repo_path:
            try:
                cmd = ["git", "worktree", "remove", workspace.root_path, "--force"]
                subprocess.run(
                    cmd,
                    cwd=workspace.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            except Exception as e:
                logger.warning("移除git worktree失败: %s", e)
        
        # 删除目录
        root_path = Path(workspace.root_path)
        if root_path.exists():
            shutil.rmtree(root_path, ignore_errors=True)
        
        # 从索引中移除
        del self._workspaces[workspace_id]
        self._save_metadata()
        
        logger.info("已销毁工作区: %s", workspace_id)
        return True
    
    def get_workspace_path(self, workspace_id: str) -> Optional[str]:
        """获取工作区根路径"""
        workspace = self._workspaces.get(workspace_id)
        return workspace.root_path if workspace else None
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/test_workspace_manager.py -v
```

预期：全部PASS

- [ ] **Step 5: 提交**

```bash
git add backend/workspace_manager.py backend/tests/test_workspace_manager.py
git commit -m "feat: add WorkspaceManager for git worktree isolation"
```

---

### Task 2: ToolRegistry - 工具注册中心

**Files:**
- Create: `backend/tool_registry.py`
- Test: `backend/tests/test_tool_executor.py`（与Task 3共用）

- [ ] **Step 1: 定义工具数据结构**

```python
# backend/tool_registry.py
"""
ToolRegistry - 工具注册中心

管理Agent可用的工具，包括：
- 工具定义（名称、描述、参数schema）
- 安全检查（白名单、黑名单）
- 工具执行器映射
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ToolParameter:
    """工具参数定义"""
    name: str
    type: str           # "string", "integer", "boolean", "array", "object"
    description: str
    required: bool = True
    default: Any = None
    enum: Optional[List[str]] = None


@dataclass
class ToolDefinition:
    """工具定义"""
    name: str
    description: str
    parameters: List[ToolParameter] = field(default_factory=list)
    category: str = "general"  # "file", "git", "shell", "general"
    dangerous: bool = False    # 是否为危险操作
    timeout: int = 60          # 默认超时（秒）


@dataclass
class ToolCall:
    """工具调用请求"""
    tool_name: str
    arguments: Dict[str, Any]
    call_id: str = ""          # 调用ID，用于追踪


@dataclass
class ToolResult:
    """工具调用结果"""
    success: bool
    output: str = ""
    error: str = ""
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    call_id: str = ""


# 工具执行器类型：接收ToolCall，返回ToolResult
ToolExecutorFunc = Callable[[ToolCall], ToolResult]


class ToolRegistry:
    """工具注册中心
    
    提供：
    - 工具注册和查询
    - 安全检查（白名单/黑名单）
    - 执行器映射
    """
    
    # 默认允许的shell命令白名单
    DEFAULT_SHELL_WHITELIST = {
        "npm", "npx", "node", "yarn", "pnpm",
        "pip", "pip3", "python", "python3",
        "git",
        "ls", "dir", "cat", "type", "head", "tail",
        "mkdir", "cp", "copy", "mv", "move",
        "echo", "printf",
        "grep", "find", "search",
        "test", "jest", "pytest", "mocha",
        "tsc", "eslint", "prettier",
        "cargo", "rustc",
        "go",
    }
    
    # 默认禁止的shell命令黑名单
    DEFAULT_SHELL_BLACKLIST = {
        "rm -rf /",
        "sudo",
        "chmod 777",
        "wget",
        "curl",  # 可配置允许
        "shutdown",
        "reboot",
        "format",
    }
    
    def __init__(
        self,
        shell_whitelist: Optional[set] = None,
        shell_blacklist: Optional[set] = None,
    ):
        self._tools: Dict[str, ToolDefinition] = {}
        self._executors: Dict[str, ToolExecutorFunc] = {}
        self._shell_whitelist = shell_whitelist or self.DEFAULT_SHELL_WHITELIST
        self._shell_blacklist = shell_blacklist or self.DEFAULT_SHELL_BLACKLIST
    
    def register(
        self,
        definition: ToolDefinition,
        executor: ToolExecutorFunc,
    ) -> None:
        """注册工具
        
        Args:
            definition: 工具定义
            executor: 工具执行器函数
        """
        self._tools[definition.name] = definition
        self._executors[definition.name] = executor
        logger.debug("已注册工具: %s", definition.name)
    
    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """获取工具定义"""
        return self._tools.get(name)
    
    def list_tools(self) -> List[ToolDefinition]:
        """列出所有已注册工具"""
        return list(self._tools.values())
    
    def get_executor(self, name: str) -> Optional[ToolExecutorFunc]:
        """获取工具执行器"""
        return self._executors.get(name)
    
    def validate_tool_call(self, tool_call: ToolCall) -> Optional[str]:
        """验证工具调用是否合法
        
        Args:
            tool_call: 工具调用请求
            
        Returns:
            错误信息（不合法时）或None（合法时）
        """
        # 检查工具是否存在
        tool_def = self._tools.get(tool_call.tool_name)
        if not tool_def:
            return f"未知工具: {tool_call.tool_name}"
        
        # 检查必需参数
        for param in tool_def.parameters:
            if param.required and param.name not in tool_call.arguments:
                if param.default is None:
                    return f"缺少必需参数: {param.name}"
        
        # 如果是bash工具，检查命令白名单/黑名单
        if tool_call.tool_name == "bash":
            command = tool_call.arguments.get("command", "")
            error = self._validate_shell_command(command)
            if error:
                return error
        
        return None
    
    def _validate_shell_command(self, command: str) -> Optional[str]:
        """验证shell命令是否安全
        
        Args:
            command: shell命令字符串
            
        Returns:
            错误信息或None
        """
        command_lower = command.lower().strip()
        
        # 检查黑名单
        for blocked in self._shell_blacklist:
            if blocked.lower() in command_lower:
                return f"命令被禁止: 包含 '{blocked}'"
        
        # 提取命令的第一个词（实际执行的程序）
        first_word = command.split()[0] if command.split() else ""
        
        # 如果白名单非空，检查白名单
        if self._shell_whitelist and first_word:
            # 允许管道和链接命令（检查管道后的命令）
            commands_in_pipeline = command.split("|")
            for cmd_part in commands_in_pipeline:
                cmd_word = cmd_part.strip().split()[0] if cmd_part.strip().split() else ""
                if cmd_word and cmd_word not in self._shell_whitelist:
                    return f"命令不在白名单中: {cmd_word}"
        
        return None
    
    def get_tools_schema(self) -> List[Dict[str, Any]]:
        """获取所有工具的JSON Schema格式定义（用于LLM function calling）"""
        schemas = []
        for tool in self._tools.values():
            schema = {
                "name": tool.name,
                "description": tool.description,
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                }
            }
            for param in tool.parameters:
                schema["parameters"]["properties"][param.name] = {
                    "type": param.type,
                    "description": param.description,
                }
                if param.enum:
                    schema["parameters"]["properties"][param.name]["enum"] = param.enum
                if param.required:
                    schema["parameters"]["required"].append(param.name)
            schemas.append(schema)
        return schemas
```

- [ ] **Step 2: 提交**

```bash
git add backend/tool_registry.py
git commit -m "feat: add ToolRegistry for tool management and safety checks"
```

---

### Task 3: ToolExecutor - 工具执行引擎

**Files:**
- Create: `backend/tool_executor.py`
- Test: `backend/tests/test_tool_executor.py`

- [ ] **Step 1: 创建测试文件**

```python
# backend/tests/test_tool_executor.py
import os
import shutil
import tempfile
import pytest
from tool_executor import ToolExecutor
from tool_registry import ToolRegistry, ToolDefinition, ToolParameter, ToolCall

@pytest.fixture
def temp_workspace():
    """创建临时工作区"""
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d, ignore_errors=True)

@pytest.fixture
def tool_executor(temp_workspace):
    registry = ToolRegistry()
    executor = ToolExecutor(registry=registry, workspace_root=temp_workspace)
    return executor

def test_read_file(tool_executor, temp_workspace):
    """测试读取文件"""
    # 创建测试文件
    test_file = os.path.join(temp_workspace, "test.txt")
    with open(test_file, "w") as f:
        f.write("Hello, World!")
    
    result = tool_executor.execute(ToolCall(
        tool_name="read_file",
        arguments={"path": "test.txt"}
    ))
    
    assert result.success is True
    assert "Hello, World!" in result.output

def test_write_file(tool_executor, temp_workspace):
    """测试写入文件"""
    result = tool_executor.execute(ToolCall(
        tool_name="write_file",
        arguments={
            "path": "new_file.txt",
            "content": "New content"
        }
    ))
    
    assert result.success is True
    assert os.path.exists(os.path.join(temp_workspace, "new_file.txt"))
    
    with open(os.path.join(temp_workspace, "new_file.txt")) as f:
        assert f.read() == "New content"

def test_bash_command(tool_executor):
    """测试执行bash命令"""
    result = tool_executor.execute(ToolCall(
        tool_name="bash",
        arguments={"command": "echo hello"}
    ))
    
    assert result.success is True
    assert "hello" in result.output

def test_bash_blocked_command(tool_executor):
    """测试被禁止的命令"""
    result = tool_executor.execute(ToolCall(
        tool_name="bash",
        arguments={"command": "sudo rm -rf /"}
    ))
    
    assert result.success is False
    assert "禁止" in result.error or "blocked" in result.error.lower()

def test_path_traversal_blocked(tool_executor):
    """测试路径遍历攻击防护"""
    result = tool_executor.execute(ToolCall(
        tool_name="read_file",
        arguments={"path": "../../../etc/passwd"}
    ))
    
    assert result.success is False
    assert "路径" in result.error or "path" in result.error.lower()

def test_edit_file(tool_executor, temp_workspace):
    """测试编辑文件"""
    # 创建测试文件
    test_file = os.path.join(temp_workspace, "edit_test.txt")
    with open(test_file, "w") as f:
        f.write("Hello, World!")
    
    result = tool_executor.execute(ToolCall(
        tool_name="edit_file",
        arguments={
            "path": "edit_test.txt",
            "old_text": "World",
            "new_text": "Python"
        }
    ))
    
    assert result.success is True
    
    with open(test_file) as f:
        assert "Hello, Python!" == f.read()
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/test_tool_executor.py -v
```

预期：FAIL

- [ ] **Step 3: 实现ToolExecutor**

```python
# backend/tool_executor.py
"""
ToolExecutor - 工具执行引擎

安全执行Agent工具调用，包括：
- 路径安全检查（防止目录遍历）
- 命令执行（受限白名单）
- 超时控制
- 输出捕获
"""

import logging
import os
import subprocess
from pathlib import Path
from typing import Optional

from tool_registry import (
    ToolCall,
    ToolDefinition,
    ToolExecutorFunc,
    ToolParameter,
    ToolRegistry,
    ToolResult,
)

logger = logging.getLogger(__name__)


class ToolExecutor:
    """工具执行引擎
    
    Args:
        registry: 工具注册中心
        workspace_root: 工作区根目录（所有文件操作限制在此目录内）
        default_timeout: 默认命令超时（秒）
        max_output_size: 最大输出大小（字节）
    """
    
    def __init__(
        self,
        registry: ToolRegistry,
        workspace_root: str,
        default_timeout: int = 60,
        max_output_size: int = 1024 * 1024,  # 1MB
    ):
        self._registry = registry
        self._workspace_root = Path(workspace_root).resolve()
        self._default_timeout = default_timeout
        self._max_output_size = max_output_size
        
        # 注册内置工具
        self._register_builtin_tools()
    
    def _register_builtin_tools(self) -> None:
        """注册内置工具"""
        # read_file
        self._registry.register(
            ToolDefinition(
                name="read_file",
                description="读取文件内容",
                parameters=[
                    ToolParameter(name="path", type="string", description="文件路径（相对于工作区）"),
                    ToolParameter(name="encoding", type="string", description="文件编码", required=False, default="utf-8"),
                ],
                category="file",
            ),
            self._execute_read_file,
        )
        
        # write_file
        self._registry.register(
            ToolDefinition(
                name="write_file",
                description="写入文件内容（创建或覆盖）",
                parameters=[
                    ToolParameter(name="path", type="string", description="文件路径（相对于工作区）"),
                    ToolParameter(name="content", type="string", description="文件内容"),
                    ToolParameter(name="encoding", type="string", description="文件编码", required=False, default="utf-8"),
                ],
                category="file",
            ),
            self._execute_write_file,
        )
        
        # edit_file
        self._registry.register(
            ToolDefinition(
                name="edit_file",
                description="编辑文件（查找替换）",
                parameters=[
                    ToolParameter(name="path", type="string", description="文件路径（相对于工作区）"),
                    ToolParameter(name="old_text", type="string", description="要查找的文本"),
                    ToolParameter(name="new_text", type="string", description="替换后的文本"),
                ],
                category="file",
            ),
            self._execute_edit_file,
        )
        
        # list_directory
        self._registry.register(
            ToolDefinition(
                name="list_directory",
                description="列出目录内容",
                parameters=[
                    ToolParameter(name="path", type="string", description="目录路径（相对于工作区）", required=False, default="."),
                ],
                category="file",
            ),
            self._execute_list_directory,
        )
        
        # bash
        self._registry.register(
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
            self._execute_bash,
        )
        
        # git_status
        self._registry.register(
            ToolDefinition(
                name="git_status",
                description="查看git状态",
                parameters=[],
                category="git",
            ),
            self._execute_git_status,
        )
        
        # git_commit
        self._registry.register(
            ToolDefinition(
                name="git_commit",
                description="提交git更改",
                parameters=[
                    ToolParameter(name="message", type="string", description="提交信息"),
                    ToolParameter(name="add_all", type="boolean", description="是否暂存所有更改", required=False, default=True),
                ],
                category="git",
            ),
            self._execute_git_commit,
        )
    
    def _resolve_path(self, relative_path: str) -> Path:
        """解析并验证路径安全性
        
        Args:
            relative_path: 相对于工作区的路径
            
        Returns:
            解析后的绝对路径
            
        Raises:
            ValueError: 路径不安全（目录遍历）
        """
        # 规范化路径
        clean_path = relative_path.replace("\\", "/").strip("/")
        
        # 解析绝对路径
        abs_path = (self._workspace_root / clean_path).resolve()
        
        # 检查是否在工作区内
        if not str(abs_path).startswith(str(self._workspace_root)):
            raise ValueError(f"路径不安全: {relative_path} (尝试访问工作区外)")
        
        return abs_path
    
    def execute(self, tool_call: ToolCall) -> ToolResult:
        """执行工具调用
        
        Args:
            tool_call: 工具调用请求
            
        Returns:
            执行结果
        """
        # 验证工具调用
        error = self._registry.validate_tool_call(tool_call)
        if error:
            return ToolResult(success=False, error=error, call_id=tool_call.call_id)
        
        # 获取执行器
        executor = self._registry.get_executor(tool_call.tool_name)
        if not executor:
            return ToolResult(
                success=False,
                error=f"工具未实现: {tool_call.tool_name}",
                call_id=tool_call.call_id,
            )
        
        try:
            result = executor(tool_call)
            result.call_id = tool_call.call_id
            return result
        except Exception as e:
            logger.exception("工具执行异常: %s", tool_call.tool_name)
            return ToolResult(
                success=False,
                error=f"执行异常: {str(e)}",
                call_id=tool_call.call_id,
            )
    
    def _execute_read_file(self, tool_call: ToolCall) -> ToolResult:
        """执行read_file工具"""
        try:
            file_path = self._resolve_path(tool_call.arguments["path"])
            encoding = tool_call.arguments.get("encoding", "utf-8")
            
            if not file_path.exists():
                return ToolResult(success=False, error=f"文件不存在: {file_path.name}")
            
            if not file_path.is_file():
                return ToolResult(success=False, error=f"不是文件: {file_path.name}")
            
            content = file_path.read_text(encoding=encoding)
            
            # 截断过大的输出
            if len(content) > self._max_output_size:
                content = content[:self._max_output_size] + "\n... (内容已截断)"
            
            return ToolResult(success=True, output=content)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        except Exception as e:
            return ToolResult(success=False, error=f"读取失败: {str(e)}")
    
    def _execute_write_file(self, tool_call: ToolCall) -> ToolResult:
        """执行write_file工具"""
        try:
            file_path = self._resolve_path(tool_call.arguments["path"])
            content = tool_call.arguments["content"]
            encoding = tool_call.arguments.get("encoding", "utf-8")
            
            # 确保父目录存在
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            file_path.write_text(content, encoding=encoding)
            
            return ToolResult(
                success=True,
                output=f"已写入 {file_path.name} ({len(content)} 字符)",
                artifacts=[{"type": "file", "path": str(file_path)}],
            )
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        except Exception as e:
            return ToolResult(success=False, error=f"写入失败: {str(e)}")
    
    def _execute_edit_file(self, tool_call: ToolCall) -> ToolResult:
        """执行edit_file工具"""
        try:
            file_path = self._resolve_path(tool_call.arguments["path"])
            old_text = tool_call.arguments["old_text"]
            new_text = tool_call.arguments["new_text"]
            
            if not file_path.exists():
                return ToolResult(success=False, error=f"文件不存在: {file_path.name}")
            
            content = file_path.read_text(encoding="utf-8")
            
            if old_text not in content:
                return ToolResult(success=False, error=f"未找到要替换的文本")
            
            new_content = content.replace(old_text, new_text)
            file_path.write_text(new_content, encoding="utf-8")
            
            return ToolResult(
                success=True,
                output=f"已编辑 {file_path.name}",
                artifacts=[{"type": "file", "path": str(file_path)}],
            )
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        except Exception as e:
            return ToolResult(success=False, error=f"编辑失败: {str(e)}")
    
    def _execute_list_directory(self, tool_call: ToolCall) -> ToolResult:
        """执行list_directory工具"""
        try:
            dir_path = self._resolve_path(tool_call.arguments.get("path", "."))
            
            if not dir_path.exists():
                return ToolResult(success=False, error=f"目录不存在")
            
            if not dir_path.is_dir():
                return ToolResult(success=False, error=f"不是目录")
            
            entries = []
            for item in sorted(dir_path.iterdir()):
                entry_type = "dir" if item.is_dir() else "file"
                entries.append(f"[{entry_type}] {item.name}")
            
            return ToolResult(success=True, output="\n".join(entries))
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        except Exception as e:
            return ToolResult(success=False, error=f"列出目录失败: {str(e)}")
    
    def _execute_bash(self, tool_call: ToolCall) -> ToolResult:
        """执行bash工具"""
        try:
            command = tool_call.arguments["command"]
            timeout = tool_call.arguments.get("timeout", self._default_timeout)
            
            # 执行命令
            result = subprocess.run(
                command,
                shell=True,
                cwd=str(self._workspace_root),
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            
            output = result.stdout
            error = result.stderr
            
            # 截断过大的输出
            if len(output) > self._max_output_size:
                output = output[:self._max_output_size] + "\n... (输出已截断)"
            if len(error) > self._max_output_size:
                error = error[:self._max_output_size] + "\n... (输出已截断)"
            
            if result.returncode == 0:
                return ToolResult(success=True, output=output)
            else:
                return ToolResult(
                    success=False,
                    output=output,
                    error=f"命令退出码 {result.returncode}: {error}",
                )
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, error=f"命令超时 ({timeout}秒)")
        except Exception as e:
            return ToolResult(success=False, error=f"执行失败: {str(e)}")
    
    def _execute_git_status(self, tool_call: ToolCall) -> ToolResult:
        """执行git_status工具"""
        try:
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=str(self._workspace_root),
                capture_output=True,
                text=True,
                timeout=30,
            )
            
            if result.returncode == 0:
                return ToolResult(success=True, output=result.stdout or "工作区干净，无更改")
            else:
                return ToolResult(success=False, error=result.stderr)
        except Exception as e:
            return ToolResult(success=False, error=f"git status失败: {str(e)}")
    
    def _execute_git_commit(self, tool_call: ToolCall) -> ToolResult:
        """执行git_commit工具"""
        try:
            message = tool_call.arguments["message"]
            add_all = tool_call.arguments.get("add_all", True)
            
            # 暂存更改
            if add_all:
                result = subprocess.run(
                    ["git", "add", "."],
                    cwd=str(self._workspace_root),
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if result.returncode != 0:
                    return ToolResult(success=False, error=f"git add失败: {result.stderr}")
            
            # 提交
            result = subprocess.run(
                ["git", "commit", "-m", message],
                cwd=str(self._workspace_root),
                capture_output=True,
                text=True,
                timeout=30,
            )
            
            if result.returncode == 0:
                return ToolResult(success=True, output=result.stdout)
            else:
                return ToolResult(success=False, error=result.stderr)
        except Exception as e:
            return ToolResult(success=False, error=f"git commit失败: {str(e)}")
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/test_tool_executor.py -v
```

预期：全部PASS

- [ ] **Step 5: 提交**

```bash
git add backend/tool_executor.py backend/tests/test_tool_executor.py
git commit -m "feat: add ToolExecutor with bash, file, and git tools"
```

---

### Task 4: GitIntegration - Git操作和PR创建

**Files:**
- Create: `backend/git_integration.py`
- Test: `backend/tests/test_git_integration.py`

- [ ] **Step 1: 创建测试文件**

```python
# backend/tests/test_git_integration.py
import os
import shutil
import tempfile
import pytest
from unittest.mock import patch, MagicMock
from git_integration import GitIntegration, PRInfo

@pytest.fixture
def temp_repo():
    """创建临时git仓库"""
    d = tempfile.mkdtemp()
    os.system(f"cd {d} && git init && git config user.email 'test@test.com' && git config user.name 'Test'")
    with open(os.path.join(d, "README.md"), "w") as f:
        f.write("# Test")
    os.system(f"cd {d} && git add . && git commit -m 'init'")
    yield d
    shutil.rmtree(d, ignore_errors=True)

@pytest.fixture
def git_integration(temp_repo):
    return GitIntegration(repo_path=temp_repo)

def test_create_branch(git_integration, temp_repo):
    """测试创建分支"""
    result = git_integration.create_branch("feature/test")
    assert result.success is True
    
    # 验证当前分支
    import subprocess
    current = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=temp_repo, capture_output=True, text=True
    )
    assert current.stdout.strip() == "feature/test"

def test_commit_changes(git_integration, temp_repo):
    """测试提交更改"""
    # 创建新文件
    with open(os.path.join(temp_repo, "new.txt"), "w") as f:
        f.write("new content")
    
    result = git_integration.commit_changes("test commit")
    assert result.success is True

def test_push_to_remote(git_integration):
    """测试推送到远程（mock）"""
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        result = git_integration.push_to_remote("origin", "feature/test")
        assert result.success is True

def test_create_pull_request(git_integration):
    """测试创建PR（mock GitHub API）"""
    with patch("requests.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "html_url": "https://github.com/test/repo/pull/1",
            "number": 1,
            "title": "Test PR"
        }
        mock_post.return_value = mock_response
        
        pr_info = git_integration.create_pull_request(
            title="Test PR",
            body="Test body",
            head_branch="feature/test",
            base_branch="main",
            github_token="fake-token",
            repo_owner="test",
            repo_name="repo",
        )
        
        assert pr_info.pr_url == "https://github.com/test/repo/pull/1"
        assert pr_info.pr_number == 1
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/test_git_integration.py -v
```

预期：FAIL

- [ ] **Step 3: 实现GitIntegration**

```python
# backend/git_integration.py
"""
GitIntegration - Git操作和PR创建

封装git命令行操作和GitHub API调用，支持：
- 分支创建/切换
- 代码提交
- 推送到远程
- 创建Pull Request
"""

import logging
import subprocess
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class GitResult:
    """Git操作结果"""
    success: bool
    output: str = ""
    error: str = ""


@dataclass
class PRInfo:
    """Pull Request信息"""
    pr_url: str
    pr_number: int
    title: str
    status: str = "open"


class GitIntegration:
    """Git操作封装
    
    Args:
        repo_path: git仓库路径
    """
    
    def __init__(self, repo_path: str):
        self._repo_path = repo_path
    
    def _run_git(self, args: list, timeout: int = 30) -> GitResult:
        """执行git命令
        
        Args:
            args: git命令参数列表
            timeout: 超时秒数
            
        Returns:
            GitResult
        """
        try:
            cmd = ["git"] + args
            result = subprocess.run(
                cmd,
                cwd=self._repo_path,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            
            if result.returncode == 0:
                return GitResult(success=True, output=result.stdout)
            else:
                return GitResult(success=False, error=result.stderr)
        except subprocess.TimeoutExpired:
            return GitResult(success=False, error=f"命令超时 ({timeout}秒)")
        except Exception as e:
            return GitResult(success=False, error=str(e))
    
    def create_branch(self, branch_name: str, checkout: bool = True) -> GitResult:
        """创建并切换到新分支
        
        Args:
            branch_name: 分支名
            checkout: 是否切换到新分支
            
        Returns:
            GitResult
        """
        if checkout:
            return self._run_git(["checkout", "-b", branch_name])
        else:
            return self._run_git(["branch", branch_name])
    
    def checkout_branch(self, branch_name: str) -> GitResult:
        """切换到指定分支"""
        return self._run_git(["checkout", branch_name])
    
    def get_current_branch(self) -> Optional[str]:
        """获取当前分支名"""
        result = self._run_git(["branch", "--show-current"])
        if result.success:
            return result.output.strip()
        return None
    
    def commit_changes(self, message: str, add_all: bool = True) -> GitResult:
        """提交更改
        
        Args:
            message: 提交信息
            add_all: 是否暂存所有更改
            
        Returns:
            GitResult
        """
        if add_all:
            result = self._run_git(["add", "."])
            if not result.success:
                return result
        
        return self._run_git(["commit", "-m", message])
    
    def push_to_remote(
        self,
        remote: str,
        branch: str,
        set_upstream: bool = True,
    ) -> GitResult:
        """推送到远程仓库
        
        Args:
            remote: 远程名称（如 "origin"）
            branch: 分支名
            set_upstream: 是否设置上游分支
            
        Returns:
            GitResult
        """
        args = ["push", remote, branch]
        if set_upstream:
            args = ["push", "-u", remote, branch]
        
        return self._run_git(args, timeout=60)
    
    def create_pull_request(
        self,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str,
        github_token: str,
        repo_owner: str,
        repo_name: str,
    ) -> PRInfo:
        """创建GitHub Pull Request
        
        Args:
            title: PR标题
            body: PR描述
            head_branch: 源分支
            base_branch: 目标分支
            github_token: GitHub访问令牌
            repo_owner: 仓库所有者
            repo_name: 仓库名
            
        Returns:
            PRInfo
            
        Raises:
            RuntimeError: API调用失败
        """
        import requests
        
        url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/pulls"
        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json",
        }
        data = {
            "title": title,
            "body": body,
            "head": head_branch,
            "base": base_branch,
        }
        
        try:
            response = requests.post(url, json=data, headers=headers, timeout=30)
            
            if response.status_code == 201:
                pr_data = response.json()
                return PRInfo(
                    pr_url=pr_data["html_url"],
                    pr_number=pr_data["number"],
                    title=pr_data["title"],
                    status="open",
                )
            else:
                raise RuntimeError(
                    f"创建PR失败: {response.status_code} - {response.text}"
                )
        except requests.RequestException as e:
            raise RuntimeError(f"GitHub API请求失败: {str(e)}")
    
    def get_status(self) -> GitResult:
        """获取git状态"""
        return self._run_git(["status", "--short"])
    
    def get_diff(self, staged: bool = False) -> GitResult:
        """获取diff"""
        args = ["diff"]
        if staged:
            args.append("--staged")
        return self._run_git(args)
    
    def get_log(self, count: int = 10) -> GitResult:
        """获取提交日志"""
        return self._run_git([
            "log", f"-{count}", "--oneline", "--graph"
        ])
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/test_git_integration.py -v
```

预期：全部PASS

- [ ] **Step 5: 提交**

```bash
git add backend/git_integration.py backend/tests/test_git_integration.py
git commit -m "feat: add GitIntegration for git operations and PR creation"
```

---

## 阶段2：系统集成

### Task 5: 集成到CeoAgent

**Files:**
- Modify: `backend/ceo_agent.py`

- [ ] **Step 1: 在CeoAgent中创建工作区**

在`_execute_complex`方法中，创建项目后创建工作区：

```python
# 在 __init__ 中添加
self._workspace_manager: Optional[WorkspaceManager] = None

# 在 _execute_complex 方法中，创建项目后添加：
# ① 创建工作区
from workspace_manager import WorkspaceManager, WorkspaceType
workspace_mgr = WorkspaceManager(
    workspaces_dir=os.path.join("data", "workspaces"),
    repo_path=os.getcwd()  # 当前项目目录
)
workspace = workspace_mgr.create_workspace(
    task_id=project.project_id,
    workspace_type=WorkspaceType.GIT_WORKTREE,
    branch_name=f"agent/task-{project.project_id[:8]}"
)
self._workspace_manager = workspace_mgr

# 通知前端工作区已创建
await send_message({
    "type": "workspace_created",
    "workspace_id": workspace.workspace_id,
    "workspace_path": workspace.root_path,
    "branch_name": workspace.branch_name,
})
```

- [ ] **Step 2: 将工作区信息传递给Coordinator**

```python
# 创建coordinator时传递workspace信息
coordinator = MeetingCoordinator(
    meeting_session=meeting,
    provider=self._session.provider,
    model_name=self._session.model_name or "",
    api_key=self._session.api_key,
    base_url=self._session.base_url or "",
    workspace=workspace,  # 新增参数
)
```

- [ ] **Step 3: 运行现有测试确保不破坏**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/ -v
```

预期：全部PASS

- [ ] **Step 4: 提交**

```bash
git add backend/ceo_agent.py
git commit -m "feat: integrate workspace creation into CeoAgent flow"
```

---

### Task 6: 集成到MeetingCoordinator

**Files:**
- Modify: `backend/meeting_coordinator.py`

- [ ] **Step 1: 添加工具调用支持**

在MeetingCoordinator中添加工具执行能力：

```python
# 在 __init__ 中添加
from tool_registry import ToolRegistry
from tool_executor import ToolExecutor
from workspace_manager import Workspace

# 如果有workspace，初始化工具
if workspace:
    self._tool_registry = ToolRegistry()
    self._tool_executor = ToolExecutor(
        registry=self._tool_registry,
        workspace_root=workspace.root_path,
    )
else:
    self._tool_registry = None
    self._tool_executor = None
```

- [ ] **Step 2: 在Agent执行中支持工具调用**

```python
# 添加工具调用处理方法
async def execute_tool_call(self, tool_name: str, arguments: dict) -> dict:
    """执行工具调用"""
    if not self._tool_executor:
        return {"success": False, "error": "工具系统未初始化"}
    
    from tool_registry import ToolCall
    tool_call = ToolCall(
        tool_name=tool_name,
        arguments=arguments,
    )
    
    result = self._tool_executor.execute(tool_call)
    
    # 发送工具调用结果到前端
    await self._send_progress(
        "system",
        f"[工具调用] {tool_name}: {'成功' if result.success else '失败'}",
        ""
    )
    
    return {
        "success": result.success,
        "output": result.output,
        "error": result.error,
    }
```

- [ ] **Step 3: 运行测试确保不破坏**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/ -v
```

- [ ] **Step 4: 提交**

```bash
git add backend/meeting_coordinator.py
git commit -m "feat: add tool execution support to MeetingCoordinator"
```

---

### Task 7: server.py消息处理

**Files:**
- Modify: `backend/server.py`

- [ ] **Step 1: 添加工作区相关消息处理**

```python
# 在 unified_message 处理器中添加workspace相关消息类型

elif msg_type == "workspace_action":
    # 工作区操作
    action = data.get("action")
    workspace_id = data.get("workspace_id")
    
    if action == "list":
        # 列出所有工作区
        workspaces = session._workspace_manager.list_workspaces() if session._workspace_manager else []
        await ws.send_json({
            "type": "workspace_list",
            "workspaces": [w.__dict__ for w in workspaces],
        })
    elif action == "destroy":
        # 销毁工作区
        if session._workspace_manager:
            success = session._workspace_manager.destroy_workspace(workspace_id)
            await ws.send_json({
                "type": "workspace_destroyed",
                "workspace_id": workspace_id,
                "success": success,
            })

elif msg_type == "tool_call":
    # 工具调用（从Agent或前端发起）
    tool_name = data.get("tool_name")
    arguments = data.get("arguments", {})
    
    if session._meeting_coordinator and session._meeting_coordinator._tool_executor:
        result = await session._meeting_coordinator.execute_tool_call(tool_name, arguments)
        await ws.send_json({
            "type": "tool_result",
            "tool_name": tool_name,
            **result,
        })
```

- [ ] **Step 2: 运行测试确保不破坏**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/ -v
```

- [ ] **Step 3: 提交**

```bash
git add backend/server.py
git commit -m "feat: add workspace and tool call message handlers"
```

---

## 阶段3：前端展示

### Task 8: WorkspacePanel组件

**Files:**
- Create: `src/components/office-team/WorkspacePanel.tsx`

- [ ] **Step 1: 创建WorkspacePanel组件**

```tsx
// src/components/office-team/WorkspacePanel.tsx
import React, { useState, useEffect } from 'react'

interface Workspace {
  workspace_id: string
  task_id: string
  workspace_type: string
  root_path: string
  branch_name?: string
}

interface ToolCallLog {
  tool_name: string
  arguments: Record<string, unknown>
  success: boolean
  output?: string
  error?: string
  timestamp: string
}

interface WorkspacePanelProps {
  workspace: Workspace | null
  toolCallLogs: ToolCallLog[]
  onToolCall: (toolName: string, arguments: Record<string, unknown>) => void
  onDestroy: () => void
}

export default function WorkspacePanel({
  workspace,
  toolCallLogs,
  onToolCall,
  onDestroy,
}: WorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'files' | 'logs'>('info')

  if (!workspace) {
    return (
      <div style={{ padding: 16, color: '#8e8e93' }}>
        暂无工作区
      </div>
    )
  }

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: 'rgba(0,0,0,0.3)',
      borderRadius: 8,
    }}>
      {/* 标题栏 */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#00eeff', fontWeight: 600 }}>
          📁 工作区
        </span>
        <button
          onClick={onDestroy}
          style={{
            padding: '4px 8px',
            background: 'rgba(255,59,48,0.2)',
            border: '1px solid rgba(255,59,48,0.5)',
            borderRadius: 4,
            color: '#ff3b30',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          销毁
        </button>
      </div>

      {/* 标签页 */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        {(['info', 'files', 'logs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: activeTab === tab ? 'rgba(0,238,255,0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #00eeff' : '2px solid transparent',
              color: activeTab === tab ? '#00eeff' : '#8e8e93',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {tab === 'info' ? '信息' : tab === 'files' ? '文件' : '日志'}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'info' && (
          <div style={{ color: '#fff', fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8e8e93' }}>ID: </span>
              {workspace.workspace_id}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8e8e93' }}>类型: </span>
              {workspace.workspace_type}
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#8e8e93' }}>路径: </span>
              <span style={{ wordBreak: 'break-all' }}>{workspace.root_path}</span>
            </div>
            {workspace.branch_name && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#8e8e93' }}>分支: </span>
                <span style={{ color: '#30d158' }}>{workspace.branch_name}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div style={{ color: '#8e8e93', fontSize: 13 }}>
            文件浏览器（待实现）
          </div>
        )}

        {activeTab === 'logs' && (
          <div style={{ fontSize: 12 }}>
            {toolCallLogs.length === 0 ? (
              <div style={{ color: '#8e8e93' }}>暂无工具调用记录</div>
            ) : (
              toolCallLogs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ 
                    color: log.success ? '#30d158' : '#ff3b30',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}>
                    {log.tool_name}
                  </div>
                  <pre style={{ 
                    margin: 0,
                    color: '#8e8e93',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {log.success ? log.output : log.error}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/office-team/WorkspacePanel.tsx
git commit -m "feat: add WorkspacePanel component for workspace visualization"
```

---

### Task 9: 集成到OfficeTeamMode

**Files:**
- Modify: `src/components/OfficeTeamMode.tsx`
- Modify: `src/hooks/useMeetingSocket.ts`

- [ ] **Step 1: 在useMeetingSocket中添加workspace状态**

```typescript
// src/hooks/useMeetingSocket.ts 中添加

const [workspace, setWorkspace] = useState<Workspace | null>(null)
const [toolCallLogs, setToolCallLogs] = useState<ToolCallLog[]>([])

// 在消息处理中添加：
case 'workspace_created':
  setWorkspace({
    workspace_id: data.workspace_id,
    task_id: data.task_id || '',
    workspace_type: data.workspace_type || 'git_worktree',
    root_path: data.workspace_path,
    branch_name: data.branch_name,
  })
  break

case 'tool_result':
  setToolCallLogs(prev => [...prev, {
    tool_name: data.tool_name,
    arguments: data.arguments || {},
    success: data.success,
    output: data.output,
    error: data.error,
    timestamp: new Date().toISOString(),
  }])
  break
```

- [ ] **Step 2: 在OfficeTeamMode中集成WorkspacePanel**

```tsx
// 在会议视图中添加WorkspacePanel
import WorkspacePanel from './office-team/WorkspacePanel'

// 在会议标签页中添加workspace标签
<MeetingTab value="workspace" label="工作区" />
<WorkspacePanel
  workspace={workspace}
  toolCallLogs={toolCallLogs}
  onToolCall={(name, args) => sendToolCall(name, args)}
  onDestroy={() => sendWorkspaceAction('destroy')}
/>
```

- [ ] **Step 3: 运行前端构建验证**

```bash
cd D:\trunk\test-sidepanel-host
npm run build
```

预期：构建成功

- [ ] **Step 4: 提交**

```bash
git add src/components/OfficeTeamMode.tsx src/hooks/useMeetingSocket.ts
git commit -m "feat: integrate WorkspacePanel into meeting view"
```

---

## 阶段4：测试和验证

### Task 10: 端到端测试

- [ ] **Step 1: 启动后端服务**

```bash
cd D:\trunk\test-sidepanel-host
conda activate browser-agent
python backend/server.py
```

- [ ] **Step 2: 启动前端开发服务器**

```bash
npm run dev
```

- [ ] **Step 3: 测试完整流程**

1. 打开科技大厦视图
2. 点击"与CEO对话"
3. 输入任务："创建一个简单的Hello World页面"
4. 验证：
   - CEO分析任务并创建工作区
   - 会议界面显示工作区信息
   - 工具调用日志正常显示
   - 任务完成后显示PR链接

- [ ] **Step 4: 运行所有测试**

```bash
cd D:\trunk\test-sidepanel-host
python -m pytest backend/tests/ -v
npm run test
```

预期：全部PASS

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: complete agent workspace and tool execution system (MVP)"
```

---

## 完成检查清单

- [ ] 所有测试通过
- [ ] 前端构建成功
- [ ] 后端服务正常启动
- [ ] 工作区创建/销毁正常
- [ ] 工具调用（bash、文件、git）正常
- [ ] Git操作（commit、push）正常
- [ ] PR创建功能正常（需要配置GitHub token）
- [ ] 前端展示工作区信息正常
- [ ] 工具调用日志正常显示
