"""标准化错误处理 — 统一错误码、错误类型、异常处理模式

所有 API 端点使用统一的错误响应格式：
{"success": bool, "data": any, "error": str, "code": str}
"""

import logging
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("errors")


class ErrorCode(str, Enum):
    """标准错误码"""
    OK = "OK"
    # 通用错误
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_FOUND = "NOT_FOUND"
    INVALID_INPUT = "INVALID_INPUT"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    # Agent 相关
    AGENT_NOT_FOUND = "AGENT_NOT_FOUND"
    AGENT_PROFILE_ERROR = "AGENT_PROFILE_ERROR"
    # 规则相关
    RULE_NOT_FOUND = "RULE_NOT_FOUND"
    RULE_INVALID_STATUS = "RULE_INVALID_STATUS"
    # 记忆相关
    MEMORY_ERROR = "MEMORY_ERROR"
    # 交付相关
    DELIVERY_ERROR = "DELIVERY_ERROR"
    # 模型相关
    MODEL_NOT_FOUND = "MODEL_NOT_FOUND"
    MODEL_CREATION_FAILED = "MODEL_CREATION_FAILED"
    # 租户相关
    TENANT_NOT_FOUND = "TENANT_NOT_FOUND"
    TENANT_DEACTIVATED = "TENANT_DEACTIVATED"
    # Webhook 相关
    WEBHOOK_NOT_FOUND = "WEBHOOK_NOT_FOUND"
    # 进化相关
    EVOLUTION_ERROR = "EVOLUTION_ERROR"
    DEMOTION_ERROR = "DEMOTION_ERROR"


class MDHError(Exception):
    """MDH 标准异常"""
    def __init__(self, message: str, code: str = ErrorCode.INTERNAL_ERROR, status_code: int = 500):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(MDHError):
    def __init__(self, resource: str, resource_id: str = ""):
        msg = f"{resource}不存在"
        if resource_id:
            msg = f"{resource} '{resource_id}' 不存在"
        super().__init__(msg, code=ErrorCode.NOT_FOUND, status_code=404)


class InvalidInputError(MDHError):
    def __init__(self, message: str):
        super().__init__(message, code=ErrorCode.INVALID_INPUT, status_code=400)


class PermissionDeniedError(MDHError):
    def __init__(self, message: str = "权限不足"):
        super().__init__(message, code=ErrorCode.PERMISSION_DENIED, status_code=403)


def safe_execute(func, *args, default=None, log_errors: bool = True, **kwargs):
    """安全执行函数，捕获异常并返回默认值

    替代 bare `except Exception: pass` 模式。
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        if log_errors:
            logger.warning("safe_execute %s 失败: %s", func.__name__, e)
        return default


def ok(data=None, code: str = "OK"):
    """标准化成功响应"""
    return {"success": True, "data": data, "error": None, "code": code}


def fail(error: str, code: str = "ERROR"):
    """标准化失败响应"""
    return {"success": False, "data": None, "error": error, "code": code}
