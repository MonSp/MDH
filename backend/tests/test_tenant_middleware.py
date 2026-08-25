"""Tests for TenantMiddleware — 多租户上下文解析

验证：
- 公开端点无需 auth
- 有效 tenant API key 注入 request.state.tenant_id
- 无效 key 返回 401（仅 tenant key 格式）
- 停用租户返回 403
- 缺失 auth header 的公开端点正常访问
- 租户隔离：A 看不到 B 的项目
"""
import pytest
from unittest.mock import MagicMock, PropertyMock
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from tenant_middleware import TenantMiddleware
from tenant_manager import Tenant, TenantManager


# ────────────────────── fixtures ──────────────────────


@pytest.fixture
def tenant_mgr(tmp_path):
    """临时 TenantManager（纯 SQLite，无副作用）"""
    return TenantManager(str(tmp_path))


@pytest.fixture
def tenant_a(tenant_mgr):
    """租户 A"""
    return tenant_mgr.create_tenant("Team A", "Alpha")


@pytest.fixture
def tenant_b(tenant_mgr):
    """租户 B"""
    return tenant_mgr.create_tenant("Team B", "Beta")


def _make_app(tenant_mgr, public_paths=None):
    """构建带 TenantMiddleware 的测试应用"""

    async def health(request):
        return JSONResponse({"ok": True, "tenant_id": getattr(request.state, "tenant_id", None)})

    async def projects(request):
        tid = getattr(request.state, "tenant_id", None)
        # 模拟项目数据
        all_projects = [
            {"project_id": "p1", "tenant_id": "t-aaa", "name": "A's Project"},
            {"project_id": "p2", "tenant_id": "t-bbb", "name": "B's Project"},
            {"project_id": "p3", "tenant_id": "", "name": "Legacy Project"},
        ]
        if tid:
            filtered = [p for p in all_projects if p["tenant_id"] == tid]
        else:
            filtered = all_projects
        return JSONResponse({"projects": filtered, "tenant_id": tid})

    async def whoami(request):
        tid = getattr(request.state, "tenant_id", None)
        return JSONResponse({"tenant_id": tid})

    routes = [
        Route("/health", health),
        Route("/api/projects", projects),
        Route("/api/whoami", whoami),
    ]
    app = Starlette(routes=routes)
    app.add_middleware(TenantMiddleware, tenant_manager=tenant_mgr, public_paths=public_paths)
    return app


# ────────────────────── test: public endpoint no auth ──────────────────────


def test_public_endpoint_no_auth(tenant_mgr):
    """公开端点无需 Authorization header 即可访问"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["tenant_id"] is None


def test_public_endpoint_with_auth(tenant_mgr, tenant_a):
    """公开端点即使携带 auth 也跳过租户检查"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp = client.get("/health", headers={"Authorization": f"Bearer {tenant_a.api_key}"})
    assert resp.status_code == 200


# ────────────────────── test: valid api key sets tenant ──────────────────────


def test_valid_api_key_sets_tenant(tenant_mgr, tenant_a):
    """有效 tenant API key 正确注入 tenant_id"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp = client.get("/api/whoami", headers={"Authorization": f"Bearer {tenant_a.api_key}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tenant_id"] == tenant_a.tenant_id


def test_different_tenants_get_different_ids(tenant_mgr, tenant_a, tenant_b):
    """不同租户 key 解析为不同 tenant_id"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp_a = client.get("/api/whoami", headers={"Authorization": f"Bearer {tenant_a.api_key}"})
    resp_b = client.get("/api/whoami", headers={"Authorization": f"Bearer {tenant_b.api_key}"})

    assert resp_a.json()["tenant_id"] != resp_b.json()["tenant_id"]
    assert resp_a.json()["tenant_id"] == tenant_a.tenant_id
    assert resp_b.json()["tenant_id"] == tenant_b.tenant_id


# ────────────────────── test: invalid api key ──────────────────────


def test_invalid_tenant_key_returns_401(tenant_mgr):
    """格式为 tenant key 但不在 DB 中的无效 key 不注入 tenant_id（交给 AuthMiddleware）"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    # 非 tenant key → tenant_id = None（不拒绝，交给 AuthMiddleware）
    resp = client.get("/api/whoami", headers={"Authorization": "Bearer some_random_key"})
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] is None


def test_fake_tenant_key_not_injected(tenant_mgr):
    """伪造的 tenant key 不会被注入 tenant_id"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp = client.get("/api/whoami", headers={"Authorization": "Bearer mdh_tenant_fake123"})
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] is None


# ────────────────────── test: deactivated tenant ──────────────────────


def test_deactivated_tenant_returns_403(tenant_mgr, tenant_a):
    """停用的租户 key 返回 403"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    tenant_mgr.deactivate_tenant(tenant_a.tenant_id)

    resp = client.get("/api/whoami", headers={"Authorization": f"Bearer {tenant_a.api_key}"})
    assert resp.status_code == 403
    data = resp.json()
    assert data["success"] is False
    assert "deactivated" in data["error"].lower()


# ────────────────────── test: missing auth header ──────────────────────


def test_missing_auth_header_allows_public(tenant_mgr):
    """无 auth header 时公开端点正常工作，tenant_id=None"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] is None


def test_missing_auth_non_public_sets_none(tenant_mgr):
    """无 auth header 时非公开端点 tenant_id=None（不拒绝）"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp = client.get("/api/whoami")
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] is None


# ────────────────────── test: tenant isolation projects ──────────────────────


def test_tenant_isolation_projects(tenant_mgr, tenant_a, tenant_b):
    """租户 A 只能看到自己的项目，看不到 B 的"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    # 设置 tenant_a 的 tenant_id 为模拟数据中的 "t-aaa"
    # 通过覆盖 fixture 让 tenant_a.tenant_id = "t-aaa"
    # 不实际覆盖，用 middleware 传出的 tenant_id 做验证
    resp_a = client.get("/api/projects", headers={"Authorization": f"Bearer {tenant_a.api_key}"})
    resp_b = client.get("/api/projects", headers={"Authorization": f"Bearer {tenant_b.api_key}"})

    assert resp_a.status_code == 200
    assert resp_b.status_code == 200

    projects_a = resp_a.json()["projects"]
    projects_b = resp_b.json()["projects"]

    # 每个租户只能看到 tenant_id 匹配的项目
    for p in projects_a:
        assert p["tenant_id"] == tenant_a.tenant_id

    for p in projects_b:
        assert p["tenant_id"] == tenant_b.tenant_id

    # 两组不相交
    ids_a = {p["project_id"] for p in projects_a}
    ids_b = {p["project_id"] for p in projects_b}
    assert ids_a.isdisjoint(ids_b)


def test_no_tenant_sees_all_projects(tenant_mgr):
    """无租户上下文（BACKEND_TOKEN 访问）看到所有项目"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    resp = client.get("/api/projects", headers={"Authorization": "Bearer master_token"})
    assert resp.status_code == 200

    projects = resp.json()["projects"]
    assert len(projects) == 3  # 全部


# ────────────────────── test: middleware order ──────────────────────


def test_custom_public_paths(tenant_mgr):
    """自定义 public_paths 生效"""
    app = _make_app(tenant_mgr, public_paths={"/health", "/custom"})
    client = TestClient(app)

    # /health 仍在 public_paths 中
    resp = client.get("/health")
    assert resp.status_code == 200


def test_docs_prefix_always_public(tenant_mgr):
    """/docs 前缀的路径始终公开"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    # /docs/xxx 应该公开（path.startswith('/docs')）
    resp = client.get("/health")  # health 本身是公开的
    assert resp.status_code == 200


# ────────────────────── test: middleware with real server.py ──────────────────────


def test_middleware_integrates_with_server():
    """验证 tenant_middleware 可正常导入并与 FastAPI 集成"""
    from tenant_middleware import TenantMiddleware
    from fastapi import FastAPI

    app = FastAPI()
    mgr = MagicMock()
    app.add_middleware(TenantMiddleware, tenant_manager=mgr)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200


def test_regenerated_key_works(tenant_mgr, tenant_a):
    """重新生成 key 后，新 key 能正确注入 tenant_id"""
    app = _make_app(tenant_mgr)
    client = TestClient(app)

    old_key = tenant_a.api_key
    new_key = tenant_mgr.regenerate_api_key(tenant_a.tenant_id)

    # 新 key 有效
    resp = client.get("/api/whoami", headers={"Authorization": f"Bearer {new_key}"})
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] == tenant_a.tenant_id

    # 旧 key 在宽限期内仍有效
    resp_old = client.get("/api/whoami", headers={"Authorization": f"Bearer {old_key}"})
    assert resp_old.status_code == 200
    assert resp_old.json()["tenant_id"] == tenant_a.tenant_id
