import asyncio
import json
import logging
import os
import shutil

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import SKILLS_DIR
from session import Session
from skills import list_skills_from_dir, save_skill_to_dir, generate_skill_summary
from agent import run_agent_stream

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

    except WebSocketDisconnect:
        logger.info("WebSocket 断开: session=%s", session.session_id)
    except Exception:
        logger.exception("WebSocket 异常: session=%s", session.session_id)
    finally:
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
