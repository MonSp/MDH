"""
Marketplace REST API Router
"""

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



@router.get("/experience/search")
async def search_experience(task_type: str = "", keywords: str = "", rule_type: str = "", limit: int = 10):
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
    results = _shared_pool.search(task_type=task_type, keywords=kw_list, rule_type=rule_type, limit=limit)
    return {"success": True, "rules": [r.to_dict() for r in results], "total": len(results)}




@router.get("/stats")
async def get_stats():
    return {"success": True, "stats": _shared_pool.get_stats()}


@router.get("/experience/pending")
async def list_pending_experience():
    rules = _shared_pool.get_pending_rules()
    return {"success": True, "rules": [r.to_dict() for r in rules], "total": len(rules)}






@router.get("/experience/recommendations")
async def get_share_recommendations():
    """获取可推荐发布到共享池的高分本地规则"""
    try:
        import os

        from experience_extractor import ExperienceExtractor
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
