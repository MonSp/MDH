"""
A2A (Agent-to-Agent) REST API Router — node registration, heartbeat, routing, dispatch.
"""

import asyncio
import logging
import re
import uuid
from dataclasses import asdict

from fastapi import APIRouter, Body, HTTPException, Request

from a2a_registry import AgentCard, AgentSkill
from rate_limiter import RATE_LIMITS, limiter

logger = logging.getLogger("routers.a2a")

router = APIRouter(prefix="/api/a2a", tags=["a2a"])

_srv = None


def init(server_module):
    global _srv
    _srv = server_module


@router.post("/register")
@limiter.limit(RATE_LIMITS["write"])
async def a2a_register_agent(body: dict = Body(...), request: Request = None):
    agent_id = body.get("agent_id")
    card_data = body.get("card", {})
    if not agent_id or not card_data.get("url"):
        raise HTTPException(400, "agent_id 和 card.url 必填")

    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', agent_id):
        raise HTTPException(400, "agent_id 必须为 1-64 个字符，仅允许字母、数字、连字符和下划线")

    import hmac as _hmac
    auth_header = request.headers.get("authorization", "") if request else ""
    caller_token = auth_header.replace("Bearer ", "") if auth_header else ""
    is_trusted_caller = _srv.BACKEND_TOKEN and _hmac.compare_digest(caller_token, _srv.BACKEND_TOKEN)
    if not is_trusted_caller:
        _srv._validate_a2a_url(card_data["url"])

    skills = [AgentSkill(**s) for s in card_data.get("skills", [])]
    card = AgentCard(
        name=card_data.get("name", agent_id),
        description=card_data.get("description", ""),
        url=card_data["url"],
        skills=skills,
        capabilities=card_data.get("capabilities", {}),
        version=card_data.get("version", "1.0.0"),
    )
    agent = _srv.a2a_registry.register(agent_id, card)
    await _srv._broadcast_a2a_update("registered", {
        "agent_id": agent_id, "name": card.name, "status": agent.status,
    })
    return {"success": True, "agent_id": agent_id, "status": agent.status}


@router.post("/unregister/{agent_id}")
async def a2a_unregister_agent(agent_id: str):
    success = _srv.a2a_registry.unregister(agent_id)
    if success:
        await _srv._broadcast_a2a_update("unregistered", {"agent_id": agent_id})
    return {"success": success}


@router.post("/heartbeat/{agent_id}")
async def a2a_heartbeat(agent_id: str):
    success = _srv.a2a_registry.heartbeat(agent_id)
    return {"success": success}


@router.get("/agents")
@limiter.limit(RATE_LIMITS["read"])
async def a2a_list_agents(request: Request):
    agents = _srv.a2a_registry.list_active()
    return {
        "success": True,
        "agents": [
            {
                "agent_id": a.agent_id,
                "name": a.card.name,
                "description": a.card.description,
                "url": a.card.url,
                "skills": [asdict(s) for s in a.card.skills],
                "status": a.status,
                "task_count": a.task_count,
                "success_rate": a.success_rate,
            }
            for a in agents
        ],
    }


@router.get("/route")
async def a2a_route_task(task_description: str):
    decision = _srv.a2a_task_router.route(task_description)
    if not decision:
        return {"success": True, "decision": None, "reason": "无可用执行节点"}
    return {
        "success": True,
        "decision": {
            "agent_id": decision.agent.agent_id,
            "skill_id": decision.skill_id,
            "confidence": decision.confidence,
            "reason": decision.reason,
            "matched_tags": decision.matched_tags,
        },
    }


@router.post("/dispatch")
@limiter.limit(RATE_LIMITS["write"])
async def a2a_dispatch_task(request: Request, body: dict = Body(...)):
    task_desc = body.get("task_description")
    metadata = body.get("metadata", {})
    prefer_agent = body.get("prefer_agent_id")

    if not task_desc:
        raise HTTPException(400, "task_description 必填")

    if prefer_agent:
        agent = _srv.a2a_registry.get(prefer_agent)
        if not agent or agent.status != "active":
            raise HTTPException(404, f"执行节点 {prefer_agent} 不可用")
    else:
        decision = _srv.a2a_task_router.route(task_desc)
        if not decision:
            raise HTTPException(503, "无可用执行节点")
        agent = decision.agent

    sync_metadata = _srv.state_sync.prepare_task_metadata(task_desc, agent.agent_id)
    merged_metadata = {**metadata, **sync_metadata}

    dispatch_task_id = str(uuid.uuid4())
    agent_id = agent.agent_id

    async def _run_dispatch():
        try:
            event = await _srv.a2a_client.send_task(
                agent, task_desc, merged_metadata, task_id=dispatch_task_id,
            )
            success = event.status and event.status.state == "completed"
            _srv.a2a_registry.record_task(agent_id, success)

            result_text = ""
            if event.artifact and event.artifact.parts:
                result_text = event.artifact.parts[0].text or ""
            _srv.state_sync.process_task_result(
                agent_id=agent_id,
                task_description=task_desc,
                result_text=result_text,
                success=success,
                task_id=event.task_id,
            )
        except Exception as e:
            logger.error("A2A 后台任务执行异常: %s", e)

    asyncio.create_task(_run_dispatch())

    return {
        "status": "dispatched",
        "task_id": dispatch_task_id,
        "agent_id": agent_id,
    }
