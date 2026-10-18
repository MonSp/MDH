"""
ProgramExecutor — 程序包免 LLM 沙箱执行器 (program-pivot T2 / T11 载荷)

契约（spec [S2] 程序包契约、执行载荷契约 + 错误行为）：
- ProgramPack `main.py` 从 stdin 读 JSON 输入，向 stdout 写 JSON 输出
  （`if __name__ == "__main__"` 块读 stdin → 调 run() → 写 stdout）。
  载荷形状（T11，由 router 组装）：`{task, workspace_path, input?}`——
  程序写文件时用绝对 `workspace_path`，cwd 仍为包目录（隔离）。
  **仅依赖 Python 标准库**：执行环境为 `python -I`（isolated mode，
  不加载用户 site-packages）+ 最小 env（仅 PATH），不提供环境变量/网络
  语境；依赖三方库的程序无法在该环境运行，编译期（T3）应予保证。
- 仅允许执行 status=promoted 且 kind=program 的程序包；其余拒绝。
- 子进程隔离 + 超时强杀（沿用 executor_server 的 create_subprocess_exec
  + wait_for timeout 约定）；超时/异常返回结构化错误并附遥测。
- 遥测恒定 llm_calls=0 —— 执行路径不做任何 LLM 调用。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any

from program_registry import ProgramKind, ProgramRegistry, ProgramStatus

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 15.0
# 输出硬上限：超限在 decode/JSON 解析前拒绝（OUTPUT_TOO_LARGE）
MAX_STDOUT_BYTES = 1_000_000


@dataclass
class ExecutionTelemetry:
    """执行遥测 — llm_calls 恒为 0（免 LLM 路径）。"""

    llm_calls: int = 0
    duration_ms: int = 0
    timed_out: bool = False
    program_id: str = ""
    version: str = ""


@dataclass
class ExecutionResult:
    """结构化执行结果。"""

    success: bool
    output: Any = None
    error: str | None = None
    error_code: str | None = None
    telemetry: ExecutionTelemetry = field(default_factory=ExecutionTelemetry)


class ProgramExecutor:
    """免 LLM 沙箱执行 promoted 程序包。"""

    def __init__(
        self,
        registry: ProgramRegistry,
        default_timeout: float = DEFAULT_TIMEOUT_SECONDS,
        python_executable: str | None = None,
    ) -> None:
        self._registry = registry
        self._default_timeout = default_timeout
        self._python = python_executable or sys.executable

    async def execute(
        self,
        program_id: str,
        input_data: Any,
        timeout_seconds: float | None = None,
    ) -> ExecutionResult:
        telemetry = ExecutionTelemetry(program_id=program_id)

        manifest = self._registry.get(program_id)
        if manifest is None:
            return ExecutionResult(
                success=False,
                error=f"program not found: {program_id}",
                error_code="NOT_FOUND",
                telemetry=telemetry,
            )
        telemetry.version = manifest.version

        if manifest.kind != ProgramKind.PROGRAM:
            return ExecutionResult(
                success=False,
                error=f"legacy skill pack is not executable: {program_id}",
                error_code="NOT_EXECUTABLE",
                telemetry=telemetry,
            )
        if manifest.status != ProgramStatus.PROMOTED:
            return ExecutionResult(
                success=False,
                error=(
                    f"program not promoted: {program_id} "
                    f"(status={manifest.status.value})"
                ),
                error_code="NOT_PROMOTED",
                telemetry=telemetry,
            )

        main_path = os.path.join(self._registry.pack_dir(program_id), "main.py")
        if not os.path.isfile(main_path):
            return ExecutionResult(
                success=False,
                error=f"main.py missing in pack: {program_id}",
                error_code="PROGRAM_MISSING",
                telemetry=telemetry,
            )

        timeout = timeout_seconds if timeout_seconds is not None else self._default_timeout
        payload = json.dumps(input_data, ensure_ascii=False).encode("utf-8")

        start = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                self._python,
                "-I",  # isolated mode：不加载用户 site-packages/环境
                main_path,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._registry.pack_dir(program_id),
                env={"PATH": os.environ.get("PATH", ""), "PYTHONIOENCODING": "utf-8"},
            )
        except OSError as e:
            return ExecutionResult(
                success=False,
                error=f"failed to spawn executor: {e}",
                error_code="SPAWN_FAILED",
                telemetry=telemetry,
            )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(payload), timeout=timeout
            )
        except (asyncio.TimeoutError, TimeoutError):
            telemetry.timed_out = True
            telemetry.duration_ms = int((time.monotonic() - start) * 1000)
            _kill(proc)
            await _reap(proc)
            logger.warning("program %s timed out after %ss", program_id, timeout)
            return ExecutionResult(
                success=False,
                error=f"execution timed out after {timeout}s",
                error_code="TIMEOUT",
                telemetry=telemetry,
            )

        telemetry.duration_ms = int((time.monotonic() - start) * 1000)
        stderr_text = stderr[:MAX_STDOUT_BYTES].decode("utf-8", errors="replace") if stderr else ""

        if proc.returncode != 0:
            return ExecutionResult(
                success=False,
                error=stderr_text or f"program exited with code {proc.returncode}",
                error_code="EXECUTION_ERROR",
                telemetry=telemetry,
            )

        # 输出上限：超限直接报错，避免对超大缓冲做 decode/JSON 解析
        if stdout is not None and len(stdout) > MAX_STDOUT_BYTES:
            return ExecutionResult(
                success=False,
                error=f"stdout exceeds {MAX_STDOUT_BYTES} bytes",
                error_code="OUTPUT_TOO_LARGE",
                telemetry=telemetry,
            )
        stdout_text = stdout[:MAX_STDOUT_BYTES].decode("utf-8", errors="replace") if stdout else ""
        try:
            output = json.loads(stdout_text) if stdout_text.strip() else None
        except json.JSONDecodeError:
            return ExecutionResult(
                success=False,
                error=f"stdout is not valid JSON: {stdout_text[:500]}",
                error_code="INVALID_OUTPUT",
                telemetry=telemetry,
            )

        return ExecutionResult(success=True, output=output, telemetry=telemetry)


def _kill(proc: asyncio.subprocess.Process) -> None:
    if proc.returncode is None:
        try:
            proc.kill()
        except ProcessLookupError:
            pass


async def _reap(proc: asyncio.subprocess.Process) -> None:
    """强杀后显式 wait，避免依赖事件循环延迟回收。"""
    try:
        await asyncio.wait_for(proc.wait(), timeout=5)
    except (asyncio.TimeoutError, TimeoutError):
        logger.warning("failed to reap killed process pid=%s", proc.pid)
