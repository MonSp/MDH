"""
Ops REST API Router — admin keys, backup/restore, cache, logging, model registry.
"""

import logging
from dataclasses import asdict

from fastapi import APIRouter, Request
from rate_limiter import limiter, RATE_LIMITS

from routers.common import ok, fail

logger = logging.getLogger("routers.ops")

router = APIRouter(tags=["ops"])

_data_dir = None


def init(data_dir: str):
    global _data_dir
    _data_dir = data_dir


# ── Admin Keys ──

@router.post("/api/admin/create-key")
@limiter.limit(RATE_LIMITS["admin"])
async def create_api_key(request: Request):
    try:
        body = await request.json()
        from rbac import RBACManager
        rbac = RBACManager(_data_dir)
        key = rbac.create_api_key(
            name=body.get("name", "unnamed"),
            role=body.get("role", "agent"),
        )
        return ok({"key": key, "role": body.get("role", "agent")}, code="KEY_CREATED")
    except ValueError as e:
        return fail(str(e), code="INVALID_ROLE")
    except Exception as e:
        logger.exception("create_api_key 失败")
        return fail(str(e))


@router.get("/api/admin/keys")
@limiter.limit(RATE_LIMITS["admin"])
async def list_api_keys(request: Request):
    try:
        from rbac import RBACManager
        rbac = RBACManager(_data_dir)
        return ok({"keys": rbac.list_keys()})
    except Exception as e:
        logger.exception("list_api_keys 失败")
        return fail(str(e))


@router.delete("/api/admin/keys/{key_hash}")
@limiter.limit(RATE_LIMITS["admin"])
async def delete_api_key(key_hash: str, request: Request):
    try:
        from rbac import RBACManager
        rbac = RBACManager(_data_dir)
        success = rbac.delete_key(key_hash)
        if success:
            return ok({"deleted": True}, code="KEY_DELETED")
        return fail("Key 不存在", code="KEY_NOT_FOUND")
    except Exception as e:
        logger.exception("delete_api_key 失败")
        return fail(str(e))


# ── Backup / Restore ──

@router.post("/api/ops/backup")
@limiter.limit(RATE_LIMITS["admin"])
async def backup_database(request: Request, label: str = ""):
    try:
        from ops import OpsManager
        ops = OpsManager(_data_dir)
        return ok(ops.backup_database(label))
    except Exception as e:
        logger.exception("backup_database 失败")
        return fail(str(e))


@router.get("/api/ops/backups")
async def list_backups():
    try:
        from ops import OpsManager
        ops = OpsManager(_data_dir)
        return ok({"backups": ops.list_backups()})
    except Exception as e:
        logger.exception("list_backups 失败")
        return fail(str(e))


@router.post("/api/ops/restore")
@limiter.limit(RATE_LIMITS["admin"])
async def restore_backup(request: Request):
    try:
        body = await request.json()
        from ops import OpsManager
        ops = OpsManager(_data_dir)
        return ok(ops.restore_backup(body.get("backup_name", "")))
    except Exception as e:
        logger.exception("restore_backup 失败")
        return fail(str(e))


# ── Cache ──

@router.get("/api/ops/cache")
async def get_cache_stats():
    try:
        from cache import get_cache
        cache = get_cache()
        stats = cache.stats()
        cache.cleanup()
        return ok(stats)
    except Exception as e:
        logger.exception("get_cache_stats 失败")
        return fail(str(e))


@router.post("/api/ops/cache/clear")
async def clear_cache():
    try:
        from cache import get_cache
        get_cache().clear()
        return ok({"cleared": True}, code="CACHE_CLEARED")
    except Exception as e:
        logger.exception("clear_cache 失败")
        return fail(str(e))


# ── Logging ──

@router.get("/api/ops/logging")
async def get_logging_config():
    try:
        root = logging.getLogger()
        handlers = []
        for h in root.handlers:
            handlers.append({
                "type": type(h).__name__,
                "level": logging.getLevelName(h.level),
                "formatter": type(h.formatter).__name__ if h.formatter else None,
            })
        return ok({
            "level": logging.getLevelName(root.level),
            "handlers": handlers,
            "logger_count": len(logging.Logger.manager.loggerDict),
        })
    except Exception as e:
        logger.exception("get_logging_config 失败")
        return fail(str(e))


# ── Models ──

@router.get("/api/models")
@limiter.limit(RATE_LIMITS["read"])
async def list_models(request: Request, tier: str = ""):
    try:
        from model_registry import ModelRegistry
        registry = ModelRegistry()
        models = registry.list_models(tier)
        return ok({"models": [
            {"model_id": m.model_id, "provider": m.provider, "display_name": m.display_name,
             "tier": m.tier, "cost_input": m.cost_per_1m_input, "cost_output": m.cost_per_1m_output}
            for m in models
        ]})
    except Exception as e:
        logger.exception("list_models 失败")
        return fail(str(e))


@router.get("/api/models/{model_id}")
async def get_model(model_id: str):
    try:
        from model_registry import ModelRegistry
        registry = ModelRegistry()
        model = registry.get_model(model_id)
        if model:
            return ok({"model_id": model.model_id, "provider": model.provider,
                        "display_name": model.display_name, "tier": model.tier,
                        "cost_input": model.cost_per_1m_input, "cost_output": model.cost_per_1m_output,
                        "max_tokens": model.max_tokens})
        return fail("模型不存在", code="MODEL_NOT_FOUND")
    except Exception as e:
        logger.exception("get_model 失败")
        return fail(str(e))


@router.get("/api/models/{model_id}/fallback")
async def get_model_fallback(model_id: str):
    try:
        from model_registry import ModelRegistry
        registry = ModelRegistry()
        chain = registry.get_fallback_chain(model_id)
        return ok({"chain": [m.model_id for m in chain]})
    except Exception as e:
        logger.exception("get_model_fallback 失败")
        return fail(str(e))
