"""
Community Marketplace REST API Router
"""

import os

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/community", tags=["community"])

# 注入点 — 支持延迟加载（getter 函数）
_get_registry_client = None


def init(getter):
    """接受一个 getter 函数，延迟获取 registry_client 实例"""
    global _get_registry_client
    _get_registry_client = getter


@router.get("/search")
async def search_community(q: str = "", limit: int = 20):
    client = _get_registry_client()
    results = client.search_remote(query=q, limit=limit)
    return {"success": True, "skills": [r.to_dict() for r in results]}


@router.post("/install")
async def install_from_community(request: Request):
    client = _get_registry_client()
    body = await request.json()
    skill_name = body.get("skill_name", "")
    if not skill_name:
        return {"success": False, "error": "未指定技能名称"}

    skill_dir = os.path.join(os.path.dirname(__file__), "..", "..", "skill_packs")
    success = client.install_from_remote(skill_name, skill_dir)
    if success:
        return {"success": True, "message": f"已安装: {skill_name}"}
    return {"success": False, "error": "安装失败"}
