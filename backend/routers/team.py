"""
Team REST API Router — synergy analysis, feedback, skill guidance.
"""

import logging

from fastapi import APIRouter, Request
from rate_limiter import limiter, RATE_LIMITS

from routers.common import ok, fail

logger = logging.getLogger("routers.team")

router = APIRouter(tags=["team"])

_data_dir = None
_srv = None


def init(server_module, data_dir: str):
    global _srv, _data_dir
    _srv = server_module
    _data_dir = data_dir


# ── Team Synergy ──

@router.get("/api/team/synergy")
async def get_team_synergy():
    try:
        from team_synergy import TeamSynergy
        return ok(TeamSynergy(_data_dir).analyze_synergy())
    except Exception as e:
        logger.exception("get_team_synergy 失败")
        return fail(str(e))


@router.post("/api/team/synergy/record")
async def record_team_task(request: Request):
    try:
        body = await request.json()
        from team_synergy import TeamSynergy
        synergy = TeamSynergy(_data_dir)
        synergy.record_team_task(
            agent_ids=body.get("agent_ids", []),
            task_type=body.get("task_type", ""),
            success=body.get("success", False),
            review_score=body.get("review_score", 0),
        )
        return ok({"recorded": True})
    except Exception as e:
        logger.exception("record_team_task 失败")
        return fail(str(e))


@router.get("/api/team/synergy/recommend")
async def recommend_team(task_type: str = "", agents: str = ""):
    try:
        from team_synergy import TeamSynergy
        synergy = TeamSynergy(_data_dir)
        agent_list = [a.strip() for a in agents.split(",") if a.strip()] if agents else []
        recommended = synergy.recommend_for_task(task_type, agent_list)
        return ok({"recommended_agents": recommended, "task_type": task_type})
    except Exception as e:
        logger.exception("recommend_team 失败")
        return fail(str(e))


# ── Human Feedback ──

@router.post("/api/feedback/submit")
@limiter.limit(RATE_LIMITS["feedback"])
async def submit_human_feedback(request: Request):
    try:
        body = await request.json()
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            body["tenant_id"] = tenant_id
        from human_feedback import HumanFeedbackManager
        mgr = HumanFeedbackManager(_data_dir, experience_extractor=_srv.experience_extractor)
        result = mgr.submit_feedback(body)
        return ok(result)
    except Exception as e:
        logger.exception("submit_human_feedback 失败")
        return fail(str(e))


@router.get("/api/feedback/summary")
@limiter.limit(RATE_LIMITS["feedback"])
async def get_feedback_summary(request: Request):
    try:
        from human_feedback import HumanFeedbackManager
        mgr = HumanFeedbackManager(_data_dir, experience_extractor=_srv.experience_extractor)
        return ok(mgr.get_feedback_summary())
    except Exception as e:
        logger.exception("get_feedback_summary 失败")
        return fail(str(e))


@router.get("/api/feedback/guidance/{agent_id}")
async def get_skill_guidance(agent_id: str):
    try:
        from human_feedback import HumanFeedbackManager
        mgr = HumanFeedbackManager(_data_dir, experience_extractor=_srv.experience_extractor)
        return ok({"agent_id": agent_id, "directions": mgr.get_skill_guidance(agent_id)})
    except Exception as e:
        logger.exception("get_skill_guidance 失败")
        return fail(str(e))
