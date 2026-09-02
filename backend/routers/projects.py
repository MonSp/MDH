"""
Projects REST API Router
"""

import logging
import uuid
from dataclasses import asdict

from fastapi import APIRouter, Body, Request

from rate_limiter import RATE_LIMITS, limiter
from routers.common import fail, ok
from schemas import ProjectCreateRequest

logger = logging.getLogger("routers.projects")

router = APIRouter(prefix="/api/projects", tags=["projects"])

_project_manager = None


def init(project_manager):
    global _project_manager
    _project_manager = project_manager


@router.get("")
@limiter.limit(RATE_LIMITS["read"])
async def list_projects(request: Request):
    try:
        tenant_id = getattr(request.state, "tenant_id", None)
        projects = _project_manager.list_projects()
        if tenant_id:
            projects = [p for p in projects if p.get("tenant_id") == tenant_id]
        return ok(projects)
    except (KeyError, ValueError) as e:
        logger.warning("list_projects 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("list_projects 失败")
        return fail(str(e))


@router.post("")
@limiter.limit(RATE_LIMITS["write"])
async def create_project(request: Request, body: ProjectCreateRequest):
    try:
        brief = {"name": body.name, "description": body.description, "category": body.category}
        project = _project_manager.create_project(body.name, brief)
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            project.tenant_id = tenant_id
            _project_manager._save_project(project)
        return ok(asdict(project))
    except ValueError as e:
        return fail(str(e))


@router.get("/categories")
async def get_project_categories():
    try:
        categories = _project_manager.get_categories()
        return ok(categories)
    except (KeyError, ValueError) as e:
        logger.warning("get_categories 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("get_categories 失败")
        return fail(str(e))


@router.post("/classify-all")
@limiter.limit(RATE_LIMITS["llm"])
async def classify_all_projects(request: Request):
    try:
        results = []
        for project in _project_manager._projects.values():
            if not project.category:
                category = _project_manager.auto_classify_project(project.project_id)
                results.append({"project_id": project.project_id, "category": category})
        return ok({"classified": len(results), "results": results})
    except (KeyError, ValueError) as e:
        logger.warning("classify_all 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("classify_all 失败")
        return fail(str(e))


@router.get("/{project_id}")
async def get_project(project_id: str):
    try:
        project = _project_manager.get_project(project_id)
        return ok(asdict(project))
    except KeyError as e:
        return fail(str(e))


@router.delete("/{project_id}")
@limiter.limit(RATE_LIMITS["write"])
async def delete_project(project_id: str, request: Request):
    try:
        _project_manager.delete_project(project_id)
        return ok({"project_id": project_id, "message": "项目已删除"})
    except KeyError as e:
        return fail(str(e))


@router.patch("/{project_id}")
async def rename_project(project_id: str, body: dict = Body(...)):
    try:
        new_name = body.get("name", "")
        _project_manager.rename_project(project_id, new_name)
        return ok({"project_id": project_id, "name": new_name.strip()})
    except KeyError as e:
        return fail(str(e))
    except ValueError as e:
        return fail(str(e))


@router.get("/{project_id}/status")
async def get_project_status(project_id: str):
    try:
        status = _project_manager.get_project_status(project_id)
        return ok(status)
    except KeyError as e:
        return fail(str(e))


@router.post("/{project_id}/instantiate")
@limiter.limit(RATE_LIMITS["write"])
async def instantiate_project(project_id: str, request: Request, body: dict = Body(...)):
    try:
        dag = body["dag"]
        employees = _project_manager.instantiate_project(project_id, dag)
        return ok([asdict(e) for e in employees])
    except KeyError as e:
        return fail(str(e))
    except ValueError as e:
        return fail(str(e))


@router.post("/{project_id}/category")
async def set_project_category(project_id: str, body: dict = Body(...)):
    try:
        category = body.get("category", "")
        _project_manager.set_project_category(project_id, category)
        return ok({"project_id": project_id, "category": category})
    except KeyError as e:
        return fail(str(e))


@router.post("/{project_id}/classify")
@limiter.limit(RATE_LIMITS["llm"])
async def classify_project(project_id: str, request: Request):
    try:
        category = _project_manager.auto_classify_project(project_id)
        return ok({"project_id": project_id, "category": category})
    except KeyError as e:
        return fail(str(e))


@router.get("/{project_id}/tasks")
async def get_project_tasks(project_id: str):
    try:
        tasks = _project_manager.get_project_tasks(project_id)
        return ok(tasks)
    except KeyError as e:
        return fail(str(e))


@router.post("/{project_id}/tasks")
async def add_project_task(project_id: str, body: dict = Body(...)):
    try:
        task_id = body.get("task_id", str(uuid.uuid4())[:8])
        description = body.get("description", "")
        meeting_id = body.get("meeting_id", "")
        task = _project_manager.add_task(project_id, task_id, description, meeting_id)
        return ok(asdict(task))
    except KeyError as e:
        return fail(str(e))


@router.post("/{project_id}/tasks/{task_id}/subtasks")
async def add_subtask(project_id: str, task_id: str, body: dict = Body(...)):
    try:
        subtask_id = body.get("subtask_id", str(uuid.uuid4())[:8])
        description = body.get("description", "")
        agent_id = body.get("agent_id", "")
        subtask = _project_manager.add_subtask(project_id, task_id, subtask_id, description, agent_id)
        return ok(asdict(subtask))
    except KeyError as e:
        return fail(str(e))


@router.patch("/{project_id}/tasks/{task_id}/subtasks/{subtask_id}")
async def update_subtask_status(project_id: str, task_id: str, subtask_id: str, body: dict = Body(...)):
    try:
        status = body.get("status", "")
        _project_manager.update_subtask_status(project_id, task_id, subtask_id, status)
        return ok({"project_id": project_id, "task_id": task_id, "subtask_id": subtask_id, "status": status})
    except KeyError as e:
        return fail(str(e))


@router.delete("/{project_id}/tasks/{task_id}")
async def delete_project_task(project_id: str, task_id: str):
    try:
        success = _project_manager.delete_task(project_id, task_id)
        if success:
            return ok({"project_id": project_id, "task_id": task_id, "message": "任务已删除"})
        else:
            return fail("任务不存在")
    except KeyError as e:
        return fail(str(e))


@router.post("/{project_id}/archive")
async def archive_project(project_id: str):
    try:
        result = _project_manager.archive_project(project_id)
        return ok(result)
    except KeyError as e:
        return fail(str(e))
