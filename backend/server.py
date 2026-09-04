import asyncio
import hmac
import json
import logging
import os
import uuid
from dataclasses import asdict
from urllib.parse import parse_qs

from fastapi import (
    Body,
    FastAPI,
    Header,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

import ws_handlers
from a2a_client import A2AClient
from a2a_post_processor import A2APostProcessor

# ── A2A 协议（Agent-to-Agent 执行节点管理）──
from a2a_registry import A2ARegistry
from a2a_task_router import A2ATaskRouter
from agent_memory import AgentMemory
from agent_pool import AgentPool
from agent_profile_manager import AgentProfileManager
from approval_manager import ApprovalManager
from complexity_classifier import ComplexityClassifier
from config import SKILLS_DIR
from dynamic_router import DynamicRouter
from employee_directory import get_directory
from experience_extractor import ExperienceExtractor
from key_manager import KeyManager
from onboarding_manager import OnboardingManager
from project_manager import ProjectManager
from protocol import workflow_execution_to_dict

# ── 速率限制 ──
from rate_limiter import RATE_LIMITS, limiter, rate_limit_exceeded_handler
from routers import a2a as a2a_router
from routers import agents as agents_router
from routers import assets as assets_router
from routers import browser as browser_router
from routers import community as community_router
from routers import experience as experience_router
from routers import infrastructure as infra_router
from routers import marketplace as marketplace_router
from routers import mcp_config as mcp_router
from routers import memory as memory_router
from routers import monitoring as monitoring_router
from routers import onboarding as onboarding_router
from routers import ops as ops_router
from routers import projects as projects_router
from routers import roles as roles_router

# ── 路由模块（渐进迁移：内联端点保留，新代码使用路由器）──
from routers import skills as skills_router
from routers import team as team_router
from routers import templates as templates_router
from routers import workflow as workflow_router
from routers import workspace as workspace_router
from session import Session
from simple_executor import SimpleExecutor
from skill_packager import SkillPackager
from skill_registry import SkillRegistry
from state_sync import StateSyncManager
from task_template_manager import TaskTemplateManager
from team import RuntimeType, TeamRuntime
from team_assembler import TeamAssembler
from tenant_manager import TenantManager
from tenant_middleware import TenantMiddleware
from webhook_manager import WebhookManager

# ── 请求模型 ──

logger = logging.getLogger("server")

# ──────────────────── 认证配置 ────────────────────
BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
# 不自动生成：未设置时认证绕过（本地开发模式）


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


app = FastAPI(
    title="MDH API",
    version="1.6.12",
    description="Matrix DaHuang — 数字员工操作系统 API",
    tags=[
        {"name": "agents", "description": "Agent 档案、XP、晋升、优化"},
        {"name": "evolution", "description": "经验规则、有效性追踪、自进化"},
        {"name": "memory", "description": "Agent 持久记忆"},
        {"name": "delivery", "description": "自主交付"},
        {"name": "monitoring", "description": "主动监控、健康检查"},
        {"name": "federation", "description": "跨团队进化联邦"},
        {"name": "documents", "description": "文档感知协作"},
        {"name": "workspace", "description": "活文档协作"},
        {"name": "team", "description": "团队协同优化"},
        {"name": "feedback", "description": "人机协作反馈"},
        {"name": "admin", "description": "RBAC 管理"},
        {"name": "ops", "description": "生产运维"},
        {"name": "introspection", "description": "系统自省"},
        {"name": "templates", "description": "任务模板管理"},
    ],
)
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:8080,http://localhost:9090").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# ── 速率限制集成 ──
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# API 版本化中间件
@app.middleware("http")
async def api_version_middleware(request, call_next):
    """API 版本化 + 请求追踪"""
    path = request.url.path
    if path.startswith("/api/v1/"):
        request.scope["path"] = path[3:]
    # 请求追踪
    trace_id = uuid.uuid4().hex[:12]
    request.scope["trace_id"] = trace_id
    try:
        from logging_config import set_trace_id
        set_trace_id(trace_id)
    except ImportError:
        pass
    response = await call_next(request)
    response.headers["X-API-Version"] = "v1"
    response.headers["X-MDH-Version"] = "1.6.0"
    response.headers["X-Trace-Id"] = trace_id
    return response

# 注册路由模块（渐进迁移：内联端点保留，新代码使用路由器）
# NOTE: skills_router 移至 Agent Profile 端点之后，避免 /api/skills/{skill_id} 吞掉 /api/skills/tree
app.include_router(mcp_router.router)
app.include_router(marketplace_router.router)
app.include_router(community_router.router)
app.include_router(workflow_router.router)
app.include_router(projects_router.router)
app.include_router(roles_router.router)
app.include_router(experience_router.router)
app.include_router(browser_router.router)
app.include_router(assets_router.router)
app.include_router(agents_router.router)
app.include_router(templates_router.router)
app.include_router(onboarding_router.router)
app.include_router(memory_router.router)
app.include_router(a2a_router.router)
app.include_router(ops_router.router)
app.include_router(infra_router.router)
app.include_router(team_router.router)
app.include_router(workspace_router.router)
app.include_router(monitoring_router.router)

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
    """REST 请求认证中间件，跳过 /health /metrics /docs /openapi.json 和 OPTIONS 预检

    认证链：
    1. BACKEND_TOKEN（master token）→ admin 权限
    2. API key（rbac 管理的 key）→ 按角色检查权限
    """

    _PUBLIC = {"/health", "/metrics", "/docs", "/openapi.json", "/redoc"}
    _WRITE_METHODS = {"POST", "PUT", "DELETE"}

    async def dispatch(self, request: Request, call_next):
        if not BACKEND_TOKEN:
            return await call_next(request)
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

        # Master token → admin 全权限
        if hmac.compare_digest(token, BACKEND_TOKEN):
            return await call_next(request)

        # API key → RBAC 权限检查
        try:
            from rbac import RBACManager
            rbac = RBACManager(_DATA_DIR)
            key_info = rbac.verify_key(token)
            if not key_info:
                from starlette.responses import JSONResponse
                return JSONResponse({"detail": "Invalid token"}, status_code=403)
            role = key_info.get("role", "viewer")
            if not rbac.check_permission(role, request.method, path):
                from starlette.responses import JSONResponse
                return JSONResponse({"detail": f"Role '{role}' cannot {request.method} {path}"}, status_code=403)
            return await call_next(request)
        except Exception as e:
            logger.warning("RBAC 认证检查异常: %s", e)
            from starlette.responses import JSONResponse
            return JSONResponse({"detail": "Invalid token"}, status_code=403)


sessions: dict[str, Session] = {}

# ──────────────────── 服务实例初始化 ────────────────────

_BASE_DIR = os.path.dirname(__file__)
_DATA_DIR = os.path.join(_BASE_DIR, "data")
os.makedirs(_DATA_DIR, exist_ok=True)

roles_router.init(_BASE_DIR, sessions)
_load_roles_config = roles_router._load_roles_config

# ── 租户管理（全局单例，供中间件和端点共用）──
tenant_mgr = TenantManager(_DATA_DIR)

# ── 租户上下文中间件（在 Auth 之后添加，请求流经时 Auth 先执行）──
app.add_middleware(TenantMiddleware, tenant_manager=tenant_mgr)
app.add_middleware(AuthMiddleware)

skill_registry = SkillRegistry(base_dir=os.path.join(_BASE_DIR, "..", "skill_packs"))
skill_packager = SkillPackager(
    output_dir=os.path.join(_DATA_DIR, "packages"),
)
project_manager = ProjectManager(
    projects_dir=os.path.join(_DATA_DIR, "projects"),
    skill_registry=skill_registry,
    skill_packager=skill_packager,
)
projects_router.init(project_manager)


def _make_llm_distill_caller():
    """Create an LLM caller for experience distillation (DeepSeek API via httpx).

    Returns a callable (prompt: str) -> str, or None if API key not configured.
    """
    import httpx

    from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
    api_key = DEEPSEEK_API_KEY
    if not api_key:
        return None
    base_url = DEEPSEEK_BASE_URL.rstrip("/")
    # Normalize: strip /v1 suffix for chat/completions endpoint
    base_url = base_url.removesuffix("/v1")

    def _call(prompt: str) -> str:
        payload = {
            "model": DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": "你是经验提炼专家，只输出 JSON。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 1024,
        }
        resp = httpx.post(
            f"{base_url}/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    return _call


from evolution_events import ABTracker, EvolutionEventStore

evolution_event_store = EvolutionEventStore(os.path.join(_DATA_DIR, "evolution.db"))
ab_tracker = ABTracker(evolution_event_store._conn)

experience_extractor = ExperienceExtractor(
    incremental_dir=os.path.join(_DATA_DIR, "experience"),
    llm_caller=_make_llm_distill_caller(),
    event_store=evolution_event_store,
)
skills_router.init(skill_registry, skill_packager, experience_extractor)
experience_router.init(experience_extractor, evolution_event_store, ab_tracker)
dynamic_router = DynamicRouter(
    routing_table_path=os.path.join(_DATA_DIR, "routing_table.json"),
)

# 自适应协作链路组件
complexity_classifier = ComplexityClassifier()

# Agent 池（全局单例，支持复用和负载均衡）
key_manager = KeyManager()
# ── A2A 执行节点管理 ──
a2a_registry = A2ARegistry(persist_path=os.path.join(_DATA_DIR, "a2a_agents.json"))
a2a_client = A2AClient()
a2a_task_router = A2ATaskRouter(a2a_registry)
a2a_memory = AgentMemory(data_dir=_DATA_DIR)
a2a_profile_manager = AgentProfileManager(profiles_dir=os.path.join(_DATA_DIR, "agent_profiles"), event_store=evolution_event_store)
a2a_webhook_manager = WebhookManager(_DATA_DIR)
from capability_boundary import CapabilityBoundary
from team_synergy import TeamSynergy

a2a_team_synergy = TeamSynergy(_DATA_DIR)
a2a_capability_boundary = CapabilityBoundary(data_dir=_DATA_DIR)
onboarding_mgr = OnboardingManager(_DATA_DIR)
task_template_mgr = TaskTemplateManager(_DATA_DIR)
state_sync = StateSyncManager(
    experience_extractor=experience_extractor,
    memory_manager=a2a_memory,
    capability_boundary=a2a_capability_boundary,
)
a2a_post_processor = A2APostProcessor(
    experience_extractor=experience_extractor,
    agent_memory=a2a_memory,
    dynamic_router=dynamic_router,
    agent_profile_manager=a2a_profile_manager,
    webhook_manager=a2a_webhook_manager,
    team_synergy=a2a_team_synergy,
    ab_tracker=ab_tracker,
)

simple_executor = SimpleExecutor(
    project_manager=project_manager,
    a2a_task_router=a2a_task_router,
    a2a_client=a2a_client,
    state_sync=state_sync,
    a2a_post_processor=a2a_post_processor,
    ab_tracker=ab_tracker,
)

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


def _ok(data=None, code: str = "OK"):
    return {"success": True, "data": data, "error": None, "code": code}


def _fail(error: str, code: str = "ERROR"):
    return {"success": False, "data": None, "error": error, "code": code}


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


# ── 后台定时任务 ──

@app.on_event("startup")
async def _start_background_tasks():
    """后台定时任务：A2A 健康检查 + 主动式监控 + kernel 连接"""
    import asyncio

    # ── Agent-kernel daemon connection (primary state layer) ──
    try:
        import subprocess, shutil
        from kernel_integration import KernelIntegration

        _ki = KernelIntegration()
        if not _ki.connect():
            # Try to auto-spawn the daemon
            daemon_bin = os.environ.get(
                "AGENT_KERNEL_DAEMON",
                os.path.join(os.path.dirname(__file__), "..", "agent-kernel", "build", "agent-kernel-daemon"),
            )
            if os.path.exists(daemon_bin):
                logger.info("Starting agent-kernel daemon from %s", daemon_bin)
                subprocess.Popen(
                    [daemon_bin, "--socket", "/tmp/agent-kernel.sock"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                import time
                time.sleep(1)
                _ki.connect()

        if _ki.is_available():
            logger.info("Agent-kernel daemon connected — primary state layer active")
        else:
            logger.warning("Agent-kernel unavailable — falling back to SQLite only")

        agents_router.set_kernel_integration(_ki)
        app.state.kernel_integration = _ki
        if _ws_ctx:
            _ws_ctx.kernel_integration = _ki
    except Exception as e:
        logger.warning("Kernel integration error: %s", e)

    async def _a2a_health_loop():
        while True:
            try:
                a2a_registry.check_health(timeout_seconds=120)
            except Exception as e:
                logger.warning("A2A 健康检查异常: %s", e)
            await asyncio.sleep(60)

    async def _proactive_monitor_loop():
        from proactive_monitor import ProactiveMonitor
        while True:
            try:
                monitor = ProactiveMonitor(_DATA_DIR)
                monitor.run_health_check()
            except Exception as e:
                logger.warning("主动式监控异常: %s", e)
            await asyncio.sleep(300)  # 每 5 分钟

    asyncio.create_task(_a2a_health_loop())
    asyncio.create_task(_proactive_monitor_loop())


# ── 统一异常处理 ──

@app.on_event("shutdown")
async def _shutdown_cleanup():
    """Clean up resources on shutdown."""
    _ki = getattr(app.state, "kernel_integration", None)
    if _ki:
        _ki.disconnect()
        logger.info("Agent-kernel disconnected on shutdown")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器：捕获未处理的异常，返回统一格式"""
    logger.exception("未处理的异常: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"success": False, "data": None, "error": "Internal server error"},
    )


# ── A2A 执行节点管理 API ──

import ipaddress
import socket
from urllib.parse import urlparse


async def _broadcast_a2a_update(event_type: str, agent_data: dict):
    """向所有 WebSocket 会话广播 A2A 节点状态变化"""
    message = json.dumps({"type": "a2a_agent_update", "event": event_type, **agent_data})
    dead = []
    for sid, session in list(sessions.items()):
        try:
            await session.ws.send_text(message)
        except Exception:
            logger.debug("A2A 广播发送失败: session=%s", sid)
            dead.append(sid)
    for sid in dead:
        sessions.pop(sid, None)

def _validate_a2a_url(url: str) -> str:
    """校验 A2A 节点 URL，防止 SSRF 攻击（含 DNS rebinding）"""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "URL 必须使用 http/https 协议")
    hostname = parsed.hostname or ""
    # 禁止内网地址（直接 IP 检查）
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise HTTPException(400, "不允许注册内网/回环地址")
    except ValueError:
        # hostname 是域名，需 DNS 解析后检查（防 DNS rebinding）
        try:
            addrinfos = socket.getaddrinfo(hostname, None)
            for family, _, _, _, sockaddr in addrinfos:
                resolved_ip = ipaddress.ip_address(sockaddr[0])
                if resolved_ip.is_private or resolved_ip.is_loopback or resolved_ip.is_link_local:
                    raise HTTPException(400, f"域名解析到内网/回环地址: {resolved_ip}")
        except socket.gaierror:
            pass  # DNS 解析失败，放行（域名可能是内网 DNS）
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        raise HTTPException(400, "不允许注册 localhost")
    return url


# ── A2A routes extracted to routers/a2a.py ──


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP 异常处理器：保持状态码，返回统一格式"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "data": None, "error": exc.detail},
    )


# ── Projects routes extracted to routers/projects.py ──

# ── Experience/Evolution routes extracted to routers/experience.py ──


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


# ── Agent routes extracted to routers/agents.py ──


# ── Monitoring routes extracted to routers/monitoring.py ──


# ── Workspace/Document routes extracted to routers/workspace.py ──

# ── Delivery routes extracted to routers/monitoring.py ──


# ── Agent optimize routes extracted to routers/agents.py ──

# ── Monitor routes extracted to routers/monitoring.py ──


# ── Team routes extracted to routers/team.py ──


# ── Admin routes extracted to routers/ops.py ──


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
@limiter.limit(RATE_LIMITS["llm"])
async def evolve_skills(request: Request, body: dict = Body(...)):
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


# ── Router table routes extracted to routers/monitoring.py ──


# ── Roles routes extracted to routers/roles.py ──


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
            # Prometheus: 发送消息计数（handler 执行即视为响应周期完成）
            try:
                from prometheus_metrics import WS_MESSAGES
                WS_MESSAGES.labels(direction="send").inc()
            except ImportError:
                pass
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

from protocol import WorkflowDefinition, WorkflowEdge, WorkflowNode
from workflow_engine import WorkflowEngine

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
        logger.warning("api_hybrid_team 失败: %s", exc)
        return _fail(str(exc))


@app.get("/api/employees")
async def api_employees(request: Request):
    """演示：员工目录列表（employee_id → 显示名/邮箱/职位）。"""
    from employee_directory import get_directory
    tenant_id = getattr(request.state, "tenant_id", None)
    employees = [
        {"employeeId": e.employee_id, "name": e.name, "email": e.email, "position": e.position}
        for e in get_directory().all()
    ]
    if tenant_id:
        # 附加租户上下文（员工目录为全局共享，但响应标识调用者所属租户）
        return _ok({"employees": employees, "tenant_id": tenant_id})
    return _ok(employees)


@app.post("/api/minutes")
async def api_minutes_plan(body: dict):
    """演示：速记 → 会议纪要 DAG 规划 + 混合团队组装（把关经 /api/gates）。"""
    from employee_directory import get_directory
    from mailer.seam import MailMessage, get_mailer
    from minutes_workflow import build_minutes_workflow

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
        logger.warning("api_minutes_plan 失败: %s", exc)
        return _fail(str(exc))


# ── Gates routes extracted to routers/monitoring.py ──


# ── 资产沉淀端点（M3，[S7]）────────────────────────
# 惰性单例组装 + monkeypatch 可测（TestClient 测试替换全局 helper）
_asset_store: object | None = None
_template_confirmation: object | None = None
_skill_evolution: object | None = None
_asset_search: object | None = None
_asset_judge: object | None = None


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


import sys

assets_router.init(sys.modules[__name__])
agents_router.init(sys.modules[__name__])
templates_router.init(sys.modules[__name__])
onboarding_router.init(sys.modules[__name__])
memory_router.init(_DATA_DIR)
a2a_router.init(sys.modules[__name__])
ops_router.init(_DATA_DIR)
infra_router.init(sys.modules[__name__], _DATA_DIR)
team_router.init(sys.modules[__name__], _DATA_DIR)
workspace_router.init(_DATA_DIR)
monitoring_router.init(sys.modules[__name__], _DATA_DIR)


# ── Asset routes extracted to routers/assets.py ──


@app.get("/health")
@limiter.limit(RATE_LIMITS["read"])
async def health(request: Request):
    """健康检查增强版：数据库 + 磁盘 + 模块状态"""
    try:
        from ops import OpsManager
        ops = OpsManager(_DATA_DIR)
        result = ops.health_check()
        result["status"] = "ok" if result.get("healthy", True) else "degraded"
        result["sessions"] = len(sessions)
        return result
    except Exception:
        logger.warning("health 检查异常，降级返回")
        return {"status": "ok", "sessions": len(sessions)}

# ── Ops routes extracted to routers/ops.py ──


# ── Infrastructure routes (tenants + webhooks) extracted to routers/infrastructure.py ──


# ── Ops restore extracted to routers/ops.py ──


@app.get("/metrics")
async def metrics():
    """Prometheus 格式指标 — 使用 prometheus_client 标准 registry + 补充自定义指标"""
    from fastapi.responses import PlainTextResponse
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    from prometheus_metrics import WS_CONNECTIONS

    # 更新实时 gauge 指标
    WS_CONNECTIONS.set(len(sessions))

    # A2A 执行节点指标（自定义 gauge，非 prometheus_client 注册）
    a2a_agents = a2a_registry.list_active()
    total_tasks = sum(a.task_count for a in a2a_agents)
    total_success = sum(a.success_count for a in a2a_agents)

    # 从 prometheus_client registry 生成标准指标
    output = generate_latest().decode("utf-8")

    # 追加自定义 A2A 指标（registry 外的手工行）
    extra_lines = [
        "",
        "# HELP mdh_a2a_agents_active Number of active A2A execution nodes",
        "# TYPE mdh_a2a_agents_active gauge",
        f"mdh_a2a_agents_active {len(a2a_agents)}",
        "",
        "# HELP mdh_a2a_tasks_total Total A2A tasks dispatched",
        "# TYPE mdh_a2a_tasks_total counter",
        f"mdh_a2a_tasks_total {total_tasks}",
        "",
        "# HELP mdh_a2a_tasks_success Total successful A2A tasks",
        "# TYPE mdh_a2a_tasks_success counter",
        f"mdh_a2a_tasks_success {total_success}",
        "",
        "# HELP mdh_a2a_success_rate A2A task success rate",
        "# TYPE mdh_a2a_success_rate gauge",
        f"mdh_a2a_success_rate {(total_success / total_tasks) if total_tasks > 0 else 0:.4f}",
    ]

    # A2A 任务耗时统计
    task_logs = a2a_client.get_task_log()
    if task_logs:
        durations = [t.get("duration_s", 0) for t in task_logs if t.get("status") == "completed"]
        if durations:
            avg_duration = sum(durations) / len(durations)
            max_duration = max(durations)
            extra_lines.extend([
                "",
                "# HELP mdh_a2a_task_duration_avg_seconds Average A2A task duration",
                "# TYPE mdh_a2a_task_duration_avg_seconds gauge",
                f"mdh_a2a_task_duration_avg_seconds {avg_duration:.3f}",
                "",
                "# HELP mdh_a2a_task_duration_max_seconds Max A2A task duration",
                "# TYPE mdh_a2a_task_duration_max_seconds gauge",
                f"mdh_a2a_task_duration_max_seconds {max_duration:.3f}",
            ])

    for sid, session in sessions.items():
        meeting = getattr(session, 'meeting_session', None)
        if meeting:
            extra_lines.extend([
                "",
                f'mdh_meeting_agents{{session="{sid}"}} {len(meeting.agents)}',
                f'mdh_meeting_tasks{{session="{sid}"}} {len(meeting.tasks)}',
                f'mdh_meeting_messages{{session="{sid}"}} {len(meeting.messages)}',
            ])

    output += "\n".join(extra_lines) + "\n"
    return PlainTextResponse(output, media_type=CONTENT_TYPE_LATEST)


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
            logger.debug("读取历史会话失败: %s", f.stem)
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

from mcp_config import MCPConfigManager

_mcp_config = MCPConfigManager(os.path.join(os.path.dirname(__file__), "data", "mcp_servers.json"))
mcp_router.init(_mcp_config)



# ── Browser routes extracted to routers/browser.py ──

# ── Template routes extracted to routers/templates.py ──

# ── Onboarding routes extracted to routers/onboarding.py ──


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s | %(levelname)-7s | %(name)s:%(funcName)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    uvicorn.run(app, host="0.0.0.0", port=8765)
