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
import sys
import time
from dataclasses import dataclass, field
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

        hashes = self.collect_test_hashes(program_id)
        baseline = self._last_recorded_hashes(program_id)
        tests_modified = baseline is not None and baseline != hashes

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
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=self._timeout
            )
        except (asyncio.TimeoutError, TimeoutError):
            if proc.returncode is None:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
            await _reap(proc)
            self._registry.append_lineage(
                program_id,
                _gate_event(
                    "gate_timeout", False, hashes, tests_modified, model
                ),
            )
            return GateResult(
                promoted=False,
                passed=False,
                error=f"gate timed out after {self._timeout}s",
                error_code="GATE_TIMEOUT",
                tests_modified=tests_modified,
                test_hashes=hashes,
                duration_ms=int((time.monotonic() - start) * 1000),
            )

        output = (stdout + stderr)[:MAX_OUTPUT_BYTES].decode(
            "utf-8", errors="replace"
        )
        passed = proc.returncode == 0
        duration_ms = int((time.monotonic() - start) * 1000)

        if not passed:
            self._registry.append_lineage(
                program_id,
                _gate_event("gate_failed", False, hashes, tests_modified, model),
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

        # 通过 → 自动晋升（promote 内含 lineage promote 事件 + 验证记录）
        promoted = self._registry.promote(program_id, validated_model=model)
        self._registry.append_lineage(
            program_id,
            _gate_event("gate_passed", True, hashes, tests_modified, model),
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


def _gate_event(
    name: str,
    passed: bool,
    hashes: dict[str, str],
    tests_modified: bool,
    model: str | None,
) -> dict[str, Any]:
    return {
        "event": name,
        "passed": passed,
        "test_hashes": hashes,
        "tests_modified": tests_modified,
        "model": model,
    }


async def _reap(proc: asyncio.subprocess.Process) -> None:
    try:
        await asyncio.wait_for(proc.wait(), timeout=5)
    except (asyncio.TimeoutError, TimeoutError):
        logger.warning("failed to reap killed gate process pid=%s", proc.pid)
