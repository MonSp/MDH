"""
SimpleExecutor - 简单执行引擎

负责简单任务的轻量级执行：创建轻量项目 → 单人助理团队 → 直接执行 → 轻量验收。
跳过会议讨论阶段，直接调用 run_agent_stream 执行任务。
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from meeting import MeetingSession, PERSONAL_ASSISTANT_TEMPLATE
from project_manager import ProjectManager

logger = logging.getLogger("simple_executor")


@dataclass
class ReviewResult:
    """轻量验收结果"""
    passed: bool
    checks: Dict[str, bool] = field(default_factory=dict)
    reason: str = ""


@dataclass
class SimpleResult:
    """简单执行结果"""
    success: bool
    result: str
    project_id: str
    review_passed: bool
    retry_with_complex: bool
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)


class SimpleExecutor:
    """简单执行引擎"""

    def __init__(
        self,
        project_manager: ProjectManager,
        workflow_engine=None,
        on_coordinator_created=None,
        a2a_task_router=None,
        a2a_client=None,
        state_sync=None,
        a2a_post_processor=None,
    ):
        """
        Args:
            project_manager: 项目管理器实例
            workflow_engine: 共享 WorkflowEngine
            on_coordinator_created: 协调器创建回调
            a2a_task_router: A2A 任务路由器（可选，启用 A2A 路由）
            a2a_client: A2A 协议客户端（可选）
            state_sync: 双层状态同步管理器（可选）
            a2a_post_processor: A2A 后处理器（可选，启用完整经验闭环）
        """
        self._project_manager = project_manager
        self._workflow_engine = workflow_engine
        self._on_coordinator_created = on_coordinator_created
        self._a2a_router = a2a_task_router
        self._a2a_client = a2a_client
        self._state_sync = state_sync
        self._post_processor = a2a_post_processor

    async def execute(
        self,
        session,
        content: str,
        on_progress: Callable[[str, str, str], Awaitable[None]],
    ) -> SimpleResult:
        """
        执行简单任务

        流程：
        1. 创建轻量项目容器
        2. 创建助理团队（1人）
        3. 调用 run_agent_stream 执行任务
        4. 执行轻量验收
        5. 验收通过 → 返回结果；验收失败 → 标记需要升级

        Args:
            session: Session 实例
            content: 用户消息内容
            on_progress: 进度回调函数 (agent_id, text, delta) -> None

        Returns:
            SimpleResult
        """
        tool_calls = []
        result_text = ""

        # A2A 路由：检查是否有可用的执行节点
        if self._a2a_router and self._a2a_client:
            try:
                a2a_result = await self._try_a2a_routing(content, on_progress)
                if a2a_result:
                    return a2a_result
            except Exception as e:
                logger.warning("A2A 路由失败，降级到 Python 内部执行: %s", e)

        try:
            # 1. 创建轻量项目
            project = self._create_lightweight_project(content)
            project_id = project.project_id
            logger.info("轻量项目已创建: %s", project_id)

            # 2. 创建助理团队
            meeting = self._create_assistant_team()
            logger.info("助理团队已创建: %s", meeting.meeting_id)

            # 3. 执行任务
            result_text = await self._run_task(session, content, on_progress, tool_calls)
            logger.info("任务执行完成，结果长度: %d", len(result_text))

            # 4. 轻量验收
            review = self._lightweight_review(result_text, tool_calls)
            logger.info("轻量验收: passed=%s reason=%s", review.passed, review.reason)

            return SimpleResult(
                success=True,
                result=result_text,
                project_id=project_id,
                review_passed=review.passed,
                retry_with_complex=not review.passed,
                tool_calls=tool_calls,
            )

        except Exception as e:
            logger.exception("简单执行失败: %s", e)
            return SimpleResult(
                success=False,
                result=f"执行失败: {str(e)}",
                project_id="",
                review_passed=False,
                retry_with_complex=True,
                tool_calls=tool_calls,
            )

    async def _try_a2a_routing(self, content: str, on_progress) -> Optional[SimpleResult]:
        """尝试通过 A2A 协议路由任务到外部执行节点

        Returns:
            SimpleResult 如果成功路由并执行，None 如果需要降级到 Python 内部执行
        """
        decision = self._a2a_router.route(content)
        if not decision or decision.confidence < 0.6:
            return None

        agent = decision.agent
        logger.info("A2A 路由: %s -> %s (置信度=%.2f, 匹配=%s)",
                     content[:50], agent.agent_id, decision.confidence, decision.matched_tags)

        # 通知前端
        if on_progress:
            await on_progress("system", f"通过 A2A 路由到 {agent.card.name} 执行", "")

        # 准备经验注入
        metadata = {}
        if self._state_sync:
            metadata = self._state_sync.prepare_task_metadata(content, agent.agent_id)

        # 发送任务
        event = await self._a2a_client.send_task(agent, content, metadata)

        # 处理结果
        success = event.status and event.status.state == "completed"
        result_text = ""
        if event.artifact and event.artifact.parts:
            result_text = event.artifact.parts[0].text or ""

        # 记录到注册表
        self._a2a_router._registry.record_task(agent.agent_id, success)

        # 任务后状态同步（轻量：记忆 + 规则有效性）
        if self._state_sync:
            self._state_sync.process_task_result(
                agent_id=agent.agent_id,
                task_description=content,
                result_text=result_text,
                success=success,
                task_id=event.task_id,
            )

        # 任务后完整经验闭环（经验提炼 + XP + 记忆 + 路由统计）
        if self._post_processor:
            await self._post_processor.process(
                task_description=content,
                result_text=result_text,
                success=success,
                agent_id=agent.agent_id,
                task_id=event.task_id,
            )

        if success:
            return SimpleResult(
                success=True,
                result=result_text,
                project_id=f"a2a-{event.task_id}",
                review_passed=True,
                retry_with_complex=False,
                tool_calls=[],
            )

        # A2A 执行失败，降级到 Python 内部执行
        logger.warning("A2A 执行失败，降级: %s", event.status.message if event.status else "unknown")
        return None

    def _create_lightweight_project(self, content: str):
        """创建轻量项目容器"""
        name = f"简单任务-{content[:20]}"
        brief = {
            "source": "simple_executor",
            "original_message": content,
        }
        return self._project_manager.create_lightweight_project(name, brief)

    def _create_assistant_team(self) -> MeetingSession:
        """创建单人助理团队"""
        meeting_id = str(uuid.uuid4())[:8]
        meeting = MeetingSession(meeting_id)
        meeting.start(team_template=PERSONAL_ASSISTANT_TEMPLATE)
        return meeting

    async def _run_task(
        self,
        session,
        content: str,
        on_progress: Callable[[str, str, str], Awaitable[None]],
        tool_calls: List[Dict[str, Any]],
    ) -> str:
        """
        调用 run_agent_stream 执行任务

        Args:
            session: Session 实例
            content: 用户消息
            on_progress: 进度回调
            tool_calls: 工具调用记录列表（会被修改）

        Returns:
            执行结果文本
        """
        from agent import run_agent_stream

        # 包装 on_progress 回调，同时收集工具调用
        original_pending = session.pending.copy()

        # 执行任务
        result_text = ""
        try:
            result_text = await run_agent_stream(session, content)
        except Exception as e:
            logger.warning("run_agent_stream 异常: %s", e)
            result_text = f"执行异常: {str(e)}"

        return result_text

    def _lightweight_review(
        self,
        result: str,
        tool_calls: List[Dict[str, Any]],
    ) -> ReviewResult:
        """
        轻量验收

        检查项：
        1. 工具调用是否有 error
        2. 结果文本是否为空

        Args:
            result: 执行结果文本
            tool_calls: 工具调用记录

        Returns:
            ReviewResult
        """
        checks = {}

        # 检查工具调用是否有 error
        has_tool_errors = any(
            tc.get("error") for tc in tool_calls
        )
        checks["tool_errors"] = not has_tool_errors

        # 检查结果文本是否为空
        result_non_empty = bool(result and result.strip())
        checks["result_non_empty"] = result_non_empty

        # 综合判断
        passed = all(checks.values())

        if not passed:
            failed_checks = [k for k, v in checks.items() if not v]
            reason = f"验收失败: {', '.join(failed_checks)}"
        else:
            reason = "验收通过"

        return ReviewResult(
            passed=passed,
            checks=checks,
            reason=reason,
        )

    async def upgrade_to_complex(
        self,
        session,
        content: str,
        on_progress: Callable[[str, str, str], Awaitable[None]],
    ) -> Dict[str, Any]:
        """
        升级到复杂路径

        当简单路径验收失败时，自动走复杂路径。

        Args:
            session: Session 实例
            content: 用户消息内容
            on_progress: 进度回调

        Returns:
            复杂路径的执行结果
        """
        from meeting import MeetingSession, DEFAULT_MEETING_AGENTS
        from meeting_coordinator import MeetingCoordinator

        logger.info("升级到复杂路径: %s", content[:50])

        try:
            # 1. 创建正式项目
            project = self._project_manager.create_project(
                name=f"升级任务-{content[:20]}",
                brief={
                    "source": "upgrade_from_simple",
                    "original_message": content,
                }
            )

            # 2. 组建多角色团队（6人）
            meeting_id = str(uuid.uuid4())[:8]
            meeting = MeetingSession(meeting_id)
            meeting.start()  # 使用 DEFAULT_MEETING_AGENTS
            session.meeting_session = meeting
            session.meeting_mode = True

            # 3. 启动会议协调器
            # 与 server start_meeting / ceo_agent 复杂路径构造点保持一致：注入共享
            # workflow_engine 与会话级 approval_manager，否则该路径审批仍自动通过且
            # 工作流不受共享引擎（REST）管理。
            approval_manager = getattr(session, "_approval_manager", None)
            if approval_manager is None:
                from approval_manager import ApprovalManager
                approval_manager = ApprovalManager()
                session._approval_manager = approval_manager
            coordinator = MeetingCoordinator(
                meeting_session=meeting,
                provider=session.provider,
                model_name=session.model_name or "",
                api_key=session.api_key,
                base_url=session.base_url or "",
                workflow_engine=self._workflow_engine,
                approval_manager=approval_manager,
            )
            if self._on_coordinator_created:
                self._on_coordinator_created(coordinator)
            session._meeting_coordinator = coordinator

            # 4. 执行复杂路径
            result = await coordinator.process_user_message(content, on_progress)

            return {
                "type": "path_upgrade",
                "from": "simple",
                "to": "complex",
                "project_id": project.project_id,
                "meeting_id": meeting_id,
                "result": result,
            }

        except Exception as e:
            logger.exception("升级到复杂路径失败: %s", e)
            return {
                "type": "error",
                "message": f"升级失败: {str(e)}",
            }
