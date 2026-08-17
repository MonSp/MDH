"""
Skills REST API Router
"""

from dataclasses import asdict
from fastapi import APIRouter, Body

router = APIRouter(prefix="/api/skills", tags=["skills"])

# 注入点 — 由 server.py 在 include_router 前设置
_skill_registry = None


def init(skill_registry):
    global _skill_registry
    _skill_registry = skill_registry


def _ok(data):
    return {"success": True, "data": data}


def _fail(error: str):
    return {"success": False, "error": error}


@router.get("")
async def list_skills():
    try:
        return _ok(_skill_registry.list_skills())
    except Exception as e:
        return _fail(str(e))


@router.post("")
async def register_skill(body: dict = Body(...)):
    try:
        skill_dir = body["skill_dir"]
        pkg = _skill_registry.register(skill_dir)
        return _ok(asdict(pkg))
    except KeyError:
        return _fail("缺少必填字段: skill_dir")
    except ValueError as e:
        return _fail(str(e))


@router.post("/{skill_id}/clone")
async def clone_skill(skill_id: str, body: dict = Body(...)):
    try:
        target_dir = body["target_dir"]
        path = _skill_registry.clone(skill_id, target_dir)
        return _ok({"cloned_path": path})
    except KeyError as e:
        return _fail(str(e))
    except ValueError as e:
        return _fail(str(e))


@router.get("/{skill_id}/versions")
async def get_skill_versions(skill_id: str):
    try:
        versions = _skill_registry.get_versions(skill_id)
        return _ok(versions)
    except KeyError as e:
        return _fail(str(e))


@router.get("/{skill_id}")
async def get_skill(skill_id: str):
    try:
        pkg = _skill_registry.get_skill(skill_id)
        return _ok(asdict(pkg))
    except KeyError as e:
        return _fail(str(e))
