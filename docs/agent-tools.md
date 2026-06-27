# Agent工具系统技术文档

## 概述

Agent工具系统为大荒界（MDH）中的每个Agent提供独立的工具执行能力。系统支持18个内置工具，涵盖文件操作、Git版本控制、代码搜索、测试、文档和Web访问等功能。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentToolset                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ 角色配置    │  │ 工具过滤    │  │ 权限控制    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ToolExecutor                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │ 文件    │ │ Git     │ │ 搜索    │ │ 测试    │         │
│  │ 工具    │ │ 工具    │ │ 工具    │ │ 工具    │         │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ToolRegistry                            │
│  - 工具注册  - 参数验证  - 安全检查  - Schema生成          │
└─────────────────────────────────────────────────────────────┘
```

## 工具列表

### 文件操作工具

| 工具名 | 描述 | 参数 | 安全级别 |
|--------|------|------|----------|
| `read_file` | 读取文件内容 | `path: string` | 安全 |
| `write_file` | 写入文件内容 | `path: string, content: string` | 危险 |
| `edit_file` | 编辑文件（替换文本） | `path: string, old_text: string, new_text: string` | 危险 |
| `list_directory` | 列出目录内容 | `path: string (可选, 默认".")` | 安全 |

### Git工具

| 工具名 | 描述 | 参数 | 安全级别 |
|--------|------|------|----------|
| `git_status` | 查看git状态 | 无 | 安全 |
| `git_commit` | 提交git变更 | `message: string, add_all: boolean (可选)` | 危险 |
| `git_push` | 推送到远程仓库 | `remote: string (可选), branch: string (可选)` | 危险 |
| `git_branch` | 创建/切换分支 | `branch_name: string (可选)` | 安全 |
| `git_diff` | 查看代码差异 | `staged: boolean (可选)` | 安全 |
| `git_log` | 查看提交历史 | `count: integer (可选, 默认10)` | 安全 |

### 搜索工具

| 工具名 | 描述 | 参数 | 安全级别 |
|--------|------|------|----------|
| `search_files` | 按模式搜索文件 | `pattern: string, path: string (可选)` | 安全 |
| `grep_content` | 搜索文件内容 | `pattern: string, path: string (可选), include: string (可选)` | 安全 |

### 测试工具

| 工具名 | 描述 | 参数 | 安全级别 |
|--------|------|------|----------|
| `run_tests` | 运行测试套件 | `test_path: string (可选), verbose: boolean (可选)` | 危险 |
| `run_linter` | 运行代码质量检查 | `path: string (可选)` | 安全 |

### 文档工具

| 工具名 | 描述 | 参数 | 安全级别 |
|--------|------|------|----------|
| `create_document` | 创建文档 | `path: string, content: string` | 安全 |
| `edit_document` | 编辑文档 | `path: string, old_text: string, new_text: string` | 安全 |

### Web工具

| 工具名 | 描述 | 参数 | 安全级别 |
|--------|------|------|----------|
| `web_fetch` | 获取网页内容 | `url: string` | 安全 |

## 使用方式

### 1. 通过AgentToolset使用

```python
from agent_toolset import AgentToolset

# 创建工具集
toolset = AgentToolset(
    agent_id="agent-001",
    agent_role="executor",
    workspace_root="/path/to/workspace"
)

# 文件操作
toolset.read_file("src/main.py")
toolset.write_file("src/new.py", "print('hello')")
toolset.edit_file("src/main.py", "old", "new")
toolset.list_directory("src/")

# Git操作
toolset.git_status()
toolset.git_commit("feat: add new feature")
toolset.git_push()
toolset.git_branch("feature/new-feature")
toolset.git_diff()
toolset.git_log(20)

# 搜索
toolset.search_files("*.py", "src/")
toolset.grep_content("TODO", ".", "*.py")
toolset.grep_content("import", "src/")

# 测试
toolset.run_tests("tests/test_main.py", verbose=True)
toolset.run_linter("src/")

# 文档
toolset.create_document("docs/guide.md", "# Guide")
toolset.edit_document("docs/guide.md", "old", "new")

# Web
toolset.web_fetch("https://example.com")
```

### 2. 通过ToolCall直接使用

```python
from tool_registry import ToolRegistry, ToolCall
from tool_executor import ToolExecutor

registry = ToolRegistry()
executor = ToolExecutor(registry=registry, workspace_root="/path/to/workspace")

result = executor.execute(ToolCall(
    tool_name="read_file",
    arguments={"path": "src/main.py"},
    call_id="call-001"
))

print(result.output)
```

### 3. 在Agent提示词中引用

系统会自动为每个Agent生成包含工具说明的提示词：

```
## 可用工具

- read_file: 读取文件内容
- write_file: 写入文件内容 ⚠️
- git_status: 查看git状态
- search_files: 按模式搜索文件
...

## 工具调用格式

```tool_call
{
    "tool": "read_file",
    "arguments": {
        "path": "src/index.js"
    }
}
```
```

## 角色权限配置

工具权限通过 `roles_config.yaml` 配置：

```yaml
base_roles:
  executor:
    name: "执行者"
    permissions:
      tools: ["read_file", "write_file", "edit_file", "list_directory", "bash", "git_status", "git_commit"]
      dangerous_tools: ["bash"]
  
  planner:
    name: "规划者"
    permissions:
      tools: ["read_file", "list_directory", "search_files", "grep_content"]
      dangerous_tools: []
```

## 安全机制

1. **路径遍历保护**：所有文件操作限制在工作区目录内
2. **Shell命令白名单**：只允许预定义的安全命令
3. **危险工具标记**：标记潜在危险操作，需要额外确认
4. **超时控制**：长时间运行的命令自动超时

## 测试结果

```
Registered tools:
  - read_file (file)
  - write_file (file)
  - edit_file (file)
  - list_directory (file)
  - bash (shell)
  - git_status (git)
  - git_commit (git)
  - git_push (git)
  - git_branch (git)
  - git_diff (git)
  - git_log (git)
  - search_files (search)
  - grep_content (search)
  - run_tests (test)
  - run_linter (test)
  - create_document (document)
  - edit_document (document)
  - web_fetch (web)

Total: 18 tools
```

## 扩展工具

添加新工具的步骤：

1. 在 `tool_executor.py` 中实现执行函数
2. 在 `_register_builtin_tools` 中注册工具定义
3. 在 `roles_config.yaml` 中添加工具配置
4. 在 `agent_toolset.py` 中添加便捷方法（可选）

示例：

```python
def _exec_my_tool(self, tool_call: ToolCall) -> ToolResult:
    # 实现逻辑
    return ToolResult(success=True, output="result", call_id=tool_call.call_id)

# 注册
ToolDefinition(
    name="my_tool",
    description="My custom tool",
    parameters=[
        ToolParameter(name="param1", type="string", description="Parameter 1"),
    ],
    category="custom",
),
self._exec_my_tool,
```
