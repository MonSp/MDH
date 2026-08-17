"""
MCP Config REST API Router
"""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

# 注入点
_mcp_config = None


def init(mcp_config):
    global _mcp_config
    _mcp_config = mcp_config


@router.get("/servers")
async def list_servers():
    servers = _mcp_config.list_servers()
    return {"success": True, "servers": [s.to_dict() for s in servers]}


@router.post("/servers")
async def add_server(request: Request):
    from mcp_config import MCPServerEntry
    body = await request.json()
    try:
        entry = MCPServerEntry(
            name=body.get("name", ""),
            transport=body.get("transport", "stdio"),
            command=body.get("command", ""),
            args=body.get("args", []),
            url=body.get("url", ""),
            env=body.get("env", {}),
            enabled=body.get("enabled", True),
        )
        result = _mcp_config.add_server(entry)
        return {"success": True, "server": result.to_dict()}
    except ValueError as e:
        return {"success": False, "error": str(e)}


@router.put("/servers/{name}")
async def update_server(name: str, request: Request):
    body = await request.json()
    result = _mcp_config.update_server(name, body)
    if result:
        return {"success": True, "server": result.to_dict()}
    return {"success": False, "error": "服务器不存在"}


@router.delete("/servers/{name}")
async def delete_server(name: str):
    if _mcp_config.delete_server(name):
        return {"success": True}
    return {"success": False, "error": "服务器不存在"}


@router.post("/servers/{name}/test")
async def test_connection(name: str):
    result = await _mcp_config.test_connection(name)
    return result
