"""
Experience & Evolution REST API Router — rules, effectiveness, demotion, evolution timeline.
"""

import csv
import io
import logging
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse, StreamingResponse

from rate_limiter import RATE_LIMITS, limiter
from routers.common import fail, ok

logger = logging.getLogger("routers.experience")

router = APIRouter(tags=["experience"])

_experience_extractor = None
_evolution_event_store = None
_ab_tracker = None


def init(experience_extractor, evolution_event_store, ab_tracker):
    global _experience_extractor, _evolution_event_store, _ab_tracker
    _experience_extractor = experience_extractor
    _evolution_event_store = evolution_event_store
    _ab_tracker = ab_tracker


def set_experience_extractor(extractor):
    """Allow tests to replace the extractor after init()."""
    global _experience_extractor
    _experience_extractor = extractor


def _rule_to_dict(rule) -> dict:
    return asdict(rule)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_iso_24h_ago() -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()


# ── Experience Rules ──

@router.get("/api/experience/rules")
@limiter.limit(RATE_LIMITS["read"])
async def get_all_rules(request: Request):
    try:
        rules = _experience_extractor.get_all_rules()
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            rules = [r for r in rules if getattr(r, "team_id", "") == tenant_id]
        return ok([_rule_to_dict(r) for r in rules])
    except (KeyError, ValueError) as e:
        logger.warning("get_all_rules 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("get_all_rules 失败")
        return fail(str(e))


@router.get("/api/experience/rules/pending")
async def get_pending_rules():
    try:
        rules = _experience_extractor.get_pending_rules()
        return ok([_rule_to_dict(r) for r in rules])
    except (KeyError, ValueError) as e:
        logger.warning("get_pending_rules 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("get_pending_rules 失败")
        return fail(str(e))


@router.get("/api/experience/rules/{rule_id}/chain")
async def get_rule_evolution_chain(rule_id: str):
    try:
        chain = _experience_extractor.get_evolution_chain(rule_id)
        return ok(chain)
    except Exception as e:
        logger.exception("get_rule_evolution_chain 失败")
        return fail(str(e))


@router.post("/api/experience/rules/{rule_id}/approve")
@limiter.limit(RATE_LIMITS["feedback"])
async def approve_rule(rule_id: str, request: Request, body: dict = Body(...)):
    try:
        comment = body.get("comment", "")
        success = _experience_extractor.approve_rule(rule_id, comment)
        if not success:
            return fail(f"规则不存在: {rule_id}")
        approved_rule = _experience_extractor._load_rule(rule_id)
        if approved_rule:
            _experience_extractor.write_to_incremental_area(approved_rule)
        return ok({"rule_id": rule_id, "status": "approved"})
    except (KeyError, ValueError) as e:
        logger.warning("approve_rule 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("approve_rule 失败")
        return fail(str(e))


@router.post("/api/experience/rules/{rule_id}/reject")
@limiter.limit(RATE_LIMITS["feedback"])
async def reject_rule(rule_id: str, request: Request, body: dict = Body(...)):
    try:
        reason = body.get("reason", "")
        success = _experience_extractor.reject_rule(rule_id, reason)
        if not success:
            return fail(f"规则不存在: {rule_id}")
        return ok({"rule_id": rule_id, "status": "rejected"})
    except (KeyError, ValueError) as e:
        logger.warning("reject_rule 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("reject_rule 失败")
        return fail(str(e))


@router.put("/api/experience/rules/{rule_id}")
@limiter.limit(RATE_LIMITS["write"])
async def modify_rule(rule_id: str, request: Request, body: dict = Body(...)):
    try:
        updates = body.get("updates", body)
        success = _experience_extractor.modify_rule(rule_id, updates)
        if not success:
            return fail(f"规则不存在: {rule_id}")
        return ok({"rule_id": rule_id, "modified": True})
    except (KeyError, ValueError) as e:
        logger.warning("modify_rule 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("modify_rule 失败")
        return fail(str(e))


@router.get("/api/experience/rules/effectiveness")
async def get_rules_effectiveness():
    try:
        rules = _experience_extractor.get_all_rules()
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
        return ok({
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
        return fail(str(e))


@router.get("/api/experience/rules/demotion-log")
async def get_demotion_log():
    try:
        log = _experience_extractor.get_demotion_log()
        return ok({
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
        return fail(str(e))


@router.get("/api/experience/rules/demotion-stats")
async def get_demotion_stats():
    try:
        return ok(_experience_extractor.get_demotion_stats())
    except Exception as e:
        logger.exception("get_demotion_stats 失败")
        return fail(str(e))


@router.get("/api/experience/rules/demotion-export")
async def export_demotion_report(format: str = "json"):
    try:
        stats = _experience_extractor.get_demotion_stats()
        log = _experience_extractor.get_demotion_log()
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
        return fail(str(e))


# ── Evolution Events ──

@router.get("/api/evolution/timeline")
async def get_evolution_timeline(
    agent_id: str = "",
    event_type: str = "",
    since: str = "",
    limit: int = 50,
):
    try:
        events = _evolution_event_store.get_timeline(
            agent_id=agent_id or None,
            event_type=event_type or None,
            since=since or None,
            limit=limit,
        )
        return ok({"events": events, "total": len(events)})
    except Exception as e:
        logger.exception("get_evolution_timeline 失败")
        return fail(str(e))


@router.get("/api/evolution/timeline/summary")
async def get_evolution_summary(agent_id: str = "", period: int = 7):
    try:
        summary = _evolution_event_store.get_summary(
            agent_id=agent_id or None,
            period_days=period,
        )
        return ok(summary)
    except Exception as e:
        logger.exception("get_evolution_summary 失败")
        return fail(str(e))


@router.get("/api/evolution/ab-stats")
async def get_ab_stats(task_type: str = "", period: int = 30):
    try:
        stats = _ab_tracker.get_stats(
            task_type=task_type or None,
            period_days=period,
        )
        return ok({"stats": stats, "total": len(stats)})
    except Exception as e:
        logger.exception("get_ab_stats 失败")
        return fail(str(e))
