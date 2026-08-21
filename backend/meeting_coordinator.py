import asyncio
import json
import logging
import os
import re
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import PROVIDER_REGISTRY, _extract_text
from agent_pool import AgentPool, AgentConfig
from agenda import AgendaStateMachine, AgendaPhase
from approval_manager import ApprovalManager
from collaboration.planner_agent import PlannerAgent
from discussion_utils import parse_stance_from_content, resolve_agent_role, strip_stance_tags
from dynamic_router import DynamicRouter
from meeting import MeetingSession, SessionEventType
from negotiation import NegotiationEngine, ConsensusStrategy, Stance
from protocol import AgentRole, MeetingAgentStatus, SemanticAnalysisResult, semantic_analysis_to_dict, WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowNodeStatus, LLM_FALLBACK_TEMPLATE
from team import Team
from workflow_engine import WorkflowEngine

# WhyBuddy化：导入拆分后的子模块
from semantic_analyzer import SemanticAnalyzer
from task_orchestrator import TaskOrchestrator
from review_pipeline import ReviewPipeline
from discussion_manager import DiscussionManager
from mixed_location_discussion import MixedLocationDiscussion

AGENT_ROLE_PROMPTS = {
    AgentRole.CEO: "你是编程团队的CTO（技术总监）。你的职责是分析用户技术需求、判断技术意图、将开发任务自动分配给最合适的团队成员。你熟悉前后端技术栈、系统架构和团队成员能力。请用简洁果断的技术语言发言。",
    AgentRole.PLANNER: "你是团队的系统架构师。你的职责是分析技术任务、设计系统架构、将复杂需求分解为可执行的开发子任务，并为每个子任务定义验收标准和所需技能标签。请用专业的技术语言发言。",
    AgentRole.EXECUTOR: "你是团队的全栈开发工程师。你的职责是评估任务的技术可行性、提出实现方案、负责代码编写和功能实现。你精通前后端开发技术和最佳实践。请用务实高效的开发语言发言。",
    AgentRole.MONITOR: "你是团队的DevOps工程师。你的职责是评估部署风险、监控系统性能、提出CI/CD和运维建议。你熟悉容器化、部署流水线和性能调优。请用严谨细致的语言发言。",
    AgentRole.REVIEWER: "你是团队的QA工程师。你的职责是审查代码质量、编写测试用例、发现潜在bug和安全漏洞、提出改进建议。你精通代码审查和测试方法论。请用客观公正的语言发言。",
    AgentRole.COORDINATOR: "你是团队的项目经理。你的职责是协调开发各方意见、整合技术方案、跟踪项目进度、管理风险和依赖。请用简明果断的语言发言。",
}

# 各AgentRole在协调器中实际可用的工具集（与AgentToolset权限对齐）
AGENT_ROLE_TOOLS = {
    AgentRole.CEO: {"read_file", "list_directory", "git_status"},
    AgentRole.PLANNER: {"read_file", "list_directory", "search_files", "grep_content", "git_status", "git_diff", "git_log"},
    AgentRole.EXECUTOR: {"read_file", "write_file", "edit_file", "list_directory", "bash", "git_status", "git_commit"},
    AgentRole.MONITOR: {"read_file", "write_file", "list_directory", "bash", "git_status", "git_commit"},
    AgentRole.REVIEWER: {"read_file", "list_directory", "bash", "grep_content", "run_tests", "run_linter", "git_status", "git_diff"},
    AgentRole.COORDINATOR: {"read_file", "list_directory", "git_status", "git_log", "create_document"},
}

logger = logging.getLogger("meeting_coordinator")


def _build_task_approval_message(approved: bool, reason: str) -> str:
    """构造任务执行审批结果消息（显式区分通过/拒绝，避免空 reason 误报通过）。"""
    if approved:
        return (
            f"项目经理：任务执行审批通过（{reason}）。"
            if reason
            else "项目经理：任务执行审批通过。"
        )
    return (
        f"项目经理：任务执行审批被拒绝（{reason}）。"
        if reason
        else "项目经理：任务执行审批被拒绝。"
    )


def _build_approval_send_fn(on_message: Callable[[str, str, str], Awaitable[None]]) -> Callable[[dict], Awaitable[None]]:
    """构造审批请求推送回调：透传完整结构化 payload，kind='approval' 标记结构化通道。

    前端审批面板只识别 type == 'human_approval_request' 的完整结构化消息，
    因此这里不再把 payload 降级为聊天文本；由上层发送包装点
    （CeoAgent._send_fn）在检测到 kind='approval' + dict 内容时直接透传完整消息。
    """
    return lambda payload: on_message("coordinator", payload, "approval")


async def _noop_on_message(*args, **kwargs) -> None:
    """异步空操作 on_message 兜底：无 _on_message 时静默丢弃审批推送。"""
    return None


class MeetingCoordinator:
    def __init__(
        self,
        meeting_session: MeetingSession,
        provider: str,
        model_name: str,
        api_key: str,
        base_url: str = "",
        data_dir: str = "data",
        workspace=None,
        agent_pool: Optional[AgentPool] = None,
        max_iterations: int = 3,
        workflow_engine: Optional[WorkflowEngine] = None,
        approval_manager: Optional[ApprovalManager] = None,
        approval_timeout: float = 300.0,
        asset_context_builder: Optional[Callable[[str, str, list | None], str]] = None,
        consensus_strategy: ConsensusStrategy = ConsensusStrategy.SIMPLE_MAJORITY,
    ):
        self._max_iterations = max_iterations
        self._approval_manager = approval_manager
        self._approval_timeout = approval_timeout
        self._asset_context_builder = asset_context_builder
        self.meeting = meeting_session
        self.provider = provider
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url

        from tool_registry import ToolRegistry
        from tool_executor import ToolExecutor

        if workspace:
            self._tool_registry = ToolRegistry()
            self._tool_executor = ToolExecutor(
                registry=self._tool_registry,
                workspace_root=workspace.root_path,
            )
            self._workspace = workspace
        else:
            self._tool_registry = None
            self._tool_executor = None
            self._workspace = None

        # ModelManager：模型生命周期管理
        from model_manager import ModelManager
        self._model_manager = ModelManager(
            provider=provider,
            api_key=api_key,
            base_url=base_url or "",
            model_name=model_name or "",
            agent_pool=agent_pool,
        )
        self._tasks: List[Dict[str, Any]] = []
        self._on_message: Optional[Callable[[str, str, str], Awaitable[None]]] = None
        self._current_on_message: Optional[Callable[[str, str, str], Awaitable[None]]] = None
        self.logger = logging.getLogger("meeting_coordinator")
        self.agenda = AgendaStateMachine()
        self.negotiation = NegotiationEngine(consensus_strategy)

        # DynamicRouter 初始化
        routing_table_path = os.path.join(data_dir, "routing_table.json")
        self._ensure_default_routing_table(routing_table_path)
        self.router = DynamicRouter(routing_table_path)
        # 注入 AgentProfileManager 到路由器（技能等级加权）
        try:
            from agent_profile_manager import AgentProfileManager
            self.router.set_profile_manager(AgentProfileManager(os.path.join(data_dir, "agent_profiles")))
        except Exception:
            pass

        # RoutingStatsManager：路由统计管理
        from routing_stats_manager import RoutingStatsManager
        self._routing_stats = RoutingStatsManager(self.router)

        # PlannerAgent 用于生成结构化验收反馈
        self.planner = PlannerAgent(name="coordinator_planner")

        # WorkflowEngine 初始化（可由外部注入共享实例，保证 REST 可管理会议工作流）
        # 仅当本地自建引擎时才注册执行器与回调，避免多个 coordinator 注入同一共享引擎时
        # 发生 last-wins 覆盖（共享引擎由 server 统一注册委托执行器）
        self.workflow_engine = workflow_engine or WorkflowEngine()
        if not workflow_engine:
            self._setup_workflow_engine()

        # WhyBuddy化：实例化拆分后的子模块
        self._semantic_analyzer = SemanticAnalyzer(
            router=self.router,
            get_model_fn=self._get_model,
            meeting_agents=self.meeting.agents,
        )
        self._task_orchestrator = TaskOrchestrator(
            get_model_fn=self._get_model,
            meeting=self.meeting,
            router=self.router,
            workspace_root=workspace.root_path if workspace else None,
        )
        self._review_pipeline = ReviewPipeline(
            get_model_fn=self._get_model,
            meeting=self.meeting,
            planner=self.planner,
            on_model_error=self._mark_model_failed,
        )
        self._discussion_manager = DiscussionManager(
            agenda=self.agenda,
            negotiation=self.negotiation,
            get_model_fn=self._get_model,
            meeting=self.meeting,
        )
        
        # 混合位置讨论引擎（支持本地/远端Agent并行讨论）
        self._mixed_discussion: Optional[MixedLocationDiscussion] = None

    @property
    def _agent_pool(self):
        """Agent pool（委托给 ModelManager）"""
        return self._model_manager._agent_pool

    @_agent_pool.setter
    def _agent_pool(self, value):
        self._model_manager._agent_pool = value

    @property
    def _models(self) -> Dict[str, Agent]:
        """模型缓存（委托给 ModelManager，保持向后兼容）"""
        return self._model_manager._models

    @property
    def _model_pool_ids(self) -> Dict[str, str]:
        """模型池 ID 映射（委托给 ModelManager，保持向后兼容）"""
        return self._model_manager._model_pool_ids

    @property
    def _task_routing(self) -> Dict[str, str]:
        """任务路由映射（委托给 RoutingStatsManager，保持向后兼容）"""
        return self._routing_stats._task_routing

    @_task_routing.setter
    def _task_routing(self, value):
        self._routing_stats._task_routing = value

    @property
    def last_routing_decision(self):
        """委托到 SemanticAnalyzer 的路由决策"""
        return self._semantic_analyzer.last_routing_decision

    def _setup_workflow_engine(self):
        """配置 WorkflowEngine 的节点执行器和回调函数（委托给 coordinator_workflow）"""
        from coordinator_workflow import setup_workflow_engine
        setup_workflow_engine(self)

    async def _run_agent_execution_loop(self, model, prompt, agent_toolset, max_tool_rounds=5, on_model_error=None):
        """LLM + 工具执行循环（委托给 coordinator_workflow）"""
        from coordinator_workflow import run_agent_execution_loop
        return await run_agent_execution_loop(self, model, prompt, agent_toolset, max_tool_rounds, on_model_error)

    @staticmethod
    def _extract_tool_calls_from_text(text: str) -> List[Dict[str, Any]]:
        """从 LLM 文本提取工具调用 JSON（委托给 coordinator_workflow）"""
        from coordinator_workflow import extract_tool_calls_from_text
        return extract_tool_calls_from_text(text)

    async def _execute_workflow_node(self, node: WorkflowNode, input_data: dict) -> dict:
        """执行工作流节点（委托给 coordinator_workflow）"""
        from coordinator_workflow import execute_workflow_node
        return await execute_workflow_node(self, node, input_data)

    async def _run_node_gate(self, node: WorkflowNode) -> Optional[dict]:
        """节点把关（委托给 coordinator_workflow）"""
        from coordinator_workflow import run_node_gate
        return await run_node_gate(self, node)

    async def _on_workflow_status_change(self, execution):
        """工作流状态变化回调（委托给 coordinator_workflow）"""
        from coordinator_workflow import on_workflow_status_change
        await on_workflow_status_change(self, execution)

    async def _on_workflow_node_status_change(self, execution, node_id):
        """工作流节点状态变化回调（委托给 coordinator_workflow）"""
        from coordinator_workflow import on_workflow_node_status_change
        await on_workflow_node_status_change(self, execution, node_id)

        if self._on_message:
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            status_text = f"工作流节点 {node_id} 状态变更: {status_value}"
            await self._on_message(
                ceo_id, status_text, "",
                msg_type="workflow_node_status_update",
                node_id=node_id,
                status=status_value,
            )

    def _create_model(self, role: AgentRole) -> Agent:
        """委托给 ModelManager"""
        return self._model_manager._create_model(role)

    def _get_model(self, role: AgentRole) -> Agent:
        """委托给 ModelManager"""
        return self._model_manager.get_model(role)

    def _mark_model_failed(self, role: AgentRole) -> None:
        """委托给 ModelManager"""
        self._model_manager.mark_failed(role)

    def _safe_mark_model_failed(self, role: AgentRole) -> None:
        """委托给 ModelManager"""
        self._model_manager.safe_mark_failed(role)

    async def decompose_task(self, task_description: str) -> List[Dict[str, Any]]:
        planner = self._get_model(AgentRole.PLANNER)
        prompt = (
            f"请将以下任务分解为多个子任务，以JSON数组格式返回。"
            f"每个子任务包含 name(名称)、description(描述)、priority(优先级：high/medium/low)、"
            f"dependencies(依赖的子任务名称列表)。\n\n"
            f"任务：{task_description}\n\n"
            f"请只返回JSON数组，不要其他内容。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await planner.reply(msg)
            text = _extract_text(response)
        except Exception as e:
            self.logger.warning("任务分解 LLM 调用失败: %s", e)
            self._safe_mark_model_failed(AgentRole.PLANNER)
            text = "[]"

        try:
            subtasks = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            subtasks = [
                {
                    "name": task_description[:50],
                    "description": task_description,
                    "priority": "high",
                    "dependencies": [],
                }
            ]

        for i, subtask in enumerate(subtasks):
            subtask["id"] = str(uuid.uuid4())[:8]

        self._tasks = subtasks
        return subtasks

    async def run_discussion(
        self,
        topic: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        max_rounds: int = 2,
        team: Optional[Team] = None,
    ) -> List[Dict[str, str]]:
        """运行多角色讨论（委托给 coordinator_discussion）"""
        from coordinator_discussion import run_discussion
        return await run_discussion(self, topic, on_message, max_rounds, team)

    def _find_agent_id(self, role: AgentRole) -> Optional[str]:
        for a in self.meeting.agents:
            if a.role == role:
                return a.id
        return None

    async def _msg(self, agent_id: str, text: str) -> None:
        """发送消息给前端并记录到会议"""
        if self._current_on_message:
            await self._current_on_message(agent_id, text, "")
        self.meeting.add_message("agent", text, agent_id)

    def _resolve_agent(self, agent_id: str) -> Optional['MeetingAgentInfo']:
        """解析Agent ID，支持多种格式（直接ID、带前缀、不带前缀）"""
        if not agent_id:
            return None
        # 直接匹配
        agent = self.meeting.get_agent(agent_id)
        if agent:
            return agent
        # 尝试加 "agent-" 前缀
        if not agent_id.startswith("agent-"):
            agent = self.meeting.get_agent(f"agent-{agent_id}")
            if agent:
                return agent
        # 尝试去掉 "agent-" 前缀
        if agent_id.startswith("agent-"):
            agent = self.meeting.get_agent(agent_id[len("agent-"):])
            if agent:
                return agent
        # 按角色名匹配
        for a in self.meeting.agents:
            if a.role.value == agent_id:
                return a
        return None

    @staticmethod
    def _estimate_task_complexity(task_description: str) -> int:
        """估算任务复杂度（1-5），用于匹配 agent 技能等级"""
        lower = task_description.lower()
        score = 1
        # 多步骤/跨领域关键词 → 提升复杂度
        complex_signals = ['首先', '然后', '最后', '前端', '后端', '数据库', '部署',
                           '架构', '设计', '重构', '优化', 'first', 'then', 'finally',
                           'frontend', 'backend', 'database', 'deploy', 'architecture']
        score += sum(1 for kw in complex_signals if kw in lower)
        # 多文件/多模块信号
        if any(kw in lower for kw in ['多个', '多个文件', '多个模块', 'all files', 'entire']):
            score += 1
        return min(5, max(1, score))

    def _find_best_agent_for_task(self, task_description: str):
        """根据任务内容和复杂度选择最有能力执行的Agent

        晋升驱动分配策略：
        - 简单任务（complexity ≤ 2）：倾向分配给初级 agent（需要积累 XP）
        - 复杂任务（complexity ≥ 4）：倾向分配给高级 agent（能力匹配）
        - 中等任务：按技能等级加权自然选择
        """
        task_lower = task_description.lower()
        task_complexity = self._estimate_task_complexity(task_description)

        needs_write = any(kw in task_lower for kw in [
            '写', '创作', '生成', '编写', '撰写', 'write', 'create', 'generate',
            '文件', '代码', '文章', '小说', '剧本', 'file', 'code',
        ])
        needs_review = any(kw in task_lower for kw in [
            '审查', '审核', '校对', 'review', 'edit', '检查', '质量',
        ])

        from agent_toolset import load_roles_config
        config = load_roles_config()
        all_roles = {**config.get("base_roles", {}), **config.get("custom_roles", {})}

        profile_mgr = None
        try:
            from agent_profile_manager import AgentProfileManager
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            profile_mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        except Exception:
            pass

        candidates = []
        for agent in self.meeting.agents:
            if agent.role == AgentRole.CEO:
                continue
            tools = self._get_agent_tools(agent)
            role_config_id = agent.id.replace("agent-", "") if agent.id.startswith("agent-") else agent.id
            role_cfg = all_roles.get(role_config_id, {})
            skills = set(role_cfg.get("skills", []))
            score = 0

            # 基础能力匹配
            if needs_write:
                if "write_file" in tools:
                    score += 10
                if "content_writing" in skills or "script_writing" in skills:
                    score += 5
                if agent.role == AgentRole.EXECUTOR:
                    score += 3
            elif needs_review:
                if "edit_file" in tools:
                    score += 5
                if agent.role == AgentRole.REVIEWER:
                    score += 5
            else:
                if agent.role == AgentRole.EXECUTOR:
                    score += 5

            # 技能等级加权 + 晋升驱动分配
            if profile_mgr:
                try:
                    profile = profile_mgr.get_profile(agent.id)
                    if profile:
                        max_skill_level = 0
                        for skill_id in skills:
                            sp = profile.skill_progress.get(skill_id, {})
                            level = sp.get("level", 0) if isinstance(sp, dict) else 0
                            if level > max_skill_level:
                                max_skill_level = level

                        if task_complexity <= 2:
                            # 简单任务：初级 agent 优先（需要 XP），高级 agent 减分
                            if max_skill_level <= 1:
                                score += 5  # 初级 agent 加分
                            elif max_skill_level >= 3:
                                score -= 3  # 高级 agent 减分（XP 衰减，不浪费）
                        elif task_complexity >= 4:
                            # 复杂任务：高级 agent 优先
                            score += max_skill_level * 4  # 每级 +4 分（比默认更激进）
                        else:
                            # 中等任务：正常技能等级加权
                            score += max_skill_level * 3
                except Exception:
                    pass

            candidates.append((agent, score))

        if not candidates:
            return None
        candidates.sort(key=lambda x: x[1], reverse=True)
        best_agent, best_score = candidates[0]
        self.logger.info("能力匹配: 选择 %s (score=%d, complexity=%d)", best_agent.id, best_score, task_complexity)
        return best_agent

    def _get_agent_tools(self, agent) -> set:
        """获取Agent实际可用的工具集。优先使用AGENT_ROLE_TOOLS，回退到角色配置。"""
        role_tools = AGENT_ROLE_TOOLS.get(agent.role)
        if role_tools is not None:
            return role_tools
        # 仅当AgentRole不在AGENT_ROLE_TOOLS中时，才从角色配置获取
        from agent_toolset import load_roles_config
        config = load_roles_config()
        all_roles = {**config.get("base_roles", {}), **config.get("custom_roles", {})}
        role_config_id = agent.id.replace("agent-", "") if agent.id.startswith("agent-") else agent.id
        role_cfg = all_roles.get(role_config_id, {})
        return set(role_cfg.get("permissions", {}).get("tools", []))

    def _agent_can_execute(self, agent, task_description: str) -> bool:
        """检查Agent是否有能力执行该任务"""
        task_lower = task_description.lower()
        needs_write = any(kw in task_lower for kw in [
            '写', '创作', '生成', '编写', '撰写', 'write', 'create', 'generate',
            '文件', '代码', '文章', '小说', '剧本', 'file', 'code',
        ])
        if not needs_write:
            return True
        tools = self._get_agent_tools(agent)
        return "write_file" in tools

    def _ensure_default_routing_table(self, path: str) -> None:
        """如果路由表文件不存在，自动创建默认路由表"""
        if os.path.isfile(path):
            return
        dir_name = os.path.dirname(path)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        default_table = {
            "departments": [
                {
                    "dept_id": "dept-frontend",
                    "dept_name": "前端开发组",
                    "capability_desc": "React/Vue/Angular 组件开发、HTML/CSS/JS、响应式布局、前端性能优化、浏览器兼容性",
                    "capability_keywords": ["前端", "frontend", "react", "vue", "angular", "html", "css", "javascript", "typescript", "组件", "页面", "UI", "界面", "样式"],
                    "tools": ["code_generator", "linter", "webpack", "vite"],
                    "success_rate": 0.88,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 10,
                },
                {
                    "dept_id": "dept-backend",
                    "dept_name": "后端开发组",
                    "capability_desc": "Python/Java/Go 后端服务开发、RESTful API 设计、数据库设计与优化、微服务架构",
                    "capability_keywords": ["后端", "backend", "api", "python", "java", "go", "数据库", "database", "服务", "server", "接口", "微服务"],
                    "tools": ["code_generator", "test_runner", "linter", "docker"],
                    "success_rate": 0.85,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 10,
                },
                {
                    "dept_id": "dept-fullstack",
                    "dept_name": "全栈开发组",
                    "capability_desc": "全栈 Web 应用开发、前后端联调、项目脚手架搭建、技术选型与集成",
                    "capability_keywords": ["全栈", "fullstack", "web", "开发", "开发", "应用", "项目", "脚手架", "搭建"],
                    "tools": ["code_generator", "test_runner", "linter", "webpack", "docker"],
                    "success_rate": 0.82,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 9,
                },
                {
                    "dept_id": "dept-qa",
                    "dept_name": "质量保障组",
                    "capability_desc": "单元测试、集成测试、E2E 测试、代码审查、性能测试、安全测试",
                    "capability_keywords": ["测试", "test", "QA", "质量", "审查", "review", "bug", "缺陷", "安全", "性能测试"],
                    "tools": ["test_runner", "coverage_tool", "linter", "security_scanner"],
                    "success_rate": 0.92,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 8,
                },
                {
                    "dept_id": "dept-devops",
                    "dept_name": "DevOps 运维组",
                    "capability_desc": "CI/CD 流水线、Docker 容器化、K8s 部署、监控告警、日志分析、性能调优",
                    "capability_keywords": ["部署", "deploy", "docker", "k8s", "kubernetes", "CI/CD", "运维", "监控", "日志", "性能", "服务器"],
                    "tools": ["docker", "k8s", "ci_cd", "monitoring"],
                    "success_rate": 0.87,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 7,
                },
                {
                    "dept_id": "dept-data",
                    "dept_name": "数据工程组",
                    "capability_desc": "数据清洗、ETL 流程、数据分析、机器学习模型、数据可视化",
                    "capability_keywords": ["数据", "data", "分析", "analysis", "机器学习", "ML", "AI", "模型", "可视化", "图表", "统计"],
                    "tools": ["data_cleaner", "statistical_analyzer", "ml_trainer", "chart_maker"],
                    "success_rate": 0.80,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 7,
                },
                {
                    "dept_id": "dept-docs",
                    "dept_name": "文档与演示组",
                    "capability_desc": "技术文档撰写、API 文档生成、README 编写、PPT 制作、演示材料准备",
                    "capability_keywords": ["文档", "document", "README", "PPT", "演示", "报告", "说明", "教程", "API文档"],
                    "tools": ["doc_writer", "ppt_generator", "api_doc_gen"],
                    "success_rate": 0.90,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 6,
                },
            ]
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(default_table, f, ensure_ascii=False, indent=2)
        self.logger.info("已创建默认路由表: %s", path)

    async def handle_critical_blocker(
        self,
        agent_id: str,
        content: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> None:
        self.agenda.declare_emergency(f"Critical blocker from {agent_id}")

        planner_id = None
        for a in self.meeting.agents:
            if a.role == AgentRole.PLANNER:
                planner_id = a.id
                break

        if planner_id:
            self.agenda.force_token(planner_id, "emergency response")
            model = self._get_model(AgentRole.PLANNER)
            prompt = (
                f"紧急情况！{agent_id}报告了关键阻塞问题：\n{content}\n\n"
                f"请作为规划者提出应急解决方案（2-3句话）。"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            try:
                response = await model.reply(msg)
                text = _extract_text(response)
            except Exception as e:
                self.logger.warning("紧急响应LLM调用失败: %s", e)
                self._safe_mark_model_failed(AgentRole.PLANNER)
                text = LLM_FALLBACK_TEMPLATE.format(role="planner", content_type="应急方案")
            await self._msg(planner_id, text)
            self.meeting.add_message("agent", text, planner_id)

        if hasattr(self.agenda, 'resolveEmergency'):
            self.agenda.resolveEmergency()
        else:
            self.agenda.resolve_emergency()

    async def assign_tasks(
        self, subtasks: List[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        if subtasks is None:
            subtasks = self._tasks

        assignments = []

        for subtask in subtasks:
            task_text = (subtask.get("name", "") + " " + subtask.get("description", "")).lower()

            if "前端" in task_text or "frontend" in task_text:
                agent_id = "agent-executor"
            elif "监控" in task_text or "monitor" in task_text:
                agent_id = "agent-monitor"
            elif "审查" in task_text or "review" in task_text or "测试" in task_text or "test" in task_text:
                agent_id = "agent-reviewer"
            else:
                agent_id = "agent-executor"

            task = self.meeting.add_task(agent_id, subtask.get("description", ""))
            self.meeting.update_task_status(task.id, "assigned")
            self.meeting.update_agent_status(agent_id, MeetingAgentStatus.WORKING)

            assignments.append({
                "task_id": task.id,
                "agent_id": agent_id,
                "subtask": subtask,
            })

        self._tasks = subtasks or self._tasks
        return assignments

    async def execute_assigned_tasks(self) -> List[Dict[str, Any]]:
        """执行已分配的任务（委托给TaskOrchestrator）

        WhyBuddy化：委托给TaskOrchestrator。
        """
        return await self._task_orchestrator.execute(on_progress=self._on_message)

    def _update_routing_stats(self) -> None:
        """委托给 RoutingStatsManager"""
        self._routing_stats.update_stats(self.meeting.tasks)

    def _update_routing_stats_safe(self) -> None:
        """委托给 RoutingStatsManager"""
        self._routing_stats.update_stats_safe(self.meeting.tasks)

    async def _update_injected_rule_effectiveness(
        self, coordinator_id: str, injected_rule_ids: List[str], review_result: Dict[str, Any]
    ) -> None:
        """根据审查结果更新已注入规则的有效性评分，降级时发出告警"""
        try:
            from experience_extractor import ExperienceExtractor
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
            structured = review_result.get("structured_feedback", {})
            task_success = structured.get("status", "approved") == "approved"
            demoted_rules = []
            for rule_id in injected_rule_ids:
                before = extractor._load_rule(rule_id)
                before_status = before.status if before else None
                extractor.update_rule_effectiveness(rule_id, task_success)
                after = extractor._load_rule(rule_id)
                if before_status == "approved" and after and after.status == "pending_review":
                    demoted_rules.append(after)
            self.logger.info("已更新 %d 条注入规则有效性 (success=%s, demoted=%d)",
                             len(injected_rule_ids), task_success, len(demoted_rules))
            # 降级告警
            if demoted_rules:
                alert_lines = [f"⚠️ 规则自动降级告警（{len(demoted_rules)} 条）："]
                for r in demoted_rules:
                    alert_lines.append(
                        f"  - [{r.rule_id[:8]}] {r.trigger_condition} → {r.action}"
                        f"  (score={r.effectiveness_score:.0%}, {r.success_count}/{r.usage_count})"
                    )
                alert_lines.append("已退回待审核队列，请检查并决定是否重新批准。")
                alert_text = "\n".join(alert_lines)
                await self._msg(coordinator_id, alert_text)
                self.meeting.add_message("agent", alert_text, coordinator_id)
                self.meeting.append_event(
                    SessionEventType.RULE_DEMOTION,
                    content=alert_text,
                    agent_id=coordinator_id, phase="post_execution",
                )
        except Exception as e:
            self.logger.debug("规则有效性更新跳过: %s", e)

    def _grant_task_xp(self, agent_id, skill_id, task_success, review_score, task_complexity, department: str = ""):
        """任务完成后授予 XP"""
        try:
            from agent_profile_manager import AgentProfileManager
            mgr = getattr(self, '_agent_profile_manager', None)
            if mgr is None:
                data_dir = os.path.join(os.path.dirname(__file__), "data")
                mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
            profile = mgr.get_or_create(agent_id, agent_id, department=department)
            from agent_toolset import load_roles_config
            roles_config = load_roles_config()
            skill_config = roles_config.get("skills", {}).get(skill_id, {"xp_thresholds": [100, 300, 600]})
            result = mgr.grant_xp(agent_id, skill_id, task_success, review_score, task_complexity, skill_config)
            if result.get("leveled_up"):
                self.logger.info("Agent %s 技能 %s 升级到 Lv.%d", agent_id, skill_id, result["new_level"])
            # 检查晋升（使用部门职业路径）
            from promotion_engine import PromotionEngine
            engine = PromotionEngine()
            profile = mgr.get_profile(agent_id)
            promotion = engine.check_promotion(profile, roles_config)
            if promotion:
                engine.apply_promotion(profile, promotion)
                mgr.save_profile(profile)
                result["promoted_to"] = promotion
                self.logger.info("Agent %s 晋升为 %s (%s)", agent_id, promotion["title"], promotion["stage"])
            return result
        except Exception as e:
            self.logger.debug("grant-xp 跳过: %s", e)
            return {"xp_gained": 0}

    def _finalize_skill_evolution(
        self,
        extractor,
        packager,
        project_id: str,
    ) -> Dict[str, Any]:
        """技能闭环自动触发：审核 pending 规则 → 写增量区 → 打包升级版技能包

        Returns:
            {"approved": int, "written": int, "packaged": List[str]}
        """
        result: Dict[str, Any] = {"approved": 0, "written": 0, "packaged": []}
        # abspath 归一化 __file__（pytest 下可能带 "tests/.." 前缀，需先解析再取上层目录）
        skill_packs_root = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skill_packs"
        )

        pending = extractor.get_pending_rules()
        for rule in pending:
            source = getattr(rule, "source_task_id", None)
            if source and source != project_id:
                continue  # 跳过其他项目的规则，防跨项目污染
            if not extractor.approve_rule(rule.rule_id):
                continue
            result["approved"] += 1
            approved_rule = extractor._load_rule(rule.rule_id)
            if approved_rule and extractor.write_to_incremental_area(approved_rule):
                result["written"] += 1
                for kw in approved_rule.keywords or []:
                    base_skill = os.path.join(skill_packs_root, kw)
                    if os.path.isdir(base_skill) and kw not in result["packaged"]:
                        packager.full_package(
                            base_skill_path=base_skill,
                            incremental_path=extractor._incremental_dir,
                            project_id=project_id,
                            skill_name=kw,
                        )
                        result["packaged"].append(kw)
        return result

    @staticmethod
    def _build_execution_artifact_text(
        exec_results: List[Dict[str, Any]],
        max_summary_len: int = 400,
    ) -> str:
        """构建 artifact 模式的执行结果文本：文件清单 + 截断摘要（轻量引用，降低 LLM 上下文放大）"""
        parts: List[str] = []
        for r in exec_results:
            written = r.get("written_files") or []
            files_line = f"[文件清单] {', '.join(written)}" if written else "[文件清单] (无)"
            summary = (r.get("result") or "")[:max_summary_len]
            parts.append(f"{files_line}\n[摘要] {summary}")
        return "\n\n".join(parts)

    async def execute_and_review_task(
        self,
        task_description: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """执行任务并审查（委托给ReviewPipeline）

        WhyBuddy化：审查逻辑委托给ReviewPipeline，自动激活CriticAgent和GroundingAgent。

        本路径同样接入确定性门禁：review 调用前对工作区运行 _run_deterministic_gate，
        测试/lint 真实失败强制 revision_required；工具缺失（基础设施不可用）由门禁
        fail-open 记为 skipped，不触发 revision_required。

        Returns:
            Tuple[审查结果, 执行结果列表]
        """
        task_results = await self.execute_assigned_tasks()
        for task_result in task_results:
            await on_message(task_result["agent_id"], task_result["result"], "")

        review_result = {}
        if task_results:
            execution_result = self._build_execution_artifact_text(task_results)
            # 确定性门禁：与开发循环一致，门禁内部为同步 subprocess（lint/test），
            # 通过 asyncio.to_thread 卸载到线程池，避免阻塞事件循环。
            gate_result = await asyncio.to_thread(
                self._run_deterministic_gate,
                self._workspace.root_path if self._workspace else None,
            )
            review_result = await self._review_pipeline.review(
                task_description, execution_result, on_message, gate_result=gate_result
            )

        return review_result, task_results

    # 工具缺失信号（通道感知 + 工具特定）：门禁只跑 run_linter（pylint）与 run_tests（pytest）
    # 两个工具，故 error 通道只匹配这两个工具的缺失文本，不做通用匹配。
    # error 通道承载 spawn OSError / import stderr（实测 _exec_run_tests 在 python -m pytest
    # 缺模块且 pytest 不在 PATH 时 error 为 "[Errno 2] No such file or directory: 'pytest'"，
    # _exec_run_linter 在 python -m pylint 缺模块时 error 为 "<python路径>: No module named pylint"）；
    # output 通道承载命令 stdout（真实检查失败、未收集到测试均出现在此处）。
    # 工具特定匹配使 conftest/插件导入错误（如 "ModuleNotFoundError: No module named foo"）
    # 门禁信号常量（保留向后兼容，实际逻辑委托给 GateEngine）
    _GATE_ERROR_CHANNEL_SIGNALS = (
        "no module named pytest",
        "no module named pylint",
        "no such file or directory: 'pytest'",
        "no such file or directory: 'pylint'",
    )
    _GATE_OUTPUT_CHANNEL_SIGNALS = (
        "no tests were collected",
        "no tests ran",
    )

    @staticmethod
    def _gate_check_unavailable(error: str, output: str) -> bool:
        """委托给 GateEngine"""
        from gate_engine import GateEngine
        return GateEngine._check_unavailable(error, output)

    def _run_deterministic_gate(self, workspace_root: Optional[str] = None) -> Dict[str, Any]:
        """确定性门禁：委托给 GateEngine

        Returns:
            {"passed": bool, "failures": List, "skipped": List}
        """
        from gate_engine import GateEngine
        engine = GateEngine()
        return engine.run_gate(workspace_root)

    async def semantic_analyze(self, user_message: str, team_id: str = "") -> SemanticAnalysisResult:
        """语义分析用户消息（委托给SemanticAnalyzer，带缓存）

        team_id 非空时绕过缓存：缓存键不含 team_id（llm_cache key = md5(role:model:prompt)），
        同消息跨团队 TTL 命中会返回带旧 team_id 的结果（M4 注入 seam 跨团队资产泄漏）——
        team_id 场景每次实时分析（文档模式为确定性短路，无 LLM 成本）。
        """
        if team_id:
            return await self._semantic_analyzer.analyze(user_message, team_id=team_id)

        from llm_cache import llm_cache
        cached = llm_cache.get(user_message, role="semantic_analyze", model=self.model_name)
        if cached is not None:
            self.logger.info("语义分析命中缓存: %s", user_message[:50])
            return cached

        result = await self._semantic_analyzer.analyze(user_message, team_id=team_id)
        llm_cache.put(user_message, result, role="semantic_analyze", model=self.model_name)
        return result

    async def auto_assign_task(
        self,
        task_description: str,
        target_agent_id: str,
        reason: str,
    ) -> Dict[str, Any]:
        agent_info = self._resolve_agent(target_agent_id)

        # 验证解析到的Agent是否有能力执行任务（如写作任务需要write_file）
        if agent_info and not self._agent_can_execute(agent_info, task_description):
            self.logger.info("Agent %s 缺少执行能力，重新选择", agent_info.id)
            better = self._find_best_agent_for_task(task_description)
            if better:
                agent_info = better
                target_agent_id = better.id

        if agent_info is None:
            agent_info = self._find_best_agent_for_task(task_description)
            if agent_info:
                target_agent_id = agent_info.id
            else:
                for agent in self.meeting.agents:
                    if agent.role != AgentRole.CEO:
                        target_agent_id = agent.id
                        agent_info = agent
                        break

        task = self.meeting.add_task(target_agent_id, task_description)
        self.meeting.update_task_status(task.id, "assigned")
        self.meeting.update_agent_status(target_agent_id, MeetingAgentStatus.WORKING)

        # 记录路由部门，用于后续统计更新
        routing = self.last_routing_decision
        if routing and routing.selected_dept:
            self._task_routing[task.id] = routing.selected_dept
            self._routing_stats.track_task(task.id, routing.selected_dept)

        ceo_id = self._find_agent_id(AgentRole.CEO)
        if ceo_id:
            self.meeting.add_message(
                "agent",
                f"CEO分析：{reason}。已将任务分配给{target_agent_id}。",
                ceo_id,
            )

        return {
            "task_id": task.id,
            "agent_id": target_agent_id,
            "description": task_description,
            "reason": reason,
            "status": "assigned",
        }

    async def process_user_message(
        self,
        user_message: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        team_id: str = "",
    ) -> Dict[str, Any]:
        """
        处理用户消息（编排方法，协调各阶段子流程）

        架构说明：
        - CEO（主智能体）只负责团队创建和任务交接
        - COORDINATOR（团队负责人）接管所有内部流程管理
        """
        self._on_message = on_message
        self._current_on_message = on_message

        ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR) or "agent-coordinator"

        # CEO 交接
        await self._msg(ceo_id, f"CEO：收到任务「{user_message[:50]}...」，已交给项目经理处理。")

        # 需求确认 + 语义分析
        await self._msg(coordinator_id, f"项目经理：收到需求，正在确认细节。\n需求概述：{user_message[:100]}\n正在分析需求复杂度和团队配置...")
        analysis = await self.semantic_analyze(user_message, team_id=team_id)
        await self._announce_analysis(coordinator_id, analysis)
        await self._announce_plan(coordinator_id)

        # 1. 工作流模式
        if analysis.is_workflow and analysis.workflow_definition:
            return await self._run_workflow_mode(analysis, coordinator_id, on_message)

        # 2. 串行流程：讨论 → 投票 → 分派 → 审批 → 执行 → 审查
        topic = (analysis.discussion_topic.strip() if analysis.discussion_topic else "") or user_message
        await self._msg(coordinator_id, f"项目经理：组织团队讨论「{topic[:30]}...」")
        team = getattr(self, '_team', None)
        discussion_results = await self.run_discussion(topic, on_message, team=team)

        original_description = analysis.task_description or user_message
        enhanced_description = self._enhance_task_description(original_description, discussion_results)
        enhanced_description, injected_rule_ids = await self._inject_experience(coordinator_id, original_description, enhanced_description, discussion_results)
        await self._msg(coordinator_id, "项目经理：已整合团队讨论结果，任务描述已更新。")

        target_agent_id = analysis.target_agent_id or self._infer_target_agent(discussion_results) or "agent-executor"

        # 投票
        vote_passed = await self._run_voting_phase(coordinator_id, enhanced_description, discussion_results, on_message)
        if not vote_passed:
            return {"type": "vote_rejected"}

        # 分派
        await self._msg(coordinator_id, f"项目经理：将任务分派给{target_agent_id}执行。")
        assign_result = await self.auto_assign_task(enhanced_description, target_agent_id, analysis.reason)

        # 审批
        await self._run_approval_phase(coordinator_id, target_agent_id, enhanced_description, on_message)

        # 执行 + 审查循环
        await self._msg(coordinator_id, "项目经理：监督任务执行和质量审查。")
        discussion_context = self._extract_discussion_decisions(discussion_results)
        execution_results, review_result, review_report = await self._run_dev_loop(
            coordinator_id, enhanced_description, discussion_context, on_message,
        )

        # 总结 + 技能进化
        self._update_routing_stats_safe()
        project_summary = self._generate_project_summary(
            user_message, analysis, discussion_results, assign_result, review_result, execution_results,
        )
        await self._msg(coordinator_id, "项目经理：已生成项目总结报告。")
        await self._msg(coordinator_id, project_summary)
        await self._run_skill_evolution(coordinator_id, user_message, discussion_results, review_result, execution_results)

        # 更新已注入规则的有效性评分（降级时发出告警）
        if injected_rule_ids:
            await self._update_injected_rule_effectiveness(coordinator_id, injected_rule_ids, review_result)

        # 汇报
        await self._msg(coordinator_id, "项目经理：任务执行完成，向CEO汇报结果。")
        await self._msg(ceo_id, "CEO：收到项目经理汇报，任务已完成。")
        if review_report.total_iterations > 0:
            await on_message(coordinator_id, f"[审查报告] 共 {review_report.total_iterations} 轮，最终状态: {review_report.final_status}，累计发现 {review_report.total_issues_found} 个问题", "")

        return {
            "type": "serial_completed",
            "analysis": semantic_analysis_to_dict(analysis),
            "discussion_results": discussion_results,
            "assignment": assign_result,
            "review_result": review_result,
            "execution_results": execution_results,
            "project_summary": project_summary,
            "review_report": review_report.to_dict(),
            "injected_rule_ids": injected_rule_ids,
        }

    # ── process_user_message 子流程 ──

    async def _announce_analysis(self, coordinator_id, analysis):
        text = (
            f"项目经理分析：\n"
            f"• 意图：{analysis.intent}\n"
            f"• 复杂度：{'高（需要多部门协作）' if analysis.is_workflow else '中（单部门执行）'}\n"
            f"• 预计工作量：将根据任务复杂度动态调整\n"
        )
        if analysis.is_task:
            text += f"• 指派给：{analysis.target_agent_id}\n• 理由：{analysis.reason}"
        else:
            text += f"• 讨论主题：{analysis.discussion_topic}"
        await self._msg(coordinator_id, text)
        self.meeting.add_message("agent", text, coordinator_id)

    async def _announce_plan(self, coordinator_id):
        text = (
            "项目经理：制定项目计划。\n"
            "阶段1：需求分析与讨论\n阶段2：任务分配与执行\n"
            "阶段3：质量审查与验收\n阶段4：交付与总结"
        )
        await self._msg(coordinator_id, text)
        self.meeting.add_message("agent", text, coordinator_id)

    async def _run_workflow_mode(self, analysis, coordinator_id, on_message):
        text = (
            f"项目经理：检测到跨部门复杂任务，已创建工作流。\n"
            f"工作流名称：{analysis.workflow_definition.name}\n"
            f"节点数量：{len(analysis.workflow_definition.nodes)}\n"
            f"执行策略：{analysis.workflow_definition.execution_strategy}"
        )
        await self._msg(coordinator_id, text)
        self.meeting.add_message("agent", text, coordinator_id)
        workflow_result = await self._execute_workflow(analysis.workflow_definition, on_message)
        return {"type": "workflow_executed", "analysis": semantic_analysis_to_dict(analysis), "workflow_result": workflow_result}

    async def _inject_experience(self, coordinator_id, original_description, enhanced_description, discussion_results):
        """注入历史经验到任务描述，返回 (增强描述, 注入的规则 ID 列表)"""
        injected_rule_ids = []
        try:
            from experience_extractor import ExperienceExtractor
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
            task_type = extractor._infer_task_type(original_description)
            content_kw = extractor._extract_content_keywords(original_description)
            for dr in discussion_results:
                content_kw |= extractor._extract_content_keywords(dr.get("content", ""))
            past_rules = extractor.retrieve_relevant_rules(task_type, sorted(content_kw))
            if past_rules:
                injected = past_rules[:5]
                injected_rule_ids = [r.rule_id for r in injected]
                exp_context = extractor.build_experience_summary(injected)
                enhanced_description = f"{enhanced_description}\n\n{exp_context}"
                await self._msg(coordinator_id, f"项目经理：已注入 {len(injected)} 条历史经验到任务描述。")
                self.meeting.add_message("agent", f"项目经理：已注入 {len(injected)} 条历史经验到任务描述。", coordinator_id)
                self.meeting.append_event(
                    SessionEventType.EXPERIENCE_INJECTION,
                    content=f"注入 {len(injected)} 条经验规则 (task_type={task_type}, keywords={sorted(content_kw)[:5]}, rule_ids={injected_rule_ids})",
                    agent_id=coordinator_id, phase="pre_execution",
                )
        except Exception as e:
            self.logger.debug("历史经验注入跳过: %s", e)
        return enhanced_description, injected_rule_ids

    async def _run_voting_phase(self, coordinator_id, enhanced_description, discussion_results, on_message):
        await self._msg(coordinator_id, "项目经理：就讨论结果发起方案投票。")
        self.meeting.add_message("agent", "项目经理：就讨论结果发起方案投票。", coordinator_id)

        proposal = self.negotiation.create_proposal(coordinator_id, f"方案: {enhanced_description[:200]}")
        await on_message(coordinator_id, f"[提案] {proposal.content}", "")

        stance_by_agent = {}
        for dr in discussion_results:
            aid = dr.get("agent_id", dr.get("agentId", ""))
            if aid:
                stance_by_agent[aid] = dr

        for agent in self.meeting.agents:
            if agent.role in (AgentRole.CEO,):
                continue
            dr = stance_by_agent.get(agent.id, {})
            stance = dr.get("parsed_stance", dr.get("stance", "neutral"))
            confidence = dr.get("parsed_confidence", dr.get("confidence", 0.5))

            if stance == "oppose":
                vote_approve, vote_reason = False, f"{agent.role.value}反对方案（置信度{confidence:.0%}）"
            elif stance == "modify":
                vote_approve, vote_reason = True, f"{agent.role.value}有条件赞成（建议修改，置信度{confidence:.0%}）"
            elif stance == "support":
                vote_approve, vote_reason = True, f"{agent.role.value}赞成方案（置信度{confidence:.0%}）"
            else:
                vote_approve = confidence >= 0.4
                vote_reason = f"{agent.role.value}{'谨慎赞成' if vote_approve else '保留意见'}（置信度{confidence:.0%}）"

            self.negotiation.cast_vote(proposal.id, agent.id, vote_approve, reason=vote_reason)
            stance_enum = {"support": Stance.SUPPORT, "oppose": Stance.OPPOSE, "modify": Stance.MODIFY}.get(stance, Stance.NEUTRAL)
            arg_content = dr.get("content", "")[:200]
            if arg_content:
                self.negotiation.add_argument(proposal.id, agent.id, stance_enum, confidence, arg_content)
            await on_message(agent.id, f"[投票] {'赞成' if vote_approve else '反对'} - {vote_reason}", "")

        vote_result = self.negotiation.evaluate_consensus(proposal.id, strategy=self.negotiation._default_strategy)
        text = f"项目经理：投票结果 — {'通过' if vote_result.accepted else '未通过'} ({vote_result.approve_count}/{vote_result.total_votes})"
        await self._msg(coordinator_id, text)
        self.meeting.add_message("agent", text, coordinator_id)

        if not vote_result.accepted:
            await self._msg(coordinator_id, "项目经理：方案未获共识，任务终止。请重新描述需求。")
        return vote_result.accepted

    async def _run_approval_phase(self, coordinator_id, target_agent_id, enhanced_description, on_message):
        from approval_manager import classify_approval_tier, risk_classify
        tier = classify_approval_tier("task_execution", enhanced_description[:200])

        if tier == "auto_approve":
            await self._msg(coordinator_id, "项目经理：任务审批自动通过（白名单操作）。")
            self.meeting.add_message("agent", "项目经理：任务审批自动通过（白名单操作）。", coordinator_id)
        elif tier == "classifier":
            r = risk_classify("task_execution", enhanced_description[:200])
            text = f"项目经理：风险分类器判定 — {r['reason']}（风险分: {r['risk_score']:.2f}）。"
            await self._msg(coordinator_id, text)
            self.meeting.add_message("agent", text, coordinator_id)
        else:
            risk_keywords = ['rm -rf', 'chmod', 'drop table', 'delete', 'remove all', 'format']
            risk_level = 'high' if any(kw in enhanced_description.lower() for kw in risk_keywords) else 'medium'
            await self._msg(coordinator_id, f"项目经理：提交任务执行审批（风险等级: {risk_level}）。")
            self.meeting.add_message("agent", f"项目经理：提交任务执行审批（风险等级: {risk_level}）。", coordinator_id)

            if self._approval_manager:
                from protocol import RiskLevel
                risk_map = {"low": RiskLevel.LOW, "medium": RiskLevel.MEDIUM, "high": RiskLevel.HIGH, "critical": RiskLevel.CRITICAL}
                approval = await self._approval_manager.request_approval(
                    requester_id=target_agent_id, operation="task_execution",
                    description=enhanced_description[:200], risk_level=risk_map.get(risk_level, RiskLevel.MEDIUM),
                    confidence=0.8, send_fn=_build_approval_send_fn(on_message),
                )
                try:
                    decision = await self._approval_manager.wait_for_decision(approval.id, timeout=self._approval_timeout)
                except asyncio.TimeoutError:
                    decision = {"approved": True, "reason": "审批超时，默认通过"}
            else:
                decision = {"approved": True, "reason": "未配置审批管理器，自动通过"}

            approve_msg = _build_task_approval_message(decision.get("approved", True), decision.get("reason", ""))
            await self._msg(coordinator_id, approve_msg)
            self.meeting.add_message("agent", approve_msg, coordinator_id)

    async def _run_dev_loop(self, coordinator_id, enhanced_description, discussion_context, on_message):
        from review_pipeline import ReviewReport, ReviewIteration
        max_dev_iterations = self._max_iterations
        review_result = {}
        execution_results = []
        review_report = ReviewReport(task_id=coordinator_id)

        for dev_iter in range(1, max_dev_iterations + 1):
            await self._msg(coordinator_id, f"项目经理：第 {dev_iter} 轮开发，监督任务执行。")
            self.meeting.add_message("agent", f"项目经理：第 {dev_iter} 轮开发，监督任务执行。", coordinator_id)

            try:
                exec_results = await self.execute_assigned_tasks()
                execution_results = exec_results
                for er in exec_results:
                    await on_message(er["agent_id"], er["result"], "")
                    written = er.get("written_files", [])
                    if written:
                        await on_message(er["agent_id"], f"[第{dev_iter}轮] 已写入 {len(written)} 个文件: {', '.join(written)}", "")
            except Exception as e:
                self.logger.warning("第 %d 轮执行失败: %s", dev_iter, e)
                exec_results = []

            await self._msg(coordinator_id, f"项目经理：第 {dev_iter} 轮质量审查。")
            self.meeting.add_message("agent", f"项目经理：第 {dev_iter} 轮质量审查。", coordinator_id)
            execution_text = self._build_execution_artifact_text(exec_results) if exec_results else ""

            try:
                if exec_results:
                    gate_result = await asyncio.to_thread(self._run_deterministic_gate, self._workspace.root_path if self._workspace else None)
                else:
                    gate_result = None
                review_result = await self._review_pipeline.review(enhanced_description, execution_text, on_message, discussion_context=discussion_context, gate_result=gate_result)
            except Exception as e:
                self.logger.warning("第 %d 轮审查失败: %s", dev_iter, e)
                review_result = {"status": "skipped", "reason": str(e)}

            reviewer_feedback = review_result.get("reviewer_feedback", "")
            monitor_feedback = review_result.get("monitor_feedback", "")
            coordinator_summary = review_result.get("coordinator_summary", "")
            feedback_text = f"[审查反馈]\n{reviewer_feedback}\n\n[评估反馈]\n{monitor_feedback}\n\n[总结]\n{coordinator_summary}"
            structured = review_result.get("structured_feedback", {})
            feedback_status = structured.get("status", "approved")

            critic_result = review_result.get("critic_result", {})
            grounding_result = review_result.get("grounding_result", {})
            written_files = [f for er in exec_results for f in er.get("written_files", [])] if exec_results else []
            review_report.add_iteration(ReviewIteration(
                iteration=dev_iter, status=feedback_status,
                critic_severity=critic_result.get("severity", "unknown"), critic_findings=critic_result.get("findings", []),
                grounding_grounded=grounding_result.get("grounded", False), grounding_sources=grounding_result.get("sources", []),
                issues=structured.get("issues", []), reviewer_feedback=reviewer_feedback, monitor_feedback=monitor_feedback,
                coordinator_summary=coordinator_summary, gate_passed=gate_result.get("passed") if gate_result else None,
                gate_failures=[f.get("detail", "") for f in (gate_result or {}).get("failures", [])], files_written=written_files,
            ))

            if feedback_status == "approved" or dev_iter >= max_dev_iterations:
                text = f"项目经理：第 {dev_iter} 轮审查通过！" if feedback_status == "approved" else f"项目经理：已达最大迭代次数({max_dev_iterations})，结束开发循环。"
                await self._msg(coordinator_id, text)
                self.meeting.add_message("agent", text, coordinator_id)
                break

            await self._msg(coordinator_id, f"项目经理：第 {dev_iter} 轮审查发现问题，启动修复。")
            fix_description = f"{enhanced_description}\n\n## 审查反馈（请据此修复）\n{feedback_text}\n\n请根据以上反馈修改已有文件或创建补充文件，修复所有指出的问题。"
            for task in self.meeting.tasks:
                if task.status == "completed":
                    task.status = "assigned"
                    task.description = fix_description
            self.logger.info("第 %d 轮审查未通过，启动第 %d 轮修复", dev_iter, dev_iter + 1)

        return execution_results, review_result, review_report

    async def _run_skill_evolution(self, coordinator_id, user_message, discussion_results, review_result, execution_results):
        try:
            from experience_extractor import ExperienceExtractor
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
            evolution_rules = extractor.extract_from_meeting(
                project_id=self.meeting.meeting_id, task_description=user_message,
                discussion_results=discussion_results, review_result=review_result, execution_results=execution_results,
            )
            if evolution_rules:
                await self._msg(coordinator_id, f"项目经理：已从本次项目中提取 {len(evolution_rules)} 条经验规则，将在「技能进化」面板中沉淀。")
                self.meeting.add_message("agent", f"项目经理：已从本次项目中提取 {len(evolution_rules)} 条经验规则。", coordinator_id)

            from skill_packager import SkillPackager
            skill_packager = SkillPackager(output_dir=os.path.join(data_dir, "packages"))
            finalize = self._finalize_skill_evolution(extractor, skill_packager, project_id=self.meeting.meeting_id)
            if finalize["written"]:
                packaged = f"，打包技能包: {', '.join(finalize['packaged'])}" if finalize["packaged"] else ""
                await self._msg(coordinator_id, f"项目经理：已自动审核并沉淀 {finalize['written']} 条经验规则{packaged}。")
                self.meeting.add_message("agent", f"项目经理：已自动审核并沉淀 {finalize['written']} 条经验规则{packaged}。", coordinator_id)
        except Exception as e:
            self.logger.warning("技能进化提取失败: %s", e)

    def _enhance_task_description(self, original_description: str, discussion_results: list) -> str:
        """整合讨论结果到任务描述

        Args:
            original_description: 原始任务描述
            discussion_results: 讨论结果列表

        Returns:
            整合后的任务描述
        """
        if not discussion_results:
            return original_description

        # 提取结构化决策（技术选型、架构约束、关键设计点）
        decisions = []
        constraints = []
        for result in discussion_results:
            content = result.get("content", "")
            stance = result.get("parsed_stance", result.get("stance", "neutral"))
            role = result.get("role", "")
            if stance in ["support", "modify"] and content:
                # 截取核心观点，去掉标签
                core = re.sub(r'\[STANCE:.*?\]', '', content)
                core = re.sub(r'\[CONFIDENCE:.*?\]', '', core).strip()
                if len(core) > 150:
                    core = core[:150] + "..."
                if role in ("planner", "coordinator"):
                    decisions.append(f"- {core}")
                else:
                    constraints.append(f"- [{role}] {core}")

        if not decisions and not constraints:
            return original_description

        enhanced = f"{original_description}\n\n"
        if decisions:
            enhanced += "## 团队讨论确定的方案\n" + "\n".join(decisions[:5]) + "\n"
        if constraints:
            enhanced += "\n## 约束与注意事项\n" + "\n".join(constraints[:5]) + "\n"
        enhanced += "\n请严格按以上方案和约束执行。"

        return enhanced

    def _extract_discussion_decisions(self, discussion_results: list) -> str:
        """从讨论结果中提取结构化决策摘要（委托给 coordinator_discussion）"""
        from coordinator_discussion import _extract_discussion_decisions
        return _extract_discussion_decisions(self, discussion_results)

    def _project_discussion_decisions(self) -> Optional[str]:
        """从 SessionEvent 事件流投影讨论决策摘要（委托给 coordinator_discussion）"""
        from coordinator_discussion import _project_discussion_decisions
        return _project_discussion_decisions(self)

    def _infer_target_agent(self, discussion_results: list) -> str:
        """从讨论结果中推断目标 Agent

        Args:
            discussion_results: 讨论结果列表

        Returns:
            目标 Agent ID，如果无法推断则返回空字符串
        """
        if not discussion_results:
            return ""

        # 统计各角色的立场
        role_votes = {}
        for result in discussion_results:
            agent_id = result.get("agent_id", result.get("agentId", ""))
            stance = result.get("parsed_stance", result.get("stance", "neutral"))
            if agent_id and stance in ["support", "modify"]:
                role_votes[agent_id] = role_votes.get(agent_id, 0) + 1

        if not role_votes:
            return ""

        # 返回支持/修改立场最多的 Agent
        return max(role_votes, key=role_votes.get)

    def _generate_project_summary(
        self,
        user_message: str,
        analysis,
        discussion_results: list,
        assign_result: dict,
        review_result: dict,
        execution_results: list,
    ) -> str:
        """生成项目总结报告（委托给 coordinator_summary）"""
        from coordinator_summary import generate_project_summary
        return generate_project_summary(
            user_message, analysis, discussion_results,
            assign_result, review_result, execution_results,
        )

    async def execute_tool_call(self, tool_name: str, arguments: dict) -> dict:
        if not self._tool_executor:
            return {"success": False, "error": "工具系统未初始化"}

        from tool_registry import ToolCall
        tool_call = ToolCall(
            tool_name=tool_name,
            arguments=arguments,
        )

        # 在线程池中执行，避免阻塞事件循环
        result = await asyncio.to_thread(self._tool_executor.execute, tool_call)

        if self._on_message:
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            status_text = f"[工具调用] {tool_name}: {'成功' if result.success else '失败'}"
            await self._on_message(ceo_id, status_text, "")

        return {
            "success": result.success,
            "output": result.output,
            "error": result.error,
        }

    async def _execute_workflow(
        self,
        workflow_definition: WorkflowDefinition,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Dict[str, Any]:
        """执行工作流（委托给 coordinator_workflow）"""
        from coordinator_workflow import execute_workflow
        return await execute_workflow(self, workflow_definition, on_message)
