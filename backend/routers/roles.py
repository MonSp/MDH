"""
Roles REST API Router — roles, tools, and skills configuration.
"""

import logging
import os

from fastapi import APIRouter, Body, Request

from rate_limiter import RATE_LIMITS, limiter
from routers.common import fail, ok

logger = logging.getLogger("routers.roles")

router = APIRouter(prefix="/api/roles", tags=["roles"])

# ── Config file management ──

_ROLES_CONFIG_PATH = None
_roles_config_cache = None
_roles_config_mtime = 0
_sessions = None


def init(base_dir, sessions):
    global _ROLES_CONFIG_PATH, _sessions
    _ROLES_CONFIG_PATH = os.path.join(base_dir, "roles_config.yaml")
    _sessions = sessions


def _load_roles_config():
    """加载角色配置（mtime 缓存：文件未变则返回缓存）"""
    global _roles_config_cache, _roles_config_mtime
    import yaml

    if not os.path.exists(_ROLES_CONFIG_PATH):
        return {"tools": {}, "skills": {}, "prompt_templates": {}, "base_roles": {}, "custom_roles": {}}

    try:
        current_mtime = os.path.getmtime(_ROLES_CONFIG_PATH)
    except OSError:
        current_mtime = 0

    if _roles_config_cache is not None and current_mtime == _roles_config_mtime:
        return _roles_config_cache

    with open(_ROLES_CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    _roles_config_cache = config
    _roles_config_mtime = current_mtime
    return config


def _save_roles_config(config):
    """保存角色配置"""
    global _roles_config_cache, _roles_config_mtime
    import yaml
    with open(_ROLES_CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, default_flow_style=False)
    _roles_config_cache = config
    try:
        _roles_config_mtime = os.path.getmtime(_ROLES_CONFIG_PATH)
    except OSError:
        _roles_config_mtime = 0
    try:
        from agent_toolset import invalidate_roles_config_cache
        invalidate_roles_config_cache()
    except ImportError:
        pass


# ── Role CRUD ──

@router.get("/config")
async def get_roles_config():
    try:
        config = _load_roles_config()
        return ok(config)
    except (KeyError, ValueError) as e:
        logger.warning("获取角色配置失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("获取角色配置失败")
        return fail(str(e))


@router.get("/{role_id}")
async def get_role(role_id: str):
    try:
        config = _load_roles_config()
        role = config.get("base_roles", {}).get(role_id) or config.get("custom_roles", {}).get(role_id)
        if not role:
            return fail(f"角色不存在: {role_id}")
        return ok(role)
    except (KeyError, ValueError) as e:
        logger.warning("获取角色失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("获取角色失败")
        return fail(str(e))


@router.post("/{role_id}")
async def create_role(role_id: str, body: dict = Body(...)):
    try:
        config = _load_roles_config()
        if role_id in config.get("base_roles", {}):
            return fail(f"不能覆盖基础角色: {role_id}")
        if role_id in config.get("custom_roles", {}):
            return fail(f"角色已存在: {role_id}")
        if "custom_roles" not in config:
            config["custom_roles"] = {}
        config["custom_roles"][role_id] = {
            "name": body.get("name", role_id),
            "description": body.get("description", ""),
            "base_role": body.get("base_role", "executor"),
            "extra_tools": body.get("extra_tools", []),
            "extra_skills": body.get("extra_skills", []),
            "prompt_template": "custom",
            "custom_prompt": body.get("custom_prompt", ""),
        }
        _save_roles_config(config)
        return ok(config["custom_roles"][role_id])
    except (KeyError, ValueError) as e:
        logger.warning("创建角色失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("创建角色失败")
        return fail(str(e))


@router.put("/{role_id}")
async def update_role(role_id: str, body: dict = Body(...)):
    try:
        config = _load_roles_config()
        if role_id in config.get("base_roles", {}):
            base = config["base_roles"][role_id]
            if "name" in body:
                base["name"] = body["name"]
            if "description" in body:
                base["description"] = body["description"]
            if "permissions" in body:
                base["permissions"] = body["permissions"]
            if "skills" in body:
                base["skills"] = body["skills"]
            _save_roles_config(config)
            return ok(base)
        elif role_id in config.get("custom_roles", {}):
            custom = config["custom_roles"][role_id]
            for key in ["name", "description", "base_role", "extra_tools", "extra_skills", "custom_prompt"]:
                if key in body:
                    custom[key] = body[key]
            _save_roles_config(config)
            return ok(custom)
        else:
            return fail(f"角色不存在: {role_id}")
    except (KeyError, ValueError) as e:
        logger.warning("更新角色失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("更新角色失败")
        return fail(str(e))


@router.delete("/{role_id}")
async def delete_role(role_id: str):
    try:
        config = _load_roles_config()
        if role_id in config.get("base_roles", {}):
            return fail(f"不能删除基础角色: {role_id}")
        if role_id not in config.get("custom_roles", {}):
            return fail(f"角色不存在: {role_id}")
        del config["custom_roles"][role_id]
        _save_roles_config(config)
        return ok({"role_id": role_id, "deleted": True})
    except (KeyError, ValueError) as e:
        logger.warning("删除角色失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("删除角色失败")
        return fail(str(e))


# ── Tools ──

@router.get("/tools/list")
async def list_tools():
    try:
        config = _load_roles_config()
        return ok(config.get("tools", {}))
    except (KeyError, ValueError) as e:
        logger.warning("获取工具列表失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("获取工具列表失败")
        return fail(str(e))


@router.post("/tools/{tool_id}")
async def create_tool(tool_id: str, body: dict = Body(...)):
    try:
        config = _load_roles_config()
        if "tools" not in config:
            config["tools"] = {}
        if tool_id in config["tools"]:
            return fail(f"工具已存在: {tool_id}")
        config["tools"][tool_id] = {
            "name": body.get("name", tool_id),
            "description": body.get("description", ""),
            "category": body.get("category", "general"),
            "dangerous": body.get("dangerous", False),
        }
        _save_roles_config(config)
        return ok(config["tools"][tool_id])
    except (KeyError, ValueError) as e:
        logger.warning("创建工具失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("创建工具失败")
        return fail(str(e))


@router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: str):
    try:
        config = _load_roles_config()
        if tool_id not in config.get("tools", {}):
            return fail(f"工具不存在: {tool_id}")
        del config["tools"][tool_id]
        _save_roles_config(config)
        return ok({"tool_id": tool_id, "deleted": True})
    except (KeyError, ValueError) as e:
        logger.warning("删除工具失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("删除工具失败")
        return fail(str(e))


# ── Skills ──

@router.get("/skills/list")
async def list_role_skills():
    try:
        config = _load_roles_config()
        return ok(config.get("skills", {}))
    except (KeyError, ValueError) as e:
        logger.warning("获取技能列表失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("获取技能列表失败")
        return fail(str(e))


@router.post("/skills/generate")
@limiter.limit(RATE_LIMITS["llm"])
async def generate_skill(request: Request, body: dict = Body(...)):
    try:
        from skill_generator import SkillGenerator
        generator = SkillGenerator(load_roles_config_fn=_load_roles_config)

        api_key = body.get("api_key", "")
        base_url = body.get("base_url", "")
        provider = "deepseek"
        model_name = None

        if not api_key:
            session_id = body.get("session_id")
            session = _sessions.get(session_id) if session_id else None
            if not session:
                for sid, s in _sessions.items():
                    if s.api_key:
                        session = s
                        break
            if session:
                provider = session.provider or provider
                model_name = session.model_name
                api_key = session.api_key
                base_url = session.base_url

        if not api_key:
            api_key = os.environ.get("DEEPSEEK_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            from config import DEEPSEEK_API_KEY
            api_key = DEEPSEEK_API_KEY

        result = await generator.generate(
            description=body.get("description", ""),
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model_name=model_name or "",
        )
        if result["success"]:
            return ok(result["data"])
        return fail(result["error"])

    except (KeyError, ValueError) as e:
        logger.warning("AI生成技能失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("AI生成技能失败")
        return fail(str(e))


@router.post("/skills/{skill_id}")
async def create_skill(skill_id: str, body: dict = Body(...)):
    try:
        config = _load_roles_config()
        if "skills" not in config:
            config["skills"] = {}
        if skill_id in config["skills"]:
            return fail(f"技能已存在: {skill_id}")
        skill_entry = {
            "name": body.get("name", skill_id),
            "description": body.get("description", ""),
            "required_tools": body.get("required_tools", []),
        }
        if body.get("category"):
            skill_entry["category"] = body["category"]
        if body.get("methodology"):
            skill_entry["methodology"] = body["methodology"]
        if body.get("practices"):
            skill_entry["practices"] = body["practices"]
        if body.get("workflow"):
            skill_entry["workflow"] = body["workflow"]
        config["skills"][skill_id] = skill_entry
        _save_roles_config(config)
        return ok(config["skills"][skill_id])
    except (KeyError, ValueError) as e:
        logger.warning("创建技能失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("创建技能失败")
        return fail(str(e))


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str):
    try:
        config = _load_roles_config()
        if skill_id not in config.get("skills", {}):
            return fail(f"技能不存在: {skill_id}")
        del config["skills"][skill_id]
        _save_roles_config(config)
        return ok({"skill_id": skill_id, "deleted": True})
    except (KeyError, ValueError) as e:
        logger.warning("删除技能失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("删除技能失败")
        return fail(str(e))
