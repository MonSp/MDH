"""
Shared response helpers for all routers.
"""


def ok(data=None, code: str = "OK"):
    return {"success": True, "data": data, "error": None, "code": code}


def fail(error: str, code: str = "ERROR"):
    return {"success": False, "data": None, "error": error, "code": code}
