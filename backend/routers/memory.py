"""
Agent Memory REST API Router — persistent memory CRUD, recall, context injection.
"""

import logging

from fastapi import APIRouter, Request

from routers.common import fail, ok

logger = logging.getLogger("routers.memory")

router = APIRouter(tags=["memory"])

_data_dir = None


def init(data_dir: str):
    global _data_dir
    _data_dir = data_dir


def _get_memory():
    from agent_memory import AgentMemory
    return AgentMemory(_data_dir)


@router.get("/api/memory/{agent_id}")
async def get_agent_memory(agent_id: str):
    try:
        return ok(_get_memory().get_memory(agent_id))
    except Exception as e:
        logger.exception("get_agent_memory 失败")
        return fail(str(e))


@router.post("/api/memory/{agent_id}/add")
async def add_agent_memory(agent_id: str, request: Request):
    try:
        body = await request.json()
        result = _get_memory().add_memory(agent_id, body)
        return ok(result)
    except Exception as e:
        logger.exception("add_agent_memory 失败")
        return fail(str(e))


@router.get("/api/memory/{agent_id}/recall")
async def recall_agent_memory(agent_id: str, q: str = "", limit: int = 5):
    try:
        results = _get_memory().recall(agent_id, q, limit)
        return ok({"results": results})
    except Exception as e:
        logger.exception("recall_agent_memory 失败")
        return fail(str(e))


@router.get("/api/memory/{agent_id}/context")
async def get_memory_context(agent_id: str, max_chars: int = 3000):
    try:
        context = _get_memory().inject_context(agent_id, max_chars)
        return ok({"context": context, "has_content": bool(context)})
    except Exception as e:
        logger.exception("get_memory_context 失败")
        return fail(str(e))


@router.get("/api/memory/stats")
async def get_memory_stats():
    try:
        return ok(_get_memory().get_stats())
    except Exception as e:
        logger.exception("get_memory_stats 失败")
        return fail(str(e))
