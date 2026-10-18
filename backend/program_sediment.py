"""
program_sediment — 成功任务 best-effort 沉淀 (program-pivot T12.1)

契约：
- 仅对 LLM 路径 **成功** 任务调用；program 路径命中不重复沉淀。
- 绝不抛异常、不阻塞用户交付——失败只记日志并返回结构化 skipped/error。
- 无 generator（无 api_key 且无注入）→ skipped=NO_GENERATOR。
- 生成器注入签名与 ProgramCompiler 一致：`(prompt) -> str`。
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Sequence

from program_compiler import ProgramCompiler, TaskTrajectory
from program_registry import ProgramRegistry

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], Awaitable[str]]


async def sediment_successful_task(
    content: str,
    *,
    registry: ProgramRegistry,
    generate: GenerateFn | None = None,
    steps: Sequence[str] | None = None,
    input_example: Any = None,
    output_example: Any = None,
) -> dict[str, Any]:
    """成功轨迹 → candidate（best-effort）。

    Returns:
        {"compiled": bool, "program_id"?: str, "skipped"?: str, "error"?: str}
    """
    if not (content or "").strip():
        return {"compiled": False, "skipped": "EMPTY_TASK"}
    if registry is None:
        return {"compiled": False, "skipped": "NO_REGISTRY"}
    if generate is None:
        return {"compiled": False, "skipped": "NO_GENERATOR"}

    trajectory = TaskTrajectory(
        task_description=content[:2000],
        steps=list(steps or [])[:30],
        input_example=input_example,
        output_example=output_example,
        success=True,
    )
    try:
        manifest = await ProgramCompiler(registry).compile(trajectory, generate)
    except FileExistsError as e:
        # 同 id 已有包：视为已沉淀，不升错误
        logger.info("sediment skip ALREADY_EXISTS: %s", e)
        return {"compiled": False, "skipped": "ALREADY_EXISTS"}
    except Exception as e:
        logger.warning("program sediment failed (non-blocking): %s", e)
        return {"compiled": False, "error": str(e)[:500]}

    logger.info(
        "program sediment ok: %s v%s", manifest.program_id, manifest.version
    )
    return {"compiled": True, "program_id": manifest.program_id}
