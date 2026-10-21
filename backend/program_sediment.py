"""
program_sediment — 成功任务 best-effort 沉淀 (program-pivot T12.1 + M2.5)

契约：
- 仅对 LLM 路径 **成功** 任务调用；program 路径命中不重复沉淀。
- 绝不抛异常、不阻塞用户交付——失败只记日志并返回结构化 skipped/error。
- 无 generator（无 api_key 且无注入）→ skipped=NO_GENERATOR。
- 生成器注入签名与 ProgramCompiler 一致：`(prompt) -> str`。
- **M2.5**：轨迹沉淀后，按任务文本匹配 skill_packs 触发词，对最多
  `max_skill_compiles` 个技能跑 Skill→ProgramCompiler（确定性步骤），
  best-effort，结果在 `skill_compiled` / `skill_errors`。
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any, Awaitable, Callable, Sequence

from program_compiler import ProgramCompiler, TaskTrajectory
from program_registry import ProgramRegistry

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], Awaitable[str]]


def _split_hints(text: str) -> list[str]:
    if not text:
        return []
    return [
        p.strip()
        for p in re.split(r"[,，、;/]", text)
        if p.strip() and len(p.strip()) >= 2
    ][:12]


def match_skills_for_task(
    content: str,
    skill_packs_dir: str,
    *,
    limit: int = 1,
) -> list[str]:
    """按 manifest description/trigger 与任务文本的关键词重合选技能。

    仅读 manifest.yaml（轻量），不加载 rules/SKILL.md。
    """
    import yaml

    if not content or not skill_packs_dir or not os.path.isdir(skill_packs_dir):
        return []
    text = content
    scored: list[tuple[int, str]] = []
    try:
        names = [
            n
            for n in os.listdir(skill_packs_dir)
            if os.path.isdir(os.path.join(skill_packs_dir, n))
            and not n.startswith(".")
        ]
    except OSError:
        return []
    for name in names:
        mf = os.path.join(skill_packs_dir, name, "manifest.yaml")
        if not os.path.isfile(mf):
            continue
        try:
            data = yaml.safe_load(Path(mf).read_text(encoding="utf-8")) or {}
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        hints = _split_hints(str(data.get("trigger") or ""))
        hints += _split_hints(str(data.get("description") or ""))
        # methodology 里中文短词也可能有用
        hits = sum(1 for h in hints if h in text)
        if hits:
            scored.append((hits, name))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [name for _, name in scored[: max(limit, 0)]]


async def sediment_skills_for_task(
    content: str,
    *,
    registry: ProgramRegistry,
    generate: GenerateFn,
    skill_packs_dir: str,
    max_skill_compiles: int = 1,
) -> dict[str, Any]:
    """M2.5：任务成功后对匹配技能跑 compile-skill（best-effort）。"""
    from skill_to_program import compile_skill_to_program, load_skill_material

    out: dict[str, Any] = {
        "matched": [],
        "compiled": [],  # list of {skill, program_id}
        "errors": [],  # list of {skill, error}
        "skipped": [],
    }
    if max_skill_compiles <= 0 or not skill_packs_dir:
        out["skipped"].append("SKILL_SEDIMENT_DISABLED")
        return out

    names = match_skills_for_task(content, skill_packs_dir, limit=max_skill_compiles)
    out["matched"] = names
    for name in names:
        try:
            mat = load_skill_material(name, skill_packs_dir)
            if not mat.deterministic_steps:
                out["skipped"].append(f"{name}:NO_DETERMINISTIC_STEPS")
                continue
            manifest = await compile_skill_to_program(
                name, registry, generate, skill_packs_dir=skill_packs_dir
            )
            out["compiled"].append(
                {"skill": name, "program_id": manifest.program_id}
            )
        except FileExistsError as e:
            out["skipped"].append(f"{name}:ALREADY_EXISTS")
            logger.info("skill sediment skip ALREADY_EXISTS %s: %s", name, e)
        except Exception as e:
            out["errors"].append({"skill": name, "error": str(e)[:300]})
            logger.warning("skill sediment failed for %s (non-blocking): %s", name, e)
    return out


async def sediment_successful_task(
    content: str,
    *,
    registry: ProgramRegistry,
    generate: GenerateFn | None = None,
    steps: Sequence[str] | None = None,
    input_example: Any = None,
    output_example: Any = None,
    skill_packs_dir: str | None = None,
    max_skill_compiles: int = 1,
) -> dict[str, Any]:
    """成功轨迹 → candidate；随后 M2.5 匹配技能固化（best-effort）。

    Returns:
        {
          "compiled": bool, "program_id"?: str, "skipped"?: str, "error"?: str,
          "skill_sediment"?: {...}  # M2.5
        }
    """
    if not (content or "").strip():
        return {"compiled": False, "skipped": "EMPTY_TASK"}
    if registry is None:
        return {"compiled": False, "skipped": "NO_REGISTRY"}
    if generate is None:
        return {"compiled": False, "skipped": "NO_GENERATOR"}

    result: dict[str, Any] = {}
    trajectory = TaskTrajectory(
        task_description=content[:2000],
        steps=list(steps or [])[:30],
        input_example=input_example,
        output_example=output_example,
        success=True,
    )
    try:
        manifest = await ProgramCompiler(registry).compile(trajectory, generate)
        result["compiled"] = True
        result["program_id"] = manifest.program_id
        logger.info(
            "program sediment ok: %s v%s", manifest.program_id, manifest.version
        )
    except FileExistsError as e:
        logger.info("sediment skip ALREADY_EXISTS: %s", e)
        result["compiled"] = False
        result["skipped"] = "ALREADY_EXISTS"
    except Exception as e:
        logger.warning("program sediment failed (non-blocking): %s", e)
        result["compiled"] = False
        result["error"] = str(e)[:500]
        # 轨迹沉淀失败仍尝试技能沉淀（技能路径独立）
        result["skill_sediment"] = await _safe_skill_sediment(
            content, registry, generate, skill_packs_dir, max_skill_compiles
        )
        return result

    result["skill_sediment"] = await _safe_skill_sediment(
        content, registry, generate, skill_packs_dir, max_skill_compiles
    )
    return result


async def _safe_skill_sediment(
    content: str,
    registry: ProgramRegistry,
    generate: GenerateFn,
    skill_packs_dir: str | None,
    max_skill_compiles: int,
) -> dict[str, Any]:
    if not skill_packs_dir:
        return {"matched": [], "compiled": [], "errors": [], "skipped": ["NO_SKILL_PACKS_DIR"]}
    try:
        return await sediment_skills_for_task(
            content,
            registry=registry,
            generate=generate,
            skill_packs_dir=skill_packs_dir,
            max_skill_compiles=max_skill_compiles,
        )
    except Exception as e:  # pragma: no cover — belt and suspenders
        logger.warning("skill sediment unexpected failure: %s", e)
        return {
            "matched": [],
            "compiled": [],
            "errors": [{"skill": "*", "error": str(e)[:300]}],
            "skipped": [],
        }
