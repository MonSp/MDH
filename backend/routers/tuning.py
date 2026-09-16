"""自调优引擎 REST API — 参数查询、优化运行、提案管理"""

import logging

from fastapi import APIRouter, Body, Request

from rate_limiter import RATE_LIMITS, limiter
from routers.common import fail, ok

logger = logging.getLogger("routers.tuning")

router = APIRouter(tags=["tuning"])

_registry = None
_optimizer = None


def init(registry, optimizer):
    global _registry, _optimizer
    _registry = registry
    _optimizer = optimizer


@router.get("/api/tuning/params")
async def list_params():
    """列出所有可调参数"""
    try:
        params = _registry.list_params()
        return ok({
            "params": [
                {
                    "name": p.name,
                    "current": p.current,
                    "min": p.min_val,
                    "max": p.max_val,
                    "step": p.step,
                    "metric": p.metric,
                    "direction": p.direction,
                    "description": p.description,
                    "requires_approval": p.requires_approval,
                }
                for p in params
            ],
            "total": len(params),
        })
    except Exception as e:
        logger.exception("list_params 失败")
        return fail(str(e))


@router.get("/api/tuning/params/{name:path}")
async def get_param(name: str):
    """获取单个参数详情"""
    try:
        p = _registry.get_param(name)
        if p is None:
            return fail(f"参数 {name} 不存在")
        return ok({
            "name": p.name,
            "current": p.current,
            "min": p.min_val,
            "max": p.max_val,
            "step": p.step,
            "metric": p.metric,
            "direction": p.direction,
            "description": p.description,
            "requires_approval": p.requires_approval,
        })
    except Exception as e:
        logger.exception("get_param 失败")
        return fail(str(e))


@router.put("/api/tuning/params/{name:path}")
async def set_param(name: str, body: dict = Body(...)):
    """手动设置参数值"""
    try:
        value = body.get("value")
        reason = body.get("reason", "手动调整")
        if value is None:
            return fail("缺少 value 字段")
        success = _registry.set_value(name, float(value), reason=reason, applied_by="manual")
        if not success:
            return fail(f"参数 {name} 不存在或设置失败")
        return ok({"name": name, "value": _registry.get(name)})
    except Exception as e:
        logger.exception("set_param 失败")
        return fail(str(e))


@router.get("/api/tuning/history")
async def get_history(name: str = "", limit: int = 50):
    """参数变更历史"""
    try:
        history = _registry.get_history(name or None, limit)
        return ok({"history": history, "total": len(history)})
    except Exception as e:
        logger.exception("get_history 失败")
        return fail(str(e))


@router.get("/api/tuning/snapshot")
async def get_snapshot():
    """当前参数快照"""
    try:
        return ok({"snapshot": _registry.snapshot()})
    except Exception as e:
        logger.exception("get_snapshot 失败")
        return fail(str(e))


@router.post("/api/tuning/optimize")
@limiter.limit(RATE_LIMITS.get("default", "30/minute"))
async def run_optimization(request: Request, period: int = 30, auto_apply: bool = False):
    """运行一轮离线优化分析

    Args:
        period: 分析天数
        auto_apply: 是否自动应用不需要审批的提案
    """
    try:
        report = _optimizer.run(period_days=period)
        results = _optimizer.apply_proposals(report, auto_apply=auto_apply)
        return ok({
            "report": report.to_dict(),
            "applied": results,
        })
    except Exception as e:
        logger.exception("run_optimization 失败")
        return fail(str(e))
