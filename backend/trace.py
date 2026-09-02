import time
import uuid
from dataclasses import dataclass, field
from enum import Enum


class LogLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


LOG_LEVEL_ORDER = {
    LogLevel.DEBUG: 0,
    LogLevel.INFO: 1,
    LogLevel.WARN: 2,
    LogLevel.ERROR: 3,
}


@dataclass
class LogEntry:
    id: str
    timestamp: float
    level: LogLevel
    message: str
    agent_id: str | None = None
    session_id: str | None = None
    message_type: str | None = None
    causal_message_id: str | None = None
    data: dict = field(default_factory=dict)


@dataclass
class TraceSpan:
    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    causal_message_id: str | None = None
    start_time: float = 0.0
    end_time: float | None = None
    label: str | None = None


class StructuredLogger:
    def __init__(self, max_size: int = 1000, min_level: LogLevel = LogLevel.DEBUG):
        self._buffer: list[LogEntry] = []
        self._max_size = max_size
        self._min_level = min_level

    def log(
        self,
        level: LogLevel,
        message: str,
        agent_id: str | None = None,
        session_id: str | None = None,
        message_type: str | None = None,
        causal_message_id: str | None = None,
        data: dict | None = None,
    ) -> None:
        if LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[self._min_level]:
            return

        entry = LogEntry(
            id=uuid.uuid4().hex,
            timestamp=time.time(),
            level=level,
            message=message,
            agent_id=agent_id,
            session_id=session_id,
            message_type=message_type,
            causal_message_id=causal_message_id,
            data=data or {},
        )

        self._buffer.append(entry)

        if len(self._buffer) > self._max_size:
            self._buffer = self._buffer[len(self._buffer) - self._max_size :]

    def debug(self, message: str, **kwargs) -> None:
        self.log(LogLevel.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs) -> None:
        self.log(LogLevel.INFO, message, **kwargs)

    def warn(self, message: str, **kwargs) -> None:
        self.log(LogLevel.WARN, message, **kwargs)

    def error(self, message: str, **kwargs) -> None:
        self.log(LogLevel.ERROR, message, **kwargs)

    def get_entries(
        self,
        level: LogLevel | None = None,
        agent_id: str | None = None,
        session_id: str | None = None,
        message_type: str | None = None,
    ) -> list[LogEntry]:
        entries = list(self._buffer)

        if level is not None:
            min_order = LOG_LEVEL_ORDER[level]
            entries = [e for e in entries if LOG_LEVEL_ORDER[e.level] >= min_order]
        if agent_id is not None:
            entries = [e for e in entries if e.agent_id == agent_id]
        if session_id is not None:
            entries = [e for e in entries if e.session_id == session_id]
        if message_type is not None:
            entries = [e for e in entries if e.message_type == message_type]

        return entries

    def get_latest(self, count: int) -> list[LogEntry]:
        return self._buffer[-count:]

    def clear(self) -> None:
        self._buffer = []

    def size(self) -> int:
        return len(self._buffer)


class TraceContextManager:
    def __init__(self):
        self._current_span: TraceSpan | None = None
        self._spans: list[TraceSpan] = []

    def start_span(self, label: str | None = None) -> TraceSpan:
        span = TraceSpan(
            trace_id=uuid.uuid4().hex,
            span_id=uuid.uuid4().hex,
            start_time=time.time(),
            label=label,
        )
        self._current_span = span
        self._spans.append(span)
        return span

    def start_child_span(self, label: str | None = None) -> TraceSpan:
        if self._current_span is None:
            return self.start_span(label)

        span = TraceSpan(
            trace_id=self._current_span.trace_id,
            span_id=uuid.uuid4().hex,
            parent_span_id=self._current_span.span_id,
            start_time=time.time(),
            label=label,
        )
        self._current_span = span
        self._spans.append(span)
        return span

    def inject_from_message(self, message_id: str, label: str | None = None) -> TraceSpan:
        span = TraceSpan(
            trace_id=self._current_span.trace_id if self._current_span else uuid.uuid4().hex,
            span_id=uuid.uuid4().hex,
            parent_span_id=self._current_span.span_id if self._current_span else None,
            causal_message_id=message_id,
            start_time=time.time(),
            label=label,
        )
        self._current_span = span
        self._spans.append(span)
        return span

    def get_current_span(self) -> TraceSpan | None:
        return self._current_span

    def end_current_span(self) -> None:
        if self._current_span is not None:
            self._current_span.end_time = time.time()
            self._current_span = None

    def get_spans(self) -> list[TraceSpan]:
        return list(self._spans)

    def clear(self) -> None:
        self._current_span = None
        self._spans = []


logger = StructuredLogger()
trace_manager = TraceContextManager()
