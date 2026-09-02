"""
Assets REST API Router — artifacts, templates, search, experience evolution, reuse metrics.

Delegates to server module's lazy-init factories so test monkeypatching works transparently.
"""

import logging

from fastapi import APIRouter, Body

from routers.common import fail, ok

logger = logging.getLogger("routers.assets")

router = APIRouter(tags=["assets"])

_srv = None


def init(server_module):
    global _srv
    _srv = server_module


@router.post("/api/assets/artifacts")
async def api_asset_artifacts(body: dict):
    try:
        team_id = body["team_id"]
        asset = _srv._get_asset_store().store_artifact(team_id, body.get("title", ""), body.get("content", ""), body.get("source_task_id", ""))
        return ok({"asset_id": asset["asset_id"]})
    except KeyError:
        return fail("缺少必填字段: team_id")
    except Exception as exc:
        logger.warning("api_asset_artifacts 失败: %s", exc)
        return fail(str(exc))


@router.post("/api/assets/templates")
async def api_asset_templates(body: dict):
    try:
        result = await _srv._get_template_confirmation().submit(
            team_id=body["team_id"],
            title=body.get("title", ""),
            content=body.get("content", ""),
            source_task_id=body.get("source_task_id", ""),
            approver=body.get("approver", ""),
        )
        if result["ok"]:
            return ok({"asset_id": result["asset_id"], "request_id": result["request_id"]})
        return fail(result["reason"])
    except KeyError:
        return fail("缺少必填字段: team_id")
    except Exception as exc:
        logger.warning("api_asset_templates 失败: %s", exc)
        return fail(str(exc))


@router.get("/api/assets/search")
async def api_asset_search(team_id: str, q: str = "", type: str = "", task_type: str = "", keywords: str = ""):
    try:
        kw = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
        return ok(_srv._get_asset_search().search(team_id, query=q, asset_type=type, task_type=task_type, keywords=kw))
    except Exception as exc:
        logger.warning("api_asset_search 失败: %s", exc)
        return fail(str(exc))


@router.post("/api/assets/experience")
async def api_asset_experience(body: dict):
    try:
        result = _srv._get_skill_evolution().evolve_from_feedback(
            project_id=body.get("project_id", f"proj-{body['team_id']}"),
            task_type=body.get("task_type", ""),
            transcript=body.get("transcript", ""),
            feedback=body.get("feedback", ""),
            keywords=body.get("keywords", []),
            team_id=body.get("team_id", ""),
        )
        return ok({"rule_id": result["rule_id"], "count": result["count"]})
    except KeyError:
        return fail("缺少必填字段: team_id")
    except Exception as exc:
        logger.warning("api_asset_experience 失败: %s", exc)
        return fail(str(exc))


@router.get("/api/assets")
async def api_asset_list(team_id: str, status: str = ""):
    try:
        return ok(_srv._get_asset_store().list_assets(team_id, status=status or None))
    except Exception as exc:
        logger.warning("api_asset_list 失败: %s", exc)
        return fail(str(exc))


@router.put("/api/assets/{asset_id}")
async def api_asset_update(asset_id: str, body: dict = Body(...)):
    try:
        content = body.get("content", "")
        editor = body.get("editor", "")
        if not content:
            return fail("content 不能为空")
        result = _srv._get_asset_store().update_asset(asset_id, content, editor=editor)
        if result is None:
            return fail("资产不存在")
        return ok(result)
    except Exception as exc:
        logger.warning("api_asset_update 失败: %s", exc)
        return fail(str(exc))


@router.get("/api/assets/reuse-metrics")
async def api_asset_reuse_metrics():
    from asset_injection import get_reuse_stats
    return ok(get_reuse_stats())
