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
    AgentRole,
    MeetingAgentStatus,
    meeting_agent_to_dict,
    semantic_analysis_to_dict,
)
from project_manager import ProjectManager
from complexity_classifier import ComplexityClassifier, ComplexityResult
from simple_executor import SimpleExecutor
from agenda import AgendaStateMachine
from team import Team


class _VirtualProject:
    """虚拟项目对象，用于会议消息处理"""
    def __init__(self, meeting_id: str = "unknown"):
        self.project_id = meeting_id


_TEAM_ROLE_TO_AGENT_ROLE = {
    "Coordinator": AgentRole.COORDINATOR,
    "Planner": AgentRole.PLANNER,
    "Executor": AgentRole.EXECUTOR,
    "Reviewer": AgentRole.REVIEWER,
    "Monitor": AgentRole.MONITOR,
}


def team_to_meeting_template(team: Team) -> list[dict]:
    """将 Team 实例转换为会议模板格式。

    Args:
        team: Team 实例，包含成员列表。

    Returns:
        会议模板列表，每项含 id, name, role, capabilities。
    """
    template = []
    for member in team.members:
        agent_role = _TEAM_ROLE_TO_AGENT_ROLE.get(member.team_role, AgentRole.EXECUTOR)
        capabilities = [member.skill_pack_id] if member.skill_pack_id else []
        template.append({
            "id": member.agent_id,
            "name": member.role_name,
            "role": agent_role,
            "capabilities": capabilities,
            "location": member.location.value if hasattr(member.location, 'value') else str(member.location),
        })
    return template


def _build_dag(selected_roles: list[str], roles_config: dict, task_description: str, role_locations: Optional[Dict[str, str]] = None) -> dict:
    """从选中角色构建 DAG，供 instantiate_project 使用。

    Args:
        selected_roles: 用户选中的角色ID列表
        roles_config: 角色配置
        task_description: 任务描述
        role_locations: 每个角色的执行位置 {"executor": "local", "reviewer": "remote"}
    """
    if role_locations is None:
        role_locations = {}
    all_roles = {**roles_config.get("base_roles", {}), **roles_config.get("custom_roles", {})}
    tasks = []
    for role_id in selected_roles:
        role_cfg = all_roles.get(role_id, {})
        skills = role_cfg.get("skills", [])
        tasks.append({
            "task_id": f"task-{role_id}",
            "name": role_cfg.get("name", role_id),
            "required_skills": skills,
            "description": task_description[:200],
            "location": role_locations.get(role_id, "local"),
        })
    if not tasks:
        tasks.append({
            "task_id": "task-default",
            "name": "默认任务",
            "required_skills": [],
            "description": task_description[:200],
            "location": "local",
        })
    return {"tasks": tasks}


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
        workflow_engine=None,
        approval_manager=None,
        on_coordinator_created=None,
    ):
        self._session = session
        self._project_manager = project_manager
        self._complexity_classifier = complexity_classifier
        self._simple_executor = simple_executor
        self._workflow_engine = workflow_engine
        self._approval_manager = approval_manager
        # 协调器创建回调：server 注入以更新 _active_coordinator，
        # 保证 CEO 对话（unified_message）路径创建的协调器可被共享引擎委托执行。
        self._on_coordinator_created = on_coordinator_created
        self._meeting_coordinator: Optional[MeetingCoordinator] = None
        self._agenda: Optional[AgendaStateMachine] = None
        self._workspace_manager = None
        self._workspace = None
        self._workspace_confirm_event: Optional[asyncio.Event] = None
        self._workspace_confirm_response: Optional[Dict[str, Any]] = None

    @property
    def agenda(self) -> Optional[AgendaStateMachine]:
        return self._agenda

    @property
    def meeting_coordinator(self) -> Optional[MeetingCoordinator]:
        return self._meeting_coordinator

    def _create_model(self, role: str) -> Agent:
        """创建指定角色的Agent模型"""
        from model_factory import create_agent

        role_prompts = {
            "ceo": "你是编程团队的CTO。请用简洁果断的技术语言发言。",
            "planner": "你是团队的系统架构师。请用专业的技术语言发言。",
            "executor": "你是团队的全栈开发工程师。请用务实高效的开发语言发言。",
        }

        return create_agent(
            provider=self._session.provider or "deepseek",
            api_key=self._session.api_key,
            base_url=self._session.base_url or "",
            model_name=self._session.model_name or "",
            system_prompt=role_prompts.get(role, "你是一个AI助手。"),
            agent_name=role,
            stream=True,
        )

    def _send_fn(self, send_message: Callable) -> Callable:
        """创建进度回调，自动管理sequence_no"""
        async def send(agent_id: str, text: str, delta: str, **kwargs):
            # 结构化审批推送：kind == "approval" 且内容为完整消息 dict
            # （如 human_approval_request）时直接透传完整结构化消息，
            # 保证前端审批面板可识别（对齐 server request_approval 推送模式）。
            if delta == "approval" and isinstance(text, dict):
                payload = dict(text)
                request = payload.get("request")
                if isinstance(request, dict) and "approverName" not in request:
                    from employee_directory import get_directory
                    request = dict(request)
                    request["approverName"] = get_directory().display_name(request.get("approver", ""))
                    payload["request"] = request
                payload.setdefault("sequence_no", self._session.next_sequence())
                await send_message(payload)
                return
            msg_data = {
                "type": "agent_message",
                "agentId": agent_id,
                "content": text,
                "delta": delta,
                "sequence_no": self._session.next_sequence(),
            }
            msg_data.update(kwargs)
            await send_message(msg_data)
        return send

    async def process_message(
        self,
        content: str,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
        selected_roles: Optional[list] = None,
        role_locations: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        CEO处理用户消息的完整流程

        Args:
            content: 用户消息内容
            send_message: 发送消息到前端的回调 (msg_dict) -> None
            selected_roles: 用户选中的角色ID列表，如 ["planner", "executor", "reviewer"]
            role_locations: 每个角色的执行位置，如 {"executor": "local", "reviewer": "remote"}

        Returns:
            执行结果
        """
        # CEO确认收到任务
        await self._emit(send_message, f"CEO：收到任务「{content[:50]}...」，正在分析意图。")

        # 1. 复杂度判定
        self._complexity_classifier._get_model = self._create_model
        complexity = await self._complexity_classifier.classify(content)

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
            return await self._execute_complex(content, send_message, selected_roles, role_locations)

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
        selected_roles: Optional[list] = None,
        role_locations: Optional[Dict[str, str]] = None,
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

        # 创建任务（用户通过CEO对话发起的需求）
        task_id = str(uuid.uuid4())[:8]
        task = self._project_manager.add_task(
            project.project_id, task_id, content[:200]
        )
        self._session.task_id = task_id  # 存储任务ID到会话
        await self._emit(send_message, f"CEO：任务已创建（{task_id}），准备启动会议。")

        # ② 创建工作区（先询问用户确认）
        from workspace_manager import WorkspaceManager, WorkspaceType, DirectoryNotEmptyError
        workspaces_base = os.environ.get(
            "AGENT_WORKSPACES_DIR",
            os.path.join(os.path.expanduser("~"), ".agent-workspaces")
        )
        workspace_mgr = WorkspaceManager(workspaces_dir=workspaces_base)

        # 检测是否指定了已有项目路径
        import re
        repo_match = re.search(r'(?:在|修改|更新|优化)\s*[「「]?([^\s」」]+(?:/[^\s」」]+)*)[」」]?', content)
        suggested_type = "git_worktree" if (repo_match and os.path.isdir(repo_match.group(1))) else "standalone"
        suggested_path = repo_match.group(1) if repo_match else ""

        # 发送工作区确认请求给前端，等待用户选择
        self._workspace_confirm_event = asyncio.Event()
        self._workspace_confirm_response = None
        await send_message({
            "type": "workspace_confirm_request",
            "project_id": project.project_id,
            "task_description": content[:200],
            "suggested_type": suggested_type,
            "suggested_path": suggested_path,
            "options": {
                "workspace_types": [
                    {"id": "standalone", "name": "新建独立工作区", "desc": "创建全新空目录，适合新项目"},
                    {"id": "git_worktree", "name": "Git Worktree", "desc": "从已有仓库创建隔离分支，适合已有项目开发"},
                ],
                "default_output_dir": workspaces_base,
            },
        })

        # 等待用户响应（不设超时，由前端控制）
        logger.info("等待工作区确认: project_id=%s", project.project_id)
        await self._workspace_confirm_event.wait()
        logger.info("收到工作区确认响应")

        # 根据用户选择创建工作区
        resp = self._workspace_confirm_response or {}
        workspace_type = WorkspaceType.GIT_WORKTREE if resp.get("workspace_type") == "git_worktree" else WorkspaceType.STANDALONE
        repo_path = resp.get("repo_path") or (suggested_path if workspace_type == WorkspaceType.GIT_WORKTREE else None)
        branch_name = resp.get("branch_name") or (f"agent/task-{project.project_id[:8]}" if workspace_type == WorkspaceType.GIT_WORKTREE else None)
        custom_output_dir = resp.get("output_dir") or ""

        if custom_output_dir:
            workspaces_base = custom_output_dir
            workspace_mgr = WorkspaceManager(workspaces_dir=workspaces_base)

        if workspace_type == WorkspaceType.GIT_WORKTREE:
            await self._emit(send_message, f"CEO：将从 {repo_path} 创建隔离工作区。")
        else:
            await self._emit(send_message, "CEO：将创建全新的工作区。")

        try:
            workspace = workspace_mgr.create_workspace(
                task_id=project.project_id,
                workspace_type=workspace_type,
                repo_path=repo_path,
                branch_name=branch_name,
            )
        except DirectoryNotEmptyError as e:
            # 目录非空，需要用户确认
            scan = e.scan
            await self._emit(send_message, f"CEO：检测到目标目录已有内容，需要您确认。")

            # 发送确认请求给前端
            self._workspace_confirm_event = asyncio.Event()
            self._workspace_confirm_response = None
            await send_message({
                "type": "workspace_confirm_request",
                "project_id": project.project_id,
                "task_description": content[:200],
                "suggested_type": "standalone",
                "suggested_path": custom_output_dir or workspaces_base,
                "existing_project": {
                    "path": scan.path,
                    "has_git": scan.has_git,
                    "file_count": scan.file_count,
                    "files": scan.files,
                    "project_hints": scan.project_hints,
                },
                "options": {
                    "workspace_types": [
                        {"id": "continue", "name": "继续在此目录", "desc": "追加文件到现有目录"},
                        {"id": "git_worktree", "name": "Git Worktree", "desc": "从已有仓库创建隔离分支"},
                        {"id": "new_dir", "name": "选择新目录", "desc": "指定一个空目录"},
                    ],
                    "default_output_dir": workspaces_base,
                },
            })

            # 等待用户响应
            await self._workspace_confirm_event.wait()
            resp2 = self._workspace_confirm_response or {}

            if resp2.get("action") == "continue":
                # 用户确认继续
                workspace = workspace_mgr.create_workspace(
                    task_id=project.project_id,
                    workspace_type=workspace_type,
                    repo_path=repo_path,
                    branch_name=branch_name,
                    force=True,
                )
            elif resp2.get("action") == "new_dir":
                # 用户指定新目录
                new_dir = resp2.get("output_dir", "")
                if new_dir:
                    workspace_mgr = WorkspaceManager(workspaces_dir=new_dir)
                    workspace = workspace_mgr.create_workspace(
                        task_id=project.project_id,
                        workspace_type=WorkspaceType.STANDALONE,
                    )
                else:
                    await self._emit(send_message, "CEO：未指定新目录，操作取消。")
                    return {"type": "error", "message": "未指定新目录"}
            elif resp2.get("action") == "git_worktree":
                # 用户选择用 git worktree
                new_repo = resp2.get("repo_path", custom_output_dir or workspaces_base)
                workspace = workspace_mgr.create_workspace(
                    task_id=project.project_id,
                    workspace_type=WorkspaceType.GIT_WORKTREE,
                    repo_path=new_repo,
                    branch_name=f"agent/task-{project.project_id[:8]}",
                )
            else:
                await self._emit(send_message, "CEO：用户取消了操作。")
                return {"type": "error", "message": "用户取消"}

        except ValueError as e:
            # Git项目目录等不可恢复的错误
            await self._emit(send_message, f"CEO：工作区创建失败 - {e}")
            await send_message({"type": "meeting_error", "message": str(e)})
            return {"type": "error", "message": str(e)}

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

        # ④ 创建会议，通过 Team 抽象组建团队
        meeting_id = str(uuid.uuid4())[:8]
        meeting = MeetingSession(meeting_id)

        from agent_toolset import load_roles_config
        roles_config = load_roles_config()
        dag = _build_dag(selected_roles or [], roles_config, content, role_locations)
        team = self._project_manager.instantiate_project(project.project_id, dag)
        team_template = team_to_meeting_template(team)
        await self._emit(send_message, f"CEO：团队已组建（{len(team.members)} 人）：{', '.join(m.role_name for m in team.members)}")

        meeting.start(team_template=team_template)
        self._session.meeting_session = meeting
        self._session.meeting_mode = True

        # ⑤ 启动协调器（传入workspace以启用工具系统）。
        # 与 server start_meeting 构造点保持一致：注入共享 workflow_engine 与
        # approval_manager（审批真阻塞等待 + 前端 human_approval_response 解析用同一实例）。
        if self._approval_manager is None:
            from approval_manager import ApprovalManager
            self._approval_manager = ApprovalManager()
            self._session._approval_manager = self._approval_manager
        from session_persistence import SessionPersistence
        coordinator = MeetingCoordinator(
            meeting_session=meeting,
            provider=self._session.provider,
            model_name=self._session.model_name or "",
            api_key=self._session.api_key,
            base_url=self._session.base_url or "",
            workspace=workspace,
            workflow_engine=self._workflow_engine,
            approval_manager=self._approval_manager,
            executor_url=os.environ.get("MDH_EXECUTOR_URL", ""),
            session_persistence=SessionPersistence(),
        )
        # 传递Team实例给协调器，用于并行讨论
        coordinator._team = team
        self._meeting_coordinator = coordinator
        self._agenda = coordinator.agenda
        self._session._meeting_coordinator = coordinator
        self._session._agenda = coordinator.agenda

        # 注册为活动协调器（server 委托执行器按最近启动的会议路由），
        # 否则 CEO 对话路径的共享引擎工作流委托会因 _active_coordinator=None 失败。
        if self._on_coordinator_created:
            self._on_coordinator_created(coordinator)

        # 通知前端会议已启动
        self._session.project_id = project.project_id  # 存储项目ID到会话
        await send_message({
            "type": "meeting_started",
            "meeting_id": meeting_id,
            "agents": meeting.get_agents_dict(),
            "project_id": project.project_id,
            "sequence_no": self._session.next_sequence(),
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
            await send_message({
                "type": "task_auto_assigned",
                "taskId": assignment.get("task_id", ""),
                "agentId": assignment.get("agent_id", ""),
                "description": assignment.get("description", ""),
                "reason": assignment.get("reason", ""),
                "status": assignment.get("status", "assigned"),
                "analysis": result.get("analysis", {}),
                "sequence_no": self._session.next_sequence(),
            })

            # 发送审查结果
            if review_result:
                if review_result.get("structured_feedback"):
                    feedback = review_result["structured_feedback"]
                    await send_message({
                        "type": "structured_feedback",
                        "taskId": assignment.get("task_id", ""),
                        "agentId": "agent-reviewer",
                        "feedback": feedback,
                        "sequence_no": self._session.next_sequence(),
                    })

                    if feedback.get("status") == "revision_required":
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
                            "sequence_no": self._session.next_sequence(),
                        })

                await send_message({
                    "type": "review_completed",
                    "taskId": assignment.get("task_id", ""),
                    "critic_result": review_result.get("critic_result", {}),
                    "grounding_result": review_result.get("grounding_result", {}),
                    "sequence_no": self._session.next_sequence(),
                })

            await self._emit(send_message, "CEO：任务执行完成，质量审查已通过。")
            
            # 提取写入的文件信息
            execution_results = result.get("execution_results", [])
            written_files = []
            for exec_result in execution_results:
                written_files.extend(exec_result.get("written_files", []))
            
            # 如果有文件写入，通知前端
            if written_files:
                await self._emit(send_message, f"CEO：已将 {len(written_files)} 个文件写入工作区：{', '.join(written_files)}")
            
            task_result = {
                "type": "task_result",
                "path_used": "complex",
                "success": True,
                "project_id": project.project_id,
                "meeting_id": meeting_id,
                "task_id": assignment.get("task_id", ""),
                "status": "completed",
                "discussion_results": result.get("discussion_results", []),
                "written_files": written_files,
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
            # 创建一个虚拟project对象用于结果处理
            meeting_id = self._meeting_coordinator.meeting.meeting_id if self._meeting_coordinator else "unknown"
            await self._handle_coordinator_result(result, _VirtualProject(meeting_id), "", send_message)
        except Exception as e:
            logger.exception("会议消息处理异常: %s", e)
            await send_message({"type": "meeting_error", "message": str(e)})

    def handle_workspace_confirm_response(self, response: Dict[str, Any]) -> None:
        """处理前端返回的工作区确认响应"""
        self._workspace_confirm_response = response
        if self._workspace_confirm_event:
            self._workspace_confirm_event.set()

    async def _emit(
        self,
        send_message: Callable[[Dict[str, Any]], Awaitable[None]],
        text: str,
    ):
        """发送CEO发言消息"""
        await send_message({
            "type": "agent_message",
            "agentId": "agent-ceo",
            "content": text,
            "delta": "",
            "sequence_no": self._session.next_sequence(),
        })
