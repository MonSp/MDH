import asyncio
import hmac
import json
import logging
import os
import secrets
import shutil
import time
import uuid
from dataclasses import asdict
from urllib.parse import parse_qs

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body, Depends, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from config import SKILLS_DIR
from session import Session
from skills import list_skills_from_dir, save_skill_to_dir, generate_skill_summary
from agent import run_agent_stream
from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator
from protocol import MeetingAgentStatus, meeting_agent_to_dict, meeting_task_to_dict, meeting_summary_to_dict, semantic_analysis_to_dict, workflow_execution_to_dict, workflow_definition_to_dict
from skill_registry import SkillRegistry
from project_manager import ProjectManager
from experience_extractor import ExperienceExtractor
from skill_packager import SkillPackager
from dynamic_router import DynamicRouter, RouteEntry
from complexity_classifier import ComplexityClassifier
from simple_executor import SimpleExecutor
from ceo_agent import CeoAgent
from agent_pool import AgentPool
from key_manager import KeyManager
from agent_bridge import AgentBridge
from approval_manager import ApprovalManager

logger = logging.getLogger("server")

# ──────────────────── 认证配置 ────────────────────
BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
if not BACKEND_TOKEN:
    BACKEND_TOKEN = secrets.token_urlsafe(32)
    logger.warning("BACKEND_TOKEN not set, generated: %s...", BACKEND_TOKEN[:8])


async def verify_backend_token(authorization: str = Header(None)):
    """REST API 认证依赖 — Bearer token"""
    if not BACKEND_TOKEN:
        return True
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    if not hmac.compare_digest(token, BACKEND_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid token")
    return True


def _verify_ws_token(ws: WebSocket) -> bool:
    """WebSocket 认证 — 从 query string 提取 token"""
    if not BACKEND_TOKEN:
        return True
    qs = ws.scope.get("query_string", b"").decode()
    params = parse_qs(qs)
    token = params.get("token", [None])[0]
    if not token:
        return False
    return hmac.compare_digest(token, BACKEND_TOKEN)


app = FastAPI()
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:8080,http://localhost:9090").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuthMiddleware(BaseHTTPMiddleware):
    """REST 请求认证中间件，跳过 /health /metrics /docs /openapi.json 和 OPTIONS 预检"""

    _PUBLIC = {"/health", "/metrics", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next):
        if not BACKEND_TOKEN:
            return await call_next(request)
        # OPTIONS 预检请求由 CORS 中间件处理，不拦截
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        if path in self._PUBLIC or path.startswith("/docs"):
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        token = auth.replace("Bearer ", "") if auth else ""
        if not token:
            from starlette.responses import JSONResponse
            return JSONResponse({"detail": "Missing Authorization header"}, status_code=401)
        if not hmac.compare_digest(token, BACKEND_TOKEN):
            from starlette.responses import JSONResponse
            return JSONResponse({"detail": "Invalid token"}, status_code=403)
        return await call_next(request)


app.add_middleware(AuthMiddleware)

sessions: dict[str, Session] = {}

# ──────────────────── 服务实例初始化 ────────────────────

_BASE_DIR = os.path.dirname(__file__)
_DATA_DIR = os.path.join(_BASE_DIR, "data")

skill_registry = SkillRegistry(base_dir=os.path.join(_DATA_DIR, "skill_packages"))
skill_packager = SkillPackager(
    output_dir=os.path.join(_DATA_DIR, "packages"),
)
project_manager = ProjectManager(
    projects_dir=os.path.join(_DATA_DIR, "projects"),
    skill_registry=skill_registry,
    skill_packager=skill_packager,
)
experience_extractor = ExperienceExtractor(
    incremental_dir=os.path.join(_DATA_DIR, "experience"),
)
dynamic_router = DynamicRouter(
    routing_table_path=os.path.join(_DATA_DIR, "routing_table.json"),
)

# 自适应协作链路组件
complexity_classifier = ComplexityClassifier()
simple_executor = SimpleExecutor(project_manager=project_manager)

# Agent 池（全局单例，支持复用和负载均衡）
key_manager = KeyManager()
agent_pool = AgentPool(key_manager=key_manager, max_instances_per_role=2)

# 安全中间件（全局单例，审计日志）
from security import SecurityMiddleware
security_guard = SecurityMiddleware()


def _ok(data=None):
    return {"success": True, "data": data, "error": None}


def _fail(error: str):
    return {"success": False, "data": None, "error": error}


# ──────────────────── SkillRegistry REST API ────────────────────


@app.get("/api/skills")
async def list_skills():
    try:
        return _ok(skill_registry.list_skills())
    except Exception as e:
        logger.exception("list_skills 失败")
        return _fail(str(e))


@app.post("/api/skills")
async def register_skill(body: dict = Body(...)):
    try:
        skill_dir = body["skill_dir"]
        pkg = skill_registry.register(skill_dir)
        return _ok(asdict(pkg))
    except KeyError:
        return _fail("缺少必填字段: skill_dir")
    except ValueError as e:
        return _fail(str(e))


@app.post("/api/skills/{skill_id}/clone")
async def clone_skill(skill_id: str, body: dict = Body(...)):
    try:
        target_dir = body["target_dir"]
        path = skill_registry.clone(skill_id, target_dir)
        return _ok({"cloned_path": path})
    except KeyError as e:
        return _fail(str(e))
    except ValueError as e:
        return _fail(str(e))


@app.get("/api/skills/{skill_id}/versions")
async def get_skill_versions(skill_id: str):
    try:
        versions = skill_registry.get_versions(skill_id)
        return _ok(versions)
    except KeyError as e:
        return _fail(str(e))


@app.get("/api/skills/{skill_id}")
async def get_skill(skill_id: str):
    try:
        pkg = skill_registry.get_skill(skill_id)
        return _ok(asdict(pkg))
    except KeyError as e:
        return _fail(str(e))


# ──────────────────── ProjectManager REST API ────────────────────


@app.get("/api/projects")
async def list_projects():
    try:
        return _ok(project_manager.list_projects())
    except Exception as e:
        logger.exception("list_projects 失败")
        return _fail(str(e))


@app.post("/api/projects")
async def create_project(body: dict = Body(...)):
    try:
        name = body["name"]
        brief = body.get("brief", {})
        project = project_manager.create_project(name, brief)
        return _ok(asdict(project))
    except KeyError:
        return _fail("缺少必填字段: name")
    except ValueError as e:
        return _fail(str(e))


@app.get("/api/projects/categories")
async def get_project_categories():
    """获取所有项目分类及每个分类下的项目。"""
    try:
        categories = project_manager.get_categories()
        return _ok(categories)
    except Exception as e:
        logger.exception("get_categories 失败")
        return _fail(str(e))


@app.post("/api/projects/classify-all")
async def classify_all_projects():
    """批量自动分类所有未分类项目。"""
    try:
        results = []
        for project in project_manager._projects.values():
            if not project.category:
                category = project_manager.auto_classify_project(project.project_id)
                results.append({"project_id": project.project_id, "category": category})
        return _ok({"classified": len(results), "results": results})
    except Exception as e:
        logger.exception("classify_all 失败")
        return _fail(str(e))


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    try:
        project = project_manager.get_project(project_id)
        return _ok(asdict(project))
    except KeyError as e:
        return _fail(str(e))


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    try:
        project_manager.delete_project(project_id)
        return _ok({"project_id": project_id, "message": "项目已删除"})
    except KeyError as e:
        return _fail(str(e))


@app.patch("/api/projects/{project_id}")
async def rename_project(project_id: str, body: dict = Body(...)):
    try:
        new_name = body.get("name", "")
        project_manager.rename_project(project_id, new_name)
        return _ok({"project_id": project_id, "name": new_name.strip()})
    except KeyError as e:
        return _fail(str(e))
    except ValueError as e:
        return _fail(str(e))


@app.get("/api/projects/{project_id}/status")
async def get_project_status(project_id: str):
    try:
        status = project_manager.get_project_status(project_id)
        return _ok(status)
    except KeyError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/instantiate")
async def instantiate_project(project_id: str, body: dict = Body(...)):
    try:
        dag = body["dag"]
        employees = project_manager.instantiate_project(project_id, dag)
        return _ok([asdict(e) for e in employees])
    except KeyError as e:
        return _fail(str(e))
    except ValueError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/category")
async def set_project_category(project_id: str, body: dict = Body(...)):
    """设置项目分类。"""
    try:
        category = body.get("category", "")
        project_manager.set_project_category(project_id, category)
        return _ok({"project_id": project_id, "category": category})
    except KeyError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/classify")
async def classify_project(project_id: str):
    """自动分类项目。"""
    try:
        category = project_manager.auto_classify_project(project_id)
        return _ok({"project_id": project_id, "category": category})
    except KeyError as e:
        return _fail(str(e))


@app.get("/api/projects/{project_id}/tasks")
async def get_project_tasks(project_id: str):
    """获取项目的所有任务（含子任务）。"""
    try:
        tasks = project_manager.get_project_tasks(project_id)
        return _ok(tasks)
    except KeyError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/tasks")
async def add_project_task(project_id: str, body: dict = Body(...)):
    """向项目添加任务（用户通过CEO对话发起）。"""
    try:
        task_id = body.get("task_id", str(uuid.uuid4())[:8])
        description = body.get("description", "")
        meeting_id = body.get("meeting_id", "")
        task = project_manager.add_task(project_id, task_id, description, meeting_id)
        return _ok(asdict(task))
    except KeyError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/tasks/{task_id}/subtasks")
async def add_subtask(project_id: str, task_id: str, body: dict = Body(...)):
    """向任务添加子任务（会议中AI自动生成）。"""
    try:
        subtask_id = body.get("subtask_id", str(uuid.uuid4())[:8])
        description = body.get("description", "")
        agent_id = body.get("agent_id", "")
        subtask = project_manager.add_subtask(project_id, task_id, subtask_id, description, agent_id)
        return _ok(asdict(subtask))
    except KeyError as e:
        return _fail(str(e))


@app.patch("/api/projects/{project_id}/tasks/{task_id}/subtasks/{subtask_id}")
async def update_subtask_status(project_id: str, task_id: str, subtask_id: str, body: dict = Body(...)):
    """更新子任务状态。"""
    try:
        status = body.get("status", "")
        project_manager.update_subtask_status(project_id, task_id, subtask_id, status)
        return _ok({"project_id": project_id, "task_id": task_id, "subtask_id": subtask_id, "status": status})
    except KeyError as e:
        return _fail(str(e))


@app.delete("/api/projects/{project_id}/tasks/{task_id}")
async def delete_project_task(project_id: str, task_id: str):
    """删除项目中的任务。"""
    try:
        success = project_manager.delete_task(project_id, task_id)
        if success:
            return _ok({"project_id": project_id, "task_id": task_id, "message": "任务已删除"})
        else:
            return _fail("任务不存在")
    except KeyError as e:
        return _fail(str(e))


@app.post("/api/projects/{project_id}/archive")
async def archive_project(project_id: str):
    try:
        result = project_manager.archive_project(project_id)
        return _ok(result)
    except KeyError as e:
        return _fail(str(e))


# ──────────────────── ExperienceExtractor REST API ────────────────────


def _rule_to_dict(rule) -> dict:
    return asdict(rule)


@app.get("/api/experience/rules")
async def get_all_rules():
    try:
        rules = experience_extractor.get_all_rules()
        return _ok([_rule_to_dict(r) for r in rules])
    except Exception as e:
        logger.exception("get_all_rules 失败")
        return _fail(str(e))


@app.get("/api/experience/rules/pending")
async def get_pending_rules():
    try:
        rules = experience_extractor.get_pending_rules()
        return _ok([_rule_to_dict(r) for r in rules])
    except Exception as e:
        logger.exception("get_pending_rules 失败")
        return _fail(str(e))


@app.post("/api/experience/rules/{rule_id}/approve")
async def approve_rule(rule_id: str, body: dict = Body(...)):
    try:
        comment = body.get("comment", "")
        success = experience_extractor.approve_rule(rule_id, comment)
        if not success:
            return _fail(f"规则不存在: {rule_id}")
        return _ok({"rule_id": rule_id, "status": "approved"})
    except Exception as e:
        logger.exception("approve_rule 失败")
        return _fail(str(e))


@app.post("/api/experience/rules/{rule_id}/reject")
async def reject_rule(rule_id: str, body: dict = Body(...)):
    try:
        reason = body.get("reason", "")
        success = experience_extractor.reject_rule(rule_id, reason)
        if not success:
            return _fail(f"规则不存在: {rule_id}")
        return _ok({"rule_id": rule_id, "status": "rejected"})
    except Exception as e:
        logger.exception("reject_rule 失败")
        return _fail(str(e))


@app.put("/api/experience/rules/{rule_id}")
async def modify_rule(rule_id: str, body: dict = Body(...)):
    try:
        updates = body.get("updates", body)
        success = experience_extractor.modify_rule(rule_id, updates)
        if not success:
            return _fail(f"规则不存在: {rule_id}")
        return _ok({"rule_id": rule_id, "modified": True})
    except Exception as e:
        logger.exception("modify_rule 失败")
        return _fail(str(e))


# ──────────────────── SkillPackager REST API ────────────────────


def _package_result_to_dict(result) -> dict:
    return {
        "package_path": result.package_path,
        "readme_content": result.readme_content,
        "desensitize_report": [asdict(issue) for issue in result.desensitize_report],
        "diff_summary": result.diff_summary,
        "skill_name": result.skill_name,
        "base_version": result.base_version,
        "output_version": result.output_version,
    }


@app.post("/api/skills/package")
async def package_skill(body: dict = Body(...)):
    try:
        base_skill_path = body["base_skill_path"]
        incremental_path = body["incremental_path"]
        project_id = body["project_id"]
        skill_name = body["skill_name"]
        result = skill_packager.full_package(
            base_skill_path=base_skill_path,
            incremental_path=incremental_path,
            project_id=project_id,
            skill_name=skill_name,
        )
        return _ok(_package_result_to_dict(result))
    except KeyError:
        return _fail("缺少必填字段: base_skill_path, incremental_path, project_id, skill_name")
    except FileNotFoundError as e:
        return _fail(str(e))
    except Exception as e:
        logger.exception("package_skill 失败")
        return _fail(str(e))


@app.get("/api/skills/package/preview")
async def preview_package(base_skill_path: str, incremental_path: str):
    try:
        result = skill_packager.preview_package(base_skill_path, incremental_path)
        return _ok(result)
    except FileNotFoundError as e:
        return _fail(str(e))
    except Exception as e:
        logger.exception("preview_package 失败")
        return _fail(str(e))


@app.post("/api/skills/evolve")
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

        rules = experience_extractor.extract_from_meeting(
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
                    "keywords": r.keywords,
                }
                for r in rules
            ],
        })
    except Exception as e:
        logger.exception("evolve_skills 失败")
        return _fail(str(e))


# ──────────────────── DynamicRouter REST API ────────────────────


@app.get("/api/router/table")
async def get_route_table():
    try:
        return _ok(dynamic_router.get_route_table())
    except Exception as e:
        logger.exception("get_route_table 失败")
        return _fail(str(e))


@app.put("/api/router/table")
async def add_route_entry(body: dict = Body(...)):
    try:
        entry = RouteEntry(
            dept_id=body["dept_id"],
            dept_name=body["dept_name"],
            capability_desc=body.get("capability_desc", ""),
            capability_keywords=body.get("capability_keywords", []),
            tools=body.get("tools", []),
            success_rate=body.get("success_rate", 0.0),
            total_tasks=body.get("total_tasks", 0),
            successful_tasks=body.get("successful_tasks", 0),
            last_active=body.get("last_active", ""),
            priority=body.get("priority", 0),
        )
        success = dynamic_router.add_route_entry(entry)
        if not success:
            return _fail("保存路由表失败")
        return _ok(asdict(entry))
    except KeyError:
        return _fail("缺少必填字段: dept_id, dept_name")
    except Exception as e:
        logger.exception("add_route_entry 失败")
        return _fail(str(e))


@app.delete("/api/router/table/{dept_id}")
async def remove_route_entry(dept_id: str):
    try:
        success = dynamic_router.remove_route_entry(dept_id)
        if not success:
            return _fail(f"部门不存在: {dept_id}")
        return _ok({"dept_id": dept_id, "removed": True})
    except Exception as e:
        logger.exception("remove_route_entry 失败")
        return _fail(str(e))


# ──────────────────── 角色配置 REST API ────────────────────

_ROLES_CONFIG_PATH = os.path.join(_BASE_DIR, "roles_config.yaml")


def _load_roles_config():
    """加载角色配置"""
    import yaml
    if not os.path.exists(_ROLES_CONFIG_PATH):
        return {"tools": {}, "skills": {}, "prompt_templates": {}, "base_roles": {}, "custom_roles": {}}
    with open(_ROLES_CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _save_roles_config(config):
    """保存角色配置"""
    import yaml
    with open(_ROLES_CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
    # 清除 agent_toolset 的缓存，确保下次读取生效
    try:
        from agent_toolset import invalidate_roles_config_cache
        invalidate_roles_config_cache()
    except ImportError:
        pass


@app.get("/api/roles/config")
async def get_roles_config():
    """获取完整角色配置"""
    try:
        config = _load_roles_config()
        return _ok(config)
    except Exception as e:
        logger.exception("获取角色配置失败")
        return _fail(str(e))


@app.get("/api/roles/{role_id}")
async def get_role(role_id: str):
    """获取单个角色配置"""
    try:
        config = _load_roles_config()
        role = config.get("base_roles", {}).get(role_id) or config.get("custom_roles", {}).get(role_id)
        if not role:
            return _fail(f"角色不存在: {role_id}")
        return _ok(role)
    except Exception as e:
        logger.exception("获取角色失败")
        return _fail(str(e))


@app.post("/api/roles/{role_id}")
async def create_role(role_id: str, body: dict = Body(...)):
    """创建自定义角色"""
    try:
        config = _load_roles_config()
        if role_id in config.get("base_roles", {}):
            return _fail(f"不能覆盖基础角色: {role_id}")
        if role_id in config.get("custom_roles", {}):
            return _fail(f"角色已存在: {role_id}")
        if "custom_roles" not in config:
            config["custom_roles"] = {}
        config["custom_roles"][role_id] = {
            "name": body.get("name", role_id),
            "description": body.get("description", ""),
            "base_role": body.get("base_role", "executor"),
            "extra_tools": body.get("extra_tools", []),
            "extra_skills": body.get("extra_skills", []),
            "prompt_template": "custom",
            "custom_prompt": body.get("custom_prompt", ""),
        }
        _save_roles_config(config)
        return _ok(config["custom_roles"][role_id])
    except Exception as e:
        logger.exception("创建角色失败")
        return _fail(str(e))


@app.put("/api/roles/{role_id}")
async def update_role(role_id: str, body: dict = Body(...)):
    """更新角色配置"""
    try:
        config = _load_roles_config()
        if role_id in config.get("base_roles", {}):
            # 更新基础角色
            base = config["base_roles"][role_id]
            if "name" in body:
                base["name"] = body["name"]
            if "description" in body:
                base["description"] = body["description"]
            if "permissions" in body:
                base["permissions"] = body["permissions"]
            if "skills" in body:
                base["skills"] = body["skills"]
            _save_roles_config(config)
            return _ok(base)
        elif role_id in config.get("custom_roles", {}):
            # 更新自定义角色
            custom = config["custom_roles"][role_id]
            for key in ["name", "description", "base_role", "extra_tools", "extra_skills", "custom_prompt"]:
                if key in body:
                    custom[key] = body[key]
            _save_roles_config(config)
            return _ok(custom)
        else:
            return _fail(f"角色不存在: {role_id}")
    except Exception as e:
        logger.exception("更新角色失败")
        return _fail(str(e))


@app.delete("/api/roles/{role_id}")
async def delete_role(role_id: str):
    """删除自定义角色"""
    try:
        config = _load_roles_config()
        if role_id in config.get("base_roles", {}):
            return _fail(f"不能删除基础角色: {role_id}")
        if role_id not in config.get("custom_roles", {}):
            return _fail(f"角色不存在: {role_id}")
        del config["custom_roles"][role_id]
        _save_roles_config(config)
        return _ok({"role_id": role_id, "deleted": True})
    except Exception as e:
        logger.exception("删除角色失败")
        return _fail(str(e))


@app.get("/api/roles/tools/list")
async def list_tools():
    """获取所有可用工具"""
    try:
        config = _load_roles_config()
        return _ok(config.get("tools", {}))
    except Exception as e:
        logger.exception("获取工具列表失败")
        return _fail(str(e))


@app.post("/api/roles/tools/{tool_id}")
async def create_tool(tool_id: str, body: dict = Body(...)):
    """添加新工具"""
    try:
        config = _load_roles_config()
        if "tools" not in config:
            config["tools"] = {}
        if tool_id in config["tools"]:
            return _fail(f"工具已存在: {tool_id}")
        config["tools"][tool_id] = {
            "name": body.get("name", tool_id),
            "description": body.get("description", ""),
            "category": body.get("category", "general"),
            "dangerous": body.get("dangerous", False),
        }
        _save_roles_config(config)
        return _ok(config["tools"][tool_id])
    except Exception as e:
        logger.exception("创建工具失败")
        return _fail(str(e))


@app.delete("/api/roles/tools/{tool_id}")
async def delete_tool(tool_id: str):
    """删除工具"""
    try:
        config = _load_roles_config()
        if tool_id not in config.get("tools", {}):
            return _fail(f"工具不存在: {tool_id}")
        del config["tools"][tool_id]
        _save_roles_config(config)
        return _ok({"tool_id": tool_id, "deleted": True})
    except Exception as e:
        logger.exception("删除工具失败")
        return _fail(str(e))


@app.get("/api/roles/skills/list")
async def list_role_skills():
    """获取所有可用技能"""
    try:
        config = _load_roles_config()
        return _ok(config.get("skills", {}))
    except Exception as e:
        logger.exception("获取技能列表失败")
        return _fail(str(e))



@app.post("/api/roles/skills/generate")
async def generate_skill(body: dict = Body(...)):
    """用AI根据需求描述生成技能配置"""
    try:
        description = body.get("description", "").strip()
        if not description:
            return _fail("请提供技能需求描述")

        # 获取session和API配置
        from agent import PROVIDER_REGISTRY

        session_id = body.get("session_id")
        session = sessions.get(session_id) if session_id else None

        # 如果没有指定session，找一个有API key的session
        if not session:
            for sid, s in sessions.items():
                logger.info("检查session %s: api_key=%s", sid, bool(s.api_key))
                if s.api_key:
                    session = s
                    logger.info("使用session %s", sid)
                    break

        provider = "deepseek"
        model_name = None
        api_key = None
        base_url = None

        # 优先从请求体获取API key
        if body.get("api_key"):
            api_key = body["api_key"]
            base_url = body.get("base_url") or ""
            logger.info("从请求体获取API key")

        # 其次从session获取
        if not api_key and session:
            provider = session.provider or provider
            model_name = session.model_name
            api_key = session.api_key
            base_url = session.base_url
            logger.info("从session获取配置: provider=%s model=%s api_key=%s", provider, model_name, bool(api_key))

        # 尝试从环境变量获取
        if not api_key:
            api_key = os.environ.get("DEEPSEEK_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")

        # 尝试从config获取
        if not api_key:
            from config import DEEPSEEK_API_KEY
            api_key = DEEPSEEK_API_KEY

        if not api_key and provider != "ollama":
            return _fail("未配置API密钥，请先在CEO对话中设置API Key")

        logger.info("最终API配置: provider=%s api_key=%s base_url=%s", provider, bool(api_key), base_url)

        reg = PROVIDER_REGISTRY.get(provider)
        if reg is None:
            return _fail(f"不支持的模型提供商: {provider}")

        if not api_key and provider != "ollama":
            return _fail("未配置API密钥，请先在CEO对话中设置API Key")

        # 创建模型
        # 确保base_url有协议前缀
        if base_url and not base_url.startswith(("http://", "https://")):
            base_url = "https://" + base_url

        # 如果没有base_url，使用provider的默认值
        if not base_url:
            # 从provider registry获取默认base_url
            if provider == "deepseek":
                base_url = "https://api.deepseek.com"
            elif provider == "openai":
                base_url = "https://api.openai.com/v1"
            # 其他provider由credential_kwargs处理

        class _TempSession:
            pass
        temp_session = _TempSession()
        temp_session.api_key = api_key
        temp_session.base_url = base_url

        credential = reg["credential_cls"](**reg["credential_kwargs"](temp_session))
        formatter = reg["formatter_cls"]()
        final_model_name = model_name or reg["default_model"]
        model = reg["model_cls"](
            credential=credential,
            model=final_model_name,
            stream=False,
            formatter=formatter,
        )

        # 构建prompt
        existing_skills = list((_load_roles_config() or {}).get("skills", {}).keys())
        existing_list = ", ".join(existing_skills[:20]) if existing_skills else "无"

        prompt = f"""你是一位AI Harness Engineering技能设计专家。请根据以下需求描述，生成一个完整的技能配置。

用户需求：{description}

当前已有的技能ID（请避免重复）：{existing_list}

请严格按以下JSON格式返回，不要包含其他内容：
{{
    "id": "技能ID（英文snake_case，简短有意义）",
    "name": "技能中文名称",
    "description": "一句话描述（20字以内）",
    "category": "分类（dev/testing/ops/data/ai/ux/design/content/sales/general 选一）",
    "methodology": "方法论描述（用 — 连接方法名和简要说明）",
    "practices": [
        "最佳实践1（具体可执行，含量化指标）",
        "最佳实践2",
        "最佳实践3",
        "最佳实践4",
        "最佳实践5",
        "最佳实践6"
    ],
    "workflow": {{
        "1": "第一步",
        "2": "第二步",
        "3": "第三步",
        "4": "第四步",
        "5": "第五步",
        "6": "第六步"
    }},
    "required_tools": ["工具列表，从以下选择：read_file, write_file, edit_file, list_directory, bash, git_status, git_commit, git_push, git_branch, git_diff, git_log, search_files, grep_content, run_tests, run_linter, create_document, edit_document, create_slide, edit_slide, run_sql, create_chart, run_etl, generate_image, generate_video, edit_media, write_copy, seo_optimize, web_fetch"]
}}"""

        # 调用LLM
        from agentscope.agent import Agent
        from agentscope.message import Msg
        from agent import _extract_text

        agent = Agent(
            name="skill_generator",
            system_prompt="你是一位AI Harness Engineering技能设计专家。请严格按照JSON格式返回结果。",
            model=model,
        )

        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        response = await agent.reply(msg)

        # 提取文本
        text = _extract_text(response)
        logger.info("AI生成技能返回: %s", text[:500])

        # 解析JSON
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if not json_match:
            return _fail(f"AI未能生成有效配置，返回内容: {text[:200]}")

        try:
            skill_config = json.loads(json_match.group())
        except json.JSONDecodeError as e:
            return _fail(f"JSON解析失败: {str(e)}")

        # 验证必要字段
        if not skill_config.get("id"):
            return _fail("AI未生成技能ID")
        if not skill_config.get("name"):
            skill_config["name"] = skill_config["id"]

        return _ok(skill_config)

    except Exception as e:
        logger.exception("AI生成技能失败")
        return _fail(str(e))


@app.post("/api/roles/skills/{skill_id}")
async def create_skill(skill_id: str, body: dict = Body(...)):
    """添加新技能"""
    try:
        config = _load_roles_config()
        if "skills" not in config:
            config["skills"] = {}
        if skill_id in config["skills"]:
            return _fail(f"技能已存在: {skill_id}")
        skill_entry = {
            "name": body.get("name", skill_id),
            "description": body.get("description", ""),
            "required_tools": body.get("required_tools", []),
        }
        # 保存AI生成的扩展字段
        if body.get("category"):
            skill_entry["category"] = body["category"]
        if body.get("methodology"):
            skill_entry["methodology"] = body["methodology"]
        if body.get("practices"):
            skill_entry["practices"] = body["practices"]
        if body.get("workflow"):
            skill_entry["workflow"] = body["workflow"]
        config["skills"][skill_id] = skill_entry
        _save_roles_config(config)
        return _ok(config["skills"][skill_id])
    except Exception as e:
        logger.exception("创建技能失败")
        return _fail(str(e))


@app.delete("/api/roles/skills/{skill_id}")
async def delete_skill(skill_id: str):
    """删除技能"""
    try:
        config = _load_roles_config()
        if skill_id not in config.get("skills", {}):
            return _fail(f"技能不存在: {skill_id}")
        del config["skills"][skill_id]
        _save_roles_config(config)
        return _ok({"skill_id": skill_id, "deleted": True})
    except Exception as e:
        logger.exception("删除技能失败")
        return _fail(str(e))


@app.websocket("/ws")
async def ws_handler(ws: WebSocket):
    # 认证：从 query string 的 token 参数校验
    if BACKEND_TOKEN and not _verify_ws_token(ws):
        await ws.close(code=4001, reason="Unauthorized")
        return
    await ws.accept()

    # 尝试从 URL 参数恢复会话
    qs_raw = ws.scope.get("query_string", b"").decode()
    qs_params = parse_qs(qs_raw)
    restore_id = qs_params.get("session", [None])[0]
    session = None
    if restore_id:
        session = Session.load_state(restore_id, ws)
        if session:
            sessions[session.session_id] = session
            logger.info("WebSocket 恢复会话: session=%s", session.session_id)

    if not session:
        session = Session(ws)
        sessions[session.session_id] = session
        logger.info("WebSocket 新建会话: session=%s", session.session_id)

    await ws.send_json({
        "type": "connected",
        "session_id": session.session_id,
        "restored": restore_id is not None and session.session_id == restore_id,
        "buffer_size": len(session._message_buffer),
    })

    # 恢复的消息历史发给前端
    if session._message_buffer:
        await ws.send_json({
            "type": "session_restored",
            "messages": session._message_buffer[-20:],  # 最近 20 条
        })

    agent_task: asyncio.Task | None = None

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "user_message":
                config_changed = False
                if msg.get("provider") and msg["provider"] != session.provider:
                    old = session.provider
                    session.provider = msg["provider"]
                    config_changed = True
                    logger.info("提供商变更: %s -> %s (session=%s)", old, msg["provider"], session.session_id)
                if msg.get("model_name") and msg["model_name"] != session.model_name:
                    old = session.model_name or "(默认)"
                    session.model_name = msg["model_name"]
                    config_changed = True
                    logger.info("模型名称变更: %s -> %s (session=%s)", old, msg["model_name"], session.session_id)
                if msg.get("api_key") and msg["api_key"] != session.api_key:
                    session.api_key = msg["api_key"]
                    config_changed = True
                    masked = msg["api_key"][:4] + "****" + msg["api_key"][-4:] if len(msg["api_key"]) > 8 else "****"
                    logger.info("API KEY 已更新: %s (session=%s)", masked, session.session_id)
                if msg.get("base_url") and msg["base_url"] != session.base_url:
                    old = session.base_url
                    session.base_url = msg["base_url"]
                    config_changed = True
                    logger.info("BASE URL 变更: %s -> %s (session=%s)", old, msg["base_url"], session.session_id)
                if "multimodal" in msg and msg["multimodal"] != session.multimodal:
                    session.multimodal = bool(msg["multimodal"])
                    config_changed = True
                    logger.info("多模态支持变更: %s (session=%s)", session.multimodal, session.session_id)
                if msg.get("reset") or config_changed:
                    session.agent = None

                content = msg.get("content", "")
                if not content:
                    continue

                preview = content[:80] + "..." if len(content) > 80 else content
                logger.info("收到用户消息: session=%s content=%r", session.session_id, preview)

                if agent_task and not agent_task.done():
                    agent_task.cancel()
                    try:
                        await agent_task
                    except asyncio.CancelledError:
                        pass

                agent_task = asyncio.create_task(
                    run_agent_stream(session, content)
                )

            elif msg_type == "tool_result":
                call_id = msg.get("call_id")
                if call_id and call_id in session.pending:
                    future = session.pending.pop(call_id)
                    if not future.done():
                        future.set_result(msg.get("result", {}))

            elif msg_type == "confirm_result":
                call_id = msg.get("call_id")
                if call_id and call_id in session.pending:
                    future = session.pending.pop(call_id)
                    if not future.done():
                        confirmed = msg.get("confirmed", True)
                        logger.info("用户确认结果: call_id=%s confirmed=%s", call_id, confirmed)
                        future.set_result(
                            {} if confirmed else {"rejected": True}
                        )

            elif msg_type == "unified_message":
                content = msg.get("content", "")
                if not content:
                    continue

                # 更新模型配置
                if msg.get("provider"):
                    session.provider = msg["provider"]
                if msg.get("model_name"):
                    session.model_name = msg["model_name"]
                if msg.get("api_key"):
                    session.api_key = msg["api_key"]
                if msg.get("base_url"):
                    session.base_url = msg["base_url"]

                logger.info("收到统一消息: session=%s content=%r", session.session_id, content[:50])

                # 提取选中的角色（如果有）
                selected_roles = msg.get("selected_roles", [])
                role_locations = msg.get("role_locations", {})

                # 委托给CEO Agent处理
                if session._ceo_agent is None:
                    session._ceo_agent = CeoAgent(
                        session=session,
                        project_manager=project_manager,
                        complexity_classifier=complexity_classifier,
                        simple_executor=simple_executor,
                    )

                ceo = session._ceo_agent
                async def _run_ceo():
                    try:
                        result = await ceo.process_message(content, ws.send_json, selected_roles=selected_roles, role_locations=role_locations)
                        if result:
                            logger.info("CEO处理完成: type=%s path=%s",
                                       result.get("type"), result.get("path_used"))
                    except Exception as e:
                        logger.exception("CEO处理异常: %s", e)
                        await session.send_error(str(e))
                asyncio.create_task(_run_ceo())

            elif msg_type == "workspace_confirm_response":
                # 用户回复了工作区确认
                logger.info("收到 workspace_confirm_response: session=%s type=%s output_dir=%s",
                           session.session_id,
                           msg.get("workspace_type", ""),
                           msg.get("output_dir", ""))
                if session._ceo_agent:
                    session._ceo_agent.handle_workspace_confirm_response({
                        "workspace_type": msg.get("workspace_type", "standalone"),
                        "repo_path": msg.get("repo_path", ""),
                        "branch_name": msg.get("branch_name", ""),
                        "output_dir": msg.get("output_dir", ""),
                    })
                    logger.info("工作区确认响应已处理: session=%s", session.session_id)
                else:
                    logger.warning("收到 workspace_confirm_response 但 ceo_agent 不存在")

            elif msg_type == "page_context":
                ctx = msg.get("context", {})
                session.update_page_context(ctx)
                logger.info("页面上下文更新: session=%s url=%s", session.session_id, ctx.get("url", ""))

            elif msg_type == "save_skill":
                name = msg.get("name", "")
                desc = msg.get("description", "")
                steps = msg.get("steps", [])
                skill_type = msg.get("skill_type", "strict")
                if name and steps:
                    save_skill_to_dir(name, desc, steps, skill_type)
                    session.agent = None
                    logger.info("技能已保存: name=%s type=%s", name, skill_type)
                    await ws.send_json({"type": "skill_saved", "name": name})

            elif msg_type == "get_skills":
                skills = list_skills_from_dir()
                await ws.send_json({"type": "skill_list", "skills": skills})

            elif msg_type == "delete_skill":
                skill_dir_name = msg.get("dir", "")
                if skill_dir_name:
                    target = os.path.realpath(os.path.join(SKILLS_DIR, skill_dir_name))
                    skills_real = os.path.realpath(SKILLS_DIR)
                    if not target.startswith(skills_real + os.sep):
                        await session.send_error("非法路径：禁止目录遍历")
                    elif os.path.isdir(target):
                        shutil.rmtree(target)
                        session.agent = None
                        logger.info("技能已删除: dir=%s", skill_dir_name)
                await ws.send_json({"type": "skill_deleted", "dir": skill_dir_name})

            elif msg_type == "generate_skill_summary":
                steps = msg.get("steps", [])
                skill_type = msg.get("skill_type", "strict")
                if steps:
                    logger.info("生成技能摘要: session=%s steps=%d type=%s", session.session_id, len(steps), skill_type)
                    result = await generate_skill_summary(session, steps, skill_type)
                    await ws.send_json({"type": "skill_summary", **result})

            elif msg_type == "start_meeting":
                if session.meeting_session and session.meeting_session.is_running():
                    await session.send_error("会议已在进行中")
                    continue

                if msg.get("provider"):
                    session.provider = msg["provider"]
                if msg.get("model_name"):
                    session.model_name = msg["model_name"]
                if msg.get("api_key"):
                    session.api_key = msg["api_key"]
                if msg.get("base_url"):
                    session.base_url = msg["base_url"]

                logger.info("会议配置: provider=%s model=%s api_key=%s base_url=%s",
                           session.provider, session.model_name or "(默认)",
                           "已设置" if session.api_key else "未设置",
                           session.base_url or "(默认)")

                meeting_id = str(uuid.uuid4())[:8]
                meeting = MeetingSession(meeting_id)
                meeting.start()
                session.meeting_session = meeting
                session.meeting_mode = True

                # 创建工作区
                from workspace_manager import WorkspaceManager, WorkspaceType
                workspaces_base = os.environ.get(
                    "AGENT_WORKSPACES_DIR",
                    os.path.join(os.path.expanduser("~"), ".agent-workspaces")
                )
                workspace_mgr = WorkspaceManager(workspaces_dir=workspaces_base)
                workspace = workspace_mgr.create_workspace(
                    task_id=meeting_id,
                    workspace_type=WorkspaceType.STANDALONE,
                )
                session._workspace_manager = workspace_mgr
                session._workspace = workspace

                coordinator = MeetingCoordinator(
                    meeting_session=meeting,
                    provider=session.provider,
                    model_name=session.model_name or "",
                    api_key=session.api_key,
                    base_url=session.base_url or "",
                    workspace=workspace,
                    agent_pool=agent_pool,
                    max_iterations=msg.get("max_iterations", 3),
                    workflow_engine=workflow_engine,
                )
                session._meeting_coordinator = coordinator

                # 创建CeoAgent并同步引用
                if session._ceo_agent is None:
                    session._ceo_agent = CeoAgent(
                        session=session,
                        project_manager=project_manager,
                        complexity_classifier=complexity_classifier,
                        simple_executor=simple_executor,
                    )
                session._ceo_agent._meeting_coordinator = coordinator
                session._ceo_agent._agenda = coordinator.agenda
                session._agenda = coordinator.agenda

                # 创建审批管理器
                session._approval_manager = ApprovalManager()

                # 创建检查点管理器
                from compensation import CheckpointManager
                session._checkpoint_manager = CheckpointManager()

                logger.info("会议已创建: meeting_id=%s session=%s", meeting_id, session.session_id)
                msg_meeting_started = {
                    "type": "meeting_started",
                    "meeting_id": meeting_id,
                    "agents": meeting.get_agents_dict(),
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(msg_meeting_started)

                session._agenda = coordinator.agenda
                agenda_init = {
                    "type": "agenda_update",
                    "phase": "idle",
                    "topic": "",
                    "current_speaker": None,
                    "proposal_id": None,
                    "token_queue": [],
                    "event_history": [],
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(agenda_init)

            elif msg_type == "meeting_message":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                content = msg.get("content", "")
                if not content:
                    continue

                logger.info("收到会议消息: session=%s content=%r", session.session_id, content[:100])
                session.meeting_session.add_message("boss", content)

                # 委托给CeoAgent处理会议消息
                ceo = getattr(session, '_ceo_agent', None)
                if ceo:
                    try:
                        await ceo.handle_meeting_message(content, ws.send_json)
                    except Exception:
                        logger.exception("会议消息处理异常: session=%s", session.session_id)
                        await session.send_error("会议消息处理出错")
                else:
                    logger.warning("CEO Agent未初始化: session=%s", session.session_id)

                await ws.send_json({"type": "meeting_message_ack", "content": content})

            elif msg_type == "task_assign":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                agent_id = msg.get("agentId", "")
                description = msg.get("description", "")
                if not agent_id or not description:
                    continue

                task = session.meeting_session.add_task(agent_id, description)
                session.meeting_session.update_task_status(task.id, "assigned")
                session.meeting_session.update_agent_status(agent_id, MeetingAgentStatus.WORKING)
                session.meeting_session.add_message("boss", f"任务已派发给 {agent_id}: {description}")

                # 将子任务持久化到项目的当前任务下
                if session.project_id and session.task_id:
                    try:
                        project_manager.add_subtask(
                            session.project_id, session.task_id, task.id, description, agent_id
                        )
                    except Exception as e:
                        logger.warning("子任务持久化到项目失败: %s", e)

                logger.info("任务已派发: task_id=%s agent_id=%s meeting=%s", task.id, agent_id, session.meeting_session.meeting_id)
                msg_task_assigned = {
                    "type": "task_assigned",
                    "taskId": task.id,
                    "agentId": agent_id,
                    "status": "assigned",
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(msg_task_assigned)

                msg_agent_status = {
                    "type": "agent_status_update",
                    "agentId": agent_id,
                    "status": "working",
                    "currentTask": task.id,
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(msg_agent_status)

            elif msg_type == "task_delete":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                task_id = msg.get("taskId", "")
                if not task_id:
                    continue

                success = session.meeting_session.delete_task(task_id)
                if success:
                    logger.info("任务已删除: task_id=%s meeting=%s", task_id, session.meeting_session.meeting_id)
                    msg_task_deleted = {
                        "type": "task_deleted",
                        "taskId": task_id,
                        "sequence_no": session.next_sequence(),
                    }
                    await session.send_and_buffer(msg_task_deleted)
                else:
                    await session.send_error(f"任务不存在: {task_id}")

            elif msg_type == "end_meeting":
                if not session.meeting_session:
                    await session.send_error("没有进行中的会议")
                    continue

                summary = session.meeting_session.get_summary()
                session.meeting_session.stop()
                session.meeting_session.cleanup()
                meeting_id = session.meeting_session.meeting_id
                session.clear_meeting()
                
                # 清理工作区
                if session._workspace_manager and session._workspace:
                    try:
                        session._workspace_manager.cleanup_workspace(session._workspace)
                        logger.info("工作区已清理: workspace=%s", session._workspace)
                    except Exception as e:
                        logger.warning("工作区清理失败: %s", e)

                logger.info("会议已结束: meeting_id=%s session=%s", meeting_id, session.session_id)
                msg_meeting_ended = {
                    "type": "meeting_ended",
                    "summary": summary,
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(msg_meeting_ended)

            elif msg_type == "get_meeting_status":
                if not session.meeting_session:
                    await session.send_error("没有进行中的会议")
                    continue

                await ws.send_json({
                    "type": "meeting_status",
                    "meeting_id": session.meeting_session.meeting_id,
                    "agents": session.meeting_session.get_agents_dict(),
                    "tasks": session.meeting_session.get_tasks_dict(),
                    "is_running": session.meeting_session.is_running(),
                })

            elif msg_type == "pause_task":
                task_id = msg.get("taskId", "")
                if session.meeting_session and task_id:
                    session.meeting_session.update_task_status(task_id, "paused")
                    await ws.send_json({
                        "type": "task_paused",
                        "taskId": task_id,
                    })

            elif msg_type == "resume_task":
                task_id = msg.get("taskId", "")
                if session.meeting_session and task_id:
                    session.meeting_session.update_task_status(task_id, "assigned")
                    await ws.send_json({
                        "type": "task_resumed",
                        "taskId": task_id,
                    })

            elif msg_type == "agenda_action":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                # 优先从CeoAgent获取agenda，然后从coordinator，最后从session
                ceo = getattr(session, '_ceo_agent', None)
                if ceo and ceo.agenda:
                    agenda = ceo.agenda
                else:
                    coordinator = getattr(session, '_meeting_coordinator', None)
                    if coordinator and hasattr(coordinator, 'agenda'):
                        agenda = coordinator.agenda
                    elif session._agenda is not None:
                        agenda = session._agenda
                    else:
                        from agenda import AgendaStateMachine
                        session._agenda = AgendaStateMachine()
                        agenda = session._agenda
                action = msg.get("action", "")
                topic = msg.get("topic", "")
                reason = msg.get("reason", "")

                result = False
                if action == "open_topic" and topic:
                    result = agenda.open_topic(topic)
                elif action == "start_discussion":
                    result = agenda.start_discussion()
                elif action == "propose":
                    result = agenda.propose("")
                elif action == "start_voting":
                    result = agenda.start_voting()
                elif action == "accept":
                    result = agenda.accept()
                elif action == "reject":
                    result = agenda.reject()
                elif action == "close":
                    result = agenda.close()
                elif action == "declare_emergency":
                    result = agenda.declare_emergency(reason or "手动触发")
                elif action == "resolve_emergency":
                    result = agenda.resolve_emergency()

                agenda_snapshot = {
                    "type": "agenda_update",
                    "phase": agenda.get_phase().value,
                    "topic": agenda._topic,
                    "current_speaker": agenda.get_current_speaker(),
                    "proposal_id": None,
                    "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
                    "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(agenda_snapshot)

            elif msg_type == "override_decision":
                decision_id = msg.get("decision_id", "")
                new_decision = msg.get("new_decision", "")
                await ws.send_json({
                    "type": "decision_overridden",
                    "decision_id": decision_id,
                    "new_decision": new_decision,
                })

            elif msg_type == "adjust_agent_weight":
                agent_id = msg.get("agentId", "")
                weight = msg.get("weight", 1.0)
                coordinator = getattr(session, "_meeting_coordinator", None)
                if coordinator and hasattr(coordinator, 'negotiation'):
                    coordinator.negotiation.set_agent_weight(agent_id, weight)
                await ws.send_json({
                    "type": "agent_weight_adjusted",
                    "agentId": agent_id,
                    "weight": weight,
                })

            # === 投票决策系统 ===
            elif msg_type == "create_proposal":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                coordinator = getattr(session, '_meeting_coordinator', None)
                if not coordinator or not hasattr(coordinator, 'negotiation'):
                    await session.send_error("协商引擎未初始化")
                    continue

                proposer_id = msg.get("proposerId", "user")
                content = msg.get("content", "")
                if not content:
                    await session.send_error("提案内容不能为空")
                    continue

                proposal = coordinator.negotiation.create_proposal(proposer_id, content)

                # 转换议程状态到 proposal 阶段
                agenda = getattr(coordinator, 'agenda', None) or session._agenda
                if agenda:
                    agenda.propose(proposal.id)

                # 发送提案消息
                proposal_msg = {
                    "type": "proposal",
                    "proposal": {
                        "id": proposal.id,
                        "proposerId": proposal.proposer_id,
                        "content": proposal.content,
                        "stance": "neutral",
                        "confidence": 0.5,
                        "argumentRefs": [],
                        "createdAt": proposal.created_at,
                    },
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(proposal_msg)

                # 同步更新议程状态
                if agenda:
                    agenda_snapshot = {
                        "type": "agenda_update",
                        "phase": agenda.get_phase().value,
                        "topic": agenda._topic,
                        "current_speaker": agenda.get_current_speaker(),
                        "proposal_id": proposal.id,
                        "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
                        "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
                        "sequence_no": session.next_sequence(),
                    }
                    await session.send_and_buffer(agenda_snapshot)

            elif msg_type == "cast_vote":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                coordinator = getattr(session, '_meeting_coordinator', None)
                if not coordinator or not hasattr(coordinator, 'negotiation'):
                    await session.send_error("协商引擎未初始化")
                    continue

                proposal_id = msg.get("proposalId", "")
                voter_id = msg.get("voterId", "user")
                approve = msg.get("approve", True)
                weight = msg.get("weight")
                reason = msg.get("reason", "")

                # 验证提案存在
                proposal = coordinator.negotiation._proposals.get(proposal_id)
                if not proposal:
                    await session.send_error(f"提案 {proposal_id} 不存在")
                    continue

                # 检查是否已经投过票
                existing_votes = coordinator.negotiation._votes.get(proposal_id, [])
                if any(v.voter_id == voter_id for v in existing_votes):
                    await session.send_error(f"{voter_id} 已经对提案 {proposal_id} 投过票")
                    continue

                vote = coordinator.negotiation.cast_vote(
                    proposal_id, voter_id, approve, weight, reason,
                )
                if vote is None:
                    await session.send_error(f"投票失败")
                    continue

                # 广播投票消息
                vote_msg = {
                    "type": "vote",
                    "vote": {
                        "proposalId": vote.proposal_id,
                        "voterId": vote.voter_id,
                        "approve": vote.approve,
                        "weight": vote.weight,
                        "reason": vote.reason,
                    },
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(vote_msg)

                # 检查是否所有参与者都已投票，自动评估共识
                agents = session.meeting_session.agents
                voted_ids = {v.voter_id for v in coordinator.negotiation._votes.get(proposal_id, [])}
                all_voted = all(a.id in voted_ids for a in agents)
                if all_voted and len(agents) > 0:
                    result = coordinator.negotiation.evaluate_consensus(proposal_id)

                    # 更新议程状态
                    agenda = getattr(coordinator, 'agenda', None) or session._agenda
                    if agenda:
                        if result.accepted:
                            agenda.accept()
                        else:
                            agenda.reject()

                    vote_result_msg = {
                        "type": "vote_result",
                        "result": {
                            "proposalId": result.proposal_id,
                            "strategy": result.strategy.value,
                            "totalVotes": result.total_votes,
                            "approveCount": result.approve_count,
                            "opposeCount": result.oppose_count,
                            "weightedApprove": result.weighted_approve,
                            "weightedOppose": result.weighted_oppose,
                            "accepted": result.accepted,
                        },
                        "sequence_no": session.next_sequence(),
                    }
                    await session.send_and_buffer(vote_result_msg)

                    # 同步议程状态
                    if agenda:
                        await session.send_and_buffer({
                            "type": "agenda_update",
                            "phase": agenda.get_phase().value,
                            "topic": agenda._topic,
                            "current_speaker": agenda.get_current_speaker(),
                            "proposal_id": proposal_id,
                            "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
                            "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
                            "sequence_no": session.next_sequence(),
                        })

            elif msg_type == "evaluate_consensus":
                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                coordinator = getattr(session, '_meeting_coordinator', None)
                if not coordinator or not hasattr(coordinator, 'negotiation'):
                    await session.send_error("协商引擎未初始化")
                    continue

                proposal_id = msg.get("proposalId", "")
                strategy = msg.get("strategy")

                from negotiation import ConsensusStrategy
                strategy_enum = None
                if strategy:
                    try:
                        strategy_enum = ConsensusStrategy(strategy)
                    except ValueError:
                        pass

                result = coordinator.negotiation.evaluate_consensus(proposal_id, strategy_enum)

                # 更新议程状态
                agenda = getattr(coordinator, 'agenda', None) or session._agenda
                if agenda:
                    if result.accepted:
                        agenda.accept()
                    else:
                        agenda.reject()

                # 发送投票结果
                vote_result_msg = {
                    "type": "vote_result",
                    "result": {
                        "proposalId": result.proposal_id,
                        "strategy": result.strategy.value,
                        "totalVotes": result.total_votes,
                        "approveCount": result.approve_count,
                        "opposeCount": result.oppose_count,
                        "weightedApprove": result.weighted_approve,
                        "weightedOppose": result.weighted_oppose,
                        "accepted": result.accepted,
                    },
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(vote_result_msg)

                # 同步更新议程状态
                if agenda:
                    agenda_snapshot = {
                        "type": "agenda_update",
                        "phase": agenda.get_phase().value,
                        "topic": agenda._topic,
                        "current_speaker": agenda.get_current_speaker(),
                        "proposal_id": proposal_id,
                        "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
                        "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
                        "sequence_no": session.next_sequence(),
                    }
                    await session.send_and_buffer(agenda_snapshot)

            elif msg_type == "request_retransmit":
                from_seq = msg.get("from_sequence_no", 0)
                buffered = getattr(session, "_message_buffer", [])
                for buffered_msg in buffered:
                    if buffered_msg.get("sequence_no", 0) >= from_seq:
                        await ws.send_json(buffered_msg)

            elif msg_type == "workspace_action":
                action = msg.get("action")
                workspace_id = msg.get("workspace_id")

                if action == "list":
                    workspaces = session._workspace_manager.list_workspaces() if session._workspace_manager else []
                    await ws.send_json({
                        "type": "workspace_list",
                        "workspaces": [w.__dict__ for w in workspaces],
                    })
                elif action == "destroy":
                    if session._workspace_manager:
                        success = session._workspace_manager.destroy_workspace(workspace_id)
                        await ws.send_json({
                            "type": "workspace_destroyed",
                            "workspace_id": workspace_id,
                            "success": success,
                        })

            elif msg_type == "tool_call":
                tool_name = msg.get("tool_name")
                arguments = msg.get("arguments", {})

                if session._meeting_coordinator and session._meeting_coordinator._tool_executor:
                    result = await session._meeting_coordinator.execute_tool_call(tool_name, arguments)
                    await ws.send_json({
                        "type": "tool_result",
                        "tool_name": tool_name,
                        **result,
                    })

            # === Bridge 消息处理 ===
            elif msg_type == "bridge_register_agent":
                ts_agent_id = msg.get("tsAgentId")
                name = msg.get("name", "Unknown")
                role = msg.get("role", "executor")
                capabilities = msg.get("capabilities", [])

                if not session._agent_bridge:
                    # 懒初始化：首次 bridge 消息时创建
                    session._agent_bridge = AgentBridge(
                        meeting_session=session.meeting_session,
                        agent_pool=agent_pool,
                    )

                await session._agent_bridge.register_ts_agent(
                    ts_agent_id, name, role, capabilities,
                    session.send_and_buffer,
                )

            elif msg_type == "bridge_unregister_agent":
                ts_agent_id = msg.get("tsAgentId")
                if session._agent_bridge:
                    await session._agent_bridge.unregister_ts_agent(
                        ts_agent_id, session.send_and_buffer,
                    )

            elif msg_type == "bridge_message":
                from_id = msg.get("fromAgentId")
                to_id = msg.get("toAgentId")
                payload = msg.get("payload", {})

                if not session._agent_bridge:
                    session._agent_bridge = AgentBridge(
                        meeting_session=session.meeting_session,
                        agent_pool=agent_pool,
                    )

                await session._agent_bridge.route_message(
                    from_id, to_id, payload,
                    session.send_and_buffer,
                    coordinator=session._meeting_coordinator,
                )

            # === 人工审批系统 ===
            elif msg_type == "human_approval_response":
                request_id = msg.get("requestId", "")
                approved = msg.get("approved", False)
                reason = msg.get("reason", "")

                if not session._approval_manager:
                    session._approval_manager = ApprovalManager()

                success = await session._approval_manager.handle_response(
                    request_id, approved, reason, session.send_and_buffer,
                )
                if not success:
                    await session.send_error(f"审批请求 {request_id} 不存在或已处理")

            elif msg_type == "get_pending_approvals":
                if not session._approval_manager:
                    session._approval_manager = ApprovalManager()

                pending = session._approval_manager.get_pending_requests()
                await ws.send_json({
                    "type": "pending_approvals",
                    "requests": pending,
                    "count": len(pending),
                })

            elif msg_type == "request_approval":
                # 创建审批请求（用于测试或 agent 主动请求审批）
                if not session._approval_manager:
                    session._approval_manager = ApprovalManager()

                from protocol import RiskLevel
                risk_map = {"low": RiskLevel.LOW, "medium": RiskLevel.MEDIUM, "high": RiskLevel.HIGH, "critical": RiskLevel.CRITICAL}

                requester_id = msg.get("requesterId", "agent-executor")
                operation = msg.get("operation", "unknown_operation")
                description = msg.get("description", "")
                risk_level = risk_map.get(msg.get("riskLevel", "medium"), RiskLevel.MEDIUM)
                confidence = msg.get("confidence", 0.5)

                approval = await session._approval_manager.request_approval(
                    requester_id=requester_id,
                    operation=operation,
                    description=description,
                    risk_level=risk_level,
                    confidence=confidence,
                    send_fn=session.send_and_buffer,
                )
                logger.info("审批请求已发送: id=%s operation=%s", approval.id, operation)

            # === 检查点系统 ===
            elif msg_type == "checkpoint_save":
                task_id = msg.get("taskId", "")
                step_index = msg.get("stepIndex", 0)
                state = msg.get("state", {})

                if not session._checkpoint_manager:
                    from compensation import CheckpointManager
                    session._checkpoint_manager = CheckpointManager()

                checkpoint = session._checkpoint_manager.save_checkpoint(task_id, step_index, state)

                await session.send_and_buffer({
                    "type": "checkpoint_saved",
                    "checkpoint": {
                        "id": checkpoint.id,
                        "taskId": checkpoint.task_id,
                        "stepIndex": checkpoint.step_index,
                        "createdAt": checkpoint.created_at,
                    },
                    "sequence_no": session.next_sequence(),
                })

            elif msg_type == "checkpoint_restore":
                checkpoint_id = msg.get("checkpointId", "")

                if not session._checkpoint_manager:
                    from compensation import CheckpointManager
                    session._checkpoint_manager = CheckpointManager()

                state = session._checkpoint_manager.restore_checkpoint(checkpoint_id)
                if state is None:
                    await session.send_error(f"检查点 {checkpoint_id} 不存在")
                else:
                    checkpoint = session._checkpoint_manager.get_checkpoint(checkpoint_id)
                    await session.send_and_buffer({
                        "type": "checkpoint_restored",
                        "checkpointId": checkpoint_id,
                        "taskId": checkpoint.task_id if checkpoint else "",
                        "stepIndex": checkpoint.step_index if checkpoint else 0,
                        "state": state,
                        "sequence_no": session.next_sequence(),
                    })

            elif msg_type == "get_checkpoints":
                task_id = msg.get("taskId", "")

                if not session._checkpoint_manager:
                    from compensation import CheckpointManager
                    session._checkpoint_manager = CheckpointManager()

                if task_id:
                    checkpoints = session._checkpoint_manager.get_checkpoints_for_task(task_id)
                else:
                    # 返回所有检查点
                    checkpoints = []
                    for task_cps in session._checkpoint_manager._checkpoints.values():
                        checkpoints.extend(task_cps)

                await ws.send_json({
                    "type": "checkpoints_list",
                    "taskId": task_id,
                    "checkpoints": [
                        {
                            "id": cp.id,
                            "taskId": cp.task_id,
                            "stepIndex": cp.step_index,
                            "createdAt": cp.created_at,
                        }
                        for cp in checkpoints
                    ],
                })

            elif msg_type == "checkpoint_delete":
                checkpoint_id = msg.get("checkpointId", "")

                if not session._checkpoint_manager:
                    from compensation import CheckpointManager
                    session._checkpoint_manager = CheckpointManager()

                deleted = session._checkpoint_manager.delete_checkpoint(checkpoint_id)
                await ws.send_json({
                    "type": "checkpoint_deleted",
                    "checkpointId": checkpoint_id,
                    "success": deleted,
                })

            # === 迭代配置 ===
            elif msg_type == "set_max_iterations":
                max_iter = msg.get("maxIterations", 3)
                coordinator = getattr(session, '_meeting_coordinator', None)
                if coordinator:
                    coordinator._max_iterations = max(1, min(10, int(max_iter)))
                    await ws.send_json({
                        "type": "config_updated",
                        "key": "max_iterations",
                        "value": coordinator._max_iterations,
                    })
                else:
                    await session.send_error("会议协调器未初始化")

            # === 会议快照（断点续跑）===
            elif msg_type == "save_meeting_snapshot":
                meeting = session.meeting_session
                if not meeting or not meeting.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                snapshot = {
                    "meeting_id": meeting.meeting_id,
                    "agents": meeting.get_agents_dict(),
                    "tasks": meeting.get_tasks_dict(),
                    "messages": meeting.messages[-50:],  # 最近50条消息
                    "phase": session._agenda.get_phase().value if session._agenda else "idle",
                }
                if not session._checkpoint_manager:
                    from compensation import CheckpointManager
                    session._checkpoint_manager = CheckpointManager()

                cp = session._checkpoint_manager.save_checkpoint(
                    f"meeting-{meeting.meeting_id}", 0, snapshot,
                )
                await session.send_and_buffer({
                    "type": "meeting_snapshot_saved",
                    "checkpointId": cp.id,
                    "meetingId": meeting.meeting_id,
                    "sequence_no": session.next_sequence(),
                })

            elif msg_type == "restore_meeting_snapshot":
                checkpoint_id = msg.get("checkpointId", "")
                if not session._checkpoint_manager:
                    await session.send_error("无检查点")
                    continue

                state = session._checkpoint_manager.restore_checkpoint(checkpoint_id)
                if not state:
                    await session.send_error(f"检查点 {checkpoint_id} 不存在")
                    continue

                # 恢复会议状态
                meeting = session.meeting_session
                if meeting:
                    # 恢复任务
                    for task_data in state.get("tasks", []):
                        try:
                            task = meeting.add_task(task_data["agent_id"], task_data["description"])
                            meeting.update_task_status(task.id, task_data["status"])
                        except Exception:
                            pass

                    # 恢复消息
                    meeting.messages = state.get("messages", [])

                await session.send_and_buffer({
                    "type": "meeting_snapshot_restored",
                    "checkpointId": checkpoint_id,
                    "meetingId": state.get("meeting_id", ""),
                    "tasksRestored": len(state.get("tasks", [])),
                    "messagesRestored": len(state.get("messages", [])),
                    "sequence_no": session.next_sequence(),
                })

            # === 关键阻塞 ===
            elif msg_type == "critical_blocker":
                agent_id = msg.get("agentId", "unknown")
                content = msg.get("content", "")
                blocker_type = msg.get("blockerType", "unknown")

                if not session.meeting_session or not session.meeting_session.is_running():
                    await session.send_error("没有进行中的会议")
                    continue

                coordinator = getattr(session, '_meeting_coordinator', None)
                if not coordinator:
                    await session.send_error("会议协调器未初始化")
                    continue

                # 广播阻塞消息给所有参与者
                blocker_msg = {
                    "type": "critical_blocker",
                    "agentId": agent_id,
                    "content": content,
                    "blockerType": blocker_type,
                    "sequence_no": session.next_sequence(),
                }
                await session.send_and_buffer(blocker_msg)

                # 触发紧急响应
                try:
                    await coordinator.handle_critical_blocker(
                        agent_id, content,
                        lambda aid, text, extra=None: session.send_and_buffer({
                            "type": "agent_message",
                            "agentId": aid,
                            "content": text,
                            "sequence_no": session.next_sequence(),
                        }),
                    )

                    # 更新议程状态
                    agenda = getattr(coordinator, 'agenda', None) or session._agenda
                    if agenda:
                        await session.send_and_buffer({
                            "type": "agenda_update",
                            "phase": agenda.get_phase().value,
                            "topic": agenda._topic,
                            "current_speaker": agenda.get_current_speaker(),
                            "proposal_id": None,
                            "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
                            "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
                            "sequence_no": session.next_sequence(),
                        })
                except Exception as e:
                    logger.error("紧急响应处理失败: %s", e)
                    await session.send_error(f"紧急响应处理失败: {e}")

            # === 审计日志 ===
            elif msg_type == "get_audit_log":
                agent_id = msg.get("agentId")
                operation = msg.get("operation")
                risk_level_str = msg.get("riskLevel")

                from security import RiskLevel
                risk_level = None
                if risk_level_str:
                    try:
                        risk_level = RiskLevel(risk_level_str)
                    except ValueError:
                        pass

                entries = security_guard.get_audit_log(
                    agent_id=agent_id,
                    operation=operation,
                    risk_level=risk_level,
                )

                await ws.send_json({
                    "type": "audit_log_list",
                    "entries": [
                        {
                            "id": e.id,
                            "agentId": e.agent_id,
                            "operation": e.operation,
                            "target": e.target,
                            "riskLevel": e.risk_level.value,
                            "allowed": e.allowed,
                            "reason": e.reason,
                            "timestamp": e.timestamp,
                        }
                        for e in entries
                    ],
                    "count": len(entries),
                })

            elif msg_type == "log_audit":
                # 手动记录审计日志（agent 或前端触发）
                agent_id = msg.get("agentId", "unknown")
                operation = msg.get("operation", "unknown")
                target = msg.get("target", "")
                capability = msg.get("capability", operation)
                allowed = msg.get("allowed", True)
                reason = msg.get("reason", "")

                security_guard._log_audit(agent_id, operation, target, capability, allowed, reason, [])

                # 推送最新的审计条目给前端
                latest = security_guard._audit_log[-1] if security_guard._audit_log else None
                if latest:
                    await session.send_and_buffer({
                        "type": "audit_log",
                        "entry": {
                            "id": latest.id,
                            "agentId": latest.agent_id,
                            "operation": latest.operation,
                            "target": latest.target,
                            "riskLevel": latest.risk_level.value,
                            "allowed": latest.allowed,
                            "reason": latest.reason,
                            "timestamp": latest.timestamp,
                        },
                        "sequence_no": session.next_sequence(),
                    })

    except WebSocketDisconnect:
        logger.info("WebSocket 断开: session=%s", session.session_id)
    except Exception:
        logger.exception("WebSocket 异常: session=%s", session.session_id)
    finally:
        # 保存会话状态（支持重连恢复）
        try:
            session.save_state()
        except Exception as e:
            logger.warning("保存会话状态失败: %s", e)

        if session.meeting_session:
            session.meeting_session.stop()
            session.meeting_session.cleanup()
        if agent_task and not agent_task.done():
            agent_task.cancel()
            try:
                await agent_task
            except (asyncio.CancelledError, Exception):
                pass
        sessions.pop(session.session_id, None)
        logger.info("Session 已清理: session=%s, 活跃会话数=%d", session.session_id, len(sessions))


# ──────────────────── WorkflowEngine REST API ────────────────────

from workflow_engine import WorkflowEngine
from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge, workflow_execution_to_dict, workflow_definition_to_dict

workflow_engine = WorkflowEngine()


@app.post("/api/workflow/create")
async def create_workflow(definition: dict):
    """创建工作流执行实例"""
    try:
        # 将 dict 转换为 WorkflowDefinition
        nodes = [WorkflowNode(
            node_id=n["node_id"],
            task_description=n.get("task_description", ""),
            dept_id=n.get("dept_id", ""),
            input_spec=n.get("input_spec", {}),
            output_spec=n.get("output_spec", {}),
        ) for n in definition.get("nodes", [])]

        edges = [WorkflowEdge(
            source_node_id=e["source_node_id"],
            target_node_id=e["target_node_id"],
            condition=e.get("condition"),
        ) for e in definition.get("edges", [])]

        wf_def = WorkflowDefinition(
            workflow_id=definition.get("workflow_id", str(uuid.uuid4())[:8]),
            name=definition.get("name", "Unnamed"),
            description=definition.get("description", ""),
            nodes=nodes,
            edges=edges,
            execution_strategy=definition.get("execution_strategy", "sequential"),
        )

        execution = workflow_engine.create_workflow(wf_def)
        return {"success": True, "data": workflow_execution_to_dict(execution)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/workflow/execute/{execution_id}")
async def execute_workflow(execution_id: str):
    """执行工作流"""
    try:
        task = workflow_engine.start_workflow(execution_id)
        await task
        execution = workflow_engine.get_workflow_status(execution_id)
        return {"success": True, "data": workflow_execution_to_dict(execution)}
    except KeyError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/workflow/pause/{execution_id}")
async def pause_workflow(execution_id: str):
    """暂停工作流"""
    try:
        await workflow_engine.pause_workflow(execution_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@app.post("/api/workflow/resume/{execution_id}")
async def resume_workflow(execution_id: str):
    """恢复工作流"""
    try:
        await workflow_engine.resume_workflow(execution_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@app.post("/api/workflow/cancel/{execution_id}")
async def cancel_workflow(execution_id: str):
    """取消工作流"""
    try:
        await workflow_engine.cancel_workflow(execution_id)
        return {"success": True, "data": None}
    except KeyError as e:
        return {"success": False, "error": str(e)}


@app.post("/api/workflow/retry/{execution_id}/{node_id}")
async def retry_node(execution_id: str, node_id: str):
    """重试工作流节点"""
    try:
        await workflow_engine.retry_node(execution_id, node_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@app.get("/api/workflow/status/{execution_id}")
async def get_workflow_status(execution_id: str):
    """获取工作流状态"""
    try:
        execution = workflow_engine.get_workflow_status(execution_id)
        return {"success": True, "data": workflow_execution_to_dict(execution)}
    except KeyError as e:
        return {"success": False, "error": str(e)}


@app.get("/api/workflow/visualization/{execution_id}")
async def get_workflow_visualization(execution_id: str):
    """获取工作流可视化数据"""
    try:
        vis = workflow_engine.get_workflow_visualization(execution_id)
        return {"success": True, "data": vis}
    except KeyError as e:
        return {"success": False, "error": str(e)}


@app.get("/health")
async def health():
    return {"status": "ok", "sessions": len(sessions)}


@app.get("/metrics")
async def metrics():
    """Prometheus 格式指标"""
    from llm_cache import llm_cache
    from fastapi.responses import PlainTextResponse
    cache_stats = llm_cache.stats

    lines = [
        "# HELP mdh_sessions_active Number of active sessions",
        "# TYPE mdh_sessions_active gauge",
        f"mdh_sessions_active {len(sessions)}",
        "",
        "# HELP mdh_llm_cache_hits LLM cache hit count",
        "# TYPE mdh_llm_cache_hits counter",
        f"mdh_llm_cache_hits {cache_stats['hits']}",
        "",
        "# HELP mdh_llm_cache_misses LLM cache miss count",
        "# TYPE mdh_llm_cache_misses counter",
        f"mdh_llm_cache_misses {cache_stats['misses']}",
        "",
        "# HELP mdh_llm_cache_size LLM cache current size",
        "# TYPE mdh_llm_cache_size gauge",
        f"mdh_llm_cache_size {cache_stats['size']}",
        "",
        "# HELP mdh_llm_cache_hit_rate LLM cache hit rate",
        "# TYPE mdh_llm_cache_hit_rate gauge",
        f"mdh_llm_cache_hit_rate {cache_stats['hit_rate']:.4f}",
    ]

    for sid, session in sessions.items():
        meeting = getattr(session, 'meeting_session', None)
        if meeting:
            lines.extend([
                "",
                f'mdh_meeting_agents{{session="{sid}"}} {len(meeting.agents)}',
                f'mdh_meeting_tasks{{session="{sid}"}} {len(meeting.tasks)}',
                f'mdh_meeting_messages{{session="{sid}"}} {len(meeting.messages)}',
            ])

    return PlainTextResponse("\n".join(lines))


@app.get("/api/sessions/{session_id}")
async def get_session_info(session_id: str):
    """查询会话状态（支持持久化会话）"""
    # 先查内存
    session = sessions.get(session_id)
    if session:
        return {
            "session_id": session.session_id,
            "provider": session.provider,
            "model_name": session.model_name,
            "project_id": session.project_id,
            "buffer_size": len(session._message_buffer),
            "sequence_no": session._sequence_no,
            "source": "memory",
        }
    # 再查磁盘
    from pathlib import Path
    state_path = Path("data/sessions") / f"{session_id}.json"
    if state_path.exists():
        import json
        state = json.loads(state_path.read_text())
        return {
            "session_id": state["session_id"],
            "provider": state.get("provider"),
            "model_name": state.get("model_name"),
            "project_id": state.get("project_id"),
            "buffer_size": len(state.get("message_buffer", [])),
            "sequence_no": state.get("sequence_no", 0),
            "saved_at": state.get("saved_at"),
            "source": "disk",
        }
    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/api/history/sessions")
async def list_history_sessions():
    """列出历史会话（磁盘上的持久化会话）"""
    from pathlib import Path
    sessions_dir = Path("data/sessions")
    if not sessions_dir.exists():
        return []

    result = []
    for f in sessions_dir.glob("*.json"):
        try:
            state = json.loads(f.read_text())
            result.append({
                "session_id": state.get("session_id", f.stem),
                "provider": state.get("provider"),
                "model_name": state.get("model_name"),
                "message_count": len(state.get("message_buffer", [])),
                "saved_at": state.get("saved_at"),
            })
        except Exception:
            continue
    return sorted(result, key=lambda x: x.get("saved_at") or "", reverse=True)


@app.get("/api/history/sessions/{session_id}/messages")
async def get_history_messages(session_id: str):
    """获取历史会话的消息列表"""
    from pathlib import Path
    state_path = Path("data/sessions") / f"{session_id}.json"
    if not state_path.exists():
        raise HTTPException(status_code=404, detail="Session not found")

    state = json.loads(state_path.read_text())
    messages = state.get("message_buffer", [])
    return {
        "session_id": session_id,
        "messages": messages,
        "count": len(messages),
    }


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s | %(levelname)-7s | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    uvicorn.run(app, host="0.0.0.0", port=8765)
