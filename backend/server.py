import asyncio
import hmac
import json
import logging
import os
import secrets
import uuid
from dataclasses import asdict
from typing import Optional
from urllib.parse import parse_qs

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body, Depends, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config import SKILLS_DIR
from session import Session
import ws_handlers
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
from negotiation import ConsensusStrategy
from simple_executor import SimpleExecutor
from agent_pool import AgentPool
from key_manager import KeyManager
from approval_manager import ApprovalManager
from team import RuntimeType, TeamRuntime
from team_assembler import TeamAssembler
from employee_directory import get_directory

# ── 路由模块（渐进迁移：内联端点保留，新代码使用路由器）──
from routers import skills as skills_router
from routers import workflow as workflow_router
from routers import marketplace as marketplace_router
from routers import mcp_config as mcp_router
from routers import community as community_router

# ── 请求模型 ──
from schemas import (
    SkillRegisterRequest, SkillCloneRequest,
    ProjectCreateRequest, TaskCreateRequest,
    RouteEntryRequest,
    WorkflowCreateRequest,
    ApprovalDecisionRequest,
    SkillForkRequest, ExperiencePublishRequest, ExperienceForkRequest,
    SkillExportRequest, SkillImportRequest,
    MCPServerRequest, MCPServerUpdateRequest,
    CommunityInstallRequest,
)

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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# 注册路由模块（渐进迁移：内联端点保留，新代码使用路由器）
# NOTE: skills_router 移至 Agent Profile 端点之后，避免 /api/skills/{skill_id} 吞掉 /api/skills/tree
app.include_router(mcp_router.router)
app.include_router(marketplace_router.router)
app.include_router(community_router.router)
app.include_router(workflow_router.router)

# M1 演示：把关点引擎（仅演示用；会话内审批接线保持不变）
_demo_gate_manager = ApprovalManager()


def _with_approver_names(requests: list[dict]) -> list[dict]:
    """审批 payload 追加 approverName（员工目录解析，未命中回退 approver 原值）。

    [S3-1] 把关点引擎——决策节点挂"人"：前端回落链
    approverName || approver || '系统' 的显示衔接。
    """
    directory = get_directory()
    return [{**r, "approverName": directory.display_name(r.get("approver", ""))} for r in requests]


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
skills_router.init(skill_registry, skill_packager, experience_extractor)
dynamic_router = DynamicRouter(
    routing_table_path=os.path.join(_DATA_DIR, "routing_table.json"),
)

# 自适应协作链路组件
complexity_classifier = ComplexityClassifier()
simple_executor = SimpleExecutor(project_manager=project_manager)

# Agent 池（全局单例，支持复用和负载均衡）
key_manager = KeyManager()
agent_pool = AgentPool(
    key_manager=key_manager,
    max_instances_per_role=2,
    incremental_dir=os.path.join(_DATA_DIR, "experience"),
)

# 安全中间件（全局单例，审计日志）
from security import SecurityMiddleware
security_guard = SecurityMiddleware()

# WebSocket handler 上下文（延迟初始化，见 _init_ws_ctx）
_ws_ctx = None

# ── Agent Profile API 惰性单例 ──
_agent_profile_manager = None
_promotion_engine = None


def _init_ws_ctx():
    """初始化 WebSocket handler 上下文（在所有单例和辅助函数就绪后调用）"""
    global _ws_ctx
    _ws_ctx = ws_handlers.WSContext(
        skill_registry=skill_registry,
        skill_packager=skill_packager,
        project_manager=project_manager,
        experience_extractor=experience_extractor,
        dynamic_router=dynamic_router,
        complexity_classifier=complexity_classifier,
        simple_executor=simple_executor,
        agent_pool=agent_pool,
        security_guard=security_guard,
        key_manager=key_manager,
        build_agenda_snapshot=_build_agenda_snapshot,
        with_approver_names=_with_approver_names,
        register_active_coordinator=lambda c: globals().update({"_active_coordinator": c}),
        skills_dir=SKILLS_DIR,
        sessions=sessions,
    )


def _ok(data=None):
    return {"success": True, "data": data, "error": None}


def _fail(error: str):
    return {"success": False, "data": None, "error": error}


def _build_agenda_snapshot(agenda, session, proposal_id=None) -> dict:
    """构建议程快照（消除 WebSocket handler 中的重复代码）"""
    return {
        "type": "agenda_update",
        "phase": agenda.get_phase().value,
        "topic": agenda._topic,
        "current_speaker": agenda.get_current_speaker(),
        "proposal_id": proposal_id,
        "token_queue": [{"agent_id": t.agent_id, "relevance_score": t.relevance_score} for t in agenda.get_token_queue()],
        "event_history": [{"type": e.type, "timestamp": e.timestamp, "from": e.from_phase.value if e.from_phase else None, "to": e.to_phase.value if e.to_phase else None, "agent_id": e.agent_id, "reason": e.reason} for e in agenda.get_event_history()[-20:]],
        "sequence_no": session.next_sequence(),
    }


# 初始化 WebSocket handler 上下文（所有单例和辅助函数就绪后）
_init_ws_ctx()


# ── 统一异常处理 ──

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器：捕获未处理的异常，返回统一格式"""
    logger.exception("未处理的异常: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"success": False, "data": None, "error": str(exc)},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP 异常处理器：保持状态码，返回统一格式"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "data": None, "error": exc.detail},
    )


# ──────────────────── SkillRegistry REST API ────────────────────


# ──────────────────── ProjectManager REST API ────────────────────


@app.get("/api/projects")
async def list_projects():
    try:
        return _ok(project_manager.list_projects())
    except (KeyError, ValueError) as e:
        logger.warning("list_projects 失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("list_projects 失败")
        return _fail(str(e))


@app.post("/api/projects")
async def create_project(body: ProjectCreateRequest):
    try:
        brief = {"name": body.name, "description": body.description, "category": body.category}
        project = project_manager.create_project(body.name, brief)
        return _ok(asdict(project))
    except ValueError as e:
        return _fail(str(e))


@app.get("/api/projects/categories")
async def get_project_categories():
    """获取所有项目分类及每个分类下的项目。"""
    try:
        categories = project_manager.get_categories()
        return _ok(categories)
    except (KeyError, ValueError) as e:
        logger.warning("get_categories 失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("classify_all 失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("get_all_rules 失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("get_all_rules 失败")
        return _fail(str(e))


@app.get("/api/experience/rules/pending")
async def get_pending_rules():
    try:
        rules = experience_extractor.get_pending_rules()
        return _ok([_rule_to_dict(r) for r in rules])
    except (KeyError, ValueError) as e:
        logger.warning("get_pending_rules 失败 预期错误: %s", e)
        return _fail(str(e))
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
        # 审批通过后写入增量区，触发技能进化
        approved_rule = experience_extractor._load_rule(rule_id)
        if approved_rule:
            experience_extractor.write_to_incremental_area(approved_rule)
        return _ok({"rule_id": rule_id, "status": "approved"})
    except (KeyError, ValueError) as e:
        logger.warning("approve_rule 失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("reject_rule 失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("modify_rule 失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("modify_rule 失败")
        return _fail(str(e))


@app.get("/api/experience/rules/effectiveness")
async def get_rules_effectiveness():
    """获取规则有效性评分排行"""
    try:
        rules = experience_extractor.get_all_rules()
        scored = [
            {
                "rule_id": r.rule_id,
                "trigger_condition": r.trigger_condition,
                "action": r.action,
                "rule_type": r.rule_type,
                "status": r.status,
                "effectiveness_score": r.effectiveness_score,
                "usage_count": r.usage_count,
                "success_count": r.success_count,
                "keywords": r.keywords,
            }
            for r in rules
            if r.usage_count > 0
        ]
        scored.sort(key=lambda x: x["effectiveness_score"], reverse=True)
        return _ok({
            "rules": scored,
            "summary": {
                "total_rules": len(rules),
                "rules_with_usage": len(scored),
                "avg_effectiveness": (
                    sum(r["effectiveness_score"] for r in scored) / len(scored)
                    if scored else 0.0
                ),
            },
        })
    except Exception as e:
        logger.exception("get_rules_effectiveness 失败")
        return _fail(str(e))


@app.get("/api/experience/rules/demotion-log")
async def get_demotion_log():
    """获取规则降级监控日志（最近的在前）"""
    try:
        log = experience_extractor.get_demotion_log()
        return _ok({
            "entries": log,
            "summary": {
                "total_demotions": len(log),
                "unique_rules": len({e["rule_id"] for e in log}),
                "recent_24h": sum(
                    1 for e in log
                    if e.get("demoted_at", "") >= _now_iso_24h_ago()
                ),
            },
        })
    except Exception as e:
        logger.exception("get_demotion_log 失败")
        return _fail(str(e))


@app.get("/api/experience/rules/demotion-stats")
async def get_demotion_stats():
    """降级统计报表"""
    try:
        return _ok(experience_extractor.get_demotion_stats())
    except Exception as e:
        logger.exception("get_demotion_stats 失败")
        return _fail(str(e))


@app.get("/api/experience/rules/demotion-export")
async def export_demotion_report(format: str = "json"):
    """导出降级报表（json 或 csv）"""
    try:
        import csv, io
        from fastapi.responses import StreamingResponse, JSONResponse
        stats = experience_extractor.get_demotion_stats()
        log = experience_extractor.get_demotion_log()
        report = {
            "generated_at": _now_iso(),
            "stats": stats,
            "entries": log,
        }
        if format == "csv":
            output = io.StringIO()
            fields = ["rule_id", "trigger_condition", "action", "rule_type",
                       "effectiveness_score", "usage_count", "success_count",
                       "reason", "team_id", "demoted_at"]
            writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            for e in log:
                writer.writerow(e)
            output.seek(0)
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=demotion_report.csv"},
            )
        return JSONResponse(content=report, headers={
            "Content-Disposition": "attachment; filename=demotion_report.json",
        })
    except Exception as e:
        logger.exception("export_demotion_report 失败")
        return _fail(str(e))


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _now_iso_24h_ago() -> str:
    from datetime import datetime, timezone, timedelta
    return (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()


# ── Agent Profile API ──


def _get_agent_profile_manager():
    global _agent_profile_manager
    if _agent_profile_manager is None:
        from agent_profile_manager import AgentProfileManager
        _agent_profile_manager = AgentProfileManager(os.path.join(_DATA_DIR, "agent_profiles"))
    return _agent_profile_manager


def _get_promotion_engine():
    global _promotion_engine
    if _promotion_engine is None:
        from promotion_engine import PromotionEngine
        _promotion_engine = PromotionEngine()
    return _promotion_engine


@app.get("/api/agents/{agent_id}/profile")
async def get_agent_profile(agent_id: str):
    try:
        mgr = _get_agent_profile_manager()
        profile = mgr.get_or_create(agent_id, agent_id)
        return _ok(asdict(profile))
    except Exception as e:
        logger.exception("get_agent_profile 失败")
        return _fail(str(e))


@app.get("/api/skills/tree")
async def get_skill_tree():
    try:
        skills = _load_roles_config().get("skills", {})
        return _ok({"skills": skills})
    except Exception as e:
        logger.exception("get_skill_tree 失败")
        return _fail(str(e))


@app.post("/api/agents/{agent_id}/grant-xp")
async def grant_agent_xp(agent_id: str, request: Request):
    try:
        body = await request.json()
        mgr = _get_agent_profile_manager()
        department = body.get("department", "")
        profile = mgr.get_or_create(agent_id, agent_id, department=department)
        skill_id = body["skill_id"]
        config = _load_roles_config()
        skill_config = config.get("skills", {}).get(skill_id, {"xp_thresholds": [100, 300, 600]})
        result = mgr.grant_xp(
            agent_id, skill_id,
            task_success=body.get("task_success", True),
            review_score=body.get("review_score", 5.0),
            task_complexity=body.get("task_complexity", 3),
            skill_config=skill_config,
        )
        # 检查晋升
        engine = _get_promotion_engine()
        profile = mgr.get_profile(agent_id)
        promotion = engine.check_promotion(profile, config)
        if promotion:
            engine.apply_promotion(profile, promotion)
            mgr.save_profile(profile)
            result["promoted_to"] = promotion
        return _ok(result)
    except Exception as e:
        logger.exception("grant_agent_xp 失败")
        return _fail(str(e))


@app.get("/api/agents/{agent_id}/promotion")
async def check_agent_promotion(agent_id: str):
    try:
        mgr = _get_agent_profile_manager()
        profile = mgr.get_profile(agent_id)
        if not profile:
            return _fail("agent 不存在")
        engine = _get_promotion_engine()
        config = _load_roles_config()
        target = engine.check_promotion(profile, config)
        return _ok({"can_promote_to": target, "current_stage": profile.career_stage})
    except Exception as e:
        logger.exception("check_agent_promotion 失败")
        return _fail(str(e))


@app.get("/api/agents/{agent_id}/career-path")
async def get_agent_career_path(agent_id: str):
    """获取 agent 部门职业路径"""
    try:
        mgr = _get_agent_profile_manager()
        profile = mgr.get_profile(agent_id)
        if not profile:
            return _fail("agent 不存在")
        engine = _get_promotion_engine()
        config = _load_roles_config()
        path = engine.get_career_path(profile, config)
        if not path:
            return _ok({"department": profile.department, "path": None})
        return _ok({"department": profile.department, "path": path, "current_stage": profile.career_stage})
    except Exception as e:
        logger.exception("get_agent_career_path 失败")
        return _fail(str(e))


@app.get("/api/careers/departments")
async def list_career_departments():
    """列出所有部门职业路径"""
    try:
        engine = _get_promotion_engine()
        config = _load_roles_config()
        depts = engine.list_departments(config)
        return _ok(depts)
    except Exception as e:
        logger.exception("list_career_departments 失败")
        return _fail(str(e))


@app.get("/api/agents/knowledge-flow")
async def get_knowledge_flow():
    """获取知识流动日志（mentor → mentee）"""
    try:
        import json
        log_path = os.path.join(_DATA_DIR, "knowledge_flow.json")
        if os.path.isfile(log_path):
            with open(log_path, encoding="utf-8") as f:
                log = json.load(f)
            return _ok({"flows": list(reversed(log)), "total": len(log)})
        return _ok({"flows": [], "total": 0})
    except Exception as e:
        logger.exception("get_knowledge_flow 失败")
        return _fail(str(e))


@app.get("/api/llm/costs")
async def get_llm_costs():
    """LLM 成本追踪汇总"""
    try:
        from llm_cost_tracker import get_tracker
        tracker = get_tracker(os.path.join(_DATA_DIR))
        return _ok(tracker.get_summary())
    except Exception as e:
        logger.exception("get_llm_costs 失败")
        return _fail(str(e))


@app.get("/api/llm/costs/records")
async def get_llm_cost_records(limit: int = 100):
    """LLM 成本追踪详细记录"""
    try:
        from llm_cost_tracker import get_tracker
        tracker = get_tracker(os.path.join(_DATA_DIR))
        return _ok({"records": tracker.get_records(limit)})
    except Exception as e:
        logger.exception("get_llm_cost_records 失败")
        return _fail(str(e))


@app.get("/api/dashboard/performance")
async def get_performance_dashboard():
    """全局性能仪表盘 — 聚合所有子系统数据"""
    try:
        from performance_dashboard import PerformanceDashboard
        dashboard = PerformanceDashboard(_DATA_DIR)
        return _ok(dashboard.get_overview())
    except Exception as e:
        logger.exception("get_performance_dashboard 失败")
        return _fail(str(e))


@app.get("/api/knowledge/network-stats")
async def get_knowledge_network_stats():
    """知识网络统计 — 技能包/规则/资产联动状态"""
    try:
        from knowledge_network import KnowledgeNetwork
        network = KnowledgeNetwork(
            data_dir=_DATA_DIR,
            skill_packs_dir=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "skill_packs"),
        )
        return _ok(network.get_network_stats())
    except Exception as e:
        logger.exception("get_knowledge_network_stats 失败")
        return _fail(str(e))


@app.get("/api/reflection/priority-queue")
async def get_reflection_priority_queue():
    """反思优先级队列 — 自驱动选择下一步反思目标"""
    try:
        from reflection_priority import ReflectionPriorityQueue
        queue = ReflectionPriorityQueue(_DATA_DIR)
        return _ok(queue.compute_priorities())
    except Exception as e:
        logger.exception("get_reflection_priority_queue 失败")
        return _fail(str(e))


@app.get("/api/federation/stats")
async def get_federation_stats():
    """多团队进化联邦统计"""
    try:
        from team_federation import TeamFederation
        federation = TeamFederation(_DATA_DIR)
        return _ok(federation.get_federation_stats())
    except Exception as e:
        logger.exception("get_federation_stats 失败")
        return _fail(str(e))


@app.get("/api/federation/feed")
async def get_federation_feed(team_id: str = "", keywords: str = ""):
    """获取团队的个性化进化流"""
    try:
        from team_federation import TeamFederation
        federation = TeamFederation(_DATA_DIR)
        kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
        return _ok(federation.get_team_feed(team_id, kw_list))
    except Exception as e:
        logger.exception("get_federation_feed 失败")
        return _fail(str(e))


@app.get("/api/capability/boundary")
async def get_capability_boundary():
    """能力边界报告 — 置信度地图 + 边界检测 + 改进建议"""
    try:
        from capability_boundary import CapabilityBoundary
        boundary = CapabilityBoundary(_DATA_DIR)
        return _ok(boundary.get_boundary_report())
    except Exception as e:
        logger.exception("get_capability_boundary 失败")
        return _fail(str(e))


@app.get("/api/capability/detect")
async def detect_unknown_domain(keywords: str = ""):
    """检测任务是否落在未知领域"""
    try:
        from capability_boundary import CapabilityBoundary
        boundary = CapabilityBoundary(_DATA_DIR)
        kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
        return _ok(boundary.detect_unknown_domain(kw_list))
    except Exception as e:
        logger.exception("detect_unknown_domain 失败")
        return _fail(str(e))


# 注册 skills_router（在 Agent Profile 端点之后，确保 /api/skills/tree 优先匹配）
app.include_router(skills_router.router)

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
    except (KeyError, ValueError) as e:
        logger.warning("package_skill 失败 预期错误: %s", e)
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
    except (KeyError, ValueError) as e:
        logger.warning("preview_package 失败 预期错误: %s", e)
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
    except (KeyError, ValueError) as e:
        logger.warning("evolve_skills 失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("evolve_skills 失败")
        return _fail(str(e))


# ──────────────────── DynamicRouter REST API ────────────────────


@app.get("/api/router/table")
async def get_route_table():
    try:
        return _ok(dynamic_router.get_route_table())
    except (KeyError, ValueError) as e:
        logger.warning("get_route_table 失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("add_route_entry 失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("remove_route_entry 失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("remove_route_entry 失败")
        return _fail(str(e))


# ──────────────────── 角色配置 REST API ────────────────────

_ROLES_CONFIG_PATH = os.path.join(_BASE_DIR, "roles_config.yaml")
_roles_config_cache = None
_roles_config_mtime = 0


def _load_roles_config():
    """加载角色配置（mtime 缓存：文件未变则返回缓存）"""
    global _roles_config_cache, _roles_config_mtime
    import yaml

    if not os.path.exists(_ROLES_CONFIG_PATH):
        return {"tools": {}, "skills": {}, "prompt_templates": {}, "base_roles": {}, "custom_roles": {}}

    try:
        current_mtime = os.path.getmtime(_ROLES_CONFIG_PATH)
    except OSError:
        current_mtime = 0

    if _roles_config_cache is not None and current_mtime == _roles_config_mtime:
        return _roles_config_cache

    with open(_ROLES_CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    _roles_config_cache = config
    _roles_config_mtime = current_mtime
    return config


def _save_roles_config(config):
    """保存角色配置"""
    global _roles_config_cache, _roles_config_mtime
    import yaml
    with open(_ROLES_CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
    # 更新缓存
    _roles_config_cache = config
    try:
        _roles_config_mtime = os.path.getmtime(_ROLES_CONFIG_PATH)
    except OSError:
        _roles_config_mtime = 0
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
    except (KeyError, ValueError) as e:
        logger.warning("获取角色配置失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("获取角色失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("创建角色失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("更新角色失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("删除角色失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("删除角色失败")
        return _fail(str(e))


@app.get("/api/roles/tools/list")
async def list_tools():
    """获取所有可用工具"""
    try:
        config = _load_roles_config()
        return _ok(config.get("tools", {}))
    except (KeyError, ValueError) as e:
        logger.warning("获取工具列表失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("创建工具失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("删除工具失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("删除工具失败")
        return _fail(str(e))


@app.get("/api/roles/skills/list")
async def list_role_skills():
    """获取所有可用技能"""
    try:
        config = _load_roles_config()
        return _ok(config.get("skills", {}))
    except (KeyError, ValueError) as e:
        logger.warning("获取技能列表失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("获取技能列表失败")
        return _fail(str(e))



@app.post("/api/roles/skills/generate")
async def generate_skill(body: dict = Body(...)):
    """用AI根据需求描述生成技能配置"""
    try:
        from skill_generator import SkillGenerator
        generator = SkillGenerator(load_roles_config_fn=_load_roles_config)

        # 解析 API 配置
        api_key = body.get("api_key", "")
        base_url = body.get("base_url", "")
        provider = "deepseek"
        model_name = None

        if not api_key:
            session_id = body.get("session_id")
            session = sessions.get(session_id) if session_id else None
            if not session:
                for sid, s in sessions.items():
                    if s.api_key:
                        session = s
                        break
            if session:
                provider = session.provider or provider
                model_name = session.model_name
                api_key = session.api_key
                base_url = session.base_url

        if not api_key:
            api_key = os.environ.get("DEEPSEEK_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            from config import DEEPSEEK_API_KEY
            api_key = DEEPSEEK_API_KEY

        result = await generator.generate(
            description=body.get("description", ""),
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model_name=model_name or "",
        )
        if result["success"]:
            return _ok(result["data"])
        return _fail(result["error"])

    except (KeyError, ValueError) as e:
        logger.warning("AI生成技能失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("创建技能失败 预期错误: %s", e)
        return _fail(str(e))
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
    except (KeyError, ValueError) as e:
        logger.warning("删除技能失败 预期错误: %s", e)
        return _fail(str(e))
    except Exception as e:
        logger.exception("删除技能失败")
        return _fail(str(e))


@app.websocket("/ws")
async def ws_handler(ws: WebSocket):
    global _active_coordinator  # 共享引擎的委托执行器/回调按最近启动的会议路由
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

            # 字典路由分发（handler 定义在 ws_handlers.py）
            new_task = await ws_handlers.dispatch(msg_type, msg, session, _ws_ctx)
            if new_task is not None:
                agent_task = new_task
            continue

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
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.debug("agent_task 取消后异常: %s", e)
        # 会议消息后台任务同样需在断开时取消，避免任务悬挂并持续向已关闭的
        # WebSocket 发送消息（配合 meeting_message 的 create_task 后台化）。
        _meeting_task = getattr(session, "_meeting_task", None)
        if _meeting_task and not _meeting_task.done():
            _meeting_task.cancel()
            try:
                await _meeting_task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.debug("meeting_task 取消后异常: %s", e)
        sessions.pop(session.session_id, None)
        logger.info("Session 已清理: session=%s, 活跃会话数=%d", session.session_id, len(sessions))


# ──────────────────── WorkflowEngine REST API ────────────────────

from workflow_engine import WorkflowEngine
from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowExecutionStatus, workflow_execution_to_dict, workflow_definition_to_dict

workflow_engine = WorkflowEngine(
    persistence_dir=os.path.join(os.path.dirname(__file__), "data", "workflows")
)
workflow_router.init(lambda: globals()["workflow_engine"], workflow_execution_to_dict, WorkflowDefinition, WorkflowNode, WorkflowEdge)
_ws_ctx.workflow_engine = workflow_engine  # 延迟设置（测试 fixture 可替换）

# 活动 MeetingCoordinator（单用户本地形态：最近启动的会议）。
# 共享引擎上的节点执行器与状态回调统一委托到该协调器，
# 避免多个 MeetingCoordinator 注入同一共享引擎时 last-wins 覆盖注册。
_active_coordinator = None


def _register_active_coordinator(coordinator) -> None:
    """将新创建的协调器注册为活动协调器。

    server start_meeting 直接构造协调器时会自行赋值；CeoAgent 复杂路径与
    SimpleExecutor 升级路径通过构造时注入的 on_coordinator_created 回调走到这里，
    否则共享引擎委托执行器（_delegate_node_executor）无法路由到这些路径创建的协调器。
    """
    global _active_coordinator
    _active_coordinator = coordinator


# 升级路径（simple_executor.upgrade_to_complex）构造协调器时需与 server/ceo_agent
# 构造点一致：注入共享 workflow_engine 并注册活动协调器（approval_manager 为会话级，
# 在调用时从 session 解析）。
simple_executor._workflow_engine = workflow_engine
simple_executor._on_coordinator_created = _register_active_coordinator


async def _delegate_node_executor(node, input_data):
    """共享引擎节点执行器：委托到活动协调器的本地节点执行"""
    coordinator = _active_coordinator
    if coordinator is None:
        raise ValueError("无活动协调器可执行工作流节点")
    return await coordinator._execute_workflow_node(node, input_data)


async def _delegate_status_change(execution):
    """共享引擎状态变化回调：委托到活动协调器（无活动协调器时忽略）"""
    coordinator = _active_coordinator
    if coordinator is not None:
        await coordinator._on_workflow_status_change(execution)


async def _delegate_node_status_change(execution, node_id):
    """共享引擎节点状态变化回调：委托到活动协调器（无活动协调器时忽略）"""
    coordinator = _active_coordinator
    if coordinator is not None:
        await coordinator._on_workflow_node_status_change(execution, node_id)


# 在共享引擎上注册委托执行器（仅此一处注册，coordinator 不再覆盖）
for _dept in ("dept-frontend", "dept-backend", "dept-qa", "dept-devops",
              "dept-data", "dept-docs", "dept-fullstack"):
    workflow_engine.register_node_executor(_dept, _delegate_node_executor)

workflow_engine.set_status_change_callback(_delegate_status_change)
workflow_engine.set_node_status_change_callback(_delegate_node_status_change)


# ──────────────────── M1 演示：混合组队 + 把关点 ────────────────────


@app.post("/api/hybrid/team")
async def api_hybrid_team(body: dict):
    """演示：组装人+agent 混合团队。body: {project_id, dag, humans}"""
    try:
        dag = body["dag"]
    except KeyError:
        return _fail("缺少必填字段: dag")
    try:
        runtime = TeamRuntime(
            runtime_id=f"rt-{body.get('project_id', 'demo')}",
            runtime_type=RuntimeType.LOCAL_DOCKER,
            root_path="/tmp/workspace",
        )
        team = TeamAssembler().assemble_hybrid_team(
            dag, body.get("project_id", "demo"), runtime, body.get("humans", []),
        )
        return {
            "team_id": team.team_id,
            "members": [
                {
                    "agentId": m.agent_id,
                    "roleName": m.role_name,
                    "teamRole": m.team_role,
                    "memberType": m.member_type,
                    "approverFor": list(m.approver_for),
                    "displayName": m.display_name,
                }
                for m in team.members
            ],
        }
    except Exception as exc:
        return _fail(str(exc))


@app.get("/api/employees")
async def api_employees():
    """演示：员工目录列表（employee_id → 显示名/邮箱/职位）。"""
    from employee_directory import get_directory
    return _ok([
        {"employeeId": e.employee_id, "name": e.name, "email": e.email, "position": e.position}
        for e in get_directory().all()
    ])


@app.post("/api/minutes")
async def api_minutes_plan(body: dict):
    """演示：速记 → 会议纪要 DAG 规划 + 混合团队组装（把关经 /api/gates）。"""
    from minutes_workflow import build_minutes_workflow
    from mailer.seam import MailMessage, get_mailer
    from employee_directory import get_directory

    transcript = body.get("transcript", "")
    submitter = body.get("submitter", "submitter")
    if not transcript:
        return _fail("缺少必填字段: transcript")
    try:
        # 提交者从占位字符串解析为真实员工名（未命中回退原值）；
        # mailer to 保持 submitter 原值——它是地址语义，不是显示名
        submitter_name = get_directory().display_name(submitter)
        wf = build_minutes_workflow(transcript, approver=submitter)
        dag = {"tasks": [
            {"task_id": n.node_id, "name": n.node_id, "required_skills": ["frontend_dev"],
             "description": n.task_description}
            for n in wf.nodes
        ]}
        team = TeamAssembler().assemble_hybrid_team(
            dag, body.get("project_id", "proj-minutes"),
            TeamRuntime(runtime_id="rt-minutes", runtime_type=RuntimeType.LOCAL_DOCKER, root_path="/tmp/workspace"),
            humans=[{"employee_id": submitter, "name": submitter_name, "approver_for": ["draft"]}],
        )
        get_mailer("file").send(MailMessage(title="会议纪要", to=[submitter], body=transcript))
        return {
            "workflow": {
                "workflow_id": wf.workflow_id,
                "strategy": wf.execution_strategy,
                "nodes": [{"node_id": n.node_id, "task_description": n.task_description, "gate": n.gate} for n in wf.nodes],
                "edges": [{"source": e.source_node_id, "target": e.target_node_id} for e in wf.edges],
            },
            "team": {
                "team_id": team.team_id,
                "members": [{"agentId": m.agent_id, "memberType": m.member_type, "approverFor": list(m.approver_for), "displayName": m.display_name} for m in team.members],
            },
            "plan": "把关经 /api/gates 完成；纪要经 mailer seam 分发",
        }
    except Exception as exc:
        return _fail(str(exc))


@app.post("/api/gates")
async def api_gate_create(body: dict):
    """演示：创建把关点请求（等价于会议内的审批请求）"""
    approval = await _demo_gate_manager.request_gate(
        requester_id=body.get("requesterId", "agent-demo"),
        operation=body.get("operation", "unknown_operation"),
        description=body.get("description", ""),
        task_id=body.get("taskId", ""),
        gate_id=body.get("gateId", ""),
        approver=body.get("approver", ""),
    )
    return {
        "id": approval.id,
        "taskId": approval.task_id,
        "gateId": approval.gate_id,
        "status": approval.status.value,
    }


@app.get("/api/gates/pending")
async def api_gates_pending():
    """演示：查看待处理把关请求"""
    return [
        {
            "id": r["id"],
            "requesterId": r["requesterId"],
            "operation": r["operation"],
            "description": r["description"],
            "status": r["status"],
            "taskId": r.get("taskId", ""),
            "gateId": r.get("gateId", ""),
            "approver": r.get("approver", ""),
            "approverName": get_directory().display_name(r.get("approver", "")),
        }
        for r in _demo_gate_manager.get_pending_requests()
    ]


@app.post("/api/gates/{request_id}/decide")
async def api_gate_decide(request_id: str, body: dict):
    """演示：对把关请求做出决定（fail-closed：仅 approved 严格等于 True 视为批准）"""
    approved = body.get("approved")
    if approved is True:
        return {"resolved": await _demo_gate_manager.handle_gate_response(
            request_id, True, reason=body.get("reason", ""),
        )}
    # 缺失 / False / 非布尔（如字符串 "false"）一律视为拒绝，fail-closed
    await _demo_gate_manager.handle_gate_response(
        request_id, False, reason=body.get("reason", ""),
    )
    return {"resolved": False}


# ── 资产沉淀端点（M3，[S7]）────────────────────────
# 惰性单例组装 + monkeypatch 可测（TestClient 测试替换全局 helper）
_asset_store: Optional[object] = None
_template_confirmation: Optional[object] = None
_skill_evolution: Optional[object] = None
_asset_search: Optional[object] = None
_asset_judge: Optional[object] = None


def _get_asset_store():
    global _asset_store
    if _asset_store is None:
        from asset_store import AssetStore
        _asset_store = AssetStore(os.path.join(_DATA_DIR, "assets"))
    return _asset_store


def _get_asset_judge():
    """LLM judge 惰性单例：ASSET_JUDGE_ENABLED=1 且 env 有 key 才构造（否则 None）。"""
    global _asset_judge
    if _asset_judge is None and os.environ.get("ASSET_JUDGE_ENABLED") == "1":
        from asset_judge import make_judge_from_env
        _asset_judge = make_judge_from_env()  # 无 key → None（幂等）
    return _asset_judge


def _get_template_confirmation():
    global _template_confirmation
    if _template_confirmation is None:
        from asset_evaluator import AssetEvaluator
        from template_confirmation import TemplateConfirmation
        store = _get_asset_store()
        # 必须复用 _demo_gate_manager（T3 评审预警）：/api/gates/decide 走它做决定，
        # 桥接只覆盖构造时传入的实例——否则演示闭环（决定 → 固化）断裂。
        # judge 由 _get_asset_judge() 注入：env 开关 ASSET_JUDGE_ENABLED=1 且有
        # API key 才接真实 LLM judge，否则 None（快路径，行为与旧版一致）。
        _template_confirmation = TemplateConfirmation(store, AssetEvaluator(store, _get_asset_judge()), _demo_gate_manager)
    return _template_confirmation


def _get_skill_evolution():
    global _skill_evolution
    if _skill_evolution is None:
        from experience_extractor import ExperienceExtractor
        from skill_evolution import SkillEvolution
        _skill_evolution = SkillEvolution(ExperienceExtractor(os.path.join(_DATA_DIR, "rules")))
    return _skill_evolution


def _get_asset_search():
    global _asset_search
    if _asset_search is None:
        from asset_search import AssetSearch
        from experience_extractor import ExperienceExtractor
        _asset_search = AssetSearch(_get_asset_store(), ExperienceExtractor(os.path.join(_DATA_DIR, "rules")))
    return _asset_search


@app.post("/api/assets/artifacts")
async def api_asset_artifacts(body: dict):
    """演示：产出物入库（知识库）。body: team_id/title/content/source_task_id"""
    try:
        team_id = body["team_id"]
        asset = _get_asset_store().store_artifact(team_id, body.get("title", ""), body.get("content", ""), body.get("source_task_id", ""))
        return _ok({"asset_id": asset["asset_id"]})
    except KeyError:
        return _fail("缺少必填字段: team_id")
    except Exception as exc:
        # T6 评审 Important：非法/畸形 team_id（非字符串或 ../ 路径遍历）及磁盘
        # 错误不得以 500 传播，包装为 _fail（与 experience 端点一致）
        return _fail(str(exc))


@app.post("/api/assets/templates")
async def api_asset_templates(body: dict):
    """演示：模板固化（评测 + 员工把关确认）。body: team_id/title/content/source_task_id/approver"""
    try:
        result = await _get_template_confirmation().submit(
            team_id=body["team_id"],
            title=body.get("title", ""),
            content=body.get("content", ""),
            source_task_id=body.get("source_task_id", ""),
            approver=body.get("approver", ""),
        )
        if result["ok"]:
            return _ok({"asset_id": result["asset_id"], "request_id": result["request_id"]})
        return _fail(result["reason"])
    except KeyError:
        return _fail("缺少必填字段: team_id")
    except Exception as exc:
        # T6 评审 Important：与 experience 端点一致，异常不得以 500 传播
        return _fail(str(exc))


@app.get("/api/assets/search")
async def api_asset_search(team_id: str, q: str = "", type: str = "", task_type: str = "", keywords: str = ""):
    """演示：三类资产复用检索（产出物/模板/技能规则）。"""
    try:
        kw = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
        return _ok(_get_asset_search().search(team_id, query=q, asset_type=type, task_type=task_type, keywords=kw))
    except Exception as exc:
        # T6 评审 Important：畸形 team_id（如 ../ 路径遍历）不得以 500 传播
        return _fail(str(exc))


@app.post("/api/assets/experience")
async def api_asset_experience(body: dict):
    """演示：把关差异 → 技能进化（经验规则 → CoW 增量区）。body: team_id/task_type/transcript/feedback/keywords"""
    try:
        result = _get_skill_evolution().evolve_from_feedback(
            project_id=body.get("project_id", f"proj-{body['team_id']}"),
            task_type=body.get("task_type", ""),
            transcript=body.get("transcript", ""),
            feedback=body.get("feedback", ""),
            keywords=body.get("keywords", []),
            # T7 评审 Important：team_id 必须透传到 evolve_from_feedback → 规则回填，
            # 否则经端点提炼的规则 team_id="" 对团队检索永久不可见（演示闭环回归）
            team_id=body.get("team_id", ""),
        )
        return _ok({"rule_id": result["rule_id"], "count": result["count"]})
    except KeyError:
        return _fail("缺少必填字段: team_id")
    except Exception as exc:
        # T4 评审建议：磁盘错误等不得以 500 传播，包装为 _fail
        return _fail(str(exc))


@app.get("/api/assets")
async def api_asset_list(team_id: str, status: str = ""):
    """演示：资产列表（per team）。"""
    try:
        return _ok(_get_asset_store().list_assets(team_id, status=status or None))
    except Exception as exc:
        # T6 评审 Important：畸形 team_id（如 ../ 路径遍历）不得以 500 传播
        return _fail(str(exc))


@app.put("/api/assets/{asset_id}")
async def api_asset_update(asset_id: str, body: dict = Body(...)):
    """更新资产内容（保留审计日志）。"""
    try:
        content = body.get("content", "")
        editor = body.get("editor", "")
        if not content:
            return _fail("content 不能为空")
        result = _get_asset_store().update_asset(asset_id, content, editor=editor)
        if result is None:
            return _fail("资产不存在")
        return _ok(result)
    except Exception as exc:
        return _fail(str(exc))


@app.get("/api/assets/reuse-metrics")
async def api_asset_reuse_metrics():
    """演示：资产复用率统计（注入次数/按团队/按类型——设计 [S5] 复用率可感知）。"""
    from asset_injection import get_reuse_stats
    return _ok(get_reuse_stats())


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


# ── 技能市场 API ──

from shared_experience_pool import SharedExperiencePool
from skill_fork_manager import SkillForkManager

_shared_pool = SharedExperiencePool(os.path.join(os.path.dirname(__file__), "data", "shared_experience"))
_skill_forks = SkillForkManager(
    os.path.join(os.path.dirname(__file__), "data", "skill_forks"),
    os.path.join(os.path.dirname(__file__), "..", "skill_packs"),
)

from skill_exporter import SkillExporter
_skill_exporter = SkillExporter(
    skill_dir=os.path.join(os.path.dirname(__file__), "..", "skill_packs"),
    experience_dir=os.path.join(os.path.dirname(__file__), "data", "experience"),
    export_dir=os.path.join(os.path.dirname(__file__), "data", "exports"),
)
marketplace_router.init(_shared_pool, _skill_forks, _skill_exporter)



# ── MCP 配置管理 API ──

from mcp_config import MCPConfigManager, MCPServerEntry

_mcp_config = MCPConfigManager(os.path.join(os.path.dirname(__file__), "data", "mcp_servers.json"))
mcp_router.init(_mcp_config)



# ──────────────────── 批量浏览器任务 API (v1.3.0) ────────────────────

from playwright_browser import BrowserTask, BrowserTaskQueue, BrowserPool

# 全局任务队列和实例池
_task_queue = BrowserTaskQueue(max_concurrent=3)
_browser_pool = BrowserPool(min_instances=1, max_instances=5)
_browser_initialized = False


async def _ensure_browser():
    global _browser_initialized
    if not _browser_initialized:
        await _browser_pool.initialize()
        _browser_initialized = True


@app.post("/api/browser/submit")
async def browser_submit_task(request: Request):
    """提交浏览器任务到队列"""
    try:
        await _ensure_browser()
        body = await request.json()
        task_id = body.get("id", str(uuid.uuid4())[:8])
        task = BrowserTask(
            id=task_id,
            url=body.get("url", ""),
            actions=body.get("actions", []),
            priority=body.get("priority", 0),
            timeout=body.get("timeout", 60.0),
        )
        await _task_queue.submit(task)
        return {"success": True, "task_id": task_id}
    except Exception as e:
        return _fail(str(e))


@app.get("/api/browser/status")
async def browser_status():
    """获取任务队列和实例池状态"""
    return {
        "success": True,
        "queue": {
            "pending": _task_queue.pending_count,
            "completed": _task_queue.result_count,
        },
        "pool": _browser_pool.get_stats(),
    }


@app.get("/api/browser/result/{task_id}")
async def browser_get_result(task_id: str):
    """获取任务结果"""
    result = _task_queue.get_result(task_id)
    if not result:
        return _fail(f"任务不存在或未完成: {task_id}")
    return {
        "success": True,
        "data": {
            "task_id": result.task_id,
            "success": result.success,
            "data": result.data,
            "error": result.error,
            "screenshots": result.screenshots,
        },
    }


@app.get("/api/browser/results")
async def browser_get_all_results():
    """获取所有任务结果"""
    results = _task_queue.get_all_results()
    return {
        "success": True,
        "data": {
            task_id: {
                "task_id": r.task_id,
                "success": r.success,
                "data": r.data,
                "error": r.error,
                "screenshots_count": len(r.screenshots),
            }
            for task_id, r in results.items()
        },
    }


@app.post("/api/browser/start")
async def browser_start_queue():
    """启动任务队列"""
    try:
        await _ensure_browser()
        await _task_queue.start()
        return {"success": True, "message": "任务队列已启动"}
    except Exception as e:
        return _fail(str(e))


@app.post("/api/browser/stop")
async def browser_stop_queue():
    """停止任务队列"""
    try:
        await _task_queue.stop()
        return {"success": True, "message": "任务队列已停止"}
    except Exception as e:
        return _fail(str(e))


@app.post("/api/browser/pool/health-check")
async def browser_pool_health_check():
    """执行实例池健康检查"""
    try:
        await _browser_pool.health_check()
        return {"success": True, "stats": _browser_pool.get_stats()}
    except Exception as e:
        return _fail(str(e))


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s | %(levelname)-7s | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    uvicorn.run(app, host="0.0.0.0", port=8765)
