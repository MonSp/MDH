"""
CeoAgent - CEO智能体

作为用户与团队之间的唯一接口，负责：
1. 接收用户消息，分析意图
2. 判断任务复杂度，选择执行路径
3. 查找/创建项目，组建团队
4. 将任务交给项目经理(Coordinator)执行
5. 接收结果并向用户汇报
"""

import asyncio
import logging
import os
import uuid
from typing import Any, Awaitable, Callable, Dict, Optional

from agentscope.agent import Agent
from agent import PROVIDER_REGISTRY
from meeting import MeetingSession, PERSONAL_ASSISTANT_TEMPLATE
from meeting_coordinator import MeetingCoordinator
from protocol import (
    MeetingAgentStatus,
    meeting_agent_to_dict,
    semantic_analysis_to_dict,
)
from project_manager import ProjectManager
from complexity_classifier import ComplexityClassifier, ComplexityResult
from simple_executor import SimpleExecutor
from agenda import AgendaStateMachine

logger = logging.getLogger("ceo_agent")


class CeoAgent:
    """
    CEO智能体

    职责：
    - 分析用户意图（复杂度判定、项目关联）
    - 选择执行路径（简单/复杂）
    - 组建团队、启动会议
    - 将内部流程交给Coordinator管理
    - 接收汇报并向用户反馈
    """

    def __init__(
        self,
        session,
        project_manager: ProjectManager,
        complexity_classifier: ComplexityClassifier,
        simple_executor: SimpleExecutor,
    ):
        self._session = session
        self._project_manager = project_manager
        self._complexity_classifier = complexity_classifier
        self._simple_executor = simple_executor
        self._meeting_coordinator: Optional[MeetingCoordinator] = None
        self._agenda: Optional[AgendaStateMachine] = None
        self._workspace_manager = None
        self._workspace = None

    @property
    def agenda(self) -> Optional[AgendaStateMachine]:
        return self._agenda

    @property
    def meeting_coordinator(self) -> Optional[MeetingCoordinator]:
        return self._meeting_coordinator

    def _create_model(self, role: str) -> Agent:
        """创建指定角色的Agent模型"""
        role_prompts = {
            "ceo": "你是编程团队的CTO。请用简洁果断的技术语言发言。",
            "planner": "你是团队的系统架构师。请用专业的技术语言发言。",
            "executor": "你是团队的全栈开发工程师。请用务实高效的开发语言发言。",
        }

        provider = self._session.provider or "deepseek"
        reg = PROVIDER_REGISTRY.get(provider)
        if reg is None:
            raise ValueError(f"不支持的模型提供商: {provider}")

        class _TempSession:
            pass
        temp_session = _TempSession()
        temp_session.api_key = self._session.api_key
        temp_session.base_url = self._session.base_url

        credential = reg["credential_cls"](**reg["credential_kwargs"](temp_session))
        formatter = reg["formatter_cls"]()
        model_name = self._session.model_name or reg["default_model"]
        model = reg["model_cls"](
            credential=credential,
            model=model_name,
            stream=True,
            formatter=formatter,
        )
        return Agent(
            name=role,
            system_prompt=role_prompts.get(role, "你是一个AI助手。"),
            model=model,
        )

    def _send_fn(self, send_message: Callable) -> Callable:
        """创建进度回调，自动管理sequence_no"""
        async def send(agent_id: str, text: str, delta: str, **kwargs):
            self._session._sequence_no += 1
            msg_data = {
                "type": "agent_message",
                "agentId": agent_id,
                "content": text,
                "delta": delta,
                "sequence_no": self._session._sequence_no,
            }
            msg_data.update(kwargs)
            await send_message(msg_data)
        return send

    async def process_message(
        self,
        content: str,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> Dict[str, Any]:
        """
        CEO处理用户消息的完整流程

        Args:
            content: 用户消息内容
            send_message: 发送消息到前端的回调 (msg_dict) -> None

        Returns:
            执行结果
        """
        # CEO确认收到任务
        await self._emit(send_message, f"CEO：收到任务「{content[:50]}...」，正在分析意图。")

        # 1. 复杂度判定
        self._complexity_classifier._get_model = self._create_model
        complexity = self._complexity_classifier.classify(content)

        await self._emit(send_message, f"CEO：任务复杂度判定为 {complexity.level}（置信度 {complexity.confidence:.0%}）")

        # 发送复杂度结果到前端
        await send_message({
            "type": "complexity_result",
            "level": complexity.level,
            "confidence": complexity.confidence,
            "reason": complexity.reason,
            "method": complexity.method,
        })

        # 2. 根据复杂度选择路径
        if complexity.level == "simple" and complexity.confidence >= 0.7:
            return await self._execute_simple(content, send_message)
        else:
            return await self._execute_complex(content, send_message)

    async def _execute_simple(
        self,
        content: str,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> Dict[str, Any]:
        """简单路径：单人助理直接执行"""
        await self._emit(send_message, "CEO：任务较简单，指派单人助理直接执行。")
        await send_message({"type": "path_selected", "path": "simple"})

        send_progress = self._send_fn(send_message)
        result = await self._simple_executor.execute(self._session, content, send_progress)

        if result.retry_with_complex:
            # 升级到复杂路径
            await self._emit(send_message, "CEO：简单路径验收未通过，升级为复杂任务，组建专业团队。")
            await send_message({"type": "path_upgrade", "from": "simple", "to": "complex"})

            upgrade_result = await self._simple_executor.upgrade_to_complex(
                self._session, content, send_progress
            )
            return {
                "type": "task_result",
                "path_used": "complex",
                "upgraded_from": "simple",
                **upgrade_result,
            }

        # 简单路径成功
        await self._emit(send_message, "CEO：单人助理已完成任务。")
        return {
            "type": "task_result",
            "path_used": "simple",
            "success": result.success,
            "result": result.result,
            "project_id": result.project_id,
            "review_passed": result.review_passed,
        }

    async def _execute_complex(
        self,
        content: str,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> Dict[str, Any]:
        """复杂路径：创建项目 → 组建团队 → 启动会议 → 协调器接管"""
        await self._emit(send_message, "CEO：任务复杂，需要组建专业团队。正在创建项目并召集会议。")
        await send_message({"type": "path_selected", "path": "complex"})

        # ① 创建项目
        project = self._project_manager.create_project(
            name=f"任务-{content[:20]}",
            brief={"source": "ceo_agent", "original_message": content},
        )
        await self._emit(send_message, f"CEO：项目已创建（{project.project_id}），组建团队中。")

        # ② 创建工作区
        from workspace_manager import WorkspaceManager, WorkspaceType
        workspace_mgr = WorkspaceManager(
            workspaces_dir=os.path.join("data", "workspaces"),
            repo_path=os.getcwd(),
        )
        workspace = workspace_mgr.create_workspace(
            task_id=project.project_id,
            workspace_type=WorkspaceType.GIT_WORKTREE,
            branch_name=f"agent/task-{project.project_id[:8]}",
        )
        self._workspace_manager = workspace_mgr
        self._workspace = workspace

        # 通知前端工作区已创建
        await send_message({
            "type": "workspace_created",
            "workspace_id": workspace.workspace_id,
            "workspace_path": workspace.root_path,
            "branch_name": workspace.branch_name,
        })

        # ③ 检查是否已有会议进行中
        if self._session.meeting_session and self._session.meeting_session.is_running():
            await send_message({"type": "meeting_error", "message": "会议已在进行中"})
            return {"type": "error", "message": "会议已在进行中"}

        # ④ 创建会议和团队
        meeting_id = str(uuid.uuid4())[:8]
        meeting = MeetingSession(meeting_id)
        meeting.start()
        self._session.meeting_session = meeting
        self._session.meeting_mode = True

        # ⑤ 启动协调器
        coordinator = MeetingCoordinator(
            meeting_session=meeting,
            provider=self._session.provider,
            model_name=self._session.model_name or "",
            api_key=self._session.api_key,
            base_url=self._session.base_url or "",
        )
        self._meeting_coordinator = coordinator
        self._agenda = coordinator.agenda
        self._session._meeting_coordinator = coordinator
        self._session._agenda = coordinator.agenda

        # 通知前端会议已启动
        self._session._sequence_no += 1
        await send_message({
            "type": "meeting_started",
            "meeting_id": meeting_id,
            "agents": meeting.get_agents_dict(),
            "project_id": project.project_id,
            "sequence_no": self._session._sequence_no,
        })

        await self._emit(send_message, "CEO：团队已就绪，将任务交给项目经理。项目经理将组织讨论、分派任务并监督执行。")

        # ⑥ 交给Coordinator执行完整流程（讨论→分派→审查）
        send_progress = self._send_fn(send_message)
        try:
            result = await coordinator.process_user_message(content, send_progress)
            logger.info("Coordinator处理完成: type=%s", result.get("type") if result else "None")
            return await self._handle_coordinator_result(result, project, meeting_id, send_message)
        except Exception as e:
            logger.exception("复杂路径执行异常: %s", e)
            await send_message({"type": "meeting_error", "message": str(e)})
            task_result = {
                "type": "task_result",
                "path_used": "complex",
                "success": False,
                "project_id": project.project_id,
                "meeting_id": meeting_id,
                "error": str(e),
            }
            await send_message(task_result)
            return task_result

    async def _handle_coordinator_result(
        self,
        result: Dict[str, Any],
        project,
        meeting_id: str,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> Dict[str, Any]:
        """处理Coordinator返回的结果，转换为前端消息"""

        if not result:
            task_result = {"type": "task_result", "path_used": "complex", "success": True, "project_id": project.project_id, "meeting_id": meeting_id}
            logger.info("发送 task_result (result is None)")
            await send_message(task_result)
            return task_result

        result_type = result.get("type")
        logger.info("_handle_coordinator_result: result_type=%s", result_type)

        # 工作流模式
        if result_type == "workflow_executed":
            workflow_result = result.get("workflow_result", {})
            await send_message({
                "type": "workflow_executed",
                "workflow_id": workflow_result.get("execution_id", ""),
                "status": workflow_result.get("status", ""),
                "results": workflow_result.get("results", {}),
                "analysis": result.get("analysis", {}),
            })
            await self._emit(send_message, "CEO：工作流执行完成。")
            task_result = {
                "type": "task_result",
                "path_used": "complex",
                "success": True,
                "project_id": project.project_id,
                "meeting_id": meeting_id,
                "workflow_id": workflow_result.get("execution_id", ""),
                "status": workflow_result.get("status", ""),
            }
            logger.info("发送 task_result (workflow_executed)")
            await send_message(task_result)
            return task_result

        # 串行流程模式
        if result_type == "serial_completed":
            assignment = result.get("assignment", {})
            review_result = result.get("review_result", {})

            # 发送任务分配消息
            self._session._sequence_no += 1
            await send_message({
                "type": "task_auto_assigned",
                "taskId": assignment.get("task_id", ""),
                "agentId": assignment.get("agent_id", ""),
                "description": assignment.get("description", ""),
                "reason": assignment.get("reason", ""),
                "status": assignment.get("status", "assigned"),
                "analysis": result.get("analysis", {}),
                "sequence_no": self._session._sequence_no,
            })

            # 发送审查结果
            if review_result:
                if review_result.get("structured_feedback"):
                    self._session._sequence_no += 1
                    feedback = review_result["structured_feedback"]
                    await send_message({
                        "type": "structured_feedback",
                        "taskId": assignment.get("task_id", ""),
                        "agentId": "agent-reviewer",
                        "feedback": feedback,
                        "sequence_no": self._session._sequence_no,
                    })

                    if feedback.get("status") == "revision_required":
                        self._session._sequence_no += 1
                        await send_message({
                            "type": "iteration_update",
                            "taskId": assignment.get("task_id", ""),
                            "agentId": assignment.get("agent_id", ""),
                            "iteration_status": {
                                "task_id": assignment.get("task_id", ""),
                                "current_iteration": feedback.get("current_iteration", 1),
                                "max_iterations": feedback.get("max_iterations", 3),
                                "status": feedback.get("status", "revision_required"),
                                "corrections": [],
                            },
                            "sequence_no": self._session._sequence_no,
                        })

                self._session._sequence_no += 1
                await send_message({
                    "type": "review_completed",
                    "taskId": assignment.get("task_id", ""),
                    "critic_result": review_result.get("critic_result", {}),
                    "grounding_result": review_result.get("grounding_result", {}),
                    "sequence_no": self._session._sequence_no,
                })

            await self._emit(send_message, "CEO：任务执行完成，质量审查已通过。")
            task_result = {
                "type": "task_result",
                "path_used": "complex",
                "success": True,
                "project_id": project.project_id,
                "meeting_id": meeting_id,
                "task_id": assignment.get("task_id", ""),
                "status": "completed",
                "discussion_results": result.get("discussion_results", []),
            }
            logger.info("发送 task_result (serial_completed)")
            await send_message(task_result)
            return task_result

        # 其他结果
        task_result = {
            "type": "task_result",
            "path_used": "complex",
            "success": True,
            "project_id": project.project_id,
            "meeting_id": meeting_id,
            **result,
        }
        logger.info("发送 task_result (fallback): keys=%s", list(task_result.keys()))
        await send_message(task_result)
        return task_result

    async def handle_meeting_message(
        self,
        content: str,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> None:
        """处理会议中的用户消息（用户以CEO身份介入）"""
        if not self._meeting_coordinator:
            await send_message({"type": "meeting_error", "message": "没有进行中的会议"})
            return

        send_progress = self._send_fn(send_message)
        try:
            result = await self._meeting_coordinator.process_user_message(content, send_progress)
            await self._handle_coordinator_result(result, None, "", send_message)
        except Exception as e:
            logger.exception("会议消息处理异常: %s", e)
            await send_message({"type": "meeting_error", "message": str(e)})

    async def _emit(
        self,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
        text: str,
    ):
        """发送CEO发言消息"""
        self._session._sequence_no += 1
        await send_message({
            "type": "agent_message",
            "agentId": "agent-ceo",
            "content": text,
            "delta": "",
            "sequence_no": self._session._sequence_no,
        })
