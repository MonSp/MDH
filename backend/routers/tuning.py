"""自调优引擎 REST API — 参数查询、优化运行、提案管理"""

import logging

from fastapi import APIRouter, Body, Request

from rate_limiter import RATE_LIMITS, limiter
from routers.common import fail, ok

logger = logging.getLogger("routers.tuning")

router = APIRouter(tags=["tuning"])

_registry = None
_optimizer = None
_deployment = None


def init(registry, optimizer, deployment=None):
    global _registry, _optimizer, _deployment
    _registry = registry
    _optimizer = optimizer
    _deployment = deployment


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


# ── 影子验证 + 受控部署 ──

@router.post("/api/tuning/deploy/shadow")
async def start_shadow(body: dict = Body(...)):
    """启动影子验证：新参数并行运行但不实际生效"""
    try:
        param_name = body.get("param_name")
        proposed_value = body.get("proposed_value")
        reason = body.get("reason", "")
        if not param_name or proposed_value is None:
            return fail("缺少 param_name 或 proposed_value")
        deployment_id = _deployment.start_shadow(param_name, float(proposed_value), reason)
        if not deployment_id:
            return fail("启动影子验证失败（参数不存在或已有活跃部署）")
        return ok({"deployment_id": deployment_id, "status": "shadow"})
    except Exception as e:
        logger.exception("start_shadow 失败")
        return fail(str(e))


@router.post("/api/tuning/deploy/{deployment_id}/decision")
async def record_shadow_decision(deployment_id: str, body: dict = Body(...)):
    """记录一次影子验证决策对比"""
    try:
        task_type = body.get("task_type", "general")
        old_decision = body.get("old_decision", "")
        new_decision = body.get("new_decision", "")
        success = _deployment.record_shadow_decision(deployment_id, task_type, old_decision, new_decision)
        if not success:
            return fail("记录失败（部署不存在或非影子阶段）")
        return ok({"recorded": True})
    except Exception as e:
        logger.exception("record_shadow_decision 失败")
        return fail(str(e))


@router.get("/api/tuning/deploy/{deployment_id}/evaluate")
async def evaluate_shadow(deployment_id: str):
    """评估影子验证结果"""
    try:
        return ok(_deployment.evaluate_shadow(deployment_id))
    except Exception as e:
        logger.exception("evaluate_shadow 失败")
        return fail(str(e))


@router.post("/api/tuning/deploy/{deployment_id}/promote")
async def promote_deployment(deployment_id: str):
    """将影子验证通过的部署晋升为活跃部署"""
    try:
        success = _deployment.promote(deployment_id)
        if not success:
            return fail("晋升失败（部署不存在或非影子阶段）")
        return ok({"promoted": True, "deployment_id": deployment_id})
    except Exception as e:
        logger.exception("promote 失败")
        return fail(str(e))


@router.post("/api/tuning/deploy/{deployment_id}/rollback")
async def rollback_deployment(deployment_id: str):
    """手动回滚部署"""
    try:
        success = _deployment.manual_rollback(deployment_id)
        if not success:
            return fail("回滚失败（部署不存在或已结束）")
        return ok({"rolled_back": True, "deployment_id": deployment_id})
    except Exception as e:
        logger.exception("rollback 失败")
        return fail(str(e))


@router.post("/api/tuning/deploy/check-rollbacks")
async def check_rollbacks():
    """检查所有活跃部署，自动回滚指标劣化的"""
    try:
        rolled_back = _deployment.check_rollbacks()
        return ok({"rolled_back": rolled_back, "count": len(rolled_back)})
    except Exception as e:
        logger.exception("check_rollbacks 失败")
        return fail(str(e))


@router.get("/api/tuning/deployments")
async def list_deployments(status: str = ""):
    """列出部署记录"""
    try:
        deployments = _deployment.list_deployments(status or None)
        return ok({"deployments": deployments, "total": len(deployments)})
    except Exception as e:
        logger.exception("list_deployments 失败")
        return fail(str(e))


@router.get("/api/tuning/deploy/{deployment_id}")
async def get_deployment(deployment_id: str):
    """获取单个部署详情"""
    try:
        record = _deployment.get_deployment(deployment_id)
        if not record:
            return fail("部署不存在")
        decisions = _deployment.get_shadow_decisions(deployment_id)
        return ok({"deployment": record, "shadow_decisions": decisions})
    except Exception as e:
        logger.exception("get_deployment 失败")
        return fail(str(e))


# ── 自动优化 ──

_auto_optimizer = None


def set_auto_optimizer(ao):
    global _auto_optimizer
    _auto_optimizer = ao


@router.post("/api/tuning/auto-optimize/run")
async def run_auto_optimize():
    """手动触发一轮自动优化"""
    try:
        summary = _auto_optimizer.run_cycle()
        return ok(summary)
    except Exception as e:
        logger.exception("run_auto_optimize 失败")
        return fail(str(e))


@router.get("/api/tuning/auto-optimize/status")
async def get_auto_optimize_status():
    """自动优化器状态"""
    try:
        return ok(_auto_optimizer.get_status())
    except Exception as e:
        logger.exception("get_auto_optimize_status 失败")
        return fail(str(e))
