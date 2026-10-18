"""
Program Registry REST API (program-pivot T1/T3)

GET    /api/programs                     列表（可按 status 过滤）
POST   /api/programs                     创建程序包（manifest 校验）
GET    /api/programs/match               触发匹配（promoted + 新鲜）
POST   /api/programs/compile             成功轨迹沉淀 candidate 草稿 (T3)
POST   /api/programs/legacy/import       skill_packs 只读登记
GET    /api/programs/{program_id}        详情（含 lineage）
POST   /api/programs/{program_id}/promote    candidate -> promoted
POST   /api/programs/{program_id}/deprecate  -> deprecated
POST   /api/programs/{program_id}/execute    免 LLM 沙箱执行 (T2)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from program_compiler import (
    GenerationError,
    ProgramCompiler,
    TaskTrajectory,
    llm_generate_fn,
)
from program_executor import ProgramExecutor
from program_registry import PROGRAM_ID_RE, ProgramManifest, ProgramStatus
from routers.common import fail, ok

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/programs", tags=["programs"])

# 注入点 — 测试可通过 init 替换 registry / skill_packs 目录 / 生成器
_registry = None
_skill_packs_dir = "skill_packs"
_generate_override = None  # Callable[[str], Awaitable[str]]，测试注入用


def init(registry, skill_packs_dir: str = "skill_packs", generate_override=None) -> None:
    global _registry, _skill_packs_dir, _generate_override
    _registry = registry
    _skill_packs_dir = skill_packs_dir
    _generate_override = generate_override


def _get_registry():
    if _registry is None:
        raise RuntimeError("programs router not initialized")
    return _registry


def _invalid_id(program_id: str):
    """非法 program_id（含路径遍历）→ 结构化 fail，避免 500。"""
    if not PROGRAM_ID_RE.match(program_id):
        return fail(f"invalid program_id: {program_id!r}", code="INVALID_ID")
    return None


class PromoteRequest(BaseModel):
    model: str | None = Field(None, description="晋升时所用模型标识（可选）")


class ExecuteRequest(BaseModel):
    input: Any = Field(None, description="传给程序包 run() 的输入（JSON）")
    timeout_seconds: float | None = Field(
        None, gt=0, le=300, description="执行超时（秒），默认 15"
    )


class CompileRequest(BaseModel):
    """成功轨迹 + 可选 LLM 凭证（无凭证时走 generate_override/NO_GENERATOR）。"""

    task_description: str
    steps: list[str] = Field(default_factory=list)
    input_example: Any = None
    output_example: Any = None
    success: bool = True
    provider: str = "deepseek"
    api_key: str = ""
    base_url: str = ""
    model_name: str = ""


@router.get("")
async def list_programs(status: str | None = Query(None, description="candidate|promoted|deprecated")):
    try:
        parsed = ProgramStatus(status) if status else None
    except ValueError:
        return fail(f"invalid status: {status}", code="INVALID_STATUS")
    items = _get_registry().list(parsed)
    return ok([m.model_dump(mode="json") for m in items])


@router.post("")
async def create_program(manifest: ProgramManifest):
    try:
        created = _get_registry().create(manifest)
    except FileExistsError as e:
        return fail(str(e), code="ALREADY_EXISTS")
    except ValueError as e:
        return fail(str(e), code="INVALID_MANIFEST")
    return ok(created.model_dump(mode="json"), code="CREATED")


@router.get("/match")
async def match_programs(
    task_text: str = Query(..., description="任务描述文本"),
    model: str | None = Query(None, description="当前模型标识（新鲜度校验）"),
):
    hits = _get_registry().match(task_text, current_model=model)
    return ok([m.model_dump(mode="json") for m in hits])


@router.post("/legacy/import")
async def import_legacy():
    imported = _get_registry().import_legacy_skill_packs(_skill_packs_dir)
    return ok(
        {
            "imported": len(imported),
            "program_ids": [m.program_id for m in imported],
        },
        code="IMPORTED",
    )


@router.post("/compile")
async def compile_trajectory(body: CompileRequest):
    """成功任务轨迹 → candidate 程序包草稿（program-pivot T3）。"""
    try:
        trajectory = TaskTrajectory(
            task_description=body.task_description,
            steps=body.steps,
            input_example=body.input_example,
            output_example=body.output_example,
            success=body.success,
        )
    except ValueError as e:
        return fail(str(e), code="INVALID_TRAJECTORY")

    if _generate_override is not None:
        generate = _generate_override
    elif body.api_key:
        async def generate(prompt: str) -> str:
            return await llm_generate_fn(
                prompt,
                provider=body.provider,
                api_key=body.api_key,
                base_url=body.base_url,
                model_name=body.model_name,
            )
    else:
        return fail("未配置生成器（无 api_key 且无注入生成器）", code="NO_GENERATOR")

    compiler = ProgramCompiler(_get_registry())
    try:
        manifest = await compiler.compile(trajectory, generate)
    except GenerationError as e:
        return fail(str(e), code="GENERATION_FAILED")
    except FileExistsError as e:
        return fail(str(e), code="ALREADY_EXISTS")
    except ValueError as e:
        return fail(str(e), code="INVALID_TRAJECTORY")
    except Exception:
        logger.exception("compile failed")
        return fail("compile failed", code="COMPILE_FAILED")
    return ok(manifest.model_dump(mode="json"), code="COMPILED")


@router.get("/{program_id}")
async def get_program(program_id: str):
    bad = _invalid_id(program_id)
    if bad:
        return bad
    manifest = _get_registry().get(program_id)
    if manifest is None:
        return fail(f"program not found: {program_id}", code="NOT_FOUND")
    data: dict[str, Any] = manifest.model_dump(mode="json")
    data["lineage"] = _get_registry().read_lineage(program_id)
    return ok(data)


@router.post("/{program_id}/promote")
async def promote_program(program_id: str, body: PromoteRequest | None = None):
    bad = _invalid_id(program_id)
    if bad:
        return bad
    registry = _get_registry()
    try:
        # promote + 验证记录在同一锁内完成（原子）
        promoted = registry.promote(
            program_id, validated_model=body.model if body else None
        )
    except FileNotFoundError as e:
        return fail(str(e), code="NOT_FOUND")
    except PermissionError as e:
        return fail(str(e), code="READ_ONLY")
    except ValueError as e:
        return fail(str(e), code="INVALID_TRANSITION")
    return ok(promoted.model_dump(mode="json"))


@router.post("/{program_id}/deprecate")
async def deprecate_program(program_id: str):
    bad = _invalid_id(program_id)
    if bad:
        return bad
    try:
        deprecated = _get_registry().deprecate(program_id)
    except FileNotFoundError as e:
        return fail(str(e), code="NOT_FOUND")
    except PermissionError as e:
        return fail(str(e), code="READ_ONLY")
    except ValueError as e:
        return fail(str(e), code="INVALID_TRANSITION")
    return ok(deprecated.model_dump(mode="json"))


@router.post("/{program_id}/execute")
async def execute_program(program_id: str, body: ExecuteRequest | None = None):
    """免 LLM 沙箱执行 promoted 程序包（program-pivot T2）。"""
    bad = _invalid_id(program_id)
    if bad:
        return bad
    req = body or ExecuteRequest()
    executor = ProgramExecutor(_get_registry())
    result = await executor.execute(
        program_id, req.input, timeout_seconds=req.timeout_seconds
    )
    telemetry = {
        "llm_calls": result.telemetry.llm_calls,
        "duration_ms": result.telemetry.duration_ms,
        "timed_out": result.telemetry.timed_out,
        "program_id": result.telemetry.program_id,
        "version": result.telemetry.version,
    }
    if result.success:
        return ok({"output": result.output, "telemetry": telemetry})
    # 失败也把 telemetry 放在 data（与成功同一取值路径，符合 ok/fail 键结构）
    return {
        "success": False,
        "data": {"telemetry": telemetry, "error_code": result.error_code},
        "error": result.error,
        "code": result.error_code or "ERROR",
    }
