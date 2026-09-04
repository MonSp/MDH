"""
Agents REST API Router — profiles, XP, promotion, career paths, knowledge flow, optimization.
"""

import json
import logging
import os
from dataclasses import asdict

from fastapi import APIRouter, Request

from rate_limiter import RATE_LIMITS, limiter
from routers.common import fail, ok

logger = logging.getLogger("routers.agents")

router = APIRouter(tags=["agents"])

_srv = None
_kernel_integration = None  # type: Optional[object]


def init(server_module):
    global _srv
    _srv = server_module


def set_kernel_integration(ki):
    """Called from server.py on startup to inject the KernelIntegration instance."""
    global _kernel_integration
    _kernel_integration = ki


@router.get("/api/agents/{agent_id}/profile")
@limiter.limit(RATE_LIMITS["read"])
async def get_agent_profile(agent_id: str, request: Request):
    try:
        # ── Kernel-first: try kernel, fall back to SQLite ──
        if _kernel_integration and _kernel_integration.is_available():
            kernel_agent = _kernel_integration.get_agent(agent_id)
            if kernel_agent:
                return ok({
                    "agent_id": kernel_agent.id,
                    "name": kernel_agent.name,
                    "department": kernel_agent.department,
                    "total_xp": kernel_agent.total_xp,
                    "career_stage": kernel_agent.career_stage,
                    "tasks_completed": kernel_agent.tasks_completed,
                    "tasks_succeeded": kernel_agent.tasks_succeeded,
                    "avg_review_score": kernel_agent.avg_review_score,
                    "skills": kernel_agent.skills,
                    "source": "kernel",
                })
        # Fallback to SQLite
        mgr = _srv._get_agent_profile_manager()
        profile = mgr.get_or_create(agent_id, agent_id)
        return ok({**asdict(profile), "source": "sqlite"})
    except Exception as e:
        logger.exception("get_agent_profile 失败")
        return fail(str(e))


@router.get("/api/skills/tree")
async def get_skill_tree():
    try:
        skills = _srv._load_roles_config().get("skills", {})
        return ok({"skills": skills})
    except Exception as e:
        logger.exception("get_skill_tree 失败")
        return fail(str(e))


@router.post("/api/agents/{agent_id}/grant-xp")
async def grant_agent_xp(agent_id: str, request: Request):
    try:
        body = await request.json()
        mgr = _srv._get_agent_profile_manager()
        department = body.get("department", "")
        profile = mgr.get_or_create(agent_id, agent_id, department=department)
        skill_id = body["skill_id"]
        config = _srv._load_roles_config()
        skill_config = config.get("skills", {}).get(skill_id, {"xp_thresholds": [100, 300, 600]})
        result = mgr.grant_xp(
            agent_id, skill_id,
            task_success=body.get("task_success", True),
            review_score=body.get("review_score", 5.0),
            task_complexity=body.get("task_complexity", 3),
            skill_config=skill_config,
        )
        engine = _srv._get_promotion_engine()
        profile = mgr.get_profile(agent_id)
        promotion = engine.check_promotion(profile, config)
        if promotion:
            engine.apply_promotion(profile, promotion)
            mgr.save_profile(profile)
            result["promoted_to"] = promotion

        # ── Kernel-first: write XP to kernel, then SQLite ──
        xp_amount = result.get("xp_gained", 0)
        if _kernel_integration and _kernel_integration.is_available() and xp_amount > 0:
            kernel_ok = _kernel_integration.grant_xp_via_kernel(
                agent_id, skill_id, xp_amount
            )
            result["kernel_xp_granted"] = kernel_ok
        else:
            result["kernel_xp_granted"] = False

        return ok(result)
    except Exception as e:
        logger.exception("grant_agent_xp 失败")
        return fail(str(e))


@router.get("/api/agents/{agent_id}/promotion")
async def check_agent_promotion(agent_id: str):
    try:
        mgr = _srv._get_agent_profile_manager()
        profile = mgr.get_profile(agent_id)
        if not profile:
            return fail("agent 不存在")
        engine = _srv._get_promotion_engine()
        config = _srv._load_roles_config()
        target = engine.check_promotion(profile, config)
        return ok({"can_promote_to": target, "current_stage": profile.career_stage})
    except Exception as e:
        logger.exception("check_agent_promotion 失败")
        return fail(str(e))


@router.get("/api/agents/{agent_id}/career-path")
async def get_agent_career_path(agent_id: str):
    try:
        mgr = _srv._get_agent_profile_manager()
        profile = mgr.get_profile(agent_id)
        if not profile:
            return fail("agent 不存在")
        engine = _srv._get_promotion_engine()
        config = _srv._load_roles_config()
        path = engine.get_career_path(profile, config)
        if not path:
            return ok({"department": profile.department, "path": None})
        return ok({"department": profile.department, "path": path, "current_stage": profile.career_stage})
    except Exception as e:
        logger.exception("get_agent_career_path 失败")
        return fail(str(e))


@router.get("/api/careers/departments")
async def list_career_departments():
    try:
        engine = _srv._get_promotion_engine()
        config = _srv._load_roles_config()
        depts = engine.list_departments(config)
        return ok(depts)
    except Exception as e:
        logger.exception("list_career_departments 失败")
        return fail(str(e))


@router.get("/api/agents/knowledge-flow")
async def get_knowledge_flow():
    try:
        log_path = os.path.join(_srv._DATA_DIR, "knowledge_flow.json")
        if os.path.isfile(log_path):
            with open(log_path, encoding="utf-8") as f:
                log = json.load(f)
            return ok({"flows": list(reversed(log)), "total": len(log)})
        return ok({"flows": [], "total": 0})
    except Exception as e:
        logger.exception("get_knowledge_flow 失败")
        return fail(str(e))


@router.get("/api/agents/{agent_id}/optimize")
async def optimize_agent(agent_id: str):
    try:
        from agent_optimizer import AgentOptimizer
        optimizer = AgentOptimizer(_srv._DATA_DIR)
        return ok(optimizer.analyze_agent(agent_id))
    except Exception as e:
        logger.exception("optimize_agent 失败")
        return fail(str(e))


@router.get("/api/agents/optimize/all")
async def optimize_all_agents():
    try:
        from agent_optimizer import AgentOptimizer
        optimizer = AgentOptimizer(_srv._DATA_DIR)
        return ok(optimizer.get_all_agents_summary())
    except Exception as e:
        logger.exception("optimize_all_agents 失败")
        return fail(str(e))


# ── Kernel integration endpoints ──────────────────────────────────


@router.get("/api/agents/kernel/state")
async def get_kernel_state():
    """Return all agents currently held by the kernel daemon."""
    try:
        if not _kernel_integration or not _kernel_integration.is_available():
            return ok({"available": False, "agents": []})
        agents = _kernel_integration.list_agents()
        result = [
            {
                "entity_id": a.entity_id,
                "id": a.id,
                "name": a.name,
                "department": a.department,
                "total_xp": a.total_xp,
                "career_stage": a.career_stage,
                "skills": a.skills,
            }
            for a in agents
        ]
        return ok({"available": True, "agents": result, "count": len(result)})
    except Exception as e:
        logger.exception("get_kernel_state 失败")
        return fail(str(e))


@router.get("/api/agents/{agent_id}/skills")
async def get_agent_skills(agent_id: str):
    """Get agent skills — kernel-first, SQLite fallback."""
    try:
        if _kernel_integration and _kernel_integration.is_available():
            skills = _kernel_integration.get_skills(agent_id)
            if skills:
                return ok({"skills": skills, "source": "kernel"})
        # Fallback: read from SQLite profile
        mgr = _srv._get_agent_profile_manager()
        profile = mgr.get_profile(agent_id)
        if not profile:
            return fail("agent 不存在")
        return ok({"skills": profile.skills or {}, "source": "sqlite"})
    except Exception as e:
        logger.exception("get_agent_skills 失败")
        return fail(str(e))


@router.post("/api/agents/kernel/sync")
async def sync_agents_to_kernel():
    """Sync all Company agents (from SQLite) to the kernel daemon."""
    try:
        if not _kernel_integration or not _kernel_integration.is_available():
            return fail("Kernel daemon not available")
        mgr = _srv._get_agent_profile_manager()
        profiles = mgr.list_profiles()
        results = _kernel_integration.sync_all_from_company(profiles)
        synced = sum(1 for v in results.values() if v is not None)
        return ok({
            "total": len(profiles),
            "synced": synced,
            "failed": len(profiles) - synced,
            "results": results,
        })
    except Exception as e:
        logger.exception("sync_agents_to_kernel 失败")
        return fail(str(e))
