import sys
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api_config import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)


def test_get_roles():
    resp = client.get("/api/roles")
    assert resp.status_code == 200
    data = resp.json()
    # Should contain both base and custom roles
    assert "executor" in data
    assert "frontend_specialist" in data


def test_get_single_role():
    resp = client.get("/api/roles/executor")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "全栈开发工程师"


def test_get_role_not_found():
    resp = client.get("/api/roles/nonexistent_role_xyz")
    assert resp.status_code == 404


def test_get_skills():
    resp = client.get("/api/skills")
    assert resp.status_code == 200
    data = resp.json()
    assert "architecture" in data
    assert "testing" in data


def test_get_tools():
    resp = client.get("/api/tools")
    assert resp.status_code == 200
    data = resp.json()
    assert "bash" in data
    assert "read_file" in data
    assert data["bash"]["dangerous"] is True
