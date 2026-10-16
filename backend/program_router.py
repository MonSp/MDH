"""
ProgramRouter — 三分法路由的 program 路径 (program-pivot T6)

契约（spec [S2] 三分法路由、错误行为）：
- registry 触发匹配（promoted + 新鲜 + 关键词命中）→ ProgramExecutor 免 LLM
  执行 → ProgramReviewer 审阅 → 交付 task_result(path_used="program")。
- **程序路径优先于 simple/complex**；未命中/执行异常/审阅 fail/审阅器不可用
  → 返回 handled=False（调用方回退 LLM 路径重执行本次任务，宁重勿轻）。
- 审阅 fail 的意见随 outcome 带出（并入 T5 升级闭环）。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from program_executor import ProgramExecutor
from program_registry import ProgramRegistry
from program_reviewer import ProgramReviewer

logger = logging.getLogger(__name__)

ReviewGenerate = Callable[[str], Awaitable[str]]


@dataclass
class ProgramPathOutcome:
    """program 路径尝试结果。"""

    handled: bool = False
    task_result: dict[str, Any] | None = None
    fallback_reason: str | None = None  # None = 尚未尝试/已处理
    program_id: str | None = None
    review_issues: list[str] = field(default_factory=list)
    review_verdict: str | None = None
    telemetry: dict[str, Any] = field(default_factory=dict)


async def try_program_path(
    content: str,
    registry: ProgramRegistry,
    *,
    model: str | None = None,
    input_data: Any = None,
    review_generate: ReviewGenerate | None = None,
    executor: ProgramExecutor | None = None,
    reviewer: ProgramReviewer | None = None,
    timeout_seconds: float | None = None,
) -> ProgramPathOutcome:
    """尝试 program 路径；任何不确定 → handled=False 让调用方回退 LLM。"""
    try:
        matches = registry.match(content, current_model=model)
    except Exception as e:
        logger.warning("program match failed (fail-open to LLM): %s", e)
        return ProgramPathOutcome(fallback_reason="MATCH_ERROR")

    if not matches:
        return ProgramPathOutcome(fallback_reason="NO_MATCH")

    chosen = matches[0]
    outcome = ProgramPathOutcome(program_id=chosen.program_id)

    exe = executor or ProgramExecutor(registry)
    payload = {"task": content} if input_data is None else input_data
    exec_result = await exe.execute(
        chosen.program_id, payload, timeout_seconds=timeout_seconds
    )
    outcome.telemetry = {
        "llm_calls": exec_result.telemetry.llm_calls,
        "duration_ms": exec_result.telemetry.duration_ms,
        "timed_out": exec_result.telemetry.timed_out,
        "program_id": exec_result.telemetry.program_id,
        "version": exec_result.telemetry.version,
    }
    if not exec_result.success:
        # 执行异常 → 降级 LLM 路径；错误信息可供升级闭环
        outcome.fallback_reason = exec_result.error_code or "EXECUTION_ERROR"
        outcome.review_issues = [exec_result.error or "execution failed"]
        return outcome

    # 审阅不可用（无生成器）→ 宁重勿轻，回退 LLM（结果总要过 LLM 审阅）
    if review_generate is None:
        outcome.fallback_reason = "REVIEW_UNAVAILABLE"
        return outcome

    rev = reviewer or ProgramReviewer()
    review = await rev.review(
        chosen.program_id,
        content,
        exec_result.output,
        exec_result.error,
        expectation=None,
        generate=review_generate,
    )
    outcome.review_verdict = review.verdict
    outcome.review_issues = review.issues
    if review.error_code:
        outcome.fallback_reason = review.error_code
        return outcome
    if review.verdict != "pass":
        # 审阅 fail → 作废结果，降级 LLM 重执行；意见并入升级闭环
        outcome.fallback_reason = "REVIEW_FAIL"
        return outcome

    outcome.handled = True
    outcome.task_result = {
        "type": "task_result",
        "path_used": "program",
        "success": True,
        "program_id": chosen.program_id,
        "version": exec_result.telemetry.version,
        "output": exec_result.output,
        "review_summary": review.summary,
        "telemetry": outcome.telemetry,
        "review_llm_calls": review.llm_calls,
    }
    return outcome
