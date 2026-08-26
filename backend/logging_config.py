"""结构化日志配置 — 统一日志格式、级别、输出

受 Cumora 'cost model as architecture' 启发，
日志应该是可查询的结构化数据，不是纯文本。
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone


class StructuredFormatter(logging.Formatter):
    """结构化 JSON 日志格式"""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = str(record.exc_info[1])
        # 附加字段
        if hasattr(record, "trace_id"):
            log_entry["trace_id"] = record.trace_id
        if hasattr(record, "agent_id"):
            log_entry["agent_id"] = record.agent_id
        if hasattr(record, "task_id"):
            log_entry["task_id"] = record.task_id
        return json.dumps(log_entry, ensure_ascii=False)


class HumanReadableFormatter(logging.Formatter):
    """人类可读日志格式（开发环境）"""

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.now().strftime("%H:%M:%S")
        level = record.levelname.ljust(7)
        name = record.name[:20]
        msg = record.getMessage()
        if record.exc_info and record.exc_info[1]:
            msg += f" | {record.exc_info[1]}"
        return f"{ts} | {level} | {name} | {msg}"


def setup_logging(
    level: str = "INFO",
    format_type: str = "human",  # "human" or "json"
    log_file: str = "",
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5,
) -> None:
    """配置全局日志

    Args:
        level: 日志级别 (DEBUG/INFO/WARNING/ERROR)
        format_type: 格式类型 ("human" 或 "json")
        log_file: 日志文件路径（空则只输出到 stderr）
        max_bytes: 单个日志文件最大字节数
        backup_count: 保留的旧日志文件数
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # 清除已有 handler
    root.handlers.clear()

    formatter = StructuredFormatter() if format_type == "json" else HumanReadableFormatter()

    # stderr handler
    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setFormatter(formatter)
    root.addHandler(stderr_handler)

    # 文件 handler（可选）
    if log_file:
        from logging.handlers import RotatingFileHandler
        os.makedirs(os.path.dirname(log_file) or ".", exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8"
        )
        file_handler.setFormatter(StructuredFormatter())  # 文件始终用 JSON
        root.addHandler(file_handler)


def get_trace_id() -> str:
    """获取当前请求的 trace ID（用于请求链路追踪）"""
    return getattr(_trace_context, "trace_id", "")


def set_trace_id(trace_id: str) -> None:
    """设置当前请求的 trace ID"""
    _trace_context.trace_id = trace_id


class _TraceContext:
    """线程本地 trace 上下文"""
    trace_id: str = ""

_trace_context = _TraceContext()


class TraceFilter(logging.Filter):
    """自动注入 trace_id 到日志记录"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = get_trace_id()
        return True


def log_business_event(event_type: str, data: dict, logger_name: str = "business") -> None:
    """记录业务事件（结构化）

    Args:
        event_type: 事件类型 (task_completed / agent_promoted / rule_evolved 等)
        data: 事件数据
        logger_name: logger 名称
    """
    logger = logging.getLogger(logger_name)
    logger.info("[%s] %s", event_type, json.dumps(data, ensure_ascii=False))
