"""
Task Templates REST API Router — CRUD + usage tracking.
"""

import logging

from fastapi import APIRouter, Body, HTTPException
from typing import Optional

from routers.common import ok

logger = logging.getLogger("routers.templates")

router = APIRouter(prefix="/api/templates", tags=["templates"])

_srv = None


def init(server_module):
    global _srv
    _srv = server_module


@router.get("")
async def templates_list(category: Optional[str] = None):
    return _srv.task_template_mgr.list_templates(category=category)


@router.get("/{template_id}")
async def templates_get(template_id: str):
    t = _srv.task_template_mgr.get_template(template_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@router.post("")
async def templates_create(body: dict = Body(...)):
    return _srv.task_template_mgr.create_template(body)


@router.put("/{template_id}")
async def templates_update(template_id: str, body: dict = Body(...)):
    t = _srv.task_template_mgr.update_template(template_id, body)
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found or is preset")
    return t


@router.delete("/{template_id}")
async def templates_delete(template_id: str):
    success = _srv.task_template_mgr.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found or is preset")
    return {"success": True}


@router.post("/{template_id}/use")
async def templates_use(template_id: str):
    t = _srv.task_template_mgr.get_template(template_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    _srv.task_template_mgr.increment_usage(template_id)
    return {"success": True}
