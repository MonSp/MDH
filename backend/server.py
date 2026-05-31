import asyncio
import json
import logging
import os
import shutil
import time
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import SKILLS_DIR
from session import Session
from skills import list_skills_from_dir, save_skill_to_dir, generate_skill_summary
from agent import run_agent_stream
from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator
from protocol import MeetingAgentStatus, meeting_agent_to_dict, meeting_task_to_dict, meeting_summary_to_dict

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

                session.meeting_session.add_message("boss", content)
                coordinator = getattr(session, "_meeting_coordinator", None)

                async def send_agent_message(agent_id: str, text: str, delta: str):
                    session._sequence_no += 1
                    msg_with_seq = {
                        "type": "agent_message",
                        "agent_id": agent_id,
                        "content": text,
                        "delta": delta,
                        "sequence_no": session._sequence_no,
                    }
                    if len(session._message_buffer) >= 100:
                        session._message_buffer.pop(0)
                    session._message_buffer.append(msg_with_seq)
                    await ws.send_json(msg_with_seq)

                if coordinator:
                    try:
                        await coordinator.run_discussion(content, send_agent_message)
                    except Exception:
                        logger.exception("会议讨论异常: session=%s", session.session_id)
                        await ws.send_json({"type": "meeting_error", "message": "会议讨论出错"})

                await ws.send_json({"type": "meeting_message_ack", "content": content})

            elif msg_type == "task_assign":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await ws.send_json({"type": "meeting_error", "message": "没有进行中的会议"})
                    continue

                agent_id = msg.get("agent_id", "")
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
                    "task_id": task.id,
                    "agent_id": agent_id,
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
                    "agent_id": agent_id,
                    "status": "working",
                    "current_task": task.id,
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
                task_id = msg.get("task_id", "")
                if session.meeting_session and task_id:
                    session.meeting_session.update_task_status(task_id, "paused")
                    await ws.send_json({
                        "type": "task_paused",
                        "task_id": task_id,
                    })

            elif msg_type == "resume_task":
                task_id = msg.get("task_id", "")
                if session.meeting_session and task_id:
                    session.meeting_session.update_task_status(task_id, "assigned")
                    await ws.send_json({
                        "type": "task_resumed",
                        "task_id": task_id,
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
                agent_id = msg.get("agent_id", "")
                weight = msg.get("weight", 1.0)
                coordinator = getattr(session, "_meeting_coordinator", None)
                if coordinator and hasattr(coordinator, 'negotiation'):
                    coordinator.negotiation.set_agent_weight(agent_id, weight)
                await ws.send_json({
                    "type": "agent_weight_adjusted",
                    "agent_id": agent_id,
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
