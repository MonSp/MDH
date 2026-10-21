"""Kernel-backed ProgramExecutor — optional shared runtime (program-pivot + agent-kernel).

契约与 `ProgramExecutor.execute` 对齐：返回 ExecutionResult（success/output/
error_code/telemetry.llm_calls=0）。匹配仍由 MDH Python ProgramRegistry 负责；
执行优先走 agent-kernel IPC `runProgram`，kernel 无该包或连接失败时回退本地
ProgramExecutor（宁重勿轻，不改变路由语义）。
"""

from __future__ import annotations

import logging
import time
from typing import Any

from agent_kernel_client import AgentKernelClient, AgentKernelError
from program_executor import ExecutionResult, ExecutionTelemetry, ProgramExecutor
from program_registry import ProgramRegistry

logger = logging.getLogger(__name__)


class KernelProgramExecutor:
    """执行 promoted 程序包：优先 agent-kernel，失败码可判定时回退本地。"""

    def __init__(
        self,
        client: AgentKernelClient,
        registry: ProgramRegistry,
        local_fallback: ProgramExecutor | None = None,
    ) -> None:
        self._client = client
        self._registry = registry
        self._local = local_fallback or ProgramExecutor(registry)

    async def execute(
        self,
        program_id: str,
        input_data: Any,
        timeout_seconds: float | None = None,
    ) -> ExecutionResult:
        timeout_ms = int((timeout_seconds or 15.0) * 1000)
        t0 = time.monotonic()
        try:
            data = self._client.run_program(program_id, input_data, timeout_ms=timeout_ms)
        except (AgentKernelError, ConnectionError, OSError) as e:
            logger.info(
                "kernel runProgram unavailable for %s (%s); falling back to local executor",
                program_id,
                e,
            )
            return await self._local.execute(
                program_id, input_data, timeout_seconds=timeout_seconds
            )

        duration_ms = float(data.get("durationMs") or (time.monotonic() - t0) * 1000)
        telemetry = ExecutionTelemetry(
            llm_calls=0,
            duration_ms=int(duration_ms),
            timed_out=bool(data.get("timedOut")),
            program_id=program_id,
            version=str(data.get("version") or ""),
        )

        error_code = data.get("errorCode") or ""
        # Pack missing on kernel disk → local fallback (shared-dir optional)
        if error_code == "NOT_FOUND":
            logger.info(
                "program %s not on kernel library; falling back to local executor",
                program_id,
            )
            return await self._local.execute(
                program_id, input_data, timeout_seconds=timeout_seconds
            )

        if not data.get("ok"):
            return ExecutionResult(
                success=False,
                output=None,
                error=data.get("stderr") or error_code or "kernel execution failed",
                error_code=error_code or "EXECUTION_ERROR",
                telemetry=telemetry,
            )

        # stdout is one-line JSON from the program
        import json as _json

        stdout = data.get("stdout") or ""
        try:
            output = _json.loads(stdout) if stdout else None
        except _json.JSONDecodeError:
            return ExecutionResult(
                success=False,
                output=None,
                error=f"invalid JSON stdout from program: {stdout[:200]}",
                error_code="OUTPUT_INVALID",
                telemetry=telemetry,
            )
        return ExecutionResult(success=True, output=output, telemetry=telemetry)


def try_kernel_client(socket_path: str | None = None) -> AgentKernelClient | None:
    """Connect to agent-kernel if configured/reachable; else None."""
    import os

    sock = socket_path or os.environ.get("AGENT_KERNEL_SOCKET", "")
    if not sock or not os.path.exists(sock):
        return None
    client = AgentKernelClient(sock)
    try:
        client.connect()
        return client
    except OSError as e:
        logger.info("agent-kernel socket %s not connectable: %s", sock, e)
        return None


def resolve_executor(
    registry: ProgramRegistry,
    kernel_socket: str | None = None,
) -> ProgramExecutor | KernelProgramExecutor:
    """Prefer kernel-backed executor when AGENT_KERNEL_SOCKET is live."""
    client = try_kernel_client(kernel_socket)
    if client is not None:
        logger.info("program executor: agent-kernel backend")
        return KernelProgramExecutor(client, registry)
    return ProgramExecutor(registry)
