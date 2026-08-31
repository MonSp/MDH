"""
Onboarding REST API Router — wizard state, step tracking, tasks.
"""

import logging

from fastapi import APIRouter, Body, HTTPException

logger = logging.getLogger("routers.onboarding")

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

_srv = None


def init(server_module):
    global _srv
    _srv = server_module


@router.get("/state")
async def onboarding_get_state():
    return _srv.onboarding_mgr.get_state()


@router.post("/step")
async def onboarding_update_step(body: dict = Body(...)):
    step = body.get("step")
    if not isinstance(step, int):
        raise HTTPException(status_code=422, detail="step must be an integer")
    _srv.onboarding_mgr.update_step(step)
    return _srv.onboarding_mgr.get_state()


@router.post("/complete")
async def onboarding_complete():
    _srv.onboarding_mgr.complete()
    return _srv.onboarding_mgr.get_state()


@router.post("/reset")
async def onboarding_reset():
    _srv.onboarding_mgr.reset()
    return _srv.onboarding_mgr.get_state()


@router.get("/tasks")
async def onboarding_tasks():
    from onboarding_tasks import get_onboarding_tasks
    return get_onboarding_tasks()
