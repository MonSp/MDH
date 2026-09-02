"""多租户中间件 — 从 API key 解析 tenant 上下文

每个请求携带 Bearer token 时，尝试解析为租户 API key。
- 命中租户 key → request.state.tenant_id = tenant_id
- 未命中（BACKEND_TOKEN / RBAC key / 无 key）→ tenant_id = None，交给下游 AuthMiddleware
- 停用租户 → 403
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("tenant_middleware")


class TenantMiddleware(BaseHTTPMiddleware):
    """从 Authorization header 提取租户上下文的中间件

    放在 AuthMiddleware 内层（add_middleware 顺序在 AuthMiddleware 之前），
    使已认证的请求能自动携带 tenant_id。
    """

    def __init__(self, app, tenant_manager, public_paths=None):
        super().__init__(app)
        self._tenant_mgr = tenant_manager
        self._public_paths = public_paths or {
            "/health", "/docs", "/openapi.json", "/redoc", "/metrics",
        }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # 公开端点跳过
        if path in self._public_paths or path.startswith("/docs"):
            request.state.tenant_id = None
            return await call_next(request)

        # 无 Authorization header → 无租户上下文（交给 AuthMiddleware 决定是否放行）
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            request.state.tenant_id = None
            return await call_next(request)

        api_key = auth[7:]

        # 尝试解析为租户 key（含停用租户，用于区分 403）
        tenant = self._tenant_mgr.get_tenant_by_api_key(api_key, include_inactive=True)

        if tenant:
            if not tenant.is_active:
                return JSONResponse(
                    status_code=403,
                    content={"success": False, "error": "Tenant deactivated"},
                )
            request.state.tenant_id = tenant.tenant_id
            return await call_next(request)

        # 未命中 → 可能是 BACKEND_TOKEN / RBAC key，交给下游 AuthMiddleware
        request.state.tenant_id = None
        return await call_next(request)
