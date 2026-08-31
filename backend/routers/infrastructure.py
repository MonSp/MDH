"""
Infrastructure REST API Router — tenants and webhooks.
"""

import logging
from dataclasses import asdict

from fastapi import APIRouter, Request
from rate_limiter import limiter, RATE_LIMITS

from routers.common import ok, fail

logger = logging.getLogger("routers.infrastructure")

router = APIRouter(tags=["infrastructure"])

_srv = None
_data_dir = None


def init(server_module, data_dir: str):
    global _srv, _data_dir
    _srv = server_module
    _data_dir = data_dir


# ── Tenants ──

@router.post("/api/tenants")
async def create_tenant(request: Request):
    try:
        body = await request.json()
        tenant = _srv.tenant_mgr.create_tenant(body.get("name", ""), body.get("description", ""))
        return ok(asdict(tenant), code="TENANT_CREATED")
    except Exception as e:
        logger.exception("create_tenant 失败")
        return fail(str(e))


@router.get("/api/tenants")
@limiter.limit(RATE_LIMITS["read"])
async def list_tenants(request: Request):
    try:
        tenants = _srv.tenant_mgr.list_tenants()
        return ok({"tenants": [asdict(t) for t in tenants], "total": len(tenants)})
    except Exception as e:
        logger.exception("list_tenants 失败")
        return fail(str(e))


@router.get("/api/tenants/{tenant_id}")
async def get_tenant(tenant_id: str):
    try:
        tenant = _srv.tenant_mgr.get_tenant(tenant_id)
        if tenant:
            return ok(asdict(tenant))
        return fail("租户不存在", code="TENANT_NOT_FOUND")
    except Exception as e:
        logger.exception("get_tenant 失败")
        return fail(str(e))


@router.delete("/api/tenants/{tenant_id}")
async def deactivate_tenant(tenant_id: str):
    try:
        success = _srv.tenant_mgr.deactivate_tenant(tenant_id)
        if success:
            return ok({"deactivated": True}, code="TENANT_DEACTIVATED")
        return fail("租户不存在", code="TENANT_NOT_FOUND")
    except Exception as e:
        logger.exception("deactivate_tenant 失败")
        return fail(str(e))


# ── Webhooks ──

def _get_webhook_mgr():
    from webhook_manager import WebhookManager
    return WebhookManager(_data_dir)


@router.post("/api/webhooks")
async def create_webhook(request: Request):
    try:
        body = await request.json()
        sub = _get_webhook_mgr().subscribe(body.get("url", ""), body.get("events", []))
        return ok({"sub_id": sub.sub_id, "url": sub.url, "events": sub.events, "secret": sub.secret}, code="WEBHOOK_CREATED")
    except Exception as e:
        logger.exception("create_webhook 失败")
        return fail(str(e))


@router.get("/api/webhooks")
async def list_webhooks():
    try:
        subs = _get_webhook_mgr().list_subscriptions()
        return ok({"subscriptions": [
            {"sub_id": s.sub_id, "url": s.url, "events": s.events, "is_active": s.is_active}
            for s in subs
        ]})
    except Exception as e:
        logger.exception("list_webhooks 失败")
        return fail(str(e))


@router.delete("/api/webhooks/{sub_id}")
async def delete_webhook(sub_id: str):
    try:
        success = _get_webhook_mgr().unsubscribe(sub_id)
        if success:
            return ok({"deleted": True}, code="WEBHOOK_DELETED")
        return fail("订阅不存在", code="WEBHOOK_NOT_FOUND")
    except Exception as e:
        logger.exception("delete_webhook 失败")
        return fail(str(e))


@router.get("/api/webhooks/stats")
@limiter.limit(RATE_LIMITS["read"])
async def get_webhook_stats(request: Request):
    try:
        return ok(_get_webhook_mgr().get_stats())
    except Exception as e:
        logger.exception("get_webhook_stats 失败")
        return fail(str(e))
