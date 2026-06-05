import asyncio
import json
import logging
import os
import shutil
import time
import uuid
from dataclasses import asdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware

from config import SKILLS_DIR
from session import Session
from skills import list_skills_from_dir, save_skill_to_dir, generate_skill_summary
from agent import run_agent_stream
from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator
from protocol import MeetingAgentStatus, meeting_agent_to_dict, meeting_task_to_dict, meeting_summary_to_dict, semantic_analysis_to_dict, workflow_execution_to_dict, workflow_definition_to_dict
from skill_registry import SkillRegistry
from project_manager import ProjectManager
from experience_extractor import ExperienceExtractor
from skill_packager import SkillPackager
from dynamic_router import DynamicRouter, RouteEntry

logger = logging.getLogger("server")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, Session] = {}

# ──────────────────── 服务实例初始化 ────────────────────

_BASE_DIR = os.path.dirname(__file__)
_DATA_DIR = os.path.join(_BASE_DIR, "data")

skill_registry = SkillRegistry(base_dir=os.path.join(_DATA_DIR, "skill_packages"))
skill_packager = SkillPackager(
    output_dir=os.path.join(_DATA_DIR, "packages"),
)
project_manager = ProjectManager(
    projects_dir=os.path.join(_DATA_DIR, "projects"),
    skill_registry=skill_registry,
    skill_packager=skill_packager,
)
experience_extractor = ExperienceExtractor(
    incremental_dir=os.path.join(_DATA_DIR, "experience"),
)
dynamic_router = DynamicRouter(
    routing_table_path=os.path.join(_DATA_DIR, "routing_table.json"),
)


def _ok(data=None):
    return {"success": True, "data": data, "error": None}


def _fail(error: str):
    return {"success": False, "data": None, "error": error}


# ──────────────────── SkillRegistry REST API ────────────────────


@app.get("/api/skills")
async def list_skills():
    try:
        return _ok(skill_registry.list_skills())
    except Exception as e:
        logger.exception("list_skills 失败")
        return _fail(str(e))


@app.post("/api/skills")
async def register_skill(body: dict = Body(...)):
    try:
        skill_dir = body["skill_dir"]
        pkg = skill_registry.register(skill_dir)
        return _ok(asdict(pkg))
    except KeyError:
        return _fail("缺少必填字段: skill_dir")
    except ValueError as e:
        return _fail(str(e))


@app.post("/api/skills/{skill_id}/clone")
async def clone_skill(skill_id: str, body: dict = Body(...)):
    try:
        target_dir = body["target_dir"]
        path = skill_registry.clone(skill_id, target_dir)
        return _ok({"cloned_path": path})
    except KeyError as e:
        return _fail(str(e))
    except ValueError as e:
        return _fail(str(e))


@app.get("/api/skills/{skill_id}/versions")
async def get_skill_versions(skill_id: str):
    try:
        versions = skill_registry.get_versions(skill_id)
        return _ok(versions)
    except KeyError as e:
        return _fail(str(e))


@app.get("/api/skills/{skill_id}")
async def get_skill(skill_id: str):
    try:
        pkg = skill_registry.get_skill(skill_id)
        return _ok(asdict(pkg))
    except KeyError as e:
        return _fail(str(e))


# ──────────────────── ProjectManager REST API ────────────────────


@app.get("/api/projects")
async def list_projects():
    try:
        return _ok(project_manager.list_projects())
    except Exception as e:
        logger.exception("list_projects 失败")
        return _fail(str(e))


@app.post("/api/projects")
async def create_project(body: dict = Body(...)):
    try:
        name = body["name"]
        brief = body.get("brief", {})
        project = project_manager.create_project(name, brief)
        return _ok(asdict(project))
    except KeyError:
        return _fail("缺少必填字段: name")
    except ValueError as e:
        return _fail(str(e))


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    try:
        project = project_manager.get_project(project_id)
        return _ok(asdict(project))
    except KeyError as e:
        return _fail(str(e))


@app.get("/api/projects/{project_id}/status")
async def get_project_status(project_id: str):
    try:
        status = project_manager.get_project_status(project_id)
        return _ok(status)
    except KeyError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/instantiate")
async def instantiate_project(project_id: str, body: dict = Body(...)):
    try:
        dag = body["dag"]
        employees = project_manager.instantiate_project(project_id, dag)
        return _ok([asdict(e) for e in employees])
    except KeyError as e:
        return _fail(str(e))
    except ValueError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/archive")
async def archive_project(project_id: str):
    try:
        result = project_manager.archive_project(project_id)
        return _ok(result)
    except KeyError as e:
        return _fail(str(e))


# ──────────────────── ExperienceExtractor REST API ────────────────────


def _rule_to_dict(rule) -> dict:
    return asdict(rule)


@app.get("/api/experience/rules")
async def get_all_rules():
    try:
        rules = experience_extractor.get_all_rules()
        return _ok([_rule_to_dict(r) for r in rules])
    except Exception as e:
        logger.exception("get_all_rules 失败")
        return _fail(str(e))


@app.get("/api/experience/rules/pending")
async def get_pending_rules():
    try:
        rules = experience_extractor.get_pending_rules()
        return _ok([_rule_to_dict(r) for r in rules])
    except Exception as e:
        logger.exception("get_pending_rules 失败")
        return _fail(str(e))


@app.post("/api/experience/rules/{rule_id}/approve")
async def approve_rule(rule_id: str, body: dict = Body(...)):
    try:
        comment = body.get("comment", "")
        success = experience_extractor.approve_rule(rule_id, comment)
        if not success:
            return _fail(f"规则不存在: {rule_id}")
        return _ok({"rule_id": rule_id, "status": "approved"})
    except Exception as e:
        logger.exception("approve_rule 失败")
        return _fail(str(e))


@app.post("/api/experience/rules/{rule_id}/reject")
async def reject_rule(rule_id: str, body: dict = Body(...)):
    try:
        reason = body.get("reason", "")
        success = experience_extractor.reject_rule(rule_id, reason)
        if not success:
            return _fail(f"规则不存在: {rule_id}")
        return _ok({"rule_id": rule_id, "status": "rejected"})
    except Exception as e:
        logger.exception("reject_rule 失败")
        return _fail(str(e))


@app.put("/api/experience/rules/{rule_id}")
async def modify_rule(rule_id: str, body: dict = Body(...)):
    try:
        updates = body.get("updates", body)
        success = experience_extractor.modify_rule(rule_id, updates)
        if not success:
            return _fail(f"规则不存在: {rule_id}")
        return _ok({"rule_id": rule_id, "modified": True})
    except Exception as e:
        logger.exception("modify_rule 失败")
        return _fail(str(e))


# ──────────────────── SkillPackager REST API ────────────────────


def _package_result_to_dict(result) -> dict:
    return {
        "package_path": result.package_path,
        "readme_content": result.readme_content,
        "desensitize_report": [asdict(issue) for issue in result.desensitize_report],
        "diff_summary": result.diff_summary,
        "skill_name": result.skill_name,
        "base_version": result.base_version,
        "output_version": result.output_version,
    }


@app.post("/api/skills/package")
async def package_skill(body: dict = Body(...)):
    try:
        base_skill_path = body["base_skill_path"]
        incremental_path = body["incremental_path"]
        project_id = body["project_id"]
        skill_name = body["skill_name"]
        result = skill_packager.full_package(
            base_skill_path=base_skill_path,
            incremental_path=incremental_path,
            project_id=project_id,
            skill_name=skill_name,
        )
        return _ok(_package_result_to_dict(result))
    except KeyError:
        return _fail("缺少必填字段: base_skill_path, incremental_path, project_id, skill_name")
    except FileNotFoundError as e:
        return _fail(str(e))
    except Exception as e:
        logger.exception("package_skill 失败")
        return _fail(str(e))


@app.get("/api/skills/package/preview")
async def preview_package(base_skill_path: str, incremental_path: str):
    try:
        result = skill_packager.preview_package(base_skill_path, incremental_path)
        return _ok(result)
    except FileNotFoundError as e:
        return _fail(str(e))
    except Exception as e:
        logger.exception("preview_package 失败")
        return _fail(str(e))


# ──────────────────── DynamicRouter REST API ────────────────────


@app.get("/api/router/table")
async def get_route_table():
    try:
        return _ok(dynamic_router.get_route_table())
    except Exception as e:
        logger.exception("get_route_table 失败")
        return _fail(str(e))


@app.put("/api/router/table")
async def add_route_entry(body: dict = Body(...)):
    try:
        entry = RouteEntry(
            dept_id=body["dept_id"],
            dept_name=body["dept_name"],
            capability_desc=body.get("capability_desc", ""),
            capability_keywords=body.get("capability_keywords", []),
            tools=body.get("tools", []),
            success_rate=body.get("success_rate", 0.0),
            total_tasks=body.get("total_tasks", 0),
            successful_tasks=body.get("successful_tasks", 0),
            last_active=body.get("last_active", ""),
            priority=body.get("priority", 0),
        )
        success = dynamic_router.add_route_entry(entry)
        if not success:
            return _fail("保存路由表失败")
        return _ok(asdict(entry))
    except KeyError:
        return _fail("缺少必填字段: dept_id, dept_name")
    except Exception as e:
        logger.exception("add_route_entry 失败")
        return _fail(str(e))


@app.delete("/api/router/table/{dept_id}")
async def remove_route_entry(dept_id: str):
    try:
        success = dynamic_router.remove_route_entry(dept_id)
        if not success:
            return _fail(f"部门不存在: {dept_id}")
        return _ok({"dept_id": dept_id, "removed": True})
    except Exception as e:
        logger.exception("remove_route_entry 失败")
        return _fail(str(e))


@app.websocket("/ws")
async def ws_handler(ws: WebSocket):
    await ws.accept()
    session = Session(ws)
    sessions[session.session_id] = session
    session._message_buffer = []
    session._sequence_no = 0
    logger.info("WebSocket 已连接: session=%s", session.session_id)

    await ws.send_json({
        "type": "connected",
        "session_id": session.session_id,
    })

    agent_task: asyncio.Task | None = None

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "user_message":
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
                    continue

                preview = content[:80] + "..." if len(content) > 80 else content
                logger.info("收到用户消息: session=%s content=%r", session.session_id, preview)

                if agent_task and not agent_task.done():
                    agent_task.cancel()
                    try:
                        await agent_task
                    except asyncio.CancelledError:
                        pass

                agent_task = asyncio.create_task(
                    run_agent_stream(session, content)
                )

            elif msg_type == "tool_result":
                call_id = msg.get("call_id")
                if call_id and call_id in session.pending:
                    future = session.pending.pop(call_id)
                    if not future.done():
                        future.set_result(msg.get("result", {}))

            elif msg_type == "confirm_result":
                call_id = msg.get("call_id")
                if call_id and call_id in session.pending:
                    future = session.pending.pop(call_id)
                    if not future.done():
                        confirmed = msg.get("confirmed", True)
                        logger.info("用户确认结果: call_id=%s confirmed=%s", call_id, confirmed)
                        future.set_result(
                            {} if confirmed else {"rejected": True}
                        )

            elif msg_type == "page_context":
                ctx = msg.get("context", {})
                session.update_page_context(ctx)
                logger.info("页面上下文更新: session=%s url=%s", session.session_id, ctx.get("url", ""))

            elif msg_type == "save_skill":
                name = msg.get("name", "")
                desc = msg.get("description", "")
                steps = msg.get("steps", [])
                skill_type = msg.get("skill_type", "strict")
                if name and steps:
                    save_skill_to_dir(name, desc, steps, skill_type)
                    session.agent = None
                    logger.info("技能已保存: name=%s type=%s", name, skill_type)
                    await ws.send_json({"type": "skill_saved", "name": name})

            elif msg_type == "get_skills":
                skills = list_skills_from_dir()
                await ws.send_json({"type": "skill_list", "skills": skills})

            elif msg_type == "delete_skill":
                skill_dir_name = msg.get("dir", "")
                if skill_dir_name:
                    target = os.path.join(SKILLS_DIR, skill_dir_name)
                    if os.path.isdir(target):
                        shutil.rmtree(target)
                        session.agent = None
                        logger.info("技能已删除: dir=%s", skill_dir_name)
                await ws.send_json({"type": "skill_deleted", "dir": skill_dir_name})

            elif msg_type == "generate_skill_summary":
                steps = msg.get("steps", [])
                skill_type = msg.get("skill_type", "strict")
                if steps:
                    logger.info("生成技能摘要: session=%s steps=%d type=%s", session.session_id, len(steps), skill_type)
                    result = await generate_skill_summary(session, steps, skill_type)
                    await ws.send_json({"type": "skill_summary", **result})

            elif msg_type == "start_meeting":
                if session.meeting_session and session.meeting_session.is_running():
                    await ws.send_json({"type": "meeting_error", "message": "会议已在进行中"})
                    continue

                if msg.get("provider"):
                    session.provider = msg["provider"]
                if msg.get("model_name"):
                    session.model_name = msg["model_name"]
                if msg.get("api_key"):
                    session.api_key = msg["api_key"]
                if msg.get("base_url"):
                    session.base_url = msg["base_url"]

                logger.info("会议配置: provider=%s model=%s api_key=%s base_url=%s",
                           session.provider, session.model_name or "(默认)",
                           "已设置" if session.api_key else "未设置",
                           session.base_url or "(默认)")

                meeting_id = str(uuid.uuid4())[:8]
                meeting = MeetingSession(meeting_id)
                meeting.start()
                session.meeting_session = meeting
                session.meeting_mode = True

                coordinator = MeetingCoordinator(
                    meeting_session=meeting,
                    provider=session.provider,
                    model_name=session.model_name or "",
                    api_key=session.api_key,
                    base_url=session.base_url or "",
                )
                session._meeting_coordinator = coordinator

                logger.info("会议已创建: meeting_id=%s session=%s", meeting_id, session.session_id)
                session._sequence_no += 1
                msg_meeting_started = {
                    "type": "meeting_started",
                    "meeting_id": meeting_id,
                    "agents": meeting.get_agents_dict(),
                    "sequence_no": session._sequence_no,
                }
                if len(session._message_buffer) >= 100:
                    session._message_buffer.pop(0)
                session._message_buffer.append(msg_meeting_started)
                await ws.send_json(msg_meeting_started)

            elif msg_type == "meeting_message":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await ws.send_json({"type": "meeting_error", "message": "没有进行中的会议"})
                    continue

                content = msg.get("content", "")
                if not content:
                    continue

                logger.info("收到会议消息: session=%s content=%r", session.session_id, content[:100])

                session.meeting_session.add_message("boss", content)
                coordinator = getattr(session, "_meeting_coordinator", None)

                async def send_agent_message(agent_id: str, text: str, delta: str):
                    session._sequence_no += 1
                    msg_with_seq = {
                        "type": "agent_message",
                        "agentId": agent_id,
                        "content": text,
                        "delta": delta,
                        "sequence_no": session._sequence_no,
                    }
                    if len(session._message_buffer) >= 100:
                        session._message_buffer.pop(0)
                    session._message_buffer.append(msg_with_seq)
                    await ws.send_json(msg_with_seq)

                if coordinator:
                    logger.info("开始处理会议消息: session=%s", session.session_id)
                    try:
                        result = await coordinator.process_user_message(content, send_agent_message)
                        logger.info("会议消息处理完成: session=%s result=%s", session.session_id, result.get("type") if result else "None")
                        if result.get("type") == "task_auto_assigned":
                            session._sequence_no += 1
                            assignment = result.get("assignment", {})
                            routing_decision = None
                            if hasattr(coordinator, '_last_routing_decision') and coordinator._last_routing_decision:
                                rd = coordinator._last_routing_decision
                                routing_decision = {
                                    "selected_dept": rd.selected_dept,
                                    "confidence": rd.confidence,
                                    "reason": rd.reason,
                                    "candidate_depts": rd.candidate_depts,
                                    "matched_keywords": rd.matched_keywords,
                                }
                            msg_auto_assigned = {
                                "type": "task_auto_assigned",
                                "taskId": assignment.get("task_id", ""),
                                "agentId": assignment.get("agent_id", ""),
                                "description": assignment.get("description", ""),
                                "reason": assignment.get("reason", ""),
                                "status": assignment.get("status", "assigned"),
                                "analysis": result.get("analysis", {}),
                                "routing_decision": routing_decision,
                                "sequence_no": session._sequence_no,
                            }
                            if len(session._message_buffer) >= 100:
                                session._message_buffer.pop(0)
                            session._message_buffer.append(msg_auto_assigned)
                            await ws.send_json(msg_auto_assigned)

                            task_description = assignment.get("description", "")
                            logger.info("开始执行任务并审查: %s", task_description[:50])
                            review_result = await coordinator.execute_and_review_task(task_description, send_agent_message)
                            logger.info("任务执行和审查完成")

                            # 发送结构化反馈消息
                            if review_result and review_result.get("structured_feedback"):
                                session._sequence_no += 1
                                feedback = review_result["structured_feedback"]
                                msg_feedback = {
                                    "type": "structured_feedback",
                                    "taskId": assignment.get("task_id", ""),
                                    "agentId": "agent-reviewer",
                                    "feedback": feedback,
                                    "sequence_no": session._sequence_no,
                                }
                                if len(session._message_buffer) >= 100:
                                    session._message_buffer.pop(0)
                                session._message_buffer.append(msg_feedback)
                                await ws.send_json(msg_feedback)

                                # 如果需要迭代修正，发送迭代状态更新
                                if feedback.get("status") == "revision_required":
                                    session._sequence_no += 1
                                    msg_iteration = {
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
                                        "sequence_no": session._sequence_no,
                                    }
                                    if len(session._message_buffer) >= 100:
                                        session._message_buffer.pop(0)
                                    session._message_buffer.append(msg_iteration)
                                    await ws.send_json(msg_iteration)
                        elif result.get("type") == "workflow_executed":
                            session._sequence_no += 1
                            workflow_result = result.get("workflow_result", {})
                            msg_workflow = {
                                "type": "workflow_executed",
                                "workflow_id": workflow_result.get("execution_id", ""),
                                "status": workflow_result.get("status", ""),
                                "results": workflow_result.get("results", {}),
                                "analysis": result.get("analysis", {}),
                                "sequence_no": session._sequence_no,
                            }
                            if len(session._message_buffer) >= 100:
                                session._message_buffer.pop(0)
                            session._message_buffer.append(msg_workflow)
                            await ws.send_json(msg_workflow)

                    except Exception:
                        logger.exception("会议讨论异常: session=%s", session.session_id)
                        await ws.send_json({"type": "meeting_error", "message": "会议讨论出错"})
                else:
                    logger.warning("会议协调器未初始化: session=%s", session.session_id)

                await ws.send_json({"type": "meeting_message_ack", "content": content})

            elif msg_type == "task_assign":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await ws.send_json({"type": "meeting_error", "message": "没有进行中的会议"})
                    continue

                agent_id = msg.get("agentId", "")
                description = msg.get("description", "")
                if not agent_id or not description:
                    continue

                task = session.meeting_session.add_task(agent_id, description)
                session.meeting_session.update_task_status(task.id, "assigned")
                session.meeting_session.update_agent_status(agent_id, MeetingAgentStatus.WORKING)
                session.meeting_session.add_message("boss", f"任务已派发给 {agent_id}: {description}")

                logger.info("任务已派发: task_id=%s agent_id=%s meeting=%s", task.id, agent_id, session.meeting_session.meeting_id)
                session._sequence_no += 1
                msg_task_assigned = {
                    "type": "task_assigned",
                    "taskId": task.id,
                    "agentId": agent_id,
                    "status": "assigned",
                    "sequence_no": session._sequence_no,
                }
                if len(session._message_buffer) >= 100:
                    session._message_buffer.pop(0)
                session._message_buffer.append(msg_task_assigned)
                await ws.send_json(msg_task_assigned)

                session._sequence_no += 1
                msg_agent_status = {
                    "type": "agent_status_update",
                    "agentId": agent_id,
                    "status": "working",
                    "currentTask": task.id,
                    "sequence_no": session._sequence_no,
                }
                if len(session._message_buffer) >= 100:
                    session._message_buffer.pop(0)
                session._message_buffer.append(msg_agent_status)
                await ws.send_json(msg_agent_status)

            elif msg_type == "end_meeting":
                if not session.meeting_session:
                    await ws.send_json({"type": "meeting_error", "message": "没有进行中的会议"})
                    continue

                summary = session.meeting_session.get_summary()
                session.meeting_session.stop()
                session.meeting_session.cleanup()
                meeting_id = session.meeting_session.meeting_id
                session.clear_meeting()

                logger.info("会议已结束: meeting_id=%s session=%s", meeting_id, session.session_id)
                session._sequence_no += 1
                msg_meeting_ended = {
                    "type": "meeting_ended",
                    "summary": summary,
                    "sequence_no": session._sequence_no,
                }
                if len(session._message_buffer) >= 100:
                    session._message_buffer.pop(0)
                session._message_buffer.append(msg_meeting_ended)
                await ws.send_json(msg_meeting_ended)

            elif msg_type == "get_meeting_status":
                if not session.meeting_session:
                    await ws.send_json({"type": "meeting_error", "message": "没有进行中的会议"})
                    continue

                await ws.send_json({
                    "type": "meeting_status",
                    "meeting_id": session.meeting_session.meeting_id,
                    "agents": session.meeting_session.get_agents_dict(),
                    "tasks": session.meeting_session.get_tasks_dict(),
                    "is_running": session.meeting_session.is_running(),
                })

            elif msg_type == "pause_task":
                task_id = msg.get("taskId", "")
                if session.meeting_session and task_id:
                    session.meeting_session.update_task_status(task_id, "paused")
                    await ws.send_json({
                        "type": "task_paused",
                        "taskId": task_id,
                    })

            elif msg_type == "resume_task":
                task_id = msg.get("taskId", "")
                if session.meeting_session and task_id:
                    session.meeting_session.update_task_status(task_id, "assigned")
                    await ws.send_json({
                        "type": "task_resumed",
                        "taskId": task_id,
                    })

            elif msg_type == "override_decision":
                decision_id = msg.get("decision_id", "")
                new_decision = msg.get("new_decision", "")
                await ws.send_json({
                    "type": "decision_overridden",
                    "decision_id": decision_id,
                    "new_decision": new_decision,
                })

            elif msg_type == "adjust_agent_weight":
                agent_id = msg.get("agentId", "")
                weight = msg.get("weight", 1.0)
                coordinator = getattr(session, "_meeting_coordinator", None)
                if coordinator and hasattr(coordinator, 'negotiation'):
                    coordinator.negotiation.set_agent_weight(agent_id, weight)
                await ws.send_json({
                    "type": "agent_weight_adjusted",
                    "agentId": agent_id,
                    "weight": weight,
                })

            elif msg_type == "request_retransmit":
                from_seq = msg.get("from_sequence_no", 0)
                buffered = getattr(session, "_message_buffer", [])
                for buffered_msg in buffered:
                    if buffered_msg.get("sequence_no", 0) >= from_seq:
                        await ws.send_json(buffered_msg)

    except WebSocketDisconnect:
        logger.info("WebSocket 断开: session=%s", session.session_id)
    except Exception:
        logger.exception("WebSocket 异常: session=%s", session.session_id)
    finally:
        if session.meeting_session:
            session.meeting_session.stop()
            session.meeting_session.cleanup()
        if agent_task and not agent_task.done():
            agent_task.cancel()
            try:
                await agent_task
            except (asyncio.CancelledError, Exception):
                pass
        sessions.pop(session.session_id, None)
        logger.info("Session 已清理: session=%s, 活跃会话数=%d", session.session_id, len(sessions))


@app.get("/health")
async def health():
    return {"status": "ok", "sessions": len(sessions)}


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s | %(levelname)-7s | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    uvicorn.run(app, host="0.0.0.0", port=8765)
