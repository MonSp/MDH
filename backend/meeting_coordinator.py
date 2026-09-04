import asyncio
import logging
import os
import re
from collections.abc import Awaitable, Callable
from typing import Any, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agenda import AgendaStateMachine
from agent import _extract_text
from agent_pool import AgentPool
from approval_manager import ApprovalManager
from collaboration.planner_agent import PlannerAgent
from coordinator_effects import (
    grant_task_xp as _grant_task_xp_impl,
)
from coordinator_effects import (
    notify_agent_status as _notify_agent_status_impl,
)
from coordinator_effects import (
    notify_artifact_created as _notify_artifact_created_impl,
)
from coordinator_execution import (
    build_execution_artifact_text as _build_execution_artifact_text_impl,
)
from coordinator_execution import (
    execute_and_review_task as _execute_and_review_task_impl,
)
from coordinator_execution import (
    execute_tool_call as _execute_tool_call_impl,
)
from coordinator_execution import (
    lightweight_review as _lightweight_review_impl,
)
from coordinator_execution import (
    run_dev_loop as _run_dev_loop_impl,
)
from coordinator_execution import (
    run_simple_path as _run_simple_path_impl,
)
from coordinator_execution import (
    save_execution_artifacts as _save_execution_artifacts_impl,
)
from coordinator_experience import (
    finalize_skill_evolution as _finalize_skill_evolution_impl,
)
from coordinator_experience import (
    inject_experience as _inject_experience_impl,
)
from coordinator_experience import (
    log_knowledge_flow as _log_knowledge_flow_impl,
)
from coordinator_experience import (
    log_skill_evolution as _log_skill_evolution_impl,
)
from coordinator_experience import (
    recall_agent_memory as _recall_agent_memory_impl,
)
from coordinator_experience import (
    update_injected_rule_effectiveness as _update_injected_rule_effectiveness_impl,
)
from coordinator_experience import (
    write_task_memory as _write_task_memory_impl,
)
from coordinator_routing import (
    agent_can_execute as _agent_can_execute_impl,
)
from coordinator_routing import (
    ensure_default_routing_table as _ensure_default_routing_table_impl,
)
from coordinator_routing import (
    estimate_task_complexity as _estimate_task_complexity_impl,
)
from coordinator_routing import (
    find_agent_id as _find_agent_id_impl,
)
from coordinator_routing import (
    find_best_agent_for_task as _find_best_agent_for_task_impl,
)
from coordinator_routing import (
    get_agent_tools as _get_agent_tools_impl,
)
from coordinator_routing import (
    resolve_agent as _resolve_agent_impl,
)
from coordinator_routing import (
    setup_agent_isolation as _setup_agent_isolation_impl,
)
from coordinator_triage import decompose_task as _decompose_task_impl
from coordinator_triage import triage_task as _triage_task_impl
from discussion_manager import DiscussionManager
from dynamic_router import DynamicRouter
from meeting import MeetingSession
from mixed_location_discussion import MixedLocationDiscussion
from negotiation import NegotiationEngine
from protocol import (
    LLM_FALLBACK_TEMPLATE,
    AgentRole,
    MeetingAgentStatus,
    SemanticAnalysisResult,
    WorkflowDefinition,
    WorkflowNode,
    semantic_analysis_to_dict,
)
from review_pipeline import ReviewPipeline

# WhyBuddy化：导入拆分后的子模块
from semantic_analyzer import SemanticAnalyzer
from task_orchestrator import TaskOrchestrator
from team import Team
from workflow_engine import WorkflowEngine

AGENT_ROLE_PROMPTS = {
    AgentRole.CEO: "你是编程团队的CTO（技术总监）。你的职责是分析用户技术需求、判断技术意图、将开发任务自动分配给最合适的团队成员。你熟悉前后端技术栈、系统架构和团队成员能力。请用简洁果断的技术语言发言。",
    AgentRole.PLANNER: "你是团队的系统架构师。你的职责是分析技术任务、设计系统架构、将复杂需求分解为可执行的开发子任务，并为每个子任务定义验收标准和所需技能标签。请用专业的技术语言发言。",
    AgentRole.EXECUTOR: "你是团队的全栈开发工程师。你的职责是评估任务的技术可行性、提出实现方案、负责代码编写和功能实现。你精通前后端开发技术和最佳实践。请用务实高效的开发语言发言。",
    AgentRole.MONITOR: "你是团队的DevOps工程师。你的职责是评估部署风险、监控系统性能、提出CI/CD和运维建议。你熟悉容器化、部署流水线和性能调优。请用严谨细致的语言发言。",
    AgentRole.REVIEWER: "你是团队的QA工程师。你的职责是审查代码质量、编写测试用例、发现潜在bug和安全漏洞、提出改进建议。你精通代码审查和测试方法论。请用客观公正的语言发言。",
    AgentRole.COORDINATOR: "你是团队的项目经理。你的职责是协调开发各方意见、整合技术方案、跟踪项目进度、管理风险和依赖。请用简明果断的语言发言。",
}

# 各AgentRole在协调器中实际可用的工具集（与AgentToolset权限对齐）
# AGENT_ROLE_TOOLS moved to coordinator_routing.py

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
    return


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
        agent_pool: AgentPool | None = None,
        max_iterations: int = 3,
        workflow_engine: WorkflowEngine | None = None,
        approval_manager: ApprovalManager | None = None,
        approval_timeout: float = 300.0,
        asset_context_builder: Callable[[str, str, list | None], str] | None = None,
        executor_url: str = "",
        session_persistence=None,
        kernel_integration=None,
    ):
        self._max_iterations = max_iterations
        self._executor_url = executor_url
        self._kernel = kernel_integration
        self._session_persistence = session_persistence
        self._approval_manager = approval_manager
        self._approval_timeout = approval_timeout
        self._asset_context_builder = asset_context_builder
        self._data_dir = data_dir
        self._experience_extractor = None  # lazy init
        self.meeting = meeting_session
        self.provider = provider
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url

        from tool_executor import ToolExecutor
        from tool_registry import ToolRegistry

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
        self._tasks: list[dict[str, Any]] = []
        self._on_message: Callable[[str, str, str], Awaitable[None]] | None = None
        self._current_on_message: Callable[[str, str, str], Awaitable[None]] | None = None
        self.logger = logging.getLogger("meeting_coordinator")
        self.agenda = AgendaStateMachine()
        self.negotiation = NegotiationEngine()

        # DynamicRouter 初始化
        routing_table_path = os.path.join(data_dir, "routing_table.json")
        self._ensure_default_routing_table(routing_table_path)
        self.router = DynamicRouter(routing_table_path)
        # 注入 AgentProfileManager 到路由器（技能等级加权）
        try:
            from agent_profile_manager import AgentProfileManager
            self.router.set_profile_manager(AgentProfileManager(os.path.join(data_dir, "agent_profiles")))
        except Exception as e:
            self.logger.debug("AgentProfileManager 注入跳过: %s", e)

        # RoutingStatsManager：路由统计管理
        from routing_stats_manager import RoutingStatsManager
        self._routing_stats = RoutingStatsManager(self.router)

        # PlannerAgent 用于生成结构化验收反馈
        self.planner = PlannerAgent(name="coordinator_planner")

        # WorkflowEngine 初始化（可由外部注入共享实例，保证 REST 可管理会议工作流）
        self.workflow_engine = workflow_engine or WorkflowEngine()
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
            executor_url=executor_url,
            on_agent_status_change=lambda agent_id, status: asyncio.ensure_future(
                self._notify_agent_status(agent_id, status)
            ),
            kernel_integration=kernel_integration,
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
        self._mixed_discussion: MixedLocationDiscussion | None = None

        # Artifact 存储（角色产出物通过文件系统传递）
        self._artifact_store = None
        if workspace and workspace.root_path:
            from artifact_store import ArtifactStore
            self._artifact_store = ArtifactStore(workspace.root_path)

    def _get_experience_extractor(self):
        """懒初始化 ExperienceExtractor 实例（复用，避免每次调用新建）"""
        if self._experience_extractor is None:
            from experience_extractor import ExperienceExtractor
            exp_dir = os.path.join(self._data_dir, "experience")
            self._experience_extractor = ExperienceExtractor(incremental_dir=exp_dir)
        return self._experience_extractor

    # ── 持久化辅助 ──

    def _save_snapshot(self) -> None:
        """保存当前会议状态快照到 SQLite"""
        if not self._session_persistence:
            return
        try:
            state = {
                "meeting_id": self.meeting.meeting_id if hasattr(self.meeting, 'meeting_id') else "",
                "provider": self.provider,
                "model_name": self.model_name,
                "agents": [
                    {"id": a.id, "name": a.name, "role": a.role.value, "status": a.status.value,
                     "location": getattr(a, 'location', 'local')}
                    for a in self.meeting.agents
                ],
                "tasks": [
                    {"id": t.id, "agent_id": t.agent_id, "description": t.description[:200], "status": t.status}
                    for t in self.meeting.tasks
                ],
                "messages_count": len(self.meeting.messages) if hasattr(self.meeting, 'messages') else 0,
            }
            self._session_persistence.save_snapshot(self.meeting.meeting_id, state)
        except Exception as e:
            self.logger.warning("保存会话快照失败: %s", e)

    def _check_idempotent(self, execution_key: str) -> bool:
        """检查任务是否已执行（幂等）。返回 True 表示应跳过。"""
        if not self._session_persistence:
            return False
        status = self._session_persistence.check_task_executed(execution_key)
        if status == "completed":
            self.logger.info("任务 %s 已完成，跳过重复执行", execution_key)
            return True
        return False

    def _mark_task_started(self, execution_key: str, task_id: str) -> None:
        """标记任务开始（幂等执行）"""
        if self._session_persistence:
            self._session_persistence.mark_task_started(
                execution_key, task_id, getattr(self.meeting, 'meeting_id', '')
            )

    def _mark_task_completed(self, execution_key: str) -> None:
        """标记任务完成"""
        if self._session_persistence:
            self._session_persistence.mark_task_completed(execution_key)

    @property
    def _agent_pool(self):
        """Agent pool（委托给 ModelManager）"""
        return self._model_manager._agent_pool

    @_agent_pool.setter
    def _agent_pool(self, value):
        self._model_manager._agent_pool = value

    @property
    def _models(self) -> dict[str, Agent]:
        """模型缓存（委托给 ModelManager，保持向后兼容）"""
        return self._model_manager._models

    @property
    def _model_pool_ids(self) -> dict[str, str]:
        """模型池 ID 映射（委托给 ModelManager，保持向后兼容）"""
        return self._model_manager._model_pool_ids

    @property
    def _task_routing(self) -> dict[str, str]:
        """任务路由映射（委托给 RoutingStatsManager，保持向后兼容）"""
        return self._routing_stats._task_routing

    # ── Agent 状态通知（T13: 3D 场景可视化） ──

    async def _notify_agent_status(self, agent_id: str, status: str, current_tool: str = "", artifact_count: int = 0) -> None:
        await _notify_agent_status_impl(self, agent_id, status, current_tool, artifact_count)

    async def _notify_artifact_created(self, agent_id: str, files_count: int, file_types: list, summary: str = "") -> None:
        await _notify_artifact_created_impl(self, agent_id, files_count, file_types, summary)

    # ── Agent 隔离工作区 ──

    def _setup_agent_isolation(self) -> dict[str, str]:
        return _setup_agent_isolation_impl(self)

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
    def _extract_tool_calls_from_text(text: str) -> list[dict[str, Any]]:
        """从 LLM 文本提取工具调用 JSON（委托给 coordinator_workflow）"""
        from coordinator_workflow import extract_tool_calls_from_text
        return extract_tool_calls_from_text(text)

    async def _execute_workflow_node(self, node: WorkflowNode, input_data: dict) -> dict:
        """执行工作流节点（委托给 coordinator_workflow）"""
        from coordinator_workflow import execute_workflow_node
        return await execute_workflow_node(self, node, input_data)

    async def _run_node_gate(self, node: WorkflowNode) -> dict | None:
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

    async def decompose_task(self, task_description: str) -> list[dict[str, Any]]:
        return await _decompose_task_impl(self, task_description)

    async def run_discussion(
        self,
        topic: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        max_rounds: int = 2,
        team: Team | None = None,
    ) -> list[dict[str, str]]:
        """运行多角色讨论（委托给 coordinator_discussion）"""
        from coordinator_discussion import run_discussion
        return await run_discussion(self, topic, on_message, max_rounds, team)

    def _find_agent_id(self, role: AgentRole) -> str | None:
        return _find_agent_id_impl(self, role)

    async def _msg(self, agent_id: str, text: str) -> None:
        """发送消息给前端并记录到会议"""
        if self._current_on_message:
            await self._current_on_message(agent_id, text, "")
        self.meeting.add_message("agent", text, agent_id)

    def _resolve_agent(self, agent_id: str) -> Optional['MeetingAgentInfo']:  # noqa: F821
        return _resolve_agent_impl(self, agent_id)

    @staticmethod
    def _estimate_task_complexity(task_description: str) -> int:
        return _estimate_task_complexity_impl(task_description)

    def _find_best_agent_for_task(self, task_description: str):
        return _find_best_agent_for_task_impl(self, task_description)

    def _get_agent_tools(self, agent) -> set:
        return _get_agent_tools_impl(self, agent)

    def _agent_can_execute(self, agent, task_description: str) -> bool:
        return _agent_can_execute_impl(self, agent, task_description)

    def _ensure_default_routing_table(self, path: str) -> None:
        _ensure_default_routing_table_impl(path)

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
            prompt = (
                f"紧急情况！{agent_id}报告了关键阻塞问题：\n{content}\n\n"
                f"请作为规划者提出应急解决方案（2-3句话）。"
            )
            text = None

            # ── Kernel-first: use agent_decide ──
            if self._kernel and self._kernel.is_available():
                try:
                    decision = self._kernel.agent_decide("planner", prompt)
                    if decision:
                        text = decision.get("reasoning", "")
                except Exception as e:
                    self.logger.debug("Kernel 紧急响应失败: %s", e)

            # ── LLM fallback ──
            if not text:
                model = self._get_model(AgentRole.PLANNER)
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
        self, subtasks: list[dict[str, Any]] = None
    ) -> list[dict[str, Any]]:
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
            await self._notify_agent_status(agent_id, "working")

            assignments.append({
                "task_id": task.id,
                "agent_id": agent_id,
                "subtask": subtask,
            })

        self._tasks = subtasks or self._tasks
        return assignments

    async def execute_assigned_tasks(self) -> list[dict[str, Any]]:
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
        self, coordinator_id: str, injected_rule_ids: list[str], review_result: dict[str, Any]
    ) -> None:
        await _update_injected_rule_effectiveness_impl(self, coordinator_id, injected_rule_ids, review_result)

    # ── 证据驱动交付 ──

    @staticmethod
    def _build_peer_context(current_agent_id: str, execution_results: list[dict[str, Any]]) -> str:
        """构建其他 agent 已完成工作的上下文（协调协议）

        当多个 agent 执行同一任务时，每个 agent 的 prompt 应包含
        其他 agent 已完成的工作，避免重复（类似 Cumora 的 verbatim-dup）。
        """
        peer_parts = []
        for er in execution_results:
            agent_id = er.get("agent_id", "")
            if agent_id == current_agent_id:
                continue
            result_text = er.get("result", "")
            written = er.get("written_files", [])
            if result_text or written:
                summary = result_text[:200] if result_text else "(无文字结果)"
                files = f"文件: {', '.join(written)}" if written else ""
                peer_parts.append(f"[{agent_id}] {summary} {files}".strip())

        if not peer_parts:
            return ""
        return "\n\n## 其他 agent 已完成的工作（请勿重复）\n" + "\n".join(peer_parts)

    @staticmethod
    def _verify_delivery(execution_results: list[dict[str, Any]]) -> dict[str, Any]:
        """验证执行结果有实际产出（证据驱动交付）

        检查：
        1. 执行结果非空
        2. 至少有一个 agent 产出了内容（written_files 或 result 非空）
        3. 没有全部失败（至少一个成功）

        Returns:
            {"passed": bool, "reason": str, "evidence": list}
        """
        if not execution_results:
            return {"passed": False, "reason": "无执行结果", "evidence": []}

        evidence = []
        has_output = False
        all_failed = True

        for er in execution_results:
            agent_id = er.get("agent_id", "?")
            result_text = er.get("result", "")
            written = er.get("written_files", [])
            is_failure = "失败" in result_text or "error" in result_text.lower()

            if not is_failure:
                all_failed = False

            if written or (result_text and len(result_text) > 20):
                has_output = True
                evidence.append({
                    "agent_id": agent_id,
                    "files": len(written),
                    "result_len": len(result_text),
                })

        if all_failed:
            return {"passed": False, "reason": "所有 agent 执行失败", "evidence": evidence}
        if not has_output:
            return {"passed": False, "reason": "无实际产出（无文件、无有效结果）", "evidence": evidence}

        return {"passed": True, "reason": "ok", "evidence": evidence}

    @staticmethod
    def _triage_task(user_message: str) -> dict[str, Any]:
        return _triage_task_impl(user_message)

    async def _run_simple_path(self, user_message: str, ceo_id: str, on_message, team_id: str = "") -> dict[str, Any]:
        return await _run_simple_path_impl(self, user_message, ceo_id, on_message, team_id)

    async def _lightweight_review(self, reviewer_id, task_desc, exec_text, on_message) -> dict:
        return await _lightweight_review_impl(self, reviewer_id, task_desc, exec_text, on_message)

    def _grant_task_xp(self, agent_id, skill_id, task_success, review_score, task_complexity, department: str = ""):
        return _grant_task_xp_impl(self, agent_id, skill_id, task_success, review_score, task_complexity, department)

    def _recall_agent_memory(self, agent_id: str, task_description: str) -> str:
        return _recall_agent_memory_impl(self, agent_id, task_description)

    def _write_task_memory(self, agent_id: str, task_description: str, task_success: bool, review_score: float, execution_summary: str = ""):
        _write_task_memory_impl(self, agent_id, task_description, task_success, review_score, execution_summary)

    def _finalize_skill_evolution(self, extractor, packager, project_id: str) -> dict[str, Any]:
        return _finalize_skill_evolution_impl(self, extractor, packager, project_id)

    def _log_skill_evolution(self, project_id: str, rule) -> None:
        _log_skill_evolution_impl(project_id, rule)

    @staticmethod
    def _build_execution_artifact_text(exec_results: list[dict[str, Any]], max_summary_len: int = 400) -> str:
        return _build_execution_artifact_text_impl(exec_results, max_summary_len)

    async def _save_execution_artifacts(self, exec_results: list[dict[str, Any]]) -> None:
        await _save_execution_artifacts_impl(self, exec_results)

    async def execute_and_review_task(
        self,
        task_description: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        return await _execute_and_review_task_impl(self, task_description, on_message)

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

    def _run_deterministic_gate(self, workspace_root: str | None = None) -> dict[str, Any]:
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
    ) -> dict[str, Any]:
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
        await self._notify_agent_status(target_agent_id, "working")

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
    ) -> dict[str, Any]:
        """
        处理用户消息（编排方法，协调各阶段子流程）

        架构说明：
        - CEO（主智能体）只负责团队创建和任务交接
        - COORDINATOR（团队负责人）接管所有内部流程管理
        """
        self._on_message = on_message
        self._current_on_message = on_message

        # 持久化：开始处理时保存快照
        self._save_snapshot()

        ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR) or "agent-coordinator"

        # 任务分流门（规则引擎，0 token）
        triage = self._triage_task(user_message)
        self.logger.info("任务分流: level=%s confidence=%.2f reason=%s",
                         triage["level"], triage["confidence"], triage["reason"])

        if triage["level"] == "simple" and triage["confidence"] >= 0.8:
            await self._msg(ceo_id, f"CEO：收到简单任务「{user_message[:50]}...」，直接分派执行。")
            return await self._run_simple_path(user_message, ceo_id, on_message, team_id=team_id)

        # CEO 交接
        await self._msg(ceo_id, f"CEO：收到任务「{user_message[:50]}...」，已交给项目经理处理。")

        # 需求确认 + 语义分析
        await self._msg(coordinator_id, f"项目经理：收到需求，正在确认细节。\n需求概述：{user_message[:100]}\n正在分析需求复杂度和团队配置...")
        analysis = await self.semantic_analyze(user_message, team_id=team_id)
        await self._announce_analysis(coordinator_id, analysis)
        await self._announce_plan(coordinator_id)

        # 1. 工作流模式（复杂任务）
        if analysis.is_workflow and analysis.workflow_definition:
            return await self._run_workflow_mode(analysis, coordinator_id, on_message)

        # 2. 串行流程：讨论 → [投票?] → 分派 → 执行 → 审查
        topic = (analysis.discussion_topic.strip() if analysis.discussion_topic else "") or user_message
        team = getattr(self, '_team', None)

        # 标准任务跳过讨论，直接分派（减少 LLM 调用）
        if triage["level"] == "standard":
            await self._msg(coordinator_id, "项目经理：标准任务，跳过讨论直接分派。")
            discussion_results = []
        else:
            await self._msg(coordinator_id, f"项目经理：组织团队讨论「{topic[:30]}...」")
            discussion_results = await self.run_discussion(topic, on_message, max_rounds=1, team=team)

        # T14: 发送结构化讨论摘要（前端可用于格式化展示）
        if discussion_results and on_message:
            try:
                summary_data = {
                    "type": "discussion_summary",
                    "topic": topic[:100],
                    "participants": len(discussion_results),
                    "stances": {
                        r.get("parsed_stance", r.get("stance", "neutral")): r.get("agent_id", "")
                        for r in discussion_results if r.get("agent_id")
                    },
                }
                await on_message(coordinator_id, "", "", msg_type="discussion_summary", **summary_data)
            except Exception as e:
                self.logger.debug("讨论摘要发送失败: %s", e)  # 结构化消息失败不阻断流程

        original_description = analysis.task_description or user_message
        enhanced_description = self._enhance_task_description(original_description, discussion_results)
        enhanced_description, injected_rule_ids = await self._inject_experience(coordinator_id, original_description, enhanced_description, discussion_results, target_agent_id=analysis.target_agent_id or "")
        await self._msg(coordinator_id, "项目经理：已整合团队讨论结果，任务描述已更新。")

        target_agent_id = analysis.target_agent_id or self._infer_target_agent(discussion_results) or "agent-executor"

        # 投票（仅复杂任务需要，标准任务跳过）
        if triage["level"] == "complex":
            vote_passed = await self._run_voting_phase(coordinator_id, enhanced_description, discussion_results, on_message)
            if not vote_passed:
                return {"type": "vote_rejected"}
        else:
            await self._msg(coordinator_id, "项目经理：标准任务，跳过投票环节直接分派。")

        # 分派
        await self._msg(coordinator_id, f"项目经理：将任务分派给{target_agent_id}执行。")
        assign_result = await self.auto_assign_task(enhanced_description, target_agent_id, analysis.reason)

        # 审批
        await self._run_approval_phase(coordinator_id, target_agent_id, enhanced_description, on_message)

        # 执行 + 审查循环
        # 记忆注入：任务开始前检索 agent 相关经验
        memory_context = self._recall_agent_memory(target_agent_id, enhanced_description)
        if memory_context:
            enhanced_description = f"{enhanced_description}\n\n{memory_context}"
            await self._msg(coordinator_id, "项目经理：已注入 agent 历史记忆。")

        await self._msg(coordinator_id, "项目经理：监督任务执行和质量审查。")
        discussion_context = self._extract_discussion_decisions(discussion_results)
        execution_results, review_result, review_report = await self._run_dev_loop(
            coordinator_id, enhanced_description, discussion_context, on_message,
        )

        # 证据驱动交付：验证执行结果有实际产出
        evidence = self._verify_delivery(execution_results)
        if not evidence["passed"]:
            await self._msg(coordinator_id, f"项目经理：⚠️ 交付验证未通过 — {evidence['reason']}。任务标记为需补充。")
            review_result.setdefault("structured_feedback", {})["status"] = "revision_required"

        # 总结 + 技能进化
        self._update_routing_stats_safe()

        # 授予 XP（执行即得基础 XP，审查通过额外奖励）
        structured = review_result.get("structured_feedback", {})
        review_approved = structured.get("status", "approved") == "approved"
        review_score = structured.get("score", 8.0) if isinstance(structured.get("score"), (int, float)) else 8.0
        task_complexity = self._estimate_task_complexity(user_message)
        for exec_result in execution_results:
            agent_id = exec_result.get("agent_id", target_agent_id)
            dept = assign_result.get("dept_id", "")
            if not dept:
                routing = self.last_routing_decision
                dept = routing.selected_dept if routing else ""
            # 执行即得基础 XP（task_success=True），审查通过给高 review_score 加成
            bonus_score = review_score if review_approved else max(5.0, review_score - 3.0)
            self._grant_task_xp(agent_id, "backend_dev", True, bonus_score, task_complexity, department=dept)

            # 跨会话记忆：任务完成后自动写入 agent 记忆
            self._write_task_memory(
                agent_id, user_message, review_approved, review_score,
                execution_summary=exec_result.get("result", "")[:200],
            )

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

    async def _inject_experience(self, coordinator_id, original_description, enhanced_description, discussion_results, target_agent_id: str = ""):
        return await _inject_experience_impl(self, coordinator_id, original_description, enhanced_description, discussion_results, target_agent_id)

    def _log_knowledge_flow(self, from_agent: str, to_agent: str, rule_ids: list[str]) -> None:
        _log_knowledge_flow_impl(from_agent, to_agent, rule_ids)

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
            await on_message(agent.id, f"[投票] {'赞成' if vote_approve else '反对'} - {vote_reason}", "")

        vote_result = self.negotiation.evaluate_consensus(proposal.id)
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
        return await _run_dev_loop_impl(self, coordinator_id, enhanced_description, discussion_context, on_message)

    async def _run_skill_evolution(self, coordinator_id, user_message, discussion_results, review_result, execution_results):
        try:
            extractor = self._get_experience_extractor()
            evolution_rules = extractor.extract_from_meeting(
                project_id=self.meeting.meeting_id, task_description=user_message,
                discussion_results=discussion_results, review_result=review_result, execution_results=execution_results,
            )
            if evolution_rules:
                await self._msg(coordinator_id, f"项目经理：已从本次项目中提取 {len(evolution_rules)} 条经验规则，将在「技能进化」面板中沉淀。")
                self.meeting.add_message("agent", f"项目经理：已从本次项目中提取 {len(evolution_rules)} 条经验规则。", coordinator_id)

            from skill_packager import SkillPackager
            skill_packager = SkillPackager(output_dir=os.path.join(self._data_dir, "packages"))
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

    def _project_discussion_decisions(self) -> str | None:
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
        return await _execute_tool_call_impl(self, tool_name, arguments)

    async def _execute_workflow(
        self,
        workflow_definition: WorkflowDefinition,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> dict[str, Any]:
        """执行工作流（委托给 coordinator_workflow）"""
        from coordinator_workflow import execute_workflow
        return await execute_workflow(self, workflow_definition, on_message)
