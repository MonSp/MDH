"""
WebSocket 消息处理器注册表

将 server.py 中 1175 行的 if/elif 链拆分为独立的 handler 函数，
通过字典路由分发。每个 handler 签名：

    async def handler(msg: dict, session: Session, ctx: WSContext) -> Optional[asyncio.Task]

返回值：如果 handler 创建了需要跟踪的 asyncio.Task（如 agent_task），返回该 Task；
否则返回 None。
"""

import asyncio
import logging
import os
import shutil
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger("ws_handlers")


@dataclass
class WSContext:
    """WebSocket handler 共享上下文，持有全局单例和辅助函数的引用"""
    # 全局单例
    skill_registry: Any = None
    skill_packager: Any = None
    project_manager: Any = None
    experience_extractor: Any = None
    dynamic_router: Any = None
    complexity_classifier: Any = None
    simple_executor: Any = None
    workflow_engine: Any = None
    agent_pool: Any = None
    security_guard: Any = None
    key_manager: Any = None

    # 辅助函数
    build_agenda_snapshot: Callable = None
    with_approver_names: Callable = None
    register_active_coordinator: Callable = None

    # 模块级引用
    skills_dir: str = ""
    sessions: Dict = None
    active_coordinator: Any = None

    def get_workflow_engine(self):
        """动态获取 workflow_engine（支持测试 fixture 替换）"""
        return self.workflow_engine


# ──────────────────── Session 管理 handlers ────────────────────

async def handle_user_message(msg, session, ctx):
    config_changed = False
    if msg.get("provider") and msg["provider"] != session.provider:
        old = session.provider
        session.provider = msg["provider"]
        config_changed = True
        logger.info("提供商变更: %s -> %s (session=%s)", old, msg["provider"], session.session_id)
    if msg.get("model_name") and msg["model_name"] != session.model_name:
        old = session.model_name or "(默认)"
        session.model_name = msg["model_name"]
        config_changed = True
        logger.info("模型名称变更: %s -> %s (session=%s)", old, msg["model_name"], session.session_id)
    if msg.get("api_key") and msg["api_key"] != session.api_key:
        session.api_key = msg["api_key"]
        config_changed = True
        masked = msg["api_key"][:4] + "****" + msg["api_key"][-4:] if len(msg["api_key"]) > 8 else "****"
        logger.info("API KEY 已更新: %s (session=%s)", masked, session.session_id)
    if msg.get("base_url") and msg["base_url"] != session.base_url:
        old = session.base_url
        session.base_url = msg["base_url"]
        config_changed = True
        logger.info("BASE URL 变更: %s -> %s (session=%s)", old, msg["base_url"], session.session_id)
    if "multimodal" in msg and msg["multimodal"] != session.multimodal:
        session.multimodal = bool(msg["multimodal"])
        config_changed = True
        logger.info("多模态支持变更: %s (session=%s)", session.multimodal, session.session_id)
    if msg.get("reset") or config_changed:
        session.agent = None

    content = msg.get("content", "")
    if not content:
        return None

    preview = content[:80] + "..." if len(content) > 80 else content
    logger.info("收到用户消息: session=%s content=%r", session.session_id, preview)

    from agent import run_agent_stream
    return asyncio.create_task(run_agent_stream(session, content))


async def handle_tool_result(msg, session, ctx):
    call_id = msg.get("call_id")
    if call_id and call_id in session.pending:
        future = session.pending.pop(call_id)
        if not future.done():
            future.set_result(msg.get("result", {}))
    return None


async def handle_confirm_result(msg, session, ctx):
    call_id = msg.get("call_id")
    if call_id and call_id in session.pending:
        future = session.pending.pop(call_id)
        if not future.done():
            confirmed = msg.get("confirmed", True)
            logger.info("用户确认结果: call_id=%s confirmed=%s", call_id, confirmed)
            future.set_result({} if confirmed else {"rejected": True})
    return None


async def handle_unified_message(msg, session, ctx):
    content = msg.get("content", "")
    if not content:
        return None

    if msg.get("provider"):
        session.provider = msg["provider"]
    if msg.get("model_name"):
        session.model_name = msg["model_name"]
    if msg.get("api_key"):
        session.api_key = msg["api_key"]
    if msg.get("base_url"):
        session.base_url = msg["base_url"]

    logger.info("收到统一消息: session=%s content=%r", session.session_id, content[:50])

    selected_roles = msg.get("selected_roles", [])
    role_locations = msg.get("role_locations", {})
    execution_preference = msg.get("execution_preference", "auto")

    from approval_manager import ApprovalManager
    from ceo_agent import CeoAgent

    if session._ceo_agent is None:
        if not session._approval_manager:
            session._approval_manager = ApprovalManager()
        session._ceo_agent = CeoAgent(
            session=session,
            project_manager=ctx.project_manager,
            complexity_classifier=ctx.complexity_classifier,
            simple_executor=ctx.simple_executor,
            workflow_engine=ctx.get_workflow_engine(),
            approval_manager=session._approval_manager,
            on_coordinator_created=ctx.register_active_coordinator,
        )

    ceo = session._ceo_agent
    async def _run_ceo():
        try:
            result = await ceo.process_message(content, session.ws.send_json, selected_roles=selected_roles, role_locations=role_locations, execution_preference=execution_preference)
            if result:
                logger.info("CEO处理完成: type=%s path=%s", result.get("type"), result.get("path_used"))
        except Exception as e:
            logger.exception("CEO处理异常: %s", e)
            await session.send_error(str(e))
    asyncio.create_task(_run_ceo())
    return None


async def handle_workspace_confirm_response(msg, session, ctx):
    logger.info("收到 workspace_confirm_response: session=%s", session.session_id)
    if session._ceo_agent:
        session._ceo_agent.handle_workspace_confirm_response({
            "workspace_type": msg.get("workspace_type", "standalone"),
            "repo_path": msg.get("repo_path", ""),
            "branch_name": msg.get("branch_name", ""),
            "output_dir": msg.get("output_dir", ""),
        })
    else:
        logger.warning("收到 workspace_confirm_response 但 ceo_agent 不存在")
    return None


async def handle_page_context(msg, session, ctx):
    page_ctx = msg.get("context", {})
    session.update_page_context(page_ctx)
    logger.info("页面上下文更新: session=%s url=%s", session.session_id, page_ctx.get("url", ""))
    return None


# ──────────────────── 技能管理 handlers ────────────────────

async def handle_save_skill(msg, session, ctx):
    from skills import save_skill_to_dir
    name = msg.get("name", "")
    desc = msg.get("description", "")
    steps = msg.get("steps", [])
    skill_type = msg.get("skill_type", "strict")
    if name and steps:
        save_skill_to_dir(name, desc, steps, skill_type)
        session.agent = None
        logger.info("技能已保存: name=%s type=%s", name, skill_type)
        await session.ws.send_json({"type": "skill_saved", "name": name})
    return None


async def handle_get_skills(msg, session, ctx):
    from skills import list_skills_from_dir
    skills = list_skills_from_dir()
    await session.ws.send_json({"type": "skill_list", "skills": skills})
    return None


async def handle_delete_skill(msg, session, ctx):
    skill_dir_name = msg.get("dir", "")
    if skill_dir_name:
        target = os.path.realpath(os.path.join(ctx.skills_dir, skill_dir_name))
        skills_real = os.path.realpath(ctx.skills_dir)
        if not target.startswith(skills_real + os.sep):
            await session.send_error("非法路径：禁止目录遍历")
        elif os.path.isdir(target):
            shutil.rmtree(target)
            session.agent = None
            logger.info("技能已删除: dir=%s", skill_dir_name)
    await session.ws.send_json({"type": "skill_deleted", "dir": skill_dir_name})
    return None


async def handle_generate_skill_summary(msg, session, ctx):
    from skills import generate_skill_summary
    steps = msg.get("steps", [])
    skill_type = msg.get("skill_type", "strict")
    if steps:
        logger.info("生成技能摘要: session=%s steps=%d type=%s", session.session_id, len(steps), skill_type)
        result = await generate_skill_summary(session, steps, skill_type)
        await session.ws.send_json({"type": "skill_summary", **result})
    return None


# ──────────────────── 会议管理 handlers ────────────────────

async def handle_start_meeting(msg, session, ctx):
    from meeting import MeetingSession, MeetingAgentStatus
    from approval_manager import ApprovalManager
    from ceo_agent import CeoAgent
    from meeting_coordinator import MeetingCoordinator

    if session.meeting_session and session.meeting_session.is_running():
        await session.send_error("会议已在进行中")
        return None

    if msg.get("provider"):
        session.provider = msg["provider"]
    if msg.get("model_name"):
        session.model_name = msg["model_name"]
    if msg.get("api_key"):
        session.api_key = msg["api_key"]
    if msg.get("base_url"):
        session.base_url = msg["base_url"]

    logger.info("会议配置: provider=%s model=%s", session.provider, session.model_name or "(默认)")

    meeting_id = str(uuid.uuid4())[:8]
    meeting = MeetingSession(meeting_id)
    meeting.start()
    session.meeting_session = meeting
    session.meeting_mode = True

    from workspace_manager import WorkspaceManager, WorkspaceType
    workspaces_base = os.environ.get(
        "AGENT_WORKSPACES_DIR",
        os.path.join(os.path.expanduser("~"), ".agent-workspaces")
    )
    workspace_mgr = WorkspaceManager(workspaces_dir=workspaces_base)
    workspace = workspace_mgr.create_workspace(task_id=meeting_id, workspace_type=WorkspaceType.STANDALONE)
    session._workspace_manager = workspace_mgr
    session._workspace = workspace

    if not session._approval_manager:
        session._approval_manager = ApprovalManager()

    try:
        await ctx.agent_pool.health_check(timeout=3.0)
    except Exception:
        logger.warning("会议开始前 agent_pool 健康探测失败，继续创建会议")

    from session_persistence import SessionPersistence
    session_persistence = SessionPersistence()

    # 资产注入回调：自动检索团队资产注入到任务上下文
    from asset_injection import build_asset_context
    from asset_store import AssetStore
    _asset_store = AssetStore(os.path.join(ctx.data_dir, "assets"))
    _extractor = ctx.experience_extractor
    asset_context_builder = lambda team_id, task_type, keywords: build_asset_context(
        _asset_store, _extractor, team_id, task_type, keywords
    )

    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=session.provider,
        model_name=session.model_name or "",
        api_key=session.api_key,
        base_url=session.base_url or "",
        workspace=workspace,
        agent_pool=ctx.agent_pool,
        max_iterations=msg.get("max_iterations", 3),
        workflow_engine=ctx.get_workflow_engine(),
        approval_manager=session._approval_manager,
        session_persistence=session_persistence,
        asset_context_builder=asset_context_builder,
    )
    session._meeting_coordinator = coordinator
    ctx.active_coordinator = coordinator

    if session._ceo_agent is None:
        if not session._approval_manager:
            session._approval_manager = ApprovalManager()
        session._ceo_agent = CeoAgent(
            session=session,
            project_manager=ctx.project_manager,
            complexity_classifier=ctx.complexity_classifier,
            simple_executor=ctx.simple_executor,
            workflow_engine=ctx.get_workflow_engine(),
            approval_manager=session._approval_manager,
            on_coordinator_created=ctx.register_active_coordinator,
        )
    session._ceo_agent._meeting_coordinator = coordinator
    session._ceo_agent._agenda = coordinator.agenda
    session._agenda = coordinator.agenda

    from compensation import CheckpointManager
    session._checkpoint_manager = CheckpointManager()

    logger.info("会议已创建: meeting_id=%s session=%s", meeting_id, session.session_id)
    await session.send_and_buffer({
        "type": "meeting_started",
        "meeting_id": meeting_id,
        "agents": meeting.get_agents_dict(),
        "sequence_no": session.next_sequence(),
    })

    await session.send_and_buffer({
        "type": "agenda_update",
        "phase": "idle",
        "topic": "",
        "current_speaker": None,
        "proposal_id": None,
        "token_queue": [],
        "event_history": [],
        "sequence_no": session.next_sequence(),
    })
    return None


async def handle_meeting_message(msg, session, ctx):
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None

    content = msg.get("content", "")
    if not content:
        return None

    logger.info("收到会议消息: session=%s content=%r", session.session_id, content[:100])
    session.meeting_session.add_message("boss", content)

    ceo = getattr(session, '_ceo_agent', None)
    if ceo:
        prev = getattr(session, '_meeting_task', None)
        if prev and not prev.done():
            prev.cancel()
            logger.info("取消上一轮会议处理任务: session=%s", session.session_id)

        async def _run_meeting_message():
            try:
                await ceo.handle_meeting_message(content, session.ws.send_json)
            except asyncio.CancelledError:
                logger.info("会议消息处理已取消: session=%s", session.session_id)
            except Exception:
                logger.exception("会议消息处理异常: session=%s", session.session_id)
                try:
                    await session.send_error("会议消息处理出错")
                except Exception:
                    logger.debug("发送错误通知失败（WebSocket 可能已关闭）: session=%s", session.session_id)

        session._meeting_task = asyncio.create_task(_run_meeting_message())
        await session.ws.send_json({"type": "meeting_message_ack", "content": content})
    else:
        logger.warning("CEO Agent未初始化: session=%s", session.session_id)
        await session.ws.send_json({"type": "meeting_message_ack", "content": content})
    return None


async def handle_task_assign(msg, session, ctx):
    from meeting import MeetingAgentStatus
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None

    agent_id = msg.get("agentId", "")
    description = msg.get("description", "")
    if not agent_id or not description:
        return None

    task = session.meeting_session.add_task(agent_id, description)
    session.meeting_session.update_task_status(task.id, "assigned")
    session.meeting_session.update_agent_status(agent_id, MeetingAgentStatus.WORKING)
    session.meeting_session.add_message("boss", f"任务已派发给 {agent_id}: {description}")

    if session.project_id and session.task_id:
        try:
            ctx.project_manager.add_subtask(session.project_id, session.task_id, task.id, description, agent_id)
        except Exception as e:
            logger.warning("子任务持久化到项目失败: %s", e)

    logger.info("任务已派发: task_id=%s agent_id=%s", task.id, agent_id)
    await session.send_and_buffer({
        "type": "task_assigned", "taskId": task.id, "agentId": agent_id,
        "status": "assigned", "sequence_no": session.next_sequence(),
    })
    await session.send_and_buffer({
        "type": "agent_status_update", "agentId": agent_id,
        "status": "working", "currentTask": task.id, "sequence_no": session.next_sequence(),
    })
    return None


async def handle_task_delete(msg, session, ctx):
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None
    task_id = msg.get("taskId", "")
    if not task_id:
        return None
    success = session.meeting_session.delete_task(task_id)
    if success:
        await session.send_and_buffer({
            "type": "task_deleted", "taskId": task_id, "sequence_no": session.next_sequence(),
        })
    else:
        await session.send_error(f"任务不存在: {task_id}")
    return None


async def handle_end_meeting(msg, session, ctx):
    if not session.meeting_session:
        await session.send_error("没有进行中的会议")
        return None
    summary = session.meeting_session.get_summary()
    session.meeting_session.stop()
    session.meeting_session.cleanup()
    meeting_id = session.meeting_session.meeting_id
    session.clear_meeting()
    if session._workspace_manager and session._workspace:
        try:
            session._workspace_manager.cleanup_workspace(session._workspace)
        except Exception as e:
            logger.warning("工作区清理失败: %s", e)
    logger.info("会议已结束: meeting_id=%s", meeting_id)
    await session.send_and_buffer({
        "type": "meeting_ended", "summary": summary, "sequence_no": session.next_sequence(),
    })
    return None


async def handle_get_meeting_status(msg, session, ctx):
    if not session.meeting_session:
        await session.send_error("没有进行中的会议")
        return None
    await session.ws.send_json({
        "type": "meeting_status",
        "meeting_id": session.meeting_session.meeting_id,
        "agents": session.meeting_session.get_agents_dict(),
        "tasks": session.meeting_session.get_tasks_dict(),
        "is_running": session.meeting_session.is_running(),
    })
    return None


async def handle_pause_task(msg, session, ctx):
    task_id = msg.get("taskId", "")
    if session.meeting_session and task_id:
        session.meeting_session.update_task_status(task_id, "paused")
        await session.ws.send_json({"type": "task_paused", "taskId": task_id})
    return None


async def handle_resume_task(msg, session, ctx):
    task_id = msg.get("taskId", "")
    if session.meeting_session and task_id:
        session.meeting_session.update_task_status(task_id, "assigned")
        await session.ws.send_json({"type": "task_resumed", "taskId": task_id})
    return None


# ──────────────────── 议程/投票 handlers ────────────────────

async def handle_agenda_action(msg, session, ctx):
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None
    ceo = getattr(session, '_ceo_agent', None)
    if ceo and ceo.agenda:
        agenda = ceo.agenda
    else:
        coordinator = getattr(session, '_meeting_coordinator', None)
        if coordinator and hasattr(coordinator, 'agenda'):
            agenda = coordinator.agenda
        elif session._agenda is not None:
            agenda = session._agenda
        else:
            from agenda import AgendaStateMachine
            session._agenda = AgendaStateMachine()
            agenda = session._agenda

    action = msg.get("action", "")
    topic = msg.get("topic", "")
    reason = msg.get("reason", "")
    result = False
    if action == "open_topic" and topic:
        result = agenda.open_topic(topic)
    elif action == "start_discussion":
        result = agenda.start_discussion()
    elif action == "propose":
        result = agenda.propose("")
    elif action == "start_voting":
        result = agenda.start_voting()
    elif action == "accept":
        result = agenda.accept()
    elif action == "reject":
        result = agenda.reject()
    elif action == "close":
        result = agenda.close()
    elif action == "declare_emergency":
        result = agenda.declare_emergency(reason or "手动触发")
    elif action == "resolve_emergency":
        result = agenda.resolve_emergency()

    await session.send_and_buffer(ctx.build_agenda_snapshot(agenda, session))
    return None


async def handle_override_decision(msg, session, ctx):
    decision_id = msg.get("decision_id", "")
    new_decision = msg.get("new_decision", "")
    await session.ws.send_json({
        "type": "decision_overridden", "decision_id": decision_id, "new_decision": new_decision,
    })
    return None


async def handle_create_proposal(msg, session, ctx):
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None
    coordinator = getattr(session, '_meeting_coordinator', None)
    if not coordinator or not hasattr(coordinator, 'negotiation'):
        await session.send_error("协商引擎未初始化")
        return None
    proposer_id = msg.get("proposerId", "user")
    content = msg.get("content", "")
    if not content:
        await session.send_error("提案内容不能为空")
        return None
    proposal = coordinator.negotiation.create_proposal(proposer_id, content)
    agenda = getattr(coordinator, 'agenda', None) or session._agenda
    if agenda:
        agenda.propose(proposal.id)
    await session.send_and_buffer({
        "type": "proposal",
        "proposal": {
            "id": proposal.id, "proposerId": proposal.proposer_id,
            "content": proposal.content, "stance": "neutral", "confidence": 0.5,
            "argumentRefs": [], "createdAt": proposal.created_at,
        },
        "sequence_no": session.next_sequence(),
    })
    if agenda:
        await session.send_and_buffer(ctx.build_agenda_snapshot(agenda, session, proposal_id=proposal.id))
    return None


async def handle_cast_vote(msg, session, ctx):
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None
    coordinator = getattr(session, '_meeting_coordinator', None)
    if not coordinator or not hasattr(coordinator, 'negotiation'):
        await session.send_error("协商引擎未初始化")
        return None
    proposal_id = msg.get("proposalId", "")
    voter_id = msg.get("voterId", "user")
    approve = msg.get("approve", True)
    weight = msg.get("weight")
    reason = msg.get("reason", "")
    proposal = coordinator.negotiation._proposals.get(proposal_id)
    if not proposal:
        await session.send_error(f"提案 {proposal_id} 不存在")
        return None
    existing_votes = coordinator.negotiation._votes.get(proposal_id, [])
    if any(v.voter_id == voter_id for v in existing_votes):
        await session.send_error(f"{voter_id} 已经对提案 {proposal_id} 投过票")
        return None
    vote = coordinator.negotiation.cast_vote(proposal_id, voter_id, approve, weight, reason)
    if vote is None:
        await session.send_error("投票失败")
        return None
    await session.send_and_buffer({
        "type": "vote",
        "vote": {
            "proposalId": vote.proposal_id, "voterId": vote.voter_id,
            "approve": vote.approve, "weight": vote.weight, "reason": vote.reason,
        },
        "sequence_no": session.next_sequence(),
    })
    agents = session.meeting_session.agents
    voted_ids = {v.voter_id for v in coordinator.negotiation._votes.get(proposal_id, [])}
    all_voted = all(a.id in voted_ids for a in agents)
    if all_voted and len(agents) > 0:
        result = coordinator.negotiation.evaluate_consensus(proposal_id)
        agenda = getattr(coordinator, 'agenda', None) or session._agenda
        if agenda:
            if result.accepted:
                agenda.accept()
            else:
                agenda.reject()
        await session.send_and_buffer({
            "type": "vote_result",
            "result": {
                "proposalId": result.proposal_id, "strategy": result.strategy.value,
                "totalVotes": result.total_votes, "approveCount": result.approve_count,
                "opposeCount": result.oppose_count, "weightedApprove": result.weighted_approve,
                "weightedOppose": result.weighted_oppose, "accepted": result.accepted,
            },
            "sequence_no": session.next_sequence(),
        })
        if agenda:
            await session.send_and_buffer({
                "type": "agenda_update",
                "phase": agenda.get_phase().value, "topic": agenda._topic,
                "current_speaker": agenda.get_current_speaker(), "proposal_id": proposal_id,
                "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
                "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
                "sequence_no": session.next_sequence(),
            })
    return None


async def handle_evaluate_consensus(msg, session, ctx):
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None
    coordinator = getattr(session, '_meeting_coordinator', None)
    if not coordinator or not hasattr(coordinator, 'negotiation'):
        await session.send_error("协商引擎未初始化")
        return None
    proposal_id = msg.get("proposalId", "")
    result = coordinator.negotiation.evaluate_consensus(proposal_id)
    agenda = getattr(coordinator, 'agenda', None) or session._agenda
    if agenda:
        if result.accepted:
            agenda.accept()
        else:
            agenda.reject()
    await session.send_and_buffer({
        "type": "vote_result",
        "result": {
            "proposalId": result.proposal_id,
            "totalVotes": result.total_votes, "approveCount": result.approve_count,
            "opposeCount": result.oppose_count, "accepted": result.accepted,
        },
        "sequence_no": session.next_sequence(),
    })
    if agenda:
        await session.send_and_buffer(ctx.build_agenda_snapshot(agenda, session, proposal_id=proposal_id))
    return None


async def handle_request_retransmit(msg, session, ctx):
    from_seq = msg.get("from_sequence_no", 0)
    buffered = getattr(session, "_message_buffer", [])
    for buffered_msg in buffered:
        if buffered_msg.get("sequence_no", 0) >= from_seq:
            await session.ws.send_json(buffered_msg)
    return None


# ──────────────────── 工作区/Bridge/审批 handlers ────────────────────

async def handle_workspace_action(msg, session, ctx):
    action = msg.get("action")
    workspace_id = msg.get("workspace_id")
    if action == "list":
        workspaces = session._workspace_manager.list_workspaces() if session._workspace_manager else []
        await session.ws.send_json({
            "type": "workspace_list", "workspaces": [w.__dict__ for w in workspaces],
        })
    elif action == "destroy":
        if session._workspace_manager:
            success = session._workspace_manager.destroy_workspace(workspace_id)
            await session.ws.send_json({
                "type": "workspace_destroyed", "workspace_id": workspace_id, "success": success,
            })
    return None


async def handle_tool_call(msg, session, ctx):
    tool_name = msg.get("tool_name")
    arguments = msg.get("arguments", {})
    if session._meeting_coordinator and session._meeting_coordinator._tool_executor:
        result = await session._meeting_coordinator.execute_tool_call(tool_name, arguments)
        await session.ws.send_json({"type": "tool_result", "tool_name": tool_name, **result})
    return None


async def handle_bridge_register_agent(msg, session, ctx):
    from agent_bridge import AgentBridge
    ts_agent_id = msg.get("tsAgentId")
    name = msg.get("name", "Unknown")
    role = msg.get("role", "executor")
    capabilities = msg.get("capabilities", [])
    if not session._agent_bridge:
        session._agent_bridge = AgentBridge(meeting_session=session.meeting_session, agent_pool=ctx.agent_pool)
    await session._agent_bridge.register_ts_agent(ts_agent_id, name, role, capabilities, session.send_and_buffer)
    return None


async def handle_bridge_unregister_agent(msg, session, ctx):
    ts_agent_id = msg.get("tsAgentId")
    if session._agent_bridge:
        await session._agent_bridge.unregister_ts_agent(ts_agent_id, session.send_and_buffer)
    return None


async def handle_bridge_message(msg, session, ctx):
    from agent_bridge import AgentBridge
    from_id = msg.get("fromAgentId")
    to_id = msg.get("toAgentId")
    payload = msg.get("payload", {})
    if not session._agent_bridge:
        session._agent_bridge = AgentBridge(meeting_session=session.meeting_session, agent_pool=ctx.agent_pool)
    await session._agent_bridge.route_message(from_id, to_id, payload, session.send_and_buffer, coordinator=session._meeting_coordinator)
    return None


async def handle_human_approval_response(msg, session, ctx):
    from approval_manager import ApprovalManager
    request_id = msg.get("requestId", "")
    approved = msg.get("approved", False)
    reason = msg.get("reason", "")
    if not session._approval_manager:
        session._approval_manager = ApprovalManager()
    success = await session._approval_manager.handle_response(request_id, approved, reason, session.send_and_buffer)
    if not success:
        await session.send_error(f"审批请求 {request_id} 不存在或已处理")
    return None


async def handle_get_pending_approvals(msg, session, ctx):
    from approval_manager import ApprovalManager
    if not session._approval_manager:
        session._approval_manager = ApprovalManager()
    pending = session._approval_manager.get_pending_requests()
    await session.ws.send_json({
        "type": "pending_approvals",
        "requests": ctx.with_approver_names(pending), "count": len(pending),
    })
    return None


async def handle_request_approval(msg, session, ctx):
    from approval_manager import ApprovalManager
    from protocol import RiskLevel
    if not session._approval_manager:
        session._approval_manager = ApprovalManager()
    risk_map = {"low": RiskLevel.LOW, "medium": RiskLevel.MEDIUM, "high": RiskLevel.HIGH, "critical": RiskLevel.CRITICAL}
    requester_id = msg.get("requesterId", "agent-executor")
    operation = msg.get("operation", "unknown_operation")
    description = msg.get("description", "")
    risk_level = risk_map.get(msg.get("riskLevel", "medium"), RiskLevel.MEDIUM)
    confidence = msg.get("confidence", 0.5)
    approval = await session._approval_manager.request_approval(
        requester_id=requester_id, operation=operation, description=description,
        risk_level=risk_level, confidence=confidence, send_fn=session.send_and_buffer,
    )
    logger.info("审批请求已发送: id=%s operation=%s", approval.id, operation)
    return None


# ──────────────────── 检查点 handlers ────────────────────

async def handle_checkpoint_save(msg, session, ctx):
    from compensation import CheckpointManager
    task_id = msg.get("taskId", "")
    step_index = msg.get("stepIndex", 0)
    state = msg.get("state", {})
    if not session._checkpoint_manager:
        session._checkpoint_manager = CheckpointManager()
    checkpoint = session._checkpoint_manager.save_checkpoint(task_id, step_index, state)
    await session.send_and_buffer({
        "type": "checkpoint_saved",
        "checkpoint": {"id": checkpoint.id, "taskId": checkpoint.task_id, "stepIndex": checkpoint.step_index, "createdAt": checkpoint.created_at},
        "sequence_no": session.next_sequence(),
    })
    return None


async def handle_checkpoint_restore(msg, session, ctx):
    from compensation import CheckpointManager
    checkpoint_id = msg.get("checkpointId", "")
    if not session._checkpoint_manager:
        session._checkpoint_manager = CheckpointManager()
    state = session._checkpoint_manager.restore_checkpoint(checkpoint_id)
    if state is None:
        await session.send_error(f"检查点 {checkpoint_id} 不存在")
    else:
        checkpoint = session._checkpoint_manager.get_checkpoint(checkpoint_id)
        await session.send_and_buffer({
            "type": "checkpoint_restored", "checkpointId": checkpoint_id,
            "taskId": checkpoint.task_id if checkpoint else "",
            "stepIndex": checkpoint.step_index if checkpoint else 0,
            "state": state, "sequence_no": session.next_sequence(),
        })
    return None


async def handle_get_checkpoints(msg, session, ctx):
    from compensation import CheckpointManager
    task_id = msg.get("taskId", "")
    if not session._checkpoint_manager:
        session._checkpoint_manager = CheckpointManager()
    if task_id:
        checkpoints = session._checkpoint_manager.get_checkpoints_for_task(task_id)
    else:
        checkpoints = []
        for task_cps in session._checkpoint_manager._checkpoints.values():
            checkpoints.extend(task_cps)
    await session.ws.send_json({
        "type": "checkpoints_list", "taskId": task_id,
        "checkpoints": [{"id": cp.id, "taskId": cp.task_id, "stepIndex": cp.step_index, "createdAt": cp.created_at} for cp in checkpoints],
    })
    return None


async def handle_checkpoint_delete(msg, session, ctx):
    from compensation import CheckpointManager
    checkpoint_id = msg.get("checkpointId", "")
    if not session._checkpoint_manager:
        session._checkpoint_manager = CheckpointManager()
    deleted = session._checkpoint_manager.delete_checkpoint(checkpoint_id)
    await session.ws.send_json({"type": "checkpoint_deleted", "checkpointId": checkpoint_id, "success": deleted})
    return None


async def handle_set_max_iterations(msg, session, ctx):
    max_iter = msg.get("maxIterations", 3)
    coordinator = getattr(session, '_meeting_coordinator', None)
    if coordinator:
        coordinator._max_iterations = max(1, min(10, int(max_iter)))
        await session.ws.send_json({"type": "config_updated", "key": "max_iterations", "value": coordinator._max_iterations})
    else:
        await session.send_error("会议协调器未初始化")
    return None


async def handle_save_meeting_snapshot(msg, session, ctx):
    from compensation import CheckpointManager
    meeting = session.meeting_session
    if not meeting or not meeting.is_running():
        await session.send_error("没有进行中的会议")
        return None
    snapshot = {
        "meeting_id": meeting.meeting_id, "agents": meeting.get_agents_dict(),
        "tasks": meeting.get_tasks_dict(),
        "messages": meeting.deriveMessages(event_types=["user_message", "agent_message", "system"], window=50),
        "phase": session._agenda.get_phase().value if session._agenda else "idle",
    }
    if not session._checkpoint_manager:
        session._checkpoint_manager = CheckpointManager()
    cp = session._checkpoint_manager.save_checkpoint(f"meeting-{meeting.meeting_id}", 0, snapshot)
    await session.send_and_buffer({
        "type": "meeting_snapshot_saved", "checkpointId": cp.id,
        "meetingId": meeting.meeting_id, "sequence_no": session.next_sequence(),
    })
    return None


async def handle_restore_meeting_snapshot(msg, session, ctx):
    checkpoint_id = msg.get("checkpointId", "")
    if not session._checkpoint_manager:
        await session.send_error("无检查点")
        return None
    state = session._checkpoint_manager.restore_checkpoint(checkpoint_id)
    if not state:
        await session.send_error(f"检查点 {checkpoint_id} 不存在")
        return None
    meeting = session.meeting_session
    if meeting:
        for task_data in state.get("tasks", []):
            try:
                task = meeting.add_task(task_data["agent_id"], task_data["description"])
                meeting.update_task_status(task.id, task_data["status"])
            except Exception as e:
                logger.debug("恢复任务失败: %s", e)
        restored_messages = state.get("messages", [])
        meeting.messages = restored_messages
        meeting.rebuild_events_from_messages(restored_messages)
    await session.send_and_buffer({
        "type": "meeting_snapshot_restored", "checkpointId": checkpoint_id,
        "meetingId": state.get("meeting_id", ""),
        "tasksRestored": len(state.get("tasks", [])),
        "messagesRestored": len(state.get("messages", [])),
        "sequence_no": session.next_sequence(),
    })
    return None


async def handle_critical_blocker(msg, session, ctx):
    agent_id = msg.get("agentId", "unknown")
    content = msg.get("content", "")
    blocker_type = msg.get("blockerType", "unknown")
    if not session.meeting_session or not session.meeting_session.is_running():
        await session.send_error("没有进行中的会议")
        return None
    coordinator = getattr(session, '_meeting_coordinator', None)
    if not coordinator:
        await session.send_error("会议协调器未初始化")
        return None
    await session.send_and_buffer({
        "type": "critical_blocker", "agentId": agent_id, "content": content,
        "blockerType": blocker_type, "sequence_no": session.next_sequence(),
    })
    try:
        await coordinator.handle_critical_blocker(
            agent_id, content,
            lambda aid, text, extra=None: session.send_and_buffer({
                "type": "agent_message", "agentId": aid, "content": text,
                "sequence_no": session.next_sequence(),
            }),
        )
        agenda = getattr(coordinator, 'agenda', None) or session._agenda
        if agenda:
            await session.send_and_buffer({
                "type": "agenda_update",
                "phase": agenda.get_phase().value, "topic": agenda._topic,
                "current_speaker": agenda.get_current_speaker(), "proposal_id": None,
                "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
                "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
                "sequence_no": session.next_sequence(),
            })
    except Exception as e:
        logger.error("紧急响应处理失败: %s", e)
        await session.send_error(f"紧急响应处理失败: {e}")
    return None


async def handle_get_audit_log(msg, session, ctx):
    from security import RiskLevel
    agent_id = msg.get("agentId")
    operation = msg.get("operation")
    risk_level_str = msg.get("riskLevel")
    risk_level = None
    if risk_level_str:
        try:
            risk_level = RiskLevel(risk_level_str)
        except ValueError:
            pass
    entries = ctx.security_guard.get_audit_log(agent_id=agent_id, operation=operation, risk_level=risk_level)
    await session.ws.send_json({
        "type": "audit_log_list",
        "entries": [{"id": e.id, "agentId": e.agent_id, "operation": e.operation, "target": e.target, "riskLevel": e.risk_level.value, "allowed": e.allowed, "reason": e.reason, "timestamp": e.timestamp} for e in entries],
        "count": len(entries),
    })
    return None


async def handle_log_audit(msg, session, ctx):
    agent_id = msg.get("agentId", "unknown")
    operation = msg.get("operation", "unknown")
    target = msg.get("target", "")
    capability = msg.get("capability", operation)
    allowed = msg.get("allowed", True)
    reason = msg.get("reason", "")
    ctx.security_guard._log_audit(agent_id, operation, target, capability, allowed, reason, [])
    latest = ctx.security_guard._audit_log[-1] if ctx.security_guard._audit_log else None
    if latest:
        await session.send_and_buffer({
            "type": "audit_log",
            "entry": {"id": latest.id, "agentId": latest.agent_id, "operation": latest.operation, "target": latest.target, "riskLevel": latest.risk_level.value, "allowed": latest.allowed, "reason": latest.reason, "timestamp": latest.timestamp},
            "sequence_no": session.next_sequence(),
        })
    return None


# ──────────────────── 注册表 ────────────────────

HANDLER_REGISTRY: Dict[str, Callable] = {
    "user_message": handle_user_message,
    "tool_result": handle_tool_result,
    "confirm_result": handle_confirm_result,
    "unified_message": handle_unified_message,
    "workspace_confirm_response": handle_workspace_confirm_response,
    "page_context": handle_page_context,
    "save_skill": handle_save_skill,
    "get_skills": handle_get_skills,
    "delete_skill": handle_delete_skill,
    "generate_skill_summary": handle_generate_skill_summary,
    "start_meeting": handle_start_meeting,
    "meeting_message": handle_meeting_message,
    "task_assign": handle_task_assign,
    "task_delete": handle_task_delete,
    "end_meeting": handle_end_meeting,
    "get_meeting_status": handle_get_meeting_status,
    "pause_task": handle_pause_task,
    "resume_task": handle_resume_task,
    "agenda_action": handle_agenda_action,
    "override_decision": handle_override_decision,
    "create_proposal": handle_create_proposal,
    "cast_vote": handle_cast_vote,
    "evaluate_consensus": handle_evaluate_consensus,
    "request_retransmit": handle_request_retransmit,
    "workspace_action": handle_workspace_action,
    "tool_call": handle_tool_call,
    "bridge_register_agent": handle_bridge_register_agent,
    "bridge_unregister_agent": handle_bridge_unregister_agent,
    "bridge_message": handle_bridge_message,
    "human_approval_response": handle_human_approval_response,
    "get_pending_approvals": handle_get_pending_approvals,
    "request_approval": handle_request_approval,
    "checkpoint_save": handle_checkpoint_save,
    "checkpoint_restore": handle_checkpoint_restore,
    "get_checkpoints": handle_get_checkpoints,
    "checkpoint_delete": handle_checkpoint_delete,
    "set_max_iterations": handle_set_max_iterations,
    "save_meeting_snapshot": handle_save_meeting_snapshot,
    "restore_meeting_snapshot": handle_restore_meeting_snapshot,
    "critical_blocker": handle_critical_blocker,
    "get_audit_log": handle_get_audit_log,
    "log_audit": handle_log_audit,
}


async def dispatch(msg_type: str, msg: dict, session, ctx: WSContext) -> Optional[asyncio.Task]:
    """分发 WebSocket 消息到对应的 handler。返回 handler 创建的 Task（如有）。"""
    handler = HANDLER_REGISTRY.get(msg_type)
    if handler:
        return await handler(msg, session, ctx)
    else:
        logger.warning("未知消息类型: %s (session=%s)", msg_type, session.session_id)
        return None
