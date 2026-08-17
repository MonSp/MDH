"""
Community Marketplace REST API Router
"""

import os
from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/community", tags=["community"])

# 注入点
_registry_client = None


def init(registry_client):
    global _registry_client
    _registry_client = registry_client


@router.get("/search")
async def search_community(q: str = "", limit: int = 20):
    results = _registry_client.search_remote(query=q, limit=limit)
    return {"success": True, "skills": [r.to_dict() for r in results]}


@router.post("/install")
async def install_from_community(request: Request):
    body = await request.json()
    skill_name = body.get("skill_name", "")
    if not skill_name:
        return {"success": False, "error": "未指定技能名称"}

    skill_dir = os.path.join(os.path.dirname(__file__), "..", "..", "skill_packs")
    success = _registry_client.install_from_remote(skill_name, skill_dir)
    if success:
        return {"success": True, "message": f"已安装: {skill_name}"}
    return {"success": False, "error": "安装失败"}
