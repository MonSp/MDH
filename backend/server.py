import asyncio
import json
import os
import shutil

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import SKILLS_DIR
from session import Session
from skills import list_skills_from_dir, save_skill_to_dir
from agent import run_agent_stream

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
                    session.provider = msg["provider"]
                    config_changed = True
                if msg.get("model_name") and msg["model_name"] != session.model_name:
                    session.model_name = msg["model_name"]
                    config_changed = True
                if msg.get("api_key") and msg["api_key"] != session.api_key:
                    session.api_key = msg["api_key"]
                    config_changed = True
                if msg.get("base_url") and msg["base_url"] != session.base_url:
                    session.base_url = msg["base_url"]
                    config_changed = True
                if msg.get("reset") or config_changed:
                    session.agent = None

                if not msg.get("content"):
                    continue

                if agent_task and not agent_task.done():
                    agent_task.cancel()
                    try:
                        await agent_task
                    except asyncio.CancelledError:
                        pass

                agent_task = asyncio.create_task(
                    run_agent_stream(session, msg["content"])
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
                        future.set_result(
                            {} if confirmed else {"rejected": True}
                        )

            elif msg_type == "page_context":
                session.update_page_context(msg.get("context", {}))

            elif msg_type == "save_skill":
                name = msg.get("name", "")
                desc = msg.get("description", "")
                steps = msg.get("steps", [])
                if name and steps:
                    save_skill_to_dir(name, desc, steps)
                    session.agent = None
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
                await ws.send_json({"type": "skill_deleted", "dir": skill_dir_name})

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if agent_task and not agent_task.done():
            agent_task.cancel()
            try:
                await agent_task
            except (asyncio.CancelledError, Exception):
                pass
        sessions.pop(session.session_id, None)


@app.get("/health")
async def health():
    return {"status": "ok", "sessions": len(sessions)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
