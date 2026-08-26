"""
Skills REST API Router
"""

from dataclasses import asdict
from fastapi import APIRouter, Body

router = APIRouter(prefix="/api/skills", tags=["skills"])

# 注入点 — 由 server.py 在 include_router 前设置
_skill_registry = None
_skill_packager = None
_experience_extractor = None


def init(skill_registry, skill_packager=None, experience_extractor=None):
    global _skill_registry, _skill_packager, _experience_extractor
    _skill_registry = skill_registry
    _skill_packager = skill_packager
    _experience_extractor = experience_extractor


def _ok(data=None):
    return {"success": True, "data": data, "error": None}


def _fail(error: str):
    return {"success": False, "data": None, "error": error}


@router.get("")
@router.get("/list")
async def list_skills():
    try:
        return _ok(_skill_registry.list_skills())
    except Exception as e:
        return _fail(str(e))


@router.post("")
async def register_skill(body: dict = Body(...)):
    try:
        pkg = _skill_registry.register(body["skill_dir"])
        return _ok(asdict(pkg))
    except KeyError:
        return _fail("缺少必填字段: skill_dir")
    except ValueError as e:
        return _fail(str(e))


@router.post("/{skill_id}/clone")
async def clone_skill(skill_id: str, body: dict = Body(...)):
    try:
        path = _skill_registry.clone(skill_id, body["target_dir"])
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


# ── 技能打包 ──

def _package_result_to_dict(result):
    return {
        "package_path": result.package_path,
        "skill_name": result.skill_name,
        "version": result.version,
        "rules_count": result.rules_count,
        "base_files_count": result.base_files_count,
        "output_version": result.output_version,
    }


@router.post("/package")
async def package_skill(body: dict = Body(...)):
    try:
        result = _skill_packager.full_package(
            base_skill_path=body["base_skill_path"],
            incremental_path=body["incremental_path"],
            project_id=body["project_id"],
            skill_name=body["skill_name"],
        )
        return _ok(_package_result_to_dict(result))
    except KeyError:
        return _fail("缺少必填字段: base_skill_path, incremental_path, project_id, skill_name")
    except FileNotFoundError as e:
        return _fail(str(e))
    except Exception as e:
        return _fail(str(e))


@router.get("/package/preview")
async def preview_package(base_skill_path: str, incremental_path: str):
    try:
        result = _skill_packager.preview_package(base_skill_path, incremental_path)
        return _ok(result)
    except FileNotFoundError as e:
        return _fail(str(e))
    except Exception as e:
        return _fail(str(e))


@router.post("/evolve")
async def evolve_skills(body: dict = Body(...)):
    """从项目结果中提取经验规则，触发技能进化"""
    try:
        project_id = body.get("project_id", "")
        task_description = body.get("task_description", "")
        discussion_results = body.get("discussion_results", [])
        review_result = body.get("review_result", {})
        execution_results = body.get("execution_results", [])

        if not project_id:
            return _fail("缺少 project_id")

        rules = _experience_extractor.extract_from_meeting(
            project_id=project_id,
            task_description=task_description,
            discussion_results=discussion_results,
            review_result=review_result,
            execution_results=execution_results,
        )

        return _ok({
            "project_id": project_id,
            "rules_count": len(rules),
            "rules": [
                {
                    "rule_id": r.rule_id,
                    "trigger_condition": r.trigger_condition,
                    "action": r.action,
                    "note": r.note,
                    "rule_type": r.rule_type,
                    "status": r.status,
                }
                for r in rules
            ],
        })
    except Exception as e:
        return _fail(str(e))
