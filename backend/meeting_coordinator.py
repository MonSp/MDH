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
from dynamic_router import DynamicRouter
from meeting import MeetingSession
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
    ):
        self._max_iterations = max_iterations
        self._approval_manager = approval_manager
        self._approval_timeout = approval_timeout
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
        self._agent_pool = agent_pool
        self._models: Dict[str, Agent] = {}
        # role.value -> AgentPool 实例 id（用于模型失败时标记不健康，触发 failover 重取）
        self._model_pool_ids: Dict[str, str] = {}
        self._tasks: List[Dict[str, Any]] = []
        self._on_message: Optional[Callable[[str, str, str], Awaitable[None]]] = None
        self._current_on_message: Optional[Callable[[str, str, str], Awaitable[None]]] = None
        self.logger = logging.getLogger("meeting_coordinator")
        self.agenda = AgendaStateMachine()
        self.negotiation = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)

        # DynamicRouter 初始化
        routing_table_path = os.path.join(data_dir, "routing_table.json")
        self._ensure_default_routing_table(routing_table_path)
        self.router = DynamicRouter(routing_table_path)
        self._task_routing: Dict[str, str] = {}  # task_id -> dept_id

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
    def last_routing_decision(self):
        """委托到 SemanticAnalyzer 的路由决策"""
        return self._semantic_analyzer.last_routing_decision

    def _setup_workflow_engine(self):
        """配置WorkflowEngine的节点执行器和回调函数"""
        # 注册各部门的节点执行器
        self.workflow_engine.register_node_executor("dept-frontend", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-backend", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-qa", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-devops", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-data", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-docs", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-fullstack", self._execute_workflow_node)

        # 设置状态变化回调
        self.workflow_engine.set_status_change_callback(self._on_workflow_status_change)
        self.workflow_engine.set_node_status_change_callback(self._on_workflow_node_status_change)

    async def _run_agent_execution_loop(
        self,
        model,
        prompt: str,
        agent_toolset,
        max_tool_rounds: int = 5,
    ) -> Dict[str, Any]:
        """LLM + 工具执行循环：代码块写文件、工具调用、产物收集"""
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        conversation = [msg]
        files_written: List[str] = []
        tool_outputs: List[Dict[str, Any]] = []
        last_text = ""

        from code_extractor import extract_code_blocks

        for _ in range(max_tool_rounds + 1):
            response = await model.reply(conversation)
            last_text = _extract_text(response)

            code_blocks = extract_code_blocks(last_text)
            if code_blocks and agent_toolset:
                for block in code_blocks:
                    wf = agent_toolset.write_file(block["filename"], block["content"])
                    if wf.success:
                        files_written.append(block["filename"])
                    else:
                        self.logger.warning("工作流节点写文件失败: %s", block["filename"])

            if not code_blocks and agent_toolset:
                tool_calls = self._extract_tool_calls_from_text(last_text)
                for call in tool_calls:
                    tc = agent_toolset.execute(call["tool"], call.get("arguments", {}))
                    tool_outputs.append({"tool": call["tool"], "success": tc.success, "output": tc.output})

            conversation.append(
                Msg(name="assistant", role="assistant", content=[{"type": "text", "text": last_text}])
            )
            if files_written or tool_outputs:
                break
            if "完成" in last_text or "done" in last_text.lower():
                break

        return {"result": last_text, "files_written": files_written, "tool_outputs": tool_outputs}

    @staticmethod
    def _extract_tool_calls_from_text(text: str) -> List[Dict[str, Any]]:
        """从 LLM 文本提取工具调用 JSON（{"tool": "...", "arguments": {...}}）

        使用花括号配对扫描而非简单正则，以支持 arguments 中嵌套的花括号
        （例如 {"tool": "write_file", "arguments": {"path": "a.txt", "content": "1"}}）。

        对解析失败或括号不平衡的候选，仅跳过起始的 `{` 继续扫描，避免散落的
        花括号吞掉后续有效的工具调用（既不终止整个扫描，也不跳到 end + 1 跳过
        候选内可能包含的有效调用）。
        """
        calls: List[Dict[str, Any]] = []
        start = 0
        while True:
            begin = text.find("{", start)
            if begin == -1:
                break
            depth = 0
            in_str = False
            escape = False
            end = -1
            for i in range(begin, len(text)):
                ch = text[i]
                if in_str:
                    if escape:
                        escape = False
                    elif ch == "\\":
                        escape = True
                    elif ch == '"':
                        in_str = False
                else:
                    if ch == '"':
                        in_str = True
                    elif ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            end = i
                            break
            if end == -1:
                # 括号不平衡：跳过起始 { 继续扫描
                start = begin + 1
                continue
            candidate = text[begin:end + 1]
            if '"tool"' in candidate:
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict) and parsed.get("tool"):
                        calls.append(parsed)
                        start = end + 1
                        continue
                except Exception:
                    pass
            # 解析失败（如散落 { 与有效 JSON 的 } 误配对）：只跳过起始 { 继续扫描
            start = begin + 1
        return calls

    async def _execute_workflow_node(self, node: WorkflowNode, input_data: dict) -> dict:
        """执行工作流节点：LLM + 工具调用 + 产物写入工作区"""
        self.logger.info("执行工作流节点: %s (部门: %s)", node.node_id, node.dept_id)

        role_map = {
            "dept-frontend": AgentRole.EXECUTOR,
            "dept-backend": AgentRole.EXECUTOR,
            "dept-qa": AgentRole.REVIEWER,
            "dept-devops": AgentRole.MONITOR,
            "dept-data": AgentRole.EXECUTOR,
            "dept-docs": AgentRole.COORDINATOR,
            "dept-fullstack": AgentRole.EXECUTOR,
        }
        role = role_map.get(node.dept_id, AgentRole.EXECUTOR)
        model = self._get_model(role)

        agent_toolset = None
        if self._workspace:
            from agent_toolset import create_agent_toolset

            agent_toolset = create_agent_toolset(
                agent_id=node.node_id,
                agent_role=role.value,
                workspace_root=self._workspace.root_path,
            )

        tool_prompt = f"\n\n{agent_toolset.get_system_prompt()}" if agent_toolset else ""
        prompt = (
            f"请执行以下任务：\n"
            f"任务描述：{node.task_description}\n"
            f"输入数据：{json.dumps(input_data, ensure_ascii=False)}\n"
            f"{tool_prompt}\n\n"
            f"需要产出文件时，用代码块输出：```文件名\n内容\n```；需要调用工具时输出 JSON："
            f'{{"tool": "工具名", "arguments": {{...}}}}。'
        )

        try:
            loop_result = await self._run_agent_execution_loop(model, prompt, agent_toolset)
        except Exception as e:
            self.logger.warning("工作流节点执行失败: %s", e)
            # 单点治理：模型调用异常视为坏模型，驱逐缓存 + 标记 pool 实例不健康，
            # 下次 _get_model 重新获取健康实例（failover）
            self._mark_model_failed(role)
            loop_result = {
                "result": LLM_FALLBACK_TEMPLATE.format(role=node.dept_id, content_type="执行结果"),
                "files_written": [],
                "tool_outputs": [],
            }

        return {
            "result": loop_result["result"],
            "node_id": node.node_id,
            "dept_id": node.dept_id,
            "files_written": loop_result["files_written"],
            "tool_outputs": loop_result["tool_outputs"],
        }

    async def _on_workflow_status_change(self, execution):
        """工作流状态变化回调 — 推送到前端"""
        status_value = execution.status.value if hasattr(execution.status, 'value') else str(execution.status)
        self.logger.info("工作流状态变化: %s -> %s", execution.execution_id, status_value)

        if self._on_message:
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            status_text = f"工作流 {execution.workflow_id} 状态变更: {status_value}"
            await self._on_message(
                ceo_id, status_text, "",
                msg_type="workflow_status_update",
                workflow_id=execution.workflow_id,
                execution_id=execution.execution_id,
                status=status_value,
            )

    async def _on_workflow_node_status_change(self, execution, node_id):
        """工作流节点状态变化回调 — 推送到前端"""
        node_status = execution.node_states.get(node_id)
        status_value = node_status.value if node_status else "unknown"
        self.logger.info("工作流节点状态变化: %s -> %s", node_id, status_value)

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
        reg = PROVIDER_REGISTRY.get(self.provider)
        if reg is None:
            raise ValueError(f"不支持的模型提供商: {self.provider}")

        self.logger.info("创建模型: role=%s provider=%s model=%s api_key=%s",
                        role.value, self.provider, self.model_name or "(默认)",
                        "已设置" if self.api_key else "未设置")

        class _Session:
            pass

        session = _Session()
        session.api_key = self.api_key
        session.base_url = self.base_url

        credential = reg["credential_cls"](**reg["credential_kwargs"](session))
        formatter = reg["formatter_cls"]()
        model_name = self.model_name or reg["default_model"]
        model = reg["model_cls"](
            credential=credential,
            model=model_name,
            stream=True,
            formatter=formatter,
        )
        agent = Agent(
            name=role.value,
            system_prompt=AGENT_ROLE_PROMPTS[role],
            model=model,
        )
        return agent

    def _get_model(self, role: AgentRole) -> Agent:
        key = role.value
        if key not in self._models:
            # 优先从 AgentPool 获取（支持复用和负载均衡）
            if self._agent_pool:
                instance = self._agent_pool.get_agent_by_role(key)
                if instance:
                    self._models[key] = instance.agent
                    self._model_pool_ids[key] = instance.id
                    return instance.agent
            self._models[key] = self._create_model(role)
        return self._models[key]

    def _mark_model_failed(self, role: AgentRole) -> None:
        """模型调用失败：驱逐缓存 + 标记 pool 实例不健康（下次 _get_model 重新获取健康实例）"""
        key = role.value
        self._models.pop(key, None)
        pool_id = self._model_pool_ids.pop(key, None)
        if pool_id and self._agent_pool:
            self._agent_pool.mark_unhealthy(pool_id)

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
        """
        运行多角色讨论
        
        如果提供了Team实例，使用MixedLocationDiscussion进行并行讨论；
        否则回退到串行的DiscussionManager。
        """
        # 如果有Team实例，使用并行讨论引擎
        if team and hasattr(team, 'members') and team.members:
            logger.info("使用并行讨论引擎 (成员数=%d)", len(team.members))
            try:
                if self._mixed_discussion is None:
                    self._mixed_discussion = MixedLocationDiscussion(
                        team=team,
                        agenda=self.agenda,
                        negotiation=self.negotiation,
                        get_model_fn=self._get_model,
                    )
                return await self._mixed_discussion.run(topic, on_message, max_rounds)
            except Exception as e:
                logger.warning("并行讨论引擎初始化失败，回退到串行: %s", e)
        
        # 回退到串行讨论
        logger.info("使用串行讨论引擎")
        return await self._discussion_manager.run(topic, on_message, max_rounds)

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

    def _find_best_agent_for_task(self, task_description: str):
        """根据任务内容选择最有能力执行的Agent（优先选择有write_file权限的）"""
        task_lower = task_description.lower()
        # 判断任务类型
        needs_write = any(kw in task_lower for kw in [
            '写', '创作', '生成', '编写', '撰写', 'write', 'create', 'generate',
            '文件', '代码', '文章', '小说', '剧本', 'file', 'code',
        ])
        needs_review = any(kw in task_lower for kw in [
            '审查', '审核', '校对', 'review', 'edit', '检查', '质量',
        ])

        # 一次性加载配置（有 mtime 缓存）
        from agent_toolset import load_roles_config
        config = load_roles_config()
        all_roles = {**config.get("base_roles", {}), **config.get("custom_roles", {})}

        candidates = []
        for agent in self.meeting.agents:
            if agent.role == AgentRole.CEO:
                continue
            tools = self._get_agent_tools(agent)
            role_config_id = agent.id.replace("agent-", "") if agent.id.startswith("agent-") else agent.id
            role_cfg = all_roles.get(role_config_id, {})
            skills = set(role_cfg.get("skills", []))
            score = 0
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
            candidates.append((agent, score))

        if not candidates:
            return None
        # 按分数降序排列，返回最高分
        candidates.sort(key=lambda x: x[1], reverse=True)
        best_agent, best_score = candidates[0]
        self.logger.info("能力匹配: 选择 %s (score=%d)", best_agent.id, best_score)
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
        """统一更新路由统计：修复自适应学习断链（auto_assign_task 写入的 _task_routing 从未被消费）

        消费即删：每条消息只统计一次，避免多消息会议重复计数。
        """
        for task_id in list(self._task_routing.keys()):
            dept_id = self._task_routing[task_id]
            task = next((t for t in self.meeting.tasks if getattr(t, "id", None) == task_id), None)
            if task is None:
                del self._task_routing[task_id]
                continue
            self.router.update_stats(dept_id, success=task.status == "completed")
            del self._task_routing[task_id]

    def _update_routing_stats_safe(self) -> None:
        """路由统计安全包装：异常不中断后续流程（项目总结/技能进化）"""
        try:
            self._update_routing_stats()
        except Exception as e:
            self.logger.warning("更新路由统计失败: %s", e)
        finally:
            # 无论统计是否成功，都清理剩余跟踪条目，避免残留导致重复统计
            self._task_routing.clear()

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

        注意：本路径（execute_and_review_task）当前不接确定性门禁
        （_run_deterministic_gate 仅在 process_user_message 的开发循环中调用），
        后续统一时需补上门禁。
        
        Returns:
            Tuple[审查结果, 执行结果列表]
        """
        task_results = await self.execute_assigned_tasks()
        for task_result in task_results:
            await on_message(task_result["agent_id"], task_result["result"], "")

        review_result = {}
        if task_results:
            execution_result = self._build_execution_artifact_text(task_results)
            review_result = await self._review_pipeline.review(
                task_description, execution_result, on_message
            )

        return review_result, task_results

    # 工具缺失信号：基础设施不可用（pylint/pytest 未安装等）而非真实检查失败。
    # 仅保留确定性的缺失文本信号：实测 _exec_run_tests 在 python -m pytest 缺模块且
    # pytest 不在 PATH 时返回 "[Errno 2] No such file or directory: 'pytest'"，
    # _exec_run_linter 在 python -m pylint 缺模块时返回 "<python路径>: No module named pylint"。
    # 不使用裸 "not found"，避免误伤真实失败（如 pytest 的
    # "AssertionError: config key not found"）而错误地 fail-open。
    _GATE_TOOL_MISSING_SIGNALS = (
        "no module named",
        "no such file or directory",
        "command not found",
        "no tests were collected",
        "no tests ran",
    )

    def _gate_check_unavailable(self, tool_result: Any) -> bool:
        """判断 lint/test 工具结果为工具缺失（基础设施不可用）

        匹配 output/error 中的工具缺失信号（pylint/pytest 未安装、测试未收集等）。
        """
        text = (
            f"{getattr(tool_result, 'error', '') or ''}\n"
            f"{getattr(tool_result, 'output', '') or ''}"
        ).strip().lower()
        return any(sig in text for sig in self._GATE_TOOL_MISSING_SIGNALS)

    def _run_deterministic_gate(self, workspace_root: Optional[str] = None) -> Dict[str, Any]:
        """确定性门禁：对工作区运行测试与代码检查，失败即 revision_required

        门禁对工具缺失采用 fail-open（跳过并记录 skipped，不产生失败），
        对真实检查失败（lint/test 确定性失败）采用 fail-closed（passed=False）。

        Returns:
            {"passed": bool, "failures": List, "skipped": List}
        """
        result: Dict[str, Any] = {"passed": True, "failures": [], "skipped": []}
        if not workspace_root:
            return result
        try:
            from agent_toolset import create_agent_toolset
            toolset = create_agent_toolset(
                agent_id="gate", agent_role="reviewer", workspace_root=workspace_root
            )
            lint = toolset.run_linter(".")
            if not lint.success:
                if self._gate_check_unavailable(lint):
                    # 基础设施不可用（如 pylint 未安装）→ fail-open：跳过并记录，不产生失败
                    lint_detail = (lint.error or lint.output or "lint 工具不可用")[:200]
                    result["skipped"].append({
                        "type": "lint_skipped", "location": ".",
                        "detail": lint_detail,
                    })
                    self.logger.info("确定性门禁跳过: %s", lint_detail)
                else:
                    result["passed"] = False
                    result["failures"].append({
                        "type": "lint_failure", "location": ".",
                        "detail": (lint.error or lint.output or "lint 未通过")[:200],
                    })
            tests = toolset.run_tests(verbose=False)
            if not tests.success:
                if self._gate_check_unavailable(tests):
                    # 基础设施不可用（如 pytest 未安装 / 未收集到测试）→ fail-open：跳过并记录
                    test_detail = (tests.error or tests.output or "测试工具不可用")[:200]
                    result["skipped"].append({
                        "type": "test_skipped", "location": ".",
                        "detail": test_detail,
                    })
                    self.logger.info("确定性门禁跳过: %s", test_detail)
                else:
                    result["passed"] = False
                    result["failures"].append({
                        "type": "test_failure", "location": ".",
                        "detail": (tests.error or tests.output or "测试未通过")[:200],
                    })
        except Exception as e:
            result["passed"] = False
            result["failures"].append({"type": "gate_error", "location": ".", "detail": str(e)[:200]})
        return result

    async def semantic_analyze(self, user_message: str) -> SemanticAnalysisResult:
        """语义分析用户消息（委托给SemanticAnalyzer，带缓存）

        WhyBuddy化：委托给SemanticAnalyzer。
        """
        from llm_cache import llm_cache
        cached = llm_cache.get(user_message, role="semantic_analyze", model=self.model_name)
        if cached is not None:
            self.logger.info("语义分析命中缓存: %s", user_message[:50])
            return cached

        result = await self._semantic_analyzer.analyze(user_message)
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
    ) -> Dict[str, Any]:
        """
        处理用户消息
        
        架构说明：
        - CEO（主智能体）只负责团队创建和任务交接
        - COORDINATOR（团队负责人）接管所有内部流程管理
        """
        self._on_message = on_message
        self._current_on_message = on_message

        # 获取CEO和COORDINATOR的ID
        ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR) or "agent-coordinator"
        
        # CEO将任务交给COORDINATOR
        ceo_handoff_text = f"CEO：收到任务「{user_message[:50]}...」，已交给项目经理处理。"
        await self._msg(ceo_id, ceo_handoff_text)
        
        # COORDINATOR接管内部流程
        coordinator = self._get_model(AgentRole.COORDINATOR)
        
        # 需求确认阶段 - 模拟人类公司的需求确认流程
        confirmation_text = (
            f"项目经理：收到需求，正在确认细节。\n"
            f"需求概述：{user_message[:100]}\n"
            f"正在分析需求复杂度和团队配置..."
        )
        await self._msg(coordinator_id, confirmation_text)
        
        # COORDINATOR进行语义分析
        analysis = await self.semantic_analyze(user_message)
        
        # 发布分析结果和项目规划
        analysis_text = (
            f"项目经理分析：\n"
            f"• 意图：{analysis.intent}\n"
            f"• 复杂度：{'高（需要多部门协作）' if analysis.is_workflow else '中（单部门执行）'}\n"
            f"• 预计工作量：将根据任务复杂度动态调整\n"
        )
        if analysis.is_task:
            analysis_text += f"• 指派给：{analysis.target_agent_id}\n"
            analysis_text += f"• 理由：{analysis.reason}"
        else:
            analysis_text += f"• 讨论主题：{analysis.discussion_topic}"
        
        await self._msg(coordinator_id, analysis_text)
        self.meeting.add_message("agent", analysis_text, coordinator_id)

        # 项目规划阶段 - 模拟人类公司的项目规划流程
        plan_text = (
            f"项目经理：制定项目计划。\n"
            f"阶段1：需求分析与讨论\n"
            f"阶段2：任务分配与执行\n"
            f"阶段3：质量审查与验收\n"
            f"阶段4：交付与总结"
        )
        await self._msg(coordinator_id, plan_text)
        self.meeting.add_message("agent", plan_text, coordinator_id)

        # 1. 工作流模式
        if analysis.is_workflow and analysis.workflow_definition:
            self.logger.info("工作流模式: 创建并执行工作流")
            workflow_text = (
                f"项目经理：检测到跨部门复杂任务，已创建工作流。\n"
                f"工作流名称：{analysis.workflow_definition.name}\n"
                f"节点数量：{len(analysis.workflow_definition.nodes)}\n"
                f"执行策略：{analysis.workflow_definition.execution_strategy}"
            )
            await self._msg(coordinator_id, workflow_text)
            self.meeting.add_message("agent", workflow_text, coordinator_id)

            # 创建并执行工作流
            workflow_result = await self._execute_workflow(analysis.workflow_definition, on_message)

            return {
                "type": "workflow_executed",
                "analysis": semantic_analysis_to_dict(analysis),
                "workflow_result": workflow_result,
            }

        # 2. 非工作流模式：串行流程（讨论→分派→审查）
        # COORDINATOR组织讨论
        topic = (analysis.discussion_topic.strip() if analysis.discussion_topic else "") or user_message
        self.logger.info("讨论阶段: topic=%s", topic[:50])
        
        coordinator_discuss_text = f"项目经理：组织团队讨论「{topic[:30]}...」"
        await self._msg(coordinator_id, coordinator_discuss_text)
        self.meeting.add_message("agent", coordinator_discuss_text, coordinator_id)
        
        # 尝试获取Team实例用于并行讨论
        team = getattr(self, '_team', None)
        discussion_results = await self.run_discussion(topic, on_message, team=team)

        # COORDINATOR整合讨论结果
        original_description = analysis.task_description or user_message
        enhanced_description = self._enhance_task_description(original_description, discussion_results)
        self.logger.info("串行流程 - 任务描述已整合讨论结果: 原始长度=%d, 增强后长度=%d",
                        len(original_description), len(enhanced_description))

        # 注入历史经验：从过往项目中检索相关规则，注入任务描述
        try:
            from experience_extractor import ExperienceExtractor
            import os
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
            task_type = extractor._infer_task_type(original_description)
            content_kw = extractor._extract_content_keywords(original_description)
            # 从讨论结果中也提取关键词
            for dr in discussion_results:
                content_kw |= extractor._extract_content_keywords(dr.get("content", ""))
            past_rules = extractor.retrieve_relevant_rules(task_type, sorted(content_kw))
            if past_rules:
                exp_context = extractor.build_experience_context(past_rules[:5])
                enhanced_description = f"{enhanced_description}\n\n{exp_context}"
                coordinator_exp_text = f"项目经理：已注入 {len(past_rules)} 条历史经验到任务描述。"
                await self._msg(coordinator_id, coordinator_exp_text)
                self.meeting.add_message("agent", coordinator_exp_text, coordinator_id)
                self.logger.info("注入 %d 条历史经验 (task_type=%s)", len(past_rules), task_type)
        except Exception as e:
            self.logger.debug("历史经验注入跳过: %s", e)

        coordinator_integrate_text = f"项目经理：已整合团队讨论结果，任务描述已更新。"
        await self._msg(coordinator_id, coordinator_integrate_text)
        self.meeting.add_message("agent", coordinator_integrate_text, coordinator_id)

        # COORDINATOR分派任务
        target_agent_id = analysis.target_agent_id
        if not target_agent_id:
            # 如果没有明确的目标 Agent，从讨论结果中推断或使用默认值
            target_agent_id = self._infer_target_agent(discussion_results) or "agent-executor"

        # ── 方案投票阶段 ──
        coordinator_vote_text = f"项目经理：就讨论结果发起方案投票。"
        await self._msg(coordinator_id, coordinator_vote_text)
        self.meeting.add_message("agent", coordinator_vote_text, coordinator_id)

        proposal = self.negotiation.create_proposal(
            coordinator_id,
            f"方案: {enhanced_description[:200]}",
        )
        await on_message(coordinator_id, f"[提案] {proposal.content}", "")

        # 各智能体投票 — 基于讨论阶段的 stance 和 confidence
        stance_by_agent: dict[str, dict] = {}
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
                vote_approve = False
                vote_reason = f"{agent.role.value}反对方案（置信度{confidence:.0%}）"
            elif stance == "modify":
                vote_approve = True
                vote_reason = f"{agent.role.value}有条件赞成（建议修改，置信度{confidence:.0%}）"
            elif stance == "support":
                vote_approve = True
                vote_reason = f"{agent.role.value}赞成方案（置信度{confidence:.0%}）"
            else:  # neutral — 按 confidence 阈值决定
                vote_approve = confidence >= 0.4
                vote_reason = f"{agent.role.value}{'谨慎赞成' if vote_approve else '保留意见'}（置信度{confidence:.0%}）"

            self.negotiation.cast_vote(proposal.id, agent.id, vote_approve, reason=vote_reason)
            # 同时提交论据，激活 argument_based 策略
            stance_enum = {"support": Stance.SUPPORT, "oppose": Stance.OPPOSE, "modify": Stance.MODIFY}.get(stance, Stance.NEUTRAL)
            arg_content = dr.get("content", "")[:200]
            if arg_content:
                self.negotiation.add_argument(
                    proposal.id, agent.id, stance_enum, confidence, arg_content,
                )
            await on_message(agent.id, f"[投票] {'赞成' if vote_approve else '反对'} - {vote_reason}", "")

        # 评估共识
        vote_result = self.negotiation.evaluate_consensus(proposal.id)
        consensus_text = f"项目经理：投票结果 — {'通过' if vote_result.accepted else '未通过'} ({vote_result.approve_count}/{vote_result.total_votes})"
        await self._msg(coordinator_id, consensus_text)
        self.meeting.add_message("agent", consensus_text, coordinator_id)

        if not vote_result.accepted:
            reject_text = "项目经理：方案未获共识，任务终止。请重新描述需求。"
            await self._msg(coordinator_id, reject_text)
            return {"type": "vote_rejected", "vote_result": vote_result.__dict__}

        self.logger.info("串行流程 - 分派阶段: target=%s", target_agent_id)
        
        coordinator_assign_text = f"项目经理：将任务分派给{target_agent_id}执行。"
        await self._msg(coordinator_id, coordinator_assign_text)
        self.meeting.add_message("agent", coordinator_assign_text, coordinator_id)
        
        assign_result = await self.auto_assign_task(
            enhanced_description,
            target_agent_id,
            analysis.reason,
        )

        # ── 执行审批阶段 ──
        # 检测是否为高风险任务（涉及文件修改、bash命令等）
        risk_keywords = ['rm -rf', 'chmod', 'drop table', 'delete', 'remove all', 'format']
        is_high_risk = any(kw in enhanced_description.lower() for kw in risk_keywords)
        risk_level = 'high' if is_high_risk else 'medium'

        coordinator_approve_text = f"项目经理：提交任务执行审批（风险等级: {risk_level}）。"
        await self._msg(coordinator_id, coordinator_approve_text)
        self.meeting.add_message("agent", coordinator_approve_text, coordinator_id)

        # 创建审批请求并真阻塞等待（超时按配置默认通过，防单用户场景阻塞）
        if self._approval_manager:
            from protocol import RiskLevel

            risk_map = {
                "low": RiskLevel.LOW,
                "medium": RiskLevel.MEDIUM,
                "high": RiskLevel.HIGH,
                "critical": RiskLevel.CRITICAL,
            }
            approval = await self._approval_manager.request_approval(
                requester_id=target_agent_id,
                operation="task_execution",
                description=enhanced_description[:200],
                risk_level=risk_map.get(risk_level, RiskLevel.MEDIUM),
                confidence=0.8,
                send_fn=_build_approval_send_fn(on_message),
            )
            try:
                decision = await self._approval_manager.wait_for_decision(
                    approval.id, timeout=self._approval_timeout
                )
                approved = bool(decision.get("approved", True))
                reason = decision.get("reason", "")
            except asyncio.TimeoutError:
                approved = True
                reason = "审批超时，默认通过"
        else:
            approved = True
            reason = "未配置审批管理器，自动通过"

        approve_msg = _build_task_approval_message(approved, reason)
        await self._msg(coordinator_id, approve_msg)
        self.meeting.add_message("agent", approve_msg, coordinator_id)

        # COORDINATOR监督审查
        self.logger.info("串行流程 - 审查阶段: task=%s", assign_result.get("task_id", ""))
        
        coordinator_review_text = f"项目经理：监督任务执行和质量审查。"
        await self._msg(coordinator_id, coordinator_review_text)
        self.meeting.add_message("agent", coordinator_review_text, coordinator_id)
        
        # ── 开发循环：执行 → 审查 → 修复 → 再审查 ──
        max_dev_iterations = self._max_iterations
        review_result = {}
        execution_results = []
        all_review_feedback = []

        # 从讨论中提取决策摘要，供审查阶段使用
        discussion_context = self._extract_discussion_decisions(discussion_results)

        for dev_iter in range(1, max_dev_iterations + 1):
            # 执行
            coordinator_exec_text = f"项目经理：第 {dev_iter} 轮开发，监督任务执行。"
            await self._msg(coordinator_id, coordinator_exec_text)
            self.meeting.add_message("agent", coordinator_exec_text, coordinator_id)

            try:
                exec_results = await self.execute_assigned_tasks()
                execution_results = exec_results

                # 通知执行结果
                for er in exec_results:
                    await on_message(er["agent_id"], er["result"], "")
                    # 报告写入的文件
                    written = er.get("written_files", [])
                    if written:
                        file_msg = f"[第{dev_iter}轮] 已写入 {len(written)} 个文件: {', '.join(written)}"
                        await on_message(er["agent_id"], file_msg, "")
            except Exception as e:
                self.logger.warning("第 %d 轮执行失败: %s", dev_iter, e)
                exec_results = []

            # 审查
            coordinator_review_text = f"项目经理：第 {dev_iter} 轮质量审查。"
            await self._msg(coordinator_id, coordinator_review_text)
            self.meeting.add_message("agent", coordinator_review_text, coordinator_id)

            execution_text = self._build_execution_artifact_text(exec_results) if exec_results else ""

            try:
                # 确定性门禁仅在本次迭代执行产出了文件/结果时运行（执行失败的迭代不门禁；
                # 门禁即迭代验证点，每次有产出的迭代仍会跑）。
                # 门禁内部为同步 subprocess（lint/test），通过 asyncio.to_thread
                # 卸载到线程池，避免阻塞事件循环。
                if exec_results:
                    gate_result = await asyncio.to_thread(
                        self._run_deterministic_gate,
                        self._workspace.root_path if self._workspace else None,
                    )
                else:
                    gate_result = None
                review_result = await self._review_pipeline.review(
                    enhanced_description, execution_text, on_message,
                    discussion_context=discussion_context,
                    gate_result=gate_result,
                )
            except Exception as e:
                self.logger.warning("第 %d 轮审查失败: %s", dev_iter, e)
                review_result = {"status": "skipped", "reason": str(e)}

            # 提取审查反馈
            reviewer_feedback = review_result.get("reviewer_feedback", "")
            monitor_feedback = review_result.get("monitor_feedback", "")
            coordinator_summary = review_result.get("coordinator_summary", "")
            feedback_text = f"[审查反馈]\n{reviewer_feedback}\n\n[评估反馈]\n{monitor_feedback}\n\n[总结]\n{coordinator_summary}"
            all_review_feedback.append(feedback_text)

            # 判断是否需要继续修复
            structured = review_result.get("structured_feedback", {})
            feedback_status = structured.get("status", "approved")

            if feedback_status == "approved" or dev_iter >= max_dev_iterations:
                # 审查通过或达到最大迭代次数
                if feedback_status == "approved":
                    coordinator_pass_text = f"项目经理：第 {dev_iter} 轮审查通过！"
                else:
                    coordinator_pass_text = f"项目经理：已达最大迭代次数({max_dev_iterations})，结束开发循环。"
                await self._msg(coordinator_id, coordinator_pass_text)
                self.meeting.add_message("agent", coordinator_pass_text, coordinator_id)
                break

            # 审查未通过 → 将反馈注入下一轮任务描述
            coordinator_fix_text = f"项目经理：第 {dev_iter} 轮审查发现问题，启动修复。"
            await self._msg(coordinator_id, coordinator_fix_text)

            # 将审查反馈作为修复要求注入任务描述（只保留最新一轮）
            fix_description = (
                f"{enhanced_description}\n\n"
                f"## 审查反馈（请据此修复）\n"
                f"{feedback_text}\n\n"
                f"请根据以上反馈修改已有文件或创建补充文件，修复所有指出的问题。"
            )

            # 重置executor任务状态为assigned，更新描述
            for task in self.meeting.tasks:
                if task.status == "completed":
                    task.status = "assigned"
                    task.description = fix_description

            self.logger.info("第 %d 轮审查未通过，启动第 %d 轮修复", dev_iter, dev_iter + 1)

        # 更新路由统计（修复自适应学习断链）
        self._update_routing_stats_safe()

        # 生成项目总结报告
        project_summary = self._generate_project_summary(
            user_message, analysis, discussion_results, 
            assign_result, review_result, execution_results
        )
        
        coordinator_summary_text = f"项目经理：已生成项目总结报告。"
        await self._msg(coordinator_id, coordinator_summary_text)
        self.meeting.add_message("agent", coordinator_summary_text, coordinator_id)
        
        # 发送项目总结到前端
        await self._msg(coordinator_id, project_summary)

        # 技能进化：从项目结果中提取经验规则
        try:
            from experience_extractor import ExperienceExtractor
            import os
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
            evolution_rules = extractor.extract_from_meeting(
                project_id=self.meeting.meeting_id,
                task_description=user_message,
                discussion_results=discussion_results,
                review_result=review_result,
                execution_results=execution_results,
            )
            if evolution_rules:
                evolution_text = (
                    f"项目经理：已从本次项目中提取 {len(evolution_rules)} 条经验规则，"
                    f"将在「技能进化」面板中沉淀。"
                )
                await self._msg(coordinator_id, evolution_text)
                self.meeting.add_message("agent", evolution_text, coordinator_id)

            # 技能闭环自动触发：审核 pending → 写增量区 → 打包
            from skill_packager import SkillPackager

            skill_packager = SkillPackager(output_dir=os.path.join(data_dir, "packages"))
            finalize = self._finalize_skill_evolution(
                extractor, skill_packager, project_id=self.meeting.meeting_id
            )
            if finalize["written"]:
                packaged_text = (
                    f"，打包技能包: {', '.join(finalize['packaged'])}"
                    if finalize["packaged"] else ""
                )
                finalize_text = (
                    f"项目经理：已自动审核并沉淀 {finalize['written']} 条经验规则"
                    f"{packaged_text}。"
                )
                await self._msg(coordinator_id, finalize_text)
                self.meeting.add_message("agent", finalize_text, coordinator_id)
        except Exception as e:
            self.logger.warning("技能进化提取失败: %s", e)

        # COORDINATOR汇报结果
        coordinator_report_text = f"项目经理：任务执行完成，向CEO汇报结果。"
        await self._msg(coordinator_id, coordinator_report_text)
        self.meeting.add_message("agent", coordinator_report_text, coordinator_id)

        # CEO接收汇报
        ceo_report_text = f"CEO：收到项目经理汇报，任务已完成。"
        await self._msg(ceo_id, ceo_report_text)
        self.meeting.add_message("agent", ceo_report_text, ceo_id)

        # 返回所有阶段结果
        return {
            "type": "serial_completed",
            "analysis": semantic_analysis_to_dict(analysis),
            "discussion_results": discussion_results,
            "assignment": assign_result,
            "review_result": review_result,
            "execution_results": execution_results,
            "project_summary": project_summary,
        }

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
        """从讨论结果中提取结构化决策摘要
        
        Args:
            discussion_results: 讨论结果列表
            
        Returns:
            决策摘要文本（供审查阶段使用）
        """
        if not discussion_results:
            return ""
        
        decisions = []
        for result in discussion_results:
            content = result.get("content", "")
            stance = result.get("parsed_stance", result.get("stance", "neutral"))
            role = result.get("role", "")
            if stance in ["support", "modify"] and content:
                core = re.sub(r'\[STANCE:.*?\]', '', content)
                core = re.sub(r'\[CONFIDENCE:.*?\]', '', core).strip()
                if len(core) > 120:
                    core = core[:120] + "..."
                icon = "+" if stance == "support" else "~"
                decisions.append(f"  {icon} [{role}] {core}")
        
        if not decisions:
            return ""
        return "团队讨论确定的方案与约束：\n" + "\n".join(decisions[:8])

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
        """生成项目总结报告
        
        模拟人类公司的项目总结流程：
        1. 项目概述
        2. 完成的工作
        3. 遇到的问题
        4. 交付物清单
        5. 后续建议
        """
        summary_parts = []
        
        # 1. 项目概述
        summary_parts.append("📋 项目总结报告")
        summary_parts.append("=" * 40)
        summary_parts.append(f"需求：{user_message[:100]}")
        summary_parts.append(f"意图：{analysis.intent}")
        summary_parts.append("")
        
        # 2. 团队讨论要点
        if discussion_results:
            summary_parts.append("💬 团队讨论要点")
            summary_parts.append("-" * 40)
            for i, result in enumerate(discussion_results[:3], 1):
                agent_id = result.get("agent_id", result.get("agentId", "unknown"))
                content = result.get("content", "")[:80]
                stance = result.get("parsed_stance", result.get("stance", "neutral"))
                stance_icon = "✅" if stance == "support" else "🔄" if stance == "modify" else "❓"
                summary_parts.append(f"{i}. {stance_icon} [{agent_id}] {content}")
            summary_parts.append("")
        
        # 3. 任务分配
        if assign_result:
            summary_parts.append("📝 任务分配")
            summary_parts.append("-" * 40)
            summary_parts.append(f"执行者：{assign_result.get('agent_id', 'unknown')}")
            summary_parts.append(f"任务ID：{assign_result.get('task_id', 'unknown')}")
            summary_parts.append(f"状态：{assign_result.get('status', 'unknown')}")
            summary_parts.append("")
        
        # 4. 执行结果
        if execution_results:
            summary_parts.append("⚡ 执行结果")
            summary_parts.append("-" * 40)
            total_files = 0
            for result in execution_results:
                agent_id = result.get("agent_id", "unknown")
                written_files = result.get("written_files", [])
                code_blocks = result.get("code_blocks_count", 0)
                total_files += len(written_files)
                summary_parts.append(f"• [{agent_id}] 写入 {len(written_files)} 个文件，{code_blocks} 个代码块")
            summary_parts.append(f"总计写入文件：{total_files}")
            summary_parts.append("")
        
        # 5. 质量审查
        if review_result:
            summary_parts.append("🔍 质量审查")
            summary_parts.append("-" * 40)
            critic_result = review_result.get("critic_result", {})
            grounding_result = review_result.get("grounding_result", {})
            severity = critic_result.get("severity", "unknown")
            findings = critic_result.get("findings", [])
            grounded = grounding_result.get("grounded", False)
            summary_parts.append(f"严重度：{severity}")
            summary_parts.append(f"发现问题：{len(findings)} 个")
            summary_parts.append(f"代码接地：{'是' if grounded else '否'}")
            summary_parts.append("")
        
        # 6. 交付物清单
        summary_parts.append("📦 交付物清单")
        summary_parts.append("-" * 40)
        all_files = []
        for result in execution_results:
            all_files.extend(result.get("written_files", []))
        if all_files:
            for file in all_files[:10]:
                summary_parts.append(f"• {file}")
            if len(all_files) > 10:
                summary_parts.append(f"... 还有 {len(all_files) - 10} 个文件")
        else:
            summary_parts.append("无文件交付")
        summary_parts.append("")
        
        # 7. 后续建议
        summary_parts.append("💡 后续建议")
        summary_parts.append("-" * 40)
        summary_parts.append("1. 检查生成的代码是否符合预期")
        summary_parts.append("2. 运行测试验证功能正确性")
        summary_parts.append("3. 如需修改，请提供具体反馈")
        
        return "\n".join(summary_parts)

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
        """执行工作流

        Args:
            workflow_definition: 工作流定义
            on_message: 消息回调函数

        Returns:
            工作流执行结果
        """
        try:
            # 创建工作流执行实例
            execution = self.workflow_engine.create_workflow(workflow_definition)

            # 推送工作流创建消息
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            create_msg = f"工作流已创建: {workflow_definition.name} (ID: {execution.execution_id})"
            await self._msg(ceo_id, create_msg)
            self.meeting.add_message("agent", create_msg, ceo_id)

            # 启动工作流执行（注册任务，支持暂停/取消真正生效）
            task = self.workflow_engine.start_workflow(execution.execution_id)
            try:
                await task
            except asyncio.CancelledError:
                # 区分暂停与取消：暂停时引擎状态为 paused，取消时为 cancelled
                cancelled_status = self.workflow_engine.get_workflow_status(execution.execution_id)
                if cancelled_status.status.value == "paused":
                    cancelled_msg = "工作流已暂停"
                    cancelled_result_status = "paused"
                else:
                    cancelled_msg = "工作流已取消"
                    cancelled_result_status = "cancelled"
                await self._msg(ceo_id, cancelled_msg)
                self.meeting.add_message("agent", cancelled_msg, ceo_id)
                return {
                    "execution_id": execution.execution_id,
                    "status": cancelled_result_status,
                    "results": cancelled_status.results,
                }

            # 获取执行结果
            status = self.workflow_engine.get_workflow_status(execution.execution_id)

            # 推送工作流完成消息
            complete_msg = f"工作流执行完成: {status.status.value}"
            await self._msg(ceo_id, complete_msg)
            self.meeting.add_message("agent", complete_msg, ceo_id)

            # 汇总结果
            results_summary = []
            for node_id, result in status.results.items():
                if isinstance(result, dict) and "result" in result:
                    results_summary.append(f"- {node_id}: {result['result'][:100]}...")

            if results_summary:
                summary_msg = "工作流执行结果汇总:\n" + "\n".join(results_summary)
                await self._msg(ceo_id, summary_msg)
                self.meeting.add_message("agent", summary_msg, ceo_id)

            return {
                "execution_id": execution.execution_id,
                "status": status.status.value,
                "results": status.results,
            }

        except Exception as e:
            self.logger.error("工作流执行失败: %s", str(e))
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            error_msg = f"工作流执行失败: {str(e)}"
            await self._msg(ceo_id, error_msg)
            self.meeting.add_message("agent", error_msg, ceo_id)

            return {
                "error": str(e),
            }
