"""
Marketplace REST API Router
"""

import os
from dataclasses import asdict
from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])

# 注入点
_shared_pool = None
_skill_forks = None
_skill_exporter = None


def init(shared_pool, skill_forks, skill_exporter):
    global _shared_pool, _skill_forks, _skill_exporter
    _shared_pool = shared_pool
    _skill_forks = skill_forks
    _skill_exporter = skill_exporter


# ── 经验共享 ──

@router.post("/experience/publish")
async def publish_experience(request: Request):
    body = await request.json()
    rule_data = body.get("rule", {})
    source_project = body.get("source_project", "")
    source_team = body.get("source_team", "")
    result = _shared_pool.publish_rule(rule_data, source_project, source_team)
    if result:
        return {"success": True, "rule_id": result.rule_id}
    return {"success": False, "error": "发布失败：缺少必要字段"}


@router.get("/experience/search")
async def search_experience(task_type: str = "", keywords: str = "", rule_type: str = "", limit: int = 10):
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
    results = _shared_pool.search(task_type=task_type, keywords=kw_list, rule_type=rule_type, limit=limit)
    return {"success": True, "rules": [r.to_dict() for r in results], "total": len(results)}


@router.post("/experience/fork")
async def fork_experience(request: Request):
    body = await request.json()
    rule_id = body.get("rule_id", "")
    target_project = body.get("target_project", "")
    result = _shared_pool.fork_rule(rule_id, target_project)
    if result:
        return {"success": True, "rule": result}
    return {"success": False, "error": "Fork 失败：规则不存在"}


@router.get("/stats")
async def get_stats():
    return {"success": True, "stats": _shared_pool.get_stats()}


@router.get("/experience/pending")
async def list_pending_experience():
    rules = _shared_pool.get_pending_rules()
    return {"success": True, "rules": [r.to_dict() for r in rules], "total": len(rules)}


@router.post("/experience/approve")
async def approve_experience(request: Request):
    body = await request.json()
    rule_id = body.get("rule_id", "")
    approved_by = body.get("approved_by", "admin")
    success = _shared_pool.approve_rule(rule_id, approved_by)
    if success:
        return {"success": True, "rule_id": rule_id, "status": "approved"}
    return {"success": False, "error": "批准失败：规则不存在或非待审核状态"}


@router.post("/experience/reject")
async def reject_experience(request: Request):
    body = await request.json()
    rule_id = body.get("rule_id", "")
    reason = body.get("reason", "")
    success = _shared_pool.reject_rule(rule_id, reason)
    if success:
        return {"success": True, "rule_id": rule_id, "status": "rejected"}
    return {"success": False, "error": "拒绝失败：规则不存在或非待审核状态"}


@router.get("/experience/recommendations")
async def get_share_recommendations():
    """获取可推荐发布到共享池的高分本地规则"""
    try:
        from experience_extractor import ExperienceExtractor
        import os
        data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
        extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
        recs = extractor.get_share_recommendations()
        return {"success": True, "recommendations": recs, "total": len(recs)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/experience/leaderboard")
async def get_leaderboard(limit: int = 20):
    """跨团队技能排行榜"""
    board = _shared_pool.get_leaderboard(limit=limit)
    return {"success": True, "leaderboard": board, "total": len(board)}


@router.post("/experience/update-fork-effectiveness")
async def update_fork_effectiveness(request: Request):
    """更新 fork 规则的实际效果（任务完成后调用）"""
    body = await request.json()
    rule_id = body.get("rule_id", "")
    task_success = body.get("task_success", False)
    success = _shared_pool.update_fork_effectiveness(rule_id, task_success)
    if success:
        return {"success": True, "rule_id": rule_id}
    return {"success": False, "error": "规则不存在"}


# ── 技能 Fork ──

@router.post("/skills/fork")
async def fork_skill(request: Request):
    body = await request.json()
    skill_name = body.get("skill_name", "")
    project_id = body.get("project_id", "")
    result = _skill_forks.fork_skill(skill_name, project_id)
    if result:
        return {"success": True, "fork": asdict(result)}
    return {"success": False, "error": "Fork 失败：技能不存在"}


@router.get("/skills/forks")
async def list_forks(project_id: str = ""):
    forks = _skill_forks.list_forks(project_id)
    return {"success": True, "forks": [asdict(f) for f in forks]}


@router.post("/skills/pull")
async def pull_skill_update(request: Request):
    body = await request.json()
    skill_name = body.get("skill_name", "")
    project_id = body.get("project_id", "")
    updated = _skill_forks.pull_update(skill_name, project_id)
    return {"success": True, "updated": updated}


# ── 导入导出 ──

@router.post("/export")
async def export_skill(request: Request):
    body = await request.json()
    skill_name = body.get("skill_name", "")
    include_experience = body.get("include_experience", True)
    path = _skill_exporter.export_skill(skill_name, include_experience=include_experience)
    if path:
        return {"success": True, "path": path}
    return {"success": False, "error": "导出失败"}


@router.post("/import")
async def import_skill(request: Request):
    body = await request.json()
    zip_path = body.get("zip_path", "")
    overwrite = body.get("overwrite", False)
    result = _skill_exporter.import_skill(zip_path, overwrite=overwrite)
    return {
        "success": result.success,
        "skill_name": result.skill_name,
        "skill_version": result.skill_version,
        "rules_imported": result.rules_imported,
        "warnings": result.warnings,
        "error": result.error,
    }


@router.get("/exports")
async def list_exports():
    return {"success": True, "exports": _skill_exporter.list_exports()}
