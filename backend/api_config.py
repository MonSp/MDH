"""
API endpoints for roles, skills, and tools configuration.

Provides unified HTTP access to roles_config.yaml so the Orchestrator
can fetch config via HTTP instead of maintaining a separate roles.json.
"""

from fastapi import APIRouter, HTTPException

from agent_toolset import load_roles_config

router = APIRouter(prefix="/api", tags=["config"])


def _get_config():
    return load_roles_config()


@router.get("/roles")
def get_roles():
    config = _get_config()
    base = config.get("base_roles", {})
    custom = config.get("custom_roles", {})
    return {**base, **custom}


@router.get("/roles/{role_name}")
def get_role(role_name: str):
    config = _get_config()
    base = config.get("base_roles", {})
    custom = config.get("custom_roles", {})
    all_roles = {**base, **custom}
    if role_name not in all_roles:
        raise HTTPException(status_code=404, detail=f"Role '{role_name}' not found")
    return all_roles[role_name]


@router.get("/skills")
def get_skills():
    config = _get_config()
    return config.get("skills", {})


@router.get("/tools")
def get_tools():
    config = _get_config()
    return config.get("tools", {})
