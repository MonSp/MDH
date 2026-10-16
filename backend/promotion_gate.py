"""
PromotionGate — 程序包测试门禁自动晋升 (program-pivot T4)

契约（spec [S2] 审阅—升级闭环、防作弊）：
- 对 candidate 程序包运行其自带 tests/（pytest 子进程，隔离+超时）。
- 通过 → registry.promote（自动晋升，同锁写验证记录）+ lineage 门禁事件。
- 失败 → 状态不变（candidate 保持，等价于"保留上一版"语义：已有 promoted
  版本不受影响；门禁只晋升 candidate）。
- 每次门禁把 tests/ 文件哈希写入 lineage；与上次门禁哈希对比标记
  tests_modified（防"改测试过关"的事后审计信号，对应 DGM 伪造测试实证）。
- 遥测 llm_calls 恒为 0 —— 门禁是确定性测试，不调用 LLM。
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from program_registry import ProgramKind, ProgramRegistry, ProgramStatus

logger = logging.getLogger(__name__)

DEFAULT_GATE_TIMEOUT = 60.0
MAX_OUTPUT_BYTES = 100_000


@dataclass
class GateResult:
    """门禁结构化结果。"""

    promoted: bool
    passed: bool
    error: str | None = None
    error_code: str | None = None
    tests_modified: bool = False
    test_hashes: dict[str, str] = field(default_factory=dict)
    output: str = ""
    duration_ms: int = 0
    llm_calls: int = 0  # 恒为 0：确定性门禁，无 LLM 调用


class PromotionGate:
    """candidate 测试门禁：通过自动晋升，失败不改状态。"""

    def __init__(
        self,
        registry: ProgramRegistry,
        timeout: float = DEFAULT_GATE_TIMEOUT,
        python_executable: str | None = None,
    ) -> None:
        self._registry = registry
        self._timeout = timeout
        self._python = python_executable or sys.executable

    # ── tests/ 哈希（防作弊审计信号）──────────────────

    def collect_test_hashes(self, program_id: str) -> dict[str, str]:
        tests_dir = os.path.join(self._registry.pack_dir(program_id), "tests")
        hashes: dict[str, str] = {}
        if not os.path.isdir(tests_dir):
            return hashes
        for root, _dirs, files in os.walk(tests_dir):
            for name in sorted(files):
                if not name.endswith(".py"):
                    continue
                path = os.path.join(root, name)
                rel = os.path.relpath(path, tests_dir)
                with open(path, "rb") as f:
                    hashes[rel] = hashlib.sha256(f.read()).hexdigest()
        return hashes

    def collect_main_hash(self, program_id: str) -> str | None:
        main_path = os.path.join(self._registry.pack_dir(program_id), "main.py")
        if not os.path.isfile(main_path):
            return None
        with open(main_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    def _last_recorded_hashes(self, program_id: str) -> dict[str, str] | None:
        for event in reversed(self._registry.read_lineage(program_id)):
            h = event.get("test_hashes")
            if isinstance(h, dict):
                return h
        return None

    # ── 门禁主流程 ────────────────────────────────────

    async def evaluate(
        self, program_id: str, model: str | None = None
    ) -> GateResult:
        start = time.monotonic()
        manifest = self._registry.get(program_id)
        if manifest is None:
            return GateResult(
                promoted=False,
                passed=False,
                error=f"program not found: {program_id}",
                error_code="NOT_FOUND",
            )
        if manifest.kind != ProgramKind.PROGRAM:
            return GateResult(
                promoted=False,
                passed=False,
                error=f"legacy skill pack is not gated: {program_id}",
                error_code="NOT_EXECUTABLE",
            )
        if manifest.status != ProgramStatus.CANDIDATE:
            return GateResult(
                promoted=False,
                passed=False,
                error=(
                    f"gate only accepts candidate: {program_id} "
                    f"(status={manifest.status.value})"
                ),
                error_code="NOT_CANDIDATE",
            )

        pack_dir = self._registry.pack_dir(program_id)
        tests_dir = os.path.join(pack_dir, "tests")
        if not os.path.isdir(tests_dir) or not any(
            f.endswith(".py") for _r, _d, fs in os.walk(tests_dir) for f in fs
        ):
            return GateResult(
                promoted=False,
                passed=False,
                error=f"tests/ missing or empty: {program_id}",
                error_code="GATE_NO_TESTS",
            )

        baseline = self._last_recorded_hashes(program_id)
        main_sha = self.collect_main_hash(program_id)

        proc = await asyncio.create_subprocess_exec(
            self._python,
            "-m",
            "pytest",
            "tests",
            "-q",
            "--timeout=30",
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=pack_dir,
            env={
                "PATH": os.environ.get("PATH", ""),
                "PYTHONIOENCODING": "utf-8",
                # 让 pack 根目录可 import（测试内 `import main`）
                "PYTHONPATH": pack_dir,
            },
            start_new_session=True,  # 独立进程组，超时可整组强杀
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=self._timeout
            )
        except (asyncio.TimeoutError, TimeoutError):
            _kill_group(proc)
            await _reap(proc)
            self._registry.append_lineage(
                program_id,
                _gate_event(
                    "gate_timeout",
                    False,
                    self.collect_test_hashes(program_id),
                    False,
                    model,
                    main_sha,
                    output="",
                ),
            )
            return GateResult(
                promoted=False,
                passed=False,
                error=f"gate timed out after {self._timeout}s",
                error_code="GATE_TIMEOUT",
                duration_ms=int((time.monotonic() - start) * 1000),
            )

        # 以跑完后的文件状态作为新基线（运行中改动会在下次门禁被标记）
        hashes = self.collect_test_hashes(program_id)
        tests_modified = baseline is not None and baseline != hashes
        output = (stdout + stderr)[:MAX_OUTPUT_BYTES].decode(
            "utf-8", errors="replace"
        )
        passed = proc.returncode == 0
        duration_ms = int((time.monotonic() - start) * 1000)

        if not passed:
            self._registry.append_lineage(
                program_id,
                _gate_event(
                    "gate_failed",
                    False,
                    hashes,
                    tests_modified,
                    model,
                    main_sha,
                    output=output,
                ),
            )
            return GateResult(
                promoted=False,
                passed=False,
                error=output or f"pytest exited {proc.returncode}",
                error_code="GATE_FAILED",
                tests_modified=tests_modified,
                test_hashes=hashes,
                output=output,
                duration_ms=duration_ms,
            )

        # 通过：先记 gate_passed（审计时序：门禁决定 → 再晋升），再 promote
        self._registry.append_lineage(
            program_id,
            _gate_event(
                "gate_passed",
                True,
                hashes,
                tests_modified,
                model,
                main_sha,
                output=output,
            ),
        )
        try:
            promoted = self._registry.promote(program_id, validated_model=model)
        except ValueError as e:
            # TOCTOU 竞态：pytest 运行期间状态被并发修改（如 deprecate）
            self._registry.append_lineage(
                program_id,
                {
                    "event": "gate_aborted",
                    "error": str(e),
                    "at": _utc_now(),
                },
            )
            return GateResult(
                promoted=False,
                passed=True,  # 测试确实通过，但晋升被竞态中止
                error=f"gate passed but promote aborted: {e}",
                error_code="GATE_RACE",
                tests_modified=tests_modified,
                test_hashes=hashes,
                output=output,
                duration_ms=duration_ms,
            )
        logger.info(
            "gate passed: %s promoted (tests_modified=%s)",
            program_id,
            tests_modified,
        )
        return GateResult(
            promoted=promoted.status == ProgramStatus.PROMOTED,
            passed=True,
            tests_modified=tests_modified,
            test_hashes=hashes,
            output=output,
            duration_ms=duration_ms,
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gate_event(
    name: str,
    passed: bool,
    hashes: dict[str, str],
    tests_modified: bool,
    model: str | None,
    main_sha: str | None,
    output: str,
) -> dict[str, Any]:
    return {
        "event": name,
        "passed": passed,
        "test_hashes": hashes,
        "main_sha256": main_sha,
        "tests_modified": tests_modified,
        "model": model,
        "output_tail": output[-2000:],
        "at": _utc_now(),
    }


def _kill_group(proc: asyncio.subprocess.Process) -> None:
    """强杀整个进程组（pytest 可能派生子进程）。"""
    if proc.returncode is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass


async def _reap(proc: asyncio.subprocess.Process) -> None:
    try:
        await asyncio.wait_for(proc.wait(), timeout=5)
    except (asyncio.TimeoutError, TimeoutError):
        logger.warning("failed to reap killed gate process pid=%s", proc.pid)
