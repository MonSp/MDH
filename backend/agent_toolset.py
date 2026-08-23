"""
AgentToolset - Agent工具集

为每个Agent提供独立的工具集，包括：
- 文件读写
- 代码搜索
- 命令执行
- Git操作

支持从roles_config.yaml加载角色配置，支持角色混搭。
"""

import logging
import os
from typing import Any, Dict, List, Optional, Union

import yaml

from tool_registry import ToolRegistry, ToolDefinition, ToolParameter, ToolCall, ToolResult
from tool_executor import ToolExecutor

logger = logging.getLogger(__name__)

# 配置文件路径
ROLES_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "roles_config.yaml")

# 模块级缓存：避免重复读取磁盘
_roles_config_cache: Optional[Dict] = None
_roles_config_mtime: float = 0.0
_roles_config_path_cached: str = ""


def load_roles_config(config_path: str = None) -> Dict:
    """加载角色配置文件（带 mtime 缓存，文件未变化时直接返回缓存）

    Args:
        config_path: 配置文件路径，默认为roles_config.yaml

    Returns:
        配置字典
    """
    global _roles_config_cache, _roles_config_mtime, _roles_config_path_cached
    path = config_path or ROLES_CONFIG_PATH

    # 缓存命中：同一文件且 mtime 未变化
    if (_roles_config_cache is not None
            and _roles_config_path_cached == path
            and os.path.exists(path)
            and os.path.getmtime(path) == _roles_config_mtime):
        return _roles_config_cache

    if not os.path.exists(path):
        logger.warning("角色配置文件不存在: %s，使用默认配置", path)
        return {}

    with open(path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    _roles_config_cache = config
    _roles_config_mtime = os.path.getmtime(path)
    _roles_config_path_cached = path
    return config


def invalidate_roles_config_cache() -> None:
    """清除角色配置缓存（配置文件被写入后调用）"""
    global _roles_config_cache
    _roles_config_cache = None


class AgentToolset:
    """Agent工具集
    
    为特定Agent提供工具调用能力。
    
    Args:
        agent_id: Agent ID
        agent_role: Agent角色 (executor, planner, reviewer, monitor, coordinator, ceo)
        workspace_root: 工作区根目录
        config_path: 角色配置文件路径（可选）
    """
    
    # 类级别配置缓存
    _config_cache: Optional[Dict] = None
    
    def __init__(
        self,
        agent_id: str,
        agent_role: str,
        workspace_root: str,
        config_path: str = None,
    ):
        self._agent_id = agent_id
        self._agent_role = agent_role
        self._workspace_root = workspace_root
        
        # 加载配置
        if AgentToolset._config_cache is None:
            AgentToolset._config_cache = load_roles_config(config_path)
        self._config = AgentToolset._config_cache
        
        # 解析角色配置
        self._role_config = self._resolve_role_config(agent_role)
        
        # 创建工具注册中心和执行器
        self._registry = ToolRegistry()
        self._executor = ToolExecutor(
            registry=self._registry,
            workspace_root=workspace_root,
        )
        
        # 过滤工具：只保留角色允许的工具
        self._filter_tools()
        
        logger.info(
            "为Agent %s (%s) 配置工具集: %s",
            agent_id, agent_role, self._role_config.get("permissions", {}).get("tools", [])
        )
    
    def _resolve_role_config(self, role_name: str) -> Dict:
        """解析角色配置，支持自定义角色继承
        
        Args:
            role_name: 角色名称
            
        Returns:
            解析后的角色配置
        """
        # 先查找基础角色
        base_roles = self._config.get("base_roles", {})
        if role_name in base_roles:
            return base_roles[role_name]
        
        # 再查找自定义角色
        custom_roles = self._config.get("custom_roles", {})
        if role_name in custom_roles:
            custom_config = custom_roles[role_name]
            base_role_name = custom_config.get("base_role")
            
            if base_role_name and base_role_name in base_roles:
                # 继承基础角色配置
                base_config = base_roles[base_role_name].copy()
                
                # 合并工具
                base_tools = base_config.get("permissions", {}).get("tools", [])
                extra_tools = custom_config.get("extra_tools", [])
                base_config["permissions"]["tools"] = list(set(base_tools + extra_tools))
                
                # 合并技能
                base_skills = base_config.get("skills", [])
                extra_skills = custom_config.get("extra_skills", [])
                base_config["skills"] = list(set(base_skills + extra_skills))
                
                # 使用自定义提示词
                if custom_config.get("custom_prompt"):
                    base_config["custom_prompt"] = custom_config["custom_prompt"]
                    base_config["prompt_template"] = "custom"
                
                base_config["name"] = custom_config.get("name", base_config.get("name"))
                base_config["description"] = custom_config.get("description", base_config.get("description"))
                
                return base_config
        
        # 默认使用executor配置
        logger.warning("未知角色: %s，使用默认executor配置", role_name)
        return base_roles.get("executor", {
            "name": "开发工程师",
            "description": "负责代码实现",
            "permissions": {
                "tools": ["read_file", "write_file", "edit_file", "list_directory", "bash", "git_status", "git_commit"],
                "dangerous_tools": ["bash"]
            },
            "skills": ["fullstack_dev"],
            "prompt_template": "executor"
        })
    
    def _filter_tools(self) -> None:
        """根据角色权限过滤工具"""
        allowed_tools = set(self._role_config.get("permissions", {}).get("tools", []))
        
        # 获取所有已注册工具
        all_tools = self._registry.list_tools()
        
        # 禁用不在允许列表中的工具
        for tool in all_tools:
            if tool.name not in allowed_tools:
                if tool.name in self._registry._executors:
                    del self._registry._executors[tool.name]
    
    @property
    def agent_id(self) -> str:
        return self._agent_id
    
    @property
    def agent_role(self) -> str:
        return self._agent_role
    
    @property
    def role_name(self) -> str:
        """获取角色显示名称"""
        return self._role_config.get("name", self._agent_role)
    
    @property
    def role_description(self) -> str:
        """获取角色描述"""
        return self._role_config.get("description", "")
    
    @property
    def available_tools(self) -> List[str]:
        """获取可用工具列表"""
        return self._role_config.get("permissions", {}).get("tools", [])
    
    @property
    def skills(self) -> List[str]:
        """获取技能列表"""
        return self._role_config.get("skills", [])
    
    @property
    def tool_descriptions(self) -> str:
        """获取工具描述（用于Agent提示词）"""
        descriptions = []
        tools_config = self._config.get("tools", {})
        
        for tool_name in self.available_tools:
            tool_info = tools_config.get(tool_name, {})
            desc = tool_info.get("description", tool_name)
            dangerous = " ⚠️" if tool_info.get("dangerous", False) else ""
            descriptions.append(f"- {tool_name}: {desc}{dangerous}")
        
        return "\n".join(descriptions)
    
    @property
    def skill_descriptions(self) -> str:
        """获取技能描述（用于Agent提示词）— 包含方法论、最佳实践和工作流"""
        sections = []
        skills_config = self._config.get("skills", {})
        
        for skill_id in self.skills:
            skill_info = skills_config.get(skill_id, {})
            name = skill_info.get("name", skill_id)
            desc = skill_info.get("description", "")
            methodology = skill_info.get("methodology", "")
            practices = skill_info.get("practices", [])
            workflow = skill_info.get("workflow", {})
            
            lines = [f"### {name}"]
            if desc:
                lines.append(f"_{desc}_")
            if methodology:
                lines.append(f"**方法论**: {methodology}")
            if practices:
                lines.append("**最佳实践**:")
                for p in practices:
                    lines.append(f"- {p}")
            if workflow:
                lines.append("**工作流**:")
                for step_num, step_desc in sorted(workflow.items(), key=lambda x: int(x[0])):
                    lines.append(f"{step_num}. {step_desc}")
            
            sections.append("\n".join(lines))
        
        return "\n\n".join(sections) if sections else "无特定技能"
    
    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """执行工具调用
        
        Args:
            tool_name: 工具名称
            arguments: 工具参数
            
        Returns:
            ToolResult
        """
        # 检查工具是否可用
        if tool_name not in self.available_tools:
            return ToolResult(
                success=False,
                error=f"工具 {tool_name} 不在您的权限范围内。可用工具: {', '.join(self.available_tools)}",
            )
        
        # 创建工具调用
        tool_call = ToolCall(
            tool_name=tool_name,
            arguments=arguments,
        )
        
        # 执行工具
        result = self._executor.execute(tool_call)
        
        # 记录工具调用
        logger.info(
            "Agent %s (%s) 调用工具 %s: %s",
            self._agent_id, self._agent_role, tool_name,
            "成功" if result.success else f"失败 - {result.error}",
        )
        
        return result
    
    def read_file(self, path: str) -> ToolResult:
        """读取文件"""
        return self.execute("read_file", {"path": path})
    
    def write_file(self, path: str, content: str) -> ToolResult:
        """写入文件"""
        return self.execute("write_file", {"path": path, "content": content})
    
    def edit_file(self, path: str, old_text: str, new_text: str) -> ToolResult:
        """编辑文件"""
        return self.execute("edit_file", {
            "path": path,
            "old_text": old_text,
            "new_text": new_text,
        })
    
    def list_directory(self, path: str = ".") -> ToolResult:
        """列出目录内容"""
        return self.execute("list_directory", {"path": path})
    
    def run_command(self, command: str) -> ToolResult:
        """执行shell命令"""
        return self.execute("bash", {"command": command})
    
    def git_status(self) -> ToolResult:
        """获取git状态"""
        return self.execute("git_status", {})
    
    def git_commit(self, message: str) -> ToolResult:
        """提交更改"""
        return self.execute("git_commit", {"message": message, "add_all": True})
    
    def git_push(self, remote: str = "origin", branch: str = "") -> ToolResult:
        """推送到远程仓库"""
        args = {"remote": remote}
        if branch:
            args["branch"] = branch
        return self.execute("git_push", args)
    
    def git_branch(self, branch_name: str = "") -> ToolResult:
        """创建/切换分支"""
        if branch_name:
            return self.execute("git_branch", {"branch_name": branch_name})
        return self.execute("git_branch", {})
    
    def git_diff(self, staged: bool = False) -> ToolResult:
        """查看代码差异"""
        return self.execute("git_diff", {"staged": staged})
    
    def git_log(self, count: int = 10) -> ToolResult:
        """查看提交历史"""
        return self.execute("git_log", {"count": count})
    
    def search_files(self, pattern: str, path: str = ".") -> ToolResult:
        """搜索文件"""
        return self.execute("search_files", {"pattern": pattern, "path": path})
    
    def grep_content(self, pattern: str, path: str = ".", include: str = "") -> ToolResult:
        """搜索文件内容"""
        args = {"pattern": pattern, "path": path}
        if include:
            args["include"] = include
        return self.execute("grep_content", args)
    
    def run_tests(self, test_path: str = "", verbose: bool = False) -> ToolResult:
        """运行测试"""
        args = {"verbose": verbose}
        if test_path:
            args["test_path"] = test_path
        return self.execute("run_tests", args)
    
    def run_linter(self, path: str = ".") -> ToolResult:
        """运行代码检查"""
        return self.execute("run_linter", {"path": path})
    
    def create_document(self, path: str, content: str) -> ToolResult:
        """创建文档"""
        return self.execute("create_document", {"path": path, "content": content})
    
    def edit_document(self, path: str, old_text: str, new_text: str) -> ToolResult:
        """编辑文档"""
        return self.execute("edit_document", {"path": path, "old_text": old_text, "new_text": new_text})
    
    def web_fetch(self, url: str) -> ToolResult:
        """获取网页内容"""
        return self.execute("web_fetch", {"url": url})
    
    def get_system_prompt(self, name: str = None, task_context: str = None) -> str:
        """获取包含工具说明的系统提示词
        
        Args:
            name: Agent名称
            task_context: 任务上下文
            
        Returns:
            完整的系统提示词
        """
        # 获取角色基础提示词
        prompt_template = self._role_config.get("prompt_template", "executor")
        
        if prompt_template == "custom" and self._role_config.get("custom_prompt"):
            # 使用自定义提示词
            base_prompt = self._role_config["custom_prompt"]
        else:
            # 使用模板
            templates = self._config.get("prompt_templates", {})
            base_prompt = templates.get(prompt_template, templates.get("executor", ""))
        
        # 替换{name}
        agent_name = name or self.role_name
        base_prompt = base_prompt.replace("{name}", agent_name)
        
        # 构建完整提示词
        prompt_parts = [base_prompt]
        
        # 添加工具说明
        prompt_parts.append(f"""
## 可用工具

{self.tool_descriptions}
""")
        
        # 添加技能说明
        if self.skills:
            prompt_parts.append(f"""
## 已加载技能

{self.skill_descriptions}
""")
        
        # 添加工具使用格式说明
        prompt_parts.append("""
## 工具调用格式

当需要使用工具时，请使用以下格式：

```tool_call
{
    "tool": "工具名称",
    "arguments": {
        "参数名": "参数值"
    }
}
```

例如：
- 读取文件: ```tool_call\n{"tool": "read_file", "arguments": {"path": "src/index.js"}}\n```
- 写入文件: ```tool_call\n{"tool": "write_file", "arguments": {"path": "src/index.js", "content": "// 代码"}}\n```
- 执行命令: ```tool_call\n{"tool": "bash", "arguments": {"command": "npm install"}}\n```
""")
        
        # 添加任务上下文
        if task_context:
            prompt_parts.append(f"""
## 当前任务

{task_context}
""")
        
        return "\n".join(prompt_parts)


def create_agent_toolset(
    agent_id: str,
    agent_role: str,
    workspace_root: str,
    custom_config: Dict = None,
    executor_url: str = "",
    location: str = "local",
) -> Union["AgentToolset", "RemoteAgentToolset"]:
    """创建Agent工具集的便捷函数

    Args:
        agent_id: Agent ID
        agent_role: 角色名称（基础角色或自定义角色）
        workspace_root: 工作区根目录
        custom_config: 自定义配置（可选，会覆盖默认配置）
        executor_url: 远端执行器 URL（remote 模式必填）
        location: 执行位置 "local" 或 "remote"

    Returns:
        AgentToolset 或 RemoteAgentToolset 实例
    """
    if location == "remote" and executor_url:
        return RemoteAgentToolset(
            agent_id=agent_id,
            agent_role=agent_role,
            executor_url=executor_url,
            workspace=workspace_root,
        )
    return AgentToolset(
        agent_id=agent_id,
        agent_role=agent_role,
        workspace_root=workspace_root,
    )


class RemoteAgentToolset:
    """远端 Agent 工具集 — 通过 HTTP 调用 Python Executor 执行工具

    接口与 AgentToolset 兼容，工具调用路由到远端 executor_server。
    """

    def __init__(
        self,
        agent_id: str,
        agent_role: str,
        executor_url: str,
        workspace: str = "",
        token: str = "",
    ):
        self._agent_id = agent_id
        self._agent_role = agent_role
        self._executor_url = executor_url.rstrip("/")
        self._workspace = workspace
        self._token = token or os.environ.get("EXECUTOR_TOKEN", "")

    def _call(self, tool_name: str, arguments: Dict[str, Any]) -> "ToolResult":
        from tool_registry import ToolResult
        import json as _json

        payload = {
            "tool_name": tool_name,
            "arguments": arguments,
            "call_id": f"{self._agent_id}:{tool_name}",
            "workspace": self._workspace,
        }
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"

        try:
            import urllib.request
            req = urllib.request.Request(
                f"{self._executor_url}/execute",
                data=_json.dumps(payload).encode(),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = _json.loads(resp.read())
                return ToolResult(
                    success=data.get("success", True),
                    output=str(data.get("result", "")),
                    error=data.get("error", ""),
                )
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> "ToolResult":
        return self._call(tool_name, arguments)

    def write_file(self, filename: str, content: str) -> "ToolResult":
        return self._call("write_file", {"path": filename, "content": content})

    def read_file(self, filename: str) -> "ToolResult":
        return self._call("read_file", {"path": filename})

    def list_directory(self, path: str = ".") -> "ToolResult":
        return self._call("list_directory", {"path": path})

    def run_command(self, command: str) -> "ToolResult":
        return self._call("bash", {"command": command})

    def get_system_prompt(self) -> str:
        return f"[Remote Agent {self._agent_id}] 工具调用将路由到远端执行器: {self._executor_url}"
