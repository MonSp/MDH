"""
请求/响应模型 — Pydantic 输入验证

为 server.py REST 端点提供类型安全和自动验证。
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── 技能管理 ──

class SkillRegisterRequest(BaseModel):
    skill_dir: str = Field(..., description="技能目录路径")


class SkillCloneRequest(BaseModel):
    target_dir: str = Field(..., description="目标目录路径")


# ── 项目管理 ──

class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="项目名称")
    description: str = Field("", max_length=1000, description="项目描述")
    category: str = Field("", max_length=50, description="项目分类")


class TaskCreateRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=2000, description="任务描述")
    agent_id: Optional[str] = Field(None, description="指定执行者 ID")


class SubtaskCreateRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=2000, description="子任务描述")


# ── 路由管理 ──

class RouteEntryRequest(BaseModel):
    dept_id: str = Field(..., description="部门 ID")
    dept_name: str = Field(..., description="部门名称")
    capability_desc: str = Field("", description="能力描述")
    capability_keywords: List[str] = Field(default_factory=list, description="能力关键词")
    tools: List[str] = Field(default_factory=list, description="工具列表")
    priority: int = Field(5, ge=1, le=10, description="优先级 1-10")


# ── 角色管理 ──

class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="角色名称")
    description: str = Field("", max_length=500, description="角色描述")
    tools: List[str] = Field(default_factory=list, description="工具列表")
    skills: List[str] = Field(default_factory=list, description="技能列表")


class RoleUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    tools: Optional[List[str]] = None
    skills: Optional[List[str]] = None


# ── 工作流 ──

class WorkflowNodeRequest(BaseModel):
    node_id: str = Field(..., description="节点 ID")
    task_description: str = Field("", description="任务描述")
    dept_id: str = Field("", description="部门 ID")
    input_spec: Dict[str, Any] = Field(default_factory=dict)
    output_spec: Dict[str, Any] = Field(default_factory=dict)


class WorkflowEdgeRequest(BaseModel):
    source_node_id: str = Field(..., description="源节点 ID")
    target_node_id: str = Field(..., description="目标节点 ID")
    condition: Optional[str] = Field(None, description="条件表达式")


class WorkflowCreateRequest(BaseModel):
    workflow_id: Optional[str] = Field(None, description="工作流 ID")
    name: str = Field("Unnamed", max_length=200, description="工作流名称")
    description: str = Field("", max_length=1000, description="工作流描述")
    nodes: List[WorkflowNodeRequest] = Field(default_factory=list, description="节点列表")
    edges: List[WorkflowEdgeRequest] = Field(default_factory=list, description="边列表")
    execution_strategy: str = Field("sequential", description="执行策略")


# ── 审批 ──

class ApprovalDecisionRequest(BaseModel):
    approved: bool = Field(..., description="是否批准")
    reason: str = Field("", max_length=500, description="审批理由")


# ── 技能市场 ──

class SkillForkRequest(BaseModel):
    skill_name: str = Field(..., description="技能名称")
    project_id: str = Field("current", description="目标项目 ID")


class ExperiencePublishRequest(BaseModel):
    trigger_condition: str = Field(..., min_length=1, description="触发条件")
    action: str = Field(..., min_length=1, description="建议动作")
    keywords: List[str] = Field(default_factory=list, description="关键词")
    rule_type: str = Field("success_pattern", description="规则类型")


class ExperienceForkRequest(BaseModel):
    rule_id: str = Field(..., description="规则 ID")
    target_project: str = Field("current", description="目标项目")


class SkillExportRequest(BaseModel):
    skill_name: str = Field(..., description="技能名称")
    include_experience: bool = Field(True, description="是否包含经验规则")


class SkillImportRequest(BaseModel):
    zip_path: str = Field(..., description="zip 文件路径")
    overwrite: bool = Field(False, description="是否覆盖已有技能")


# ── MCP 配置 ──

class MCPServerRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="服务器名称")
    transport: str = Field("stdio", description="传输类型")
    command: str = Field("", description="命令（stdio）")
    args: List[str] = Field(default_factory=list, description="参数（stdio）")
    url: str = Field("", description="URL（http）")
    env: Dict[str, str] = Field(default_factory=dict, description="环境变量")
    enabled: bool = Field(True, description="是否启用")


class MCPServerUpdateRequest(BaseModel):
    transport: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    url: Optional[str] = None
    env: Optional[Dict[str, str]] = None
    enabled: Optional[bool] = None


# ── 社区市场 ──

class CommunityInstallRequest(BaseModel):
    skill_name: str = Field(..., description="技能名称")
