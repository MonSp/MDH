"""Tests for logging_config — 结构化日志"""
import json
import logging

from logging_config import (
    HumanReadableFormatter,
    StructuredFormatter,
    TraceFilter,
    get_trace_id,
    log_business_event,
    set_trace_id,
    setup_logging,
)


class TestLoggingConfig:
    def test_structured_formatter(self):
        """结构化 JSON 格式"""
        fmt = StructuredFormatter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "test message", (), None)
        result = fmt.format(record)
        data = json.loads(result)
        assert data["level"] == "INFO"
        assert data["message"] == "test message"
        assert "timestamp" in data

    def test_human_readable_formatter(self):
        """人类可读格式"""
        fmt = HumanReadableFormatter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "hello", (), None)
        result = fmt.format(record)
        assert "INFO" in result
        assert "hello" in result

    def test_structured_formatter_with_exception(self):
        """异常信息格式化"""
        fmt = StructuredFormatter()
        try:
            raise ValueError("test error")
        except ValueError:
            import sys
            record = logging.LogRecord("test", logging.ERROR, "", 0, "error occurred", (), sys.exc_info())
        result = fmt.format(record)
        data = json.loads(result)
        assert "test error" in data.get("exception", "")

    def test_structured_formatter_with_trace_id(self):
        """trace_id 注入"""
        fmt = StructuredFormatter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        record.trace_id = "abc123"
        result = fmt.format(record)
        data = json.loads(result)
        assert data["trace_id"] == "abc123"

    def test_trace_context(self):
        """trace_id 上下文"""
        set_trace_id("test-trace-123")
        assert get_trace_id() == "test-trace-123"
        set_trace_id("")
        assert get_trace_id() == ""

    def test_log_business_event(self):
        """业务事件日志"""
        # 不崩溃即可
        log_business_event("task_completed", {"task_id": "t1", "agent_id": "a1"})

    def test_setup_logging_human(self, tmp_path):
        """配置人类可读日志"""
        setup_logging(level="DEBUG", format_type="human")
        root = logging.getLogger()
        assert root.level == logging.DEBUG
        assert len(root.handlers) >= 1

    def test_setup_logging_json_with_file(self, tmp_path):
        """配置 JSON 日志 + 文件输出"""
        log_file = str(tmp_path / "test.log")
        setup_logging(level="INFO", format_type="json", log_file=log_file)
        root = logging.getLogger()
        assert len(root.handlers) == 2  # stderr + file
        # 清理
        for h in root.handlers[:]:
            root.removeHandler(h)
            h.close()

    def test_trace_filter(self):
        """TraceFilter 注入 trace_id"""
        set_trace_id("filter-test")
        f = TraceFilter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        f.filter(record)
        assert record.trace_id == "filter-test"
        set_trace_id("")
